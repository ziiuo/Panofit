import type { AspectRatio, LayoutMode, CanvasPlan, SliceRect, UploadedImage, ImageAnalysis } from '../types';
import { MAX_CANVAS_DIMENSION } from '../utils/canvas';
import { placeImages } from './placer';

function rowDistribution(totalCells: number): number[] {
  switch (totalCells) {
    case 1: return [1]; case 2: return [2]; case 3: return [3];
    case 4: return [3, 1]; case 5: return [3, 2]; case 6: return [3, 3];
    case 7: return [3, 3, 1]; case 8: return [3, 3, 2]; case 9: return [3, 3, 3];
    default: return [1];
  }
}

function computeCellSize(maxImgWidth: number, aspectRatio: AspectRatio, maxCols: number, maxRows: number): { cellW: number; cellH: number } {
  let cellW = maxImgWidth;
  if (cellW > MAX_CANVAS_DIMENSION / maxCols) cellW = Math.floor(MAX_CANVAS_DIMENSION / maxCols);
  const cellH = Math.round(cellW * (aspectRatio.height / aspectRatio.width));
  if (cellH * maxRows > MAX_CANVAS_DIMENSION) {
    const adjH = Math.floor(MAX_CANVAS_DIMENSION / maxRows);
    return { cellW: Math.round(adjH * (aspectRatio.width / aspectRatio.height)), cellH: adjH };
  }
  return { cellW, cellH };
}

function makeSlices(cw: number, ch: number, cols: number, rows: number, cellW: number, cellH: number): SliceRect[] {
  const s: SliceRect[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) s.push({ x: c * cellW, y: r * cellH, width: cellW, height: cellH });
  return s;
}

function allocateImages(images: UploadedImage[], analyses: (ImageAnalysis | null)[], rowSizes: number[], collageCount: number, manualGroups?: number[][]): number[][] {
  const n = images.length, numCanvases = rowSizes.length;
  if (n === 0 || numCanvases === 0) return [];
  const groups: number[][] = Array.from({ length: numCanvases }, () => []);
  const base = Math.floor(n / numCanvases), rem = n % numCanvases;
  let capacities = rowSizes.map((_, i) => base + (i < rem ? 1 : 0));
  const used = new Set<number>();
  const pushToCanvas = (g: number, idx: number) => { if (capacities[g] > 0) { groups[g].push(idx); capacities[g]--; used.add(idx); return true; } return false; };
  const findBestCanvas = (atomSize: number, prefer3Cell: boolean): number => { let best = -1, bestCap = -1; for (let g = 0; g < numCanvases; g++) { const is3cell = rowSizes[g] === 3; const score = capacities[g] + (prefer3Cell && is3cell ? 100 : 0) + (is3cell ? 50 : 0); if (capacities[g] >= atomSize && score > bestCap) { bestCap = score; best = g; } } return best; };
  const test = (k: string) => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has(k);
  const pool2 = Array.from({ length: n }, (_, i) => i).filter(i => !used.has(i));

  // Layout test atoms
  const layouts = [
    ['layout5_3', 8], ['layout5_2', 8], ['layout5_1', 8], ['layout4_4', 7], ['layout4_3', 7], ['layout4_2', 7], ['layout4_1', 7],
    ['layout3_4', 6], ['layout3_3', 6], ['layout3_2', 6], ['layout3_1', 6],
    ['layout2_5', 5], ['layout2_4', 5], ['layout2_3', 5], ['layout2_2', 5], ['layout2_1', 5],
    ['layout1_3', 4], ['layout1_2', 4], ['layout1_1', 4],
    ['layout0_2', 3, false], ['layout0_1', 3, false],
  ];
  for (const [name, count, prefer3 = true] of layouts) {
    if (test(name as string) && pool2.length >= (count as number)) {
      const g = findBestCanvas(count as number, prefer3 as boolean);
      if (g >= 0 && (!prefer3 || rowSizes[g] === 3)) for (const idx of pool2.slice(0, count as number)) pushToCanvas(g, idx);
      break;
    }
  }

  // Manual groups
  if (manualGroups) {
    for (const mg of manualGroups) { const valid = mg.filter(idx => idx < n && !used.has(idx)); if (valid.length >= 2) { const g = findBestCanvas(valid.length, false); if (g >= 0) { for (const idx of valid) pushToCanvas(g, idx); } else { for (const idx of valid) { for (let gg = 0; gg < numCanvases; gg++) { if (pushToCanvas(gg, idx)) break; } } } } }
  }

  // Solo
  const soloPool = Array.from({ length: n }, (_, i) => i).filter(i => !used.has(i));
  soloPool.sort((a, b) => (analyses[a]?.dominantColors?.[0]?.h ?? 0) - (analyses[b]?.dominantColors?.[0]?.h ?? 0));
  let gIdx = 0;
  for (const idx of soloPool) { while (gIdx < numCanvases && capacities[gIdx] === 0) gIdx++; if (gIdx >= numCanvases) gIdx = 0; if (capacities[gIdx] > 0) { groups[gIdx].push(idx); capacities[gIdx]--; } gIdx = (gIdx + 1) % numCanvases; }
  return groups.filter(g => g.length > 0);
}

