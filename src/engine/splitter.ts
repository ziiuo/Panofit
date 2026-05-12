export interface SplitOption {
  parts: number[];
  totalOutput: number;
}

export function getSplitOptions(n: number): SplitOption[] {
  if (n < 3) return [];
  const seen = new Set<number>();
  const options: SplitOption[] = [];

  // Single canvas
  if (n >= 3 && n <= 8) {
    options.push({ parts: [n], totalOutput: n === 3 ? 2 : 3 });
    seen.add(n === 3 ? 2 : 3);
  }

  // N=6 special: two 2-cell canvases → 4 outputs
  if (n === 6) {
    options.push({ parts: [3, 3], totalOutput: 4 });
    seen.add(4);
  }

  // 2-canvas splits (each 3-cell, parts 4-8) → 6 outputs
  if (n >= 8 && n <= 16) {
    let best: [number, number] | null = null;
    let bestDiff = Infinity;
    for (let a = Math.max(4, n - 8); a <= Math.min(8, n - 4); a++) {
      const b = n - a;
      if (b >= a && b <= 8) {
        if (b - a < bestDiff) { bestDiff = b - a; best = [a, b]; }
      }
    }
    if (best && !seen.has(6)) {
      options.push({ parts: best, totalOutput: 6 });
      seen.add(6);
    }
  }

  // 3-canvas splits (each 3-cell, parts 4-8) → 9 outputs
  if (n >= 12 && n <= 24) {
    let best: [number, number, number] | null = null;
    let bestRange = Infinity;
    for (let a = Math.max(4, n - 16); a <= Math.min(8, n - 8); a++) {
      for (let b = Math.max(a, n - a - 8); b <= Math.min(8, n - a - 4); b++) {
        const c = n - a - b;
        if (c >= b && c <= 8) {
          if (c - a < bestRange) { bestRange = c - a; best = [a, b, c]; }
        }
      }
    }
    if (best && !seen.has(9)) {
      options.push({ parts: best, totalOutput: 9 });
      seen.add(9);
    }
  }

  return options;
}
