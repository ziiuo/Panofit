import { useState, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { compositeWithBackground, renderTextOnCanvas } from '../engine/renderer';

export default function SavePage() {
  const cellCanvases = useAppStore((s) => s.cellCanvases);
  const cellBackgrounds = useAppStore((s) => s.cellBackgrounds);
  const cellTextOverlays = useAppStore((s) => s.cellTextOverlays);
  const setPage = useAppStore((s) => s.setPage);

  const dataUrls = useMemo(() =>
    cellCanvases.map((c, i) => {
      const bg = cellBackgrounds[i] ?? '#000000';
      let composite = compositeWithBackground(c, bg);
      composite = renderTextOnCanvas(composite, cellTextOverlays[i] ?? []);
      const url = composite.toDataURL('image/jpeg', 0.95);
      composite.width = 0;
      return url;
    }),
    [cellCanvases, cellBackgrounds, cellTextOverlays]
  );

  const handleNewPuzzle = useCallback(() => {
    useAppStore.getState().reset();
    setPage('upload');
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('input[type="file"]');
      if (input) input.click();
    }, 200);
  }, [setPage]);

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-center px-4 py-3 flex-shrink-0 bg-[#1a1a1a] relative">
        <button onClick={() => setPage('editor')} className="absolute left-4 text-text text-sm font-medium glass-btn active:scale-95">← 返回</button>
        <span className="text-sm font-medium text-text">保存拼图</span>
      </div>

      {/* Instruction */}
      <div className="text-center px-4 py-2 bg-white/5">
        <p className="text-xs text-text-secondary">长按图片保存至相册</p>
        <p className="text-[10px] text-text-secondary/50 mt-0.5">或点击图片逐个下载</p>
      </div>

      {/* Image grid */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col items-center gap-4">
          {dataUrls.map((url, i) => (
            <div key={i} className="w-full max-w-sm">
              <div className="text-[10px] text-text-secondary mb-1 ml-1">{i + 1} / {dataUrls.length}</div>
              <a href={url} download={`panofit_${i + 1}_${dataUrls.length}.jpg`}>
                <img
                  src={url}
                  alt={`拼图 ${i + 1}`}
                  className="w-full rounded-lg shadow-2xl block"
                  style={{ imageRendering: 'auto' }}
                />
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom */}
      <div className="flex gap-3 px-4 py-3 flex-shrink-0 bg-black">
        <button onClick={handleNewPuzzle} className="flex-1 py-3 rounded-xl bg-white/10 text-white text-sm font-medium active:scale-[0.98] border border-white/10">再拼一张</button>
        <button onClick={() => setPage('home')} className="flex-1 py-3 rounded-xl glass-strong text-white text-sm font-medium active:scale-[0.98]">完成</button>
      </div>
    </div>
  );
}
