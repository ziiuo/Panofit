import type { AspectRatio } from '../types';

export const MAX_CANVAS_DIMENSION = 4096;

export function createCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

export function getImageDataAtScale(
  img: HTMLImageElement,
  maxDim: number
): { data: ImageData; scaleW: number; scaleH: number } {
  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const sw = Math.round(w * scale);
  const sh = Math.round(h * scale);
  const { canvas, ctx } = createCanvas(sw, sh);
  ctx.drawImage(img, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh);
  canvas.width = 0;
  return { data, scaleW: scale, scaleH: scale };
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      'image/jpeg',
      quality
    );
  });
}

export function computeCanvasDimensions(
  maxImageWidth: number,
  maxCols: number,
  numRows: number,
  aspectRatio: AspectRatio
): { canvasWidth: number; canvasHeight: number; cellW: number; cellH: number } {
  let canvasWidth = maxImageWidth * maxCols;
  if (canvasWidth > MAX_CANVAS_DIMENSION) {
    canvasWidth = MAX_CANVAS_DIMENSION;
  }
  const canvasHeight = Math.round(canvasWidth * (aspectRatio.height / aspectRatio.width));
  const cellW = Math.round(canvasWidth / maxCols);
  const cellH = Math.round(canvasHeight / numRows);
  return { canvasWidth, canvasHeight, cellW, cellH };
}
