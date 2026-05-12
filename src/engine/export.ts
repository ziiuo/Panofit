import { canvasToBlob } from '../utils/canvas';
import { downloadBlob, generateFilename } from '../utils/file';

export async function exportCanvas(canvas: HTMLCanvasElement, filename: string, quality: number = 0.95): Promise<void> {
  const blob = await canvasToBlob(canvas, quality);
  downloadBlob(blob, filename);
}

export async function exportAll(
  canvases: (HTMLCanvasElement | null)[],
  quality: number = 0.95
): Promise<void> {
  for (let i = 0; i < canvases.length; i++) {
    const canvas = canvases[i];
    if (!canvas) continue;
    await exportCanvas(canvas, generateFilename(i, canvases.length), quality);
    // Brief pause between exports to allow GC
    await new Promise((r) => setTimeout(r, 200));
  }
}
