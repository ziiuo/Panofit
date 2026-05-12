import type { ImageAnalysis } from '../types';
import { extractDominantColors, rgbToHsv } from './color';
import { getImageDataAtScale } from '../utils/canvas';

// ── Grayscale conversion ──
function toGray(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }
  return gray;
}

// ── Sobel edge density (full image) ──
function sobelEdgeDensity(gray: Float32Array, width: number, height: number): number {
  let total = 0; let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1]
                + gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
      const gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1]
                + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      total += Math.sqrt(gx * gx + gy * gy);
      count++;
    }
  }
  return count > 0 ? Math.min(1, total / (count * 255)) : 0;
}

// ── Edge density for a specific region ──
function regionEdgeDensity(gray: Float32Array, width: number, _height: number, rx: number, ry: number, rw: number, rh: number): number {
  let total = 0; let count = 0;
  const x1 = Math.min(width - 2, rx + rw);
  const y1 = Math.min(_height - 2, ry + rh);
  for (let y = Math.max(1, ry); y < y1; y++) {
    for (let x = Math.max(1, rx); x < x1; x++) {
      const i = y * width + x;
      const gx = -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1]
                + gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
      total += Math.abs(gx);
      count++;
    }
  }
  return count > 0 ? Math.min(1, total / (count * 255)) : 0;
}

// ── Check if HSV falls in skin-tone range (multi-ethnicity) ──
function isSkinPixel(h: number, s: number, v: number): boolean {
  // Skin tone range (tightened to reduce false positives on warm scenery)
  if (s < 0.15) return false;
  if (v < 0.25 || v > 0.90) return false;
  if (h >= 5 && h <= 35 && s >= 0.18 && s <= 0.70) return true; // primary skin
  if (h > 35 && h <= 42 && s >= 0.18 && s <= 0.50) return true; // olive/tan
  return false;
}

// ── Enhanced sky/landscape detection ──
function computeSkyScore(data: Uint8ClampedArray, gray: Float32Array, width: number, height: number): number {
  const upperH = Math.floor(height * 0.35);
  const midY = Math.floor(height * 0.4);
  const lowerY = Math.floor(height * 0.55);

  let upperCount = 0, upperBright = 0, upperBlue = 0, upperGray = 0, upperSat = 0;

  for (let y = 0; y < upperH; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [h, s, v] = rgbToHsv(data[idx], data[idx + 1], data[idx + 2]);
      upperCount++;
      if (v > 0.55) upperBright++;
      if ((h >= 180 && h <= 260) || (h >= 170 && h <= 270 && s < 0.2)) upperBlue++;
      if (s < 0.25) upperGray++;
      upperSat += s;
    }
  }
  const avgSat = upperCount > 0 ? upperSat / upperCount : 0;
  const brightnessRatio = upperCount > 0 ? upperBright / upperCount : 0;
  const blueRatio = upperCount > 0 ? upperBlue / upperCount : 0;
  const grayRatio = upperCount > 0 ? upperGray / upperCount : 0;

  const upperEdge = regionEdgeDensity(gray, width, height, 0, 0, width, upperH);
  const lowerEdge = regionEdgeDensity(gray, width, height, 0, lowerY, width, height - lowerY);
  const edgeContrast = Math.max(0, lowerEdge - upperEdge);

  // Sky signal: bright/blue/gray upper + low saturation + edge contrast with lower half
  let score = brightnessRatio * 0.25 + blueRatio * 0.25 + grayRatio * 0.15 + edgeContrast * 0.25 + (1 - avgSat) * 0.10;
  return Math.min(1, score);
}

// ── Horizon detection ──
function detectHorizon(gray: Float32Array, width: number, height: number): number | null {
  // Scan row by row: find where horizontal edge density peaks in the middle band
  const startY = Math.floor(height * 0.2);
  const endY = Math.floor(height * 0.7);
  let maxEdge = 0, bestY: number | null = null;

  for (let y = startY; y < endY; y++) {
    let rowEdge = 0;
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      rowEdge += Math.abs(gray[i + width] - gray[i - width]) + Math.abs(gray[i + 1] - gray[i - 1]);
    }
    if (rowEdge > maxEdge) { maxEdge = rowEdge; bestY = y; }
  }

  if (bestY !== null && maxEdge / width > 15) return bestY / height;
  return null;
}