function allocateExact(images: UploadedImage[], analyses: (ImageAnalysis | null)[], splitParts: number[], manualGroups?: number[][]): number[][] {
  const n = images.length, numCanvases = splitParts.length;
  if (n === 0 || numCanvases === 0) return [];
  const groups: number[][] = Array.from({ length: numCanvases }, () => []);
  const capacities = [...splitParts];
  const used = new Set<number>();
  const pushToCanvas = (g: number, idx: number) => { if (capacities[g] > 0) { groups[g].push(idx); capacities[g]--; used.add(idx); return true; } return false; };
  const findBestCanvas = (atomSize: number, prefer3Cell: boolean): number => { let best = -1, bestCap = -1; for (let g = 0; g < numCanvases; g++) { const is3cell = splitParts[g] >= 4; const score = capacities[g] + (prefer3Cell && is3cell ? 100 : 0) + (is3cell ? 50 : 0); if (capacities[g] >= atomSize && score > bestCap) { bestCap = score; best = g; } } return best; };
  const test = (k: string) => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has(k);
  const pool2 = Array.from({ length: n }, (_, i) => i).filter(i => !used.has(i));

  const layouts = [
    ['layout5_3', 8], ['layout5_2', 8], ['layout5_1', 8], ['layout4_4', 7], ['layout4_3', 7], ['layout4_2', 7], ['layout4_1', 7],
    ['layout3_4', 6], ['layout3_3', 6], ['layout3_2', 6], ['layout3_1', 6],
    ['layout2_5', 5], ['layout2_4', 5], ['layout2_3', 5], ['layout2_2', 5], ['layout2_1', 5],
    ['layout1_3', 4], ['layout1_2', 4], ['layout1_1', 4],
    ['layout0_2', 3, false], ['layout0_1', 3, false],
  ];
  for (const [name, count, prefer3 = true] of layouts) {
    if (test(name as string) && pool2.length >= (count as number)) {
      const g = findBestCanvas(count as number, prefer3 as boolean);
      if (g >= 0 && (!prefer3 || splitParts[g] >= 4)) for (const idx of pool2.slice(0, count as number)) pushToCanvas(g, idx);
      break;
    }
  }

  if (manualGroups) {
    for (const mg of manualGroups) { const valid = mg.filter(idx => idx < n && !used.has(idx)); if (valid.length >= 2) { const g = findBestCanvas(valid.length, false); if (g >= 0) { for (const idx of valid) pushToCanvas(g, idx); } else { for (const idx of valid) { for (let gg = 0; gg < numCanvases; gg++) { if (pushToCanvas(gg, idx)) break; } } } } }
  }

  const soloPool = Array.from({ length: n }, (_, i) => i).filter(i => !used.has(i));
  soloPool.sort((a, b) => (analyses[a]?.dominantColors?.[0]?.h ?? 0) - (analyses[b]?.dominantColors?.[0]?.h ?? 0));
  let gIdx = 0;
  for (const idx of soloPool) { while (gIdx < numCanvases && capacities[gIdx] === 0) gIdx++; if (gIdx >= numCanvases) gIdx = 0; if (capacities[gIdx] > 0) { groups[gIdx].push(idx); capacities[gIdx]--; } gIdx = (gIdx + 1) % numCanvases; }
  return groups.filter(g => g.length > 0);
}

