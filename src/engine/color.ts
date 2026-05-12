import type { DominantColor } from '../types';

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s, v];
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h = (h % 360) / 360;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r: number, g: number, b: number;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
    default: r = 0; g = 0; b = 0;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function hueDistance(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360;
  return Math.min(d, 360 - d) / 180;
}

function weightedHsvDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt(
    3 * hueDistance(a[0], b[0]) ** 2 +
    1.5 * (a[1] - b[1]) ** 2 +
    (a[2] - b[2]) ** 2
  );
}

export function extractDominantColors(imageData: ImageData, k: number = 6): DominantColor[] {
  const { data, width, height } = imageData;
  const totalPixels = width * height;
  const sampleSize = Math.min(totalPixels, 10000);
  const stride = Math.max(1, Math.floor(totalPixels / sampleSize));

  const pixels: [number, number, number][] = [];
  for (let i = 0; i < totalPixels; i += stride) {
    const idx = i * 4;
    pixels.push([data[idx], data[idx + 1], data[idx + 2]]);
  }

  const pixelHsv: [number, number, number][] = pixels.map((p) => rgbToHsv(p[0], p[1], p[2]));

  // Initialize centroids evenly
  const centroids: [number, number, number][] = [];
  for (let i = 0; i < k; i++) {
    const cIdx = Math.floor((i / k) * pixelHsv.length);
    centroids.push([...pixelHsv[cIdx]]);
  }

  const assignments = new Array(pixelHsv.length).fill(0);
  const MAX_ITERS = 10;
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    let changed = false;
    for (let i = 0; i < pixelHsv.length; i++) {
      let minDist = Infinity;
      let best = 0;
      for (let c = 0; c < k; c++) {
        const dist = weightedHsvDistance(pixelHsv[i], centroids[c]);
        if (dist < minDist) { minDist = dist; best = c; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;
    // Recompute centroids
    for (let c = 0; c < k; c++) {
      let hSum = 0; let sSum = 0; let vSum = 0; let count = 0;
      for (let i = 0; i < pixelHsv.length; i++) {
        if (assignments[i] === c) {
          // Circular mean for hue
          const rad = (pixelHsv[i][0] * Math.PI) / 180;
          hSum += Math.cos(rad);
          hSum += Math.sin(rad);
          sSum += pixelHsv[i][1];
          vSum += pixelHsv[i][2];
          count++;
        }
      }
      // Note: this incorrectly mixes hue mean — fix below
      if (count > 0) {
        let hMean = 0;
        let sx = 0; let sy = 0;
        for (let i = 0; i < pixelHsv.length; i++) {
          if (assignments[i] === c) {
            const rad = (pixelHsv[i][0] * Math.PI) / 180;
            sx += Math.cos(rad);
            sy += Math.sin(rad);
          }
        }
        hMean = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
        centroids[c] = [hMean, sSum / count, vSum / count];
      }
    }
  }

  // Build result: count pixels per cluster, sort by count
  const clusterCounts = new Array(k).fill(0);
  const clusterRgb: [number, number, number][] = new Array(k).fill(null);
  for (let c = 0; c < k; c++) {
    let rSum = 0; let gSum = 0; let bSum = 0;
    for (let i = 0; i < pixels.length; i++) {
      if (assignments[i] === c) {
        clusterCounts[c]++;
        rSum += pixels[i][0];
        gSum += pixels[i][1];
        bSum += pixels[i][2];
      }
    }
    if (clusterCounts[c] > 0) {
      clusterRgb[c] = [
        Math.round(rSum / clusterCounts[c]),
        Math.round(gSum / clusterCounts[c]),
        Math.round(bSum / clusterCounts[c]),
      ];
    }
  }

  const results: DominantColor[] = [];
  const total = clusterCounts.reduce((a, b) => a + b, 0);
  const sorted = clusterCounts
    .map((count, i) => ({ count, i }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  for (const { count, i } of sorted) {
    const rgb = clusterRgb[i];
    if (!rgb) continue;
    const hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
    results.push({
      hex: rgbToHex(rgb[0], rgb[1], rgb[2]),
      r: rgb[0], g: rgb[1], b: rgb[2],
      h: hsv[0], s: hsv[1], v: hsv[2],
      proportion: count / total,
    });
  }

  return results.slice(0, 5);
}

export function colorDistance(c1: DominantColor, c2: DominantColor): number {
  return weightedHsvDistance([c1.h, c1.s, c1.v], [c2.h, c2.s, c2.v]);
}