// ── Enhanced portrait / skin detection with face region estimation ──
function computePortraitFeatures(
  data: Uint8ClampedArray, width: number, height: number, orientation: string
): { portraitScore: number; skinRatio: number; faceRegion: { cx: number; cy: number; r: number } | null } {
  let skinCount = 0;
  const totalSamples = Math.floor(width * height / 4); // sample every 4th pixel
  let sumX = 0, sumY = 0;

  // Coarse grid for spatial clustering
  const gridCols = 8, gridRows = 8;
  const skinGrid = new Uint32Array(gridCols * gridRows);
  const cellW = width / gridCols;
  const cellH = height / gridRows;

  for (let i = 0; i < width * height; i += 4) {
    const idx = i * 4;
    const [h, s, v] = rgbToHsv(data[idx], data[idx + 1], data[idx + 2]);
    if (isSkinPixel(h, s, v)) {
      skinCount++;
      const px = i % width;
      const py = Math.floor(i / width);
      sumX += px;
      sumY += py;

      const gx = Math.min(gridCols - 1, Math.floor(px / cellW));
      const gy = Math.min(gridRows - 1, Math.floor(py / cellH));
      skinGrid[gy * gridCols + gx]++;
    }
  }

  const skinRatio = skinCount / totalSamples;

  // Portrait score: skin ratio + orientation bonus + skin concentration
  let portraitScore = 0;
  if (skinRatio > 0.12) portraitScore += Math.min(0.6, skinRatio * 5);
  if (orientation === 'portrait') portraitScore += 0.25;
  // Bonus: skin pixels concentrated in center (face-like)
  if (skinCount > 0) {
    const meanX = sumX / skinCount / width;
    const meanY = sumY / skinCount / height;
    // Center bias: face is usually near center horizontally, upper center vertically
    const centerDist = Math.abs(meanX - 0.5) + Math.abs(meanY - 0.35);
    if (centerDist < 0.25) portraitScore += 0.15;
  }

  // Find face region: find the densest cluster of skin pixels
  let faceRegion: { cx: number; cy: number; r: number } | null = null;
  if (skinCount > 20) {
    // Find the grid cell with max skin count and its neighbors
    let maxCell = 0, maxIdx = 0;
    for (let i = 0; i < skinGrid.length; i++) {
      if (skinGrid[i] > maxCell) { maxCell = skinGrid[i]; maxIdx = i; }
    }
    const gx = maxIdx % gridCols;
    const gy = Math.floor(maxIdx / gridCols);
    faceRegion = {
      cx: (gx + 0.5) / gridCols,
      cy: (gy + 0.5) / gridRows,
      r: Math.max(0.08, Math.min(0.3, Math.sqrt(maxCell / skinCount) * 0.5)),
    };
  }

  // Suppress faceRegion if clearly not a portrait
  const isLandscape = orientation === 'landscape';
  const finalFaceRegion = (isLandscape && portraitScore < 0.4) ? null : faceRegion;
  return { portraitScore: Math.min(1, portraitScore), skinRatio, faceRegion: finalFaceRegion };
}

// ── Texture complexity (local variance) ──
function computeTextureComplexity(gray: Float32Array, width: number, height: number): number {
  const blockSize = 8;
  let totalVar = 0;
  let blockCount = 0;

  for (let by = 0; by < height - blockSize; by += blockSize) {
    for (let bx = 0; bx < width - blockSize; bx += blockSize) {
      let sum = 0, sumSq = 0;
      const n = blockSize * blockSize;
      for (let dy = 0; dy < blockSize; dy++) {
        for (let dx = 0; dx < blockSize; dx++) {
          const v = gray[(by + dy) * width + (bx + dx)];
          sum += v;
          sumSq += v * v;
        }
      }
      const mean = sum / n;
      const variance = sumSq / n - mean * mean;
      totalVar += Math.sqrt(variance);
      blockCount++;
    }
  }

  return blockCount > 0 ? Math.min(1, totalVar / (blockCount * 60)) : 0;
}

// ── Warmth score (overall color temperature) ──
function computeWarmth(data: Uint8ClampedArray, width: number, height: number): number {
  let warmCount = 0;
  const total = Math.floor(width * height / 4);
  for (let i = 0; i < width * height; i += 4) {
    const idx = i * 4;
    const [h] = rgbToHsv(data[idx], data[idx + 1], data[idx + 2]);
    // Warm hues: red through yellow (0-60)
    if (h <= 60 || h >= 340) warmCount++;
  }
  return total > 0 ? warmCount / total : 0;
}

// ── Scene type classification ──
function classifyScene(
  skyScore: number, portraitScore: number, edgeDensity: number, textureComplexity: number, warmth: number, orientation: string
): ImageAnalysis['sceneType'] {
  if (portraitScore > 0.45 && orientation === 'portrait') return 'portrait';
  if (skyScore > 0.45 && edgeDensity < 0.25 && textureComplexity < 0.4) return 'landscape';
  if (edgeDensity > 0.3 && textureComplexity > 0.5 && warmth < 0.35) return 'architecture';
  if (textureComplexity < 0.2 && warmth > 0.4 && edgeDensity < 0.2) return 'macro';
  return 'general';
}

// ── Main analysis entry ──
export async function analyzeImage(img: HTMLImageElement, index: number): Promise<ImageAnalysis> {
  const orientation =
    img.naturalHeight > img.naturalWidth * 1.1 ? 'portrait' :
    img.naturalWidth > img.naturalHeight * 1.1 ? 'landscape' : 'square';

  const { data: imageData, scaleW: sw, scaleH: sh } = getImageDataAtScale(img, 400);
  const { data, width, height } = imageData;
  const gray = toGray(data, width, height);

  const dominantColors = extractDominantColors(imageData, 6);
  const edgeDensity = sobelEdgeDensity(gray, width, height);
  const skyScore = computeSkyScore(data, gray, width, height);
  const horizonY = detectHorizon(gray, width, height);
  const { portraitScore, skinRatio, faceRegion } = computePortraitFeatures(data, width, height, orientation);
  const textureComplexity = computeTextureComplexity(gray, width, height);
  const warmthScore = computeWarmth(data, width, height);
  const sceneType = classifyScene(skyScore, portraitScore, edgeDensity, textureComplexity, warmthScore, orientation);

  return {
    index, orientation, dominantColors, edgeDensity,
    skyScore, portraitScore,
    skinPixelRatio: skinRatio,
    faceRegion,
    horizonY,
    textureComplexity,
    warmthScore,
    sceneType,
  };
}
