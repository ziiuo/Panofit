import type { CanvasPlan, UploadedImage, TextOverlay } from '../types';
import { createCanvas } from '../utils/canvas';

export function renderPlanToCanvas(
  plan: CanvasPlan,
  imageElements: Map<string, HTMLImageElement>,
  images: UploadedImage[]
): HTMLCanvasElement {
  const { canvasWidth: cw, canvasHeight: ch, placements } = plan;
  const { canvas, ctx } = createCanvas(cw, ch);

  ctx.clearRect(0, 0, cw, ch);

  const sorted = [...placements].sort((a, b) => a.zIndex - b.zIndex);

  for (const p of sorted) {
    const img = imageElements.get(images[p.imageIndex]?.id ?? '');
    if (!img) continue;

    const sx = p.sx ?? 0;
    const sy = p.sy ?? 0;
    const sw = p.sw ?? img.naturalWidth;
    const sh = p.sh ?? img.naturalHeight;
    ctx.drawImage(img, sx, sy, sw, sh, p.x, p.y, p.width, p.height);
  }

  return canvas;
}

export function sliceCanvas(
  sourceCanvas: HTMLCanvasElement,
  slices: { x: number; y: number; width: number; height: number }[]
): HTMLCanvasElement[] {
  const results: HTMLCanvasElement[] = [];
  for (const s of slices) {
    const { canvas, ctx } = createCanvas(s.width, s.height);
    ctx.drawImage(sourceCanvas, s.x, s.y, s.width, s.height, 0, 0, s.width, s.height);
    results.push(canvas);
  }
  return results;
}

export function compositeWithBackground(
  cellCanvas: HTMLCanvasElement,
  bgColor: string
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(cellCanvas.width, cellCanvas.height);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(cellCanvas, 0, 0);
  return canvas;
}

export function renderCellCanvases(
  plans: CanvasPlan[],
  imageElements: Map<string, HTMLImageElement>,
  images: UploadedImage[]
): HTMLCanvasElement[] {
  const allCells: HTMLCanvasElement[] = [];
  for (const plan of plans) {
    const fullCanvas = renderPlanToCanvas(plan, imageElements, images);
    const cells = sliceCanvas(fullCanvas, plan.slices);
    allCells.push(...cells);
    fullCanvas.width = 0;
  }
  return allCells;
}

export function renderOverallPreview(
  plans: CanvasPlan[],
  imageElements: Map<string, HTMLImageElement>,
  images: UploadedImage[],
  maxWidth: number = 360
): HTMLCanvasElement[] {
  return plans.map((plan) => {
    const scale = Math.min(maxWidth / plan.canvasWidth, 1);
    const { canvas, ctx } = createCanvas(
      Math.round(plan.canvasWidth * scale),
      Math.round(plan.canvasHeight * scale)
    );

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sorted = [...plan.placements].sort((a, b) => a.zIndex - b.zIndex);
    for (const p of sorted) {
      const img = imageElements.get(images[p.imageIndex]?.id ?? '');
      if (!img) continue;
      const sx = p.sx ?? 0;
      const sy = p.sy ?? 0;
      const sw = p.sw ?? img.naturalWidth;
      const sh = p.sh ?? img.naturalHeight;
      ctx.drawImage(img, sx, sy, sw, sh,
        Math.round(p.x * scale), Math.round(p.y * scale),
        Math.round(p.width * scale), Math.round(p.height * scale));
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (const s of plan.slices) {
      ctx.strokeRect(
        Math.round(s.x * scale), Math.round(s.y * scale),
        Math.round(s.width * scale), Math.round(s.height * scale)
      );
    }

    return canvas;
  });
}

export function renderTextOnCanvas(source: HTMLCanvasElement, overlays: TextOverlay[]): HTMLCanvasElement {
  if (!overlays || overlays.length === 0) return source;
  const { canvas, ctx } = createCanvas(source.width, source.height);
  ctx.drawImage(source, 0, 0);
  for (const ov of overlays) {
    if (!ov.text.trim()) continue;
    const px = ov.x * source.width;
    const py = ov.y * source.height;
    const fontStyle = `${ov.fontStyle} ${ov.fontWeight} ${ov.fontSize}px ${ov.fontFamily}`;
    ctx.font = fontStyle;
    ctx.fillStyle = ov.color;
    ctx.textAlign = ov.textAlign;
    ctx.textBaseline = 'top';
    ctx.fillText(ov.text, px, py);
  }
  return canvas;
}

export async function loadImageElements(images: UploadedImage[]): Promise<Map<string, HTMLImageElement>> {
  const map = new Map<string, HTMLImageElement>();
  await Promise.all(
    images.map(async (img) => {
      const el = new Image();
      el.src = img.objectUrl;
      await new Promise<void>((resolve, reject) => {
        el.onload = () => resolve();
        el.onerror = () => reject(new Error(`Failed to load ${img.id}`));
      });
      map.set(img.id, el);
    })
  );
  return map;
}
