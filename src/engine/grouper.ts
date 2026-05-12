import type { ImageAnalysis } from '../types';

export function distributeImages(analyses: (ImageAnalysis | null)[], collageCount: number): number[][] {
  const n = analyses.length;
  if (n === 0) return [];
  if (collageCount === 1) return [analyses.map((_, i) => i)];

  // Sort by dominant hue for color-flow
  const withHue = analyses.map((a, i) => ({
    index: i,
    hue: a?.dominantColors?.[0]?.h ?? 0,
  }));
  withHue.sort((a, b) => a.hue - b.hue);

  const base = Math.floor(n / collageCount);
  const remainder = n % collageCount;

  const groups: number[][] = [];
  let cursor = 0;
  for (let g = 0; g < collageCount; g++) {
    const size = base + (g < remainder ? 1 : 0);
    const group: number[] = [];
    for (let j = 0; j < size; j++) {
      group.push(withHue[cursor + j].index);
    }
    cursor += size;
    groups.push(group);
  }

  return groups;
}
