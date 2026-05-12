import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { compositeWithBackground, renderTextOnCanvas } from '../engine/renderer';

export default function SavePage() {
  const cellCanvases = useAppStore((s) => s.cellCanvases);
  const cellBackgrounds = useAppStore((s) => s.cellBackgrounds);
  const cellTextOverlays = useAppStore((s) => s.cellTextOverlays);
  const setPage = useAppStore((s) => s.setPage);
  const [saved, setSaved] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const gridCols = cellCanvases.length === 4 ? 2 : 3;

  const dataUrls = useMemo(() =>
    cellCanvases.map((c, i) => {
      const bg = cellBackgrounds[i] ?? '#000000';
      let composite = compositeWithBackground(c, bg);
      composite = renderTextOnCanvas(composite, cellTextOverlays[i] ?? []);
      const url = composite.toDataURL('image/jpeg', 0.8);
      composite.width = 0;
      return url;
    }),
    [cellCanvases, cellBackgrounds, cellTextOverlays]
  );

  // Auto-export on mount
  useEffect(() => {
    const doExport = async () => {
      try {
        const { exportAll } = await import('../engine/export');
        const canvases = useAppStore.getState().cellCanvases;
        const bgs = useAppStore.getState().cellBackgrounds;
        const overlays = useAppStore.getState().cellTextOverlays;
        const exportCanvases = canvases.map((c, i) => {
          let composite = compositeWithBackground(c, bgs[i] ?? '#000000');
          composite = renderTextOnCanvas(composite, overlays[i] ?? []);
          return composite;
        });
        await exportAll(exportCanvases, 0.95);
        setSaved(true);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2000);
      } catch (e) {
        setSaved(true);
      }
    };
    doExport();
  }, []);

  const handleNewPuzzle = useCallback(() => {
    useAppStore.getState().reset();
    setPage('upload');
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('input[type="file"]');
      if (input) input.click();
    }, 200);
  }, [setPage]);

  return (
    <div className="h-full flex flex-col items-center justify-between py-8 px-4">
      {/* Toast */}
      {showToast && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white/10 backdrop-blur-xl text-white text-sm px-5 py-2.5 rounded-full border border-white/10 shadow-lg animate-slide-up">
          拼图已保存至相册
        </div>
      )}

      {/* Top bar */}
      <div className="w-full flex items-center justify-center relative mb-6">
        <button onClick={() => setPage('editor')} className="absolute left-0 text-text text-sm font-medium glass-btn active:scale-95">
          ← 返回
        </button>
        <span className="text-sm font-medium text-text">
          {saved ? '已保存至相册' : '保存过程中请勿退出'}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center w-full gap-8">
        {dataUrls.length > 0 && (
          <div className="relative">
            <div
              className="inline-grid"
              style={{
                gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                gap: '4px',
                maxWidth: gridCols === 2 ? 240 : 360,
              }}
            >
              {dataUrls.map((url, i) => (
                <div key={i} className="overflow-hidden bg-gray-200 rounded-sm" style={{ aspectRatio: '1/1' }}>
                  <img src={url} alt="" className="w-full h-full object-cover block" draggable={false} />
                </div>
              ))}
            </div>
            {!saved && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-sm">
                <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom actions — after save */}
      {saved && (
        <div className="w-full flex gap-3 mt-6">
          <button
            onClick={handleNewPuzzle}
            className="flex-1 py-3 rounded-xl bg-white/10 text-white text-sm font-medium active:scale-[0.98] transition-all border border-white/10"
          >
            再拼一张
          </button>
          <button
            onClick={() => setPage('home')}
            className="flex-1 py-3 rounded-xl glass-strong text-white text-sm font-medium active:scale-[0.98] transition-all"
          >
            完成
          </button>
        </div>
      )}
    </div>
  );
}
