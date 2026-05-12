import { useMemo, useCallback, useState, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { compositeWithBackground } from '../engine/renderer';
import { track } from '../utils/analytics';

export default function PreviewPage() {
  const cellCanvases = useAppStore((s) => s.cellCanvases);
  const cellBackgrounds = useAppStore((s) => s.cellBackgrounds);
  const setPage = useAppStore((s) => s.setPage);
  const [scale, setScale] = useState(1);
  const lastPinchDist = useRef(0);
  const lastPinchScale = useRef(1);

  const gridCols = cellCanvases.length === 4 ? 2 : 3;
  const gridGap = 4;

  const dataUrls = useMemo(() =>
    cellCanvases.map((c, i) => {
      const bg = cellBackgrounds[i] ?? '#000000';
      const composite = compositeWithBackground(c, bg);
      const url = composite.toDataURL('image/jpeg', 0.8);
      composite.width = 0;
      return url;
    }),
    [cellCanvases, cellBackgrounds]
  );

  const handleExport = useCallback(() => {
    track('download', { page: 'preview' });
    setPage('save');
  }, [setPage]);

  // Pinch zoom
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.current = Math.sqrt(dx * dx + dy * dy);
      lastPinchScale.current = scale;
    }
  }, [scale]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = dist / lastPinchDist.current;
      setScale(Math.max(0.5, Math.min(3, lastPinchScale.current * ratio)));
    }
  }, []);

  // Wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((s) => Math.max(0.5, Math.min(3, s + delta)));
  }, []);

  if (cellCanvases.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-secondary">
        <p>暂无生成图</p>
        <button onClick={() => setPage('upload')} className="mt-4 text-primary text-sm">返回上传</button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 bg-[#1a1a1a]">
        <button onClick={() => setPage('editor')} className="text-text text-sm font-medium glass-btn active:scale-95">← 返回</button>
        <h1 className="text-base font-semibold text-text">预览</h1>
        <button onClick={handleExport} className="text-text text-sm font-medium glass-btn active:scale-95">下载</button>
      </div>

      {/* Centered grid with zoom */}
      <div
        className="flex-1 overflow-hidden bg-[#1a1a1a] flex items-center justify-center"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onWheel={onWheel}
      >
        <div
          className="inline-grid"
          style={{
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gap: `${gridGap}px`,
            maxWidth: gridCols === 2 ? 240 : 360,
            margin: '20px',
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          {dataUrls.map((url, i) => (
            <div key={i} className="overflow-hidden bg-gray-200" style={{ aspectRatio: '1/1', borderRadius: 2 }}>
              <img src={url} alt="" className="w-full h-full object-cover block" draggable={false} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