export function generatePlans(images: UploadedImage[], analyses: (ImageAnalysis | null)[], aspectRatio: AspectRatio, collageCount: number, layoutMode: LayoutMode, manualGroups?: [number, number][]): CanvasPlan[] {
  if (images.length === 0) return [];
  const plans: CanvasPlan[] = []; let globalSliceOffset = 0;

  if (layoutMode === 'B') {
    let rows: number, cols: number;
    if (collageCount === 4) { rows = 2; cols = 2; } else if (collageCount === 6) { rows = 2; cols = 3; } else if (collageCount === 9) { rows = 3; cols = 3; } else { rows = Math.ceil(collageCount / 3); cols = 3; }
    let maxW = 0; for (const img of images) maxW = Math.max(maxW, img.naturalWidth); if (maxW === 0) maxW = 1080;
    const { cellW, cellH } = computeCellSize(maxW, aspectRatio, cols, rows);
    const cw = cellW * cols, ch = cellH * rows;
    const allIndices = images.map((_, i) => i);
    const result = placeImages(cw, ch, images, analyses, allIndices, manualGroups, cellW);
    const slices = makeSlices(cw, ch, cols, rows, cellW, cellH);
    globalSliceOffset += slices.length;
    plans.push({ index: 0, canvasWidth: cw, canvasHeight: ch, placements: result.placements, slices, fullBgImageIndex: -1, bgLockedIndices: [], debug: result.debug });
  } else {
    const rowSizes = rowDistribution(collageCount);
    const groups = allocateImages(images, analyses, rowSizes, collageCount, manualGroups);
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g]; if (group.length === 0) continue;
      const cols = rowSizes[g] ?? Math.min(3, group.length);
      let maxW = 0; for (const idx of group) maxW = Math.max(maxW, images[idx]?.naturalWidth ?? 0); if (maxW === 0) maxW = 1080;
      const { cellW, cellH } = computeCellSize(maxW, aspectRatio, cols, 1);
      const cw = cellW * cols, ch = cellH;
      const result = placeImages(cw, ch, images, analyses, group, manualGroups, cellW);
      const slices = makeSlices(cw, ch, cols, 1, cellW, cellH);
      globalSliceOffset += slices.length;
      plans.push({ index: g, canvasWidth: cw, canvasHeight: ch, placements: result.placements, slices, fullBgImageIndex: -1, bgLockedIndices: [], debug: result.debug });
    }
  }
  return plans;
}

export function generatePlansFromSplit(images: UploadedImage[], analyses: (ImageAnalysis | null)[], aspectRatio: AspectRatio, splitParts: number[], layoutMode: LayoutMode, manualGroups?: number[][]): CanvasPlan[] {
  if (images.length === 0) return [];
  if (layoutMode === 'B') return generatePlans(images, analyses, aspectRatio, splitParts.length, layoutMode, manualGroups);
  const plans: CanvasPlan[] = [];
  const groups = allocateExact(images, analyses, splitParts, manualGroups);
  const variantBySize = new Map<number, number>();
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g]; if (group.length === 0) continue;
    const size = group.length;
    const variant = ((variantBySize.get(size) ?? 0) % 3) + 1;
    variantBySize.set(size, (variantBySize.get(size) ?? 0) + 1);
    const cols = size === 3 ? 2 : 3;
    let maxW = 0; for (const idx of group) maxW = Math.max(maxW, images[idx]?.naturalWidth ?? 0); if (maxW === 0) maxW = 1080;
    const { cellW, cellH } = computeCellSize(maxW, aspectRatio, cols, 1);
    const cw = cellW * cols, ch = cellH;
    const result = placeImages(cw, ch, images, analyses, group, manualGroups, cellW, variant);
    const slices = makeSlices(cw, ch, cols, 1, cellW, cellH);
    plans.push({ index: g, canvasWidth: cw, canvasHeight: ch, placements: result.placements, slices, fullBgImageIndex: -1, bgLockedIndices: [], debug: result.debug });
  }
  return plans;
}
