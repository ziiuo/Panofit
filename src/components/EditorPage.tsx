import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { compositeWithBackground, renderTextOnCanvas } from '../engine/renderer';
import { track } from '../utils/analytics';

const BG_COLORS = [
  '#000000', '#FFFFFF', '#F5F5F5', '#E8E8E8',
  '#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C',
  '#4DABF7', '#748FFC', '#DA77F2', '#F783AC',
  '#FFE8CC', '#D3F9D8', '#E7F5FF', '#FFF9DB',
];

const FONT_OPTIONS = [
  'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif',
  'Heiti SC, STHeiti, Noto Sans CJK SC, sans-serif',
  'Songti SC, STSong, Noto Serif CJK SC, SimSun, serif',
  'Kaiti SC, STKaiti, KaiTi, serif',
  'Arial, Helvetica, sans-serif',
  'Georgia, Times New Roman, serif',
];
const FONT_LABELS = ['苹方', '黑体', '宋体', '楷体', 'Arial', 'Georgia'];

function isLightBg(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 128;
}

export default function EditorPage() {
  const cellCanvases = useAppStore((s) => s.cellCanvases);
  const cellBackgrounds = useAppStore((s) => s.cellBackgrounds);
  const cellTextOverlays = useAppStore((s) => s.cellTextOverlays);
  const canvasPlans = useAppStore((s) => s.canvasPlans);
  const uploadedImages = useAppStore((s) => s.uploadedImages);
  const editorIndex = useAppStore((s) => s.editorIndex);
  const setEditorIndex = useAppStore((s) => s.setEditorIndex);
  const setCellBackground = useAppStore((s) => s.setCellBackground);
  const addTextOverlay = useAppStore((s) => s.addTextOverlay);
  const updateTextOverlay = useAppStore((s) => s.updateTextOverlay);
  const removeTextOverlay = useAppStore((s) => s.removeTextOverlay);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const undoStack = useAppStore((s) => s.undoStack);
  const redoStack = useAppStore((s) => s.redoStack);
  const setPage = useAppStore((s) => s.setPage);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [textPanelMode, setTextPanelMode] = useState<'main' | 'edit' | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [textCellIndex, setTextCellIndex] = useState(0);
  const [editSubTab, setEditSubTab] = useState<'font' | 'style'>('font');
  const [showDebug, setShowDebug] = useState(false);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const pinching = useRef(false);
  const lastPinchDist = useRef(0);
  const lastPinchScale = useRef(1);
  const draggingRef = useRef<{ id: string; cellIdx: number; startX: number; startY: number; startOx: number; startOy: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draggingId = useRef<string | null>(null);

  const n = cellCanvases.length;
  const currentBg = cellBackgrounds[0] ?? '#000000';
  const currentOverlays = cellTextOverlays[textCellIndex] ?? [];
  const editingOverlay = editingTextId ? currentOverlays.find(o => o.id === editingTextId) : null;
  const hasText = currentOverlays.length > 0;

  const bgLocked = useMemo(() => {
    for (const plan of canvasPlans) {
      if (plan.bgLockedIndices.includes(0)) return true;
    }
    return false;
  }, [canvasPlans]);

  // Per-cell display URLs (no text — text shown via HTML overlay)
  const displayUrls = useMemo(() => {
    return cellCanvases.map((c, i) => {
      const bg = cellBackgrounds[i] ?? '#000000';
      const composite = compositeWithBackground(c, bg);
      const url = composite.toDataURL('image/jpeg', 0.92);
      return url;
    });
  }, [cellCanvases, cellBackgrounds]);

  // Centering first cell on mount
  useEffect(() => {
    if (!scrollRef.current || n === 0) return;
    const timer = setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const firstImg = el.querySelector('.cell-img') as HTMLImageElement;
      if (!firstImg) return;
      const rect = firstImg.getBoundingClientRect();
      const containerRect = el.getBoundingClientRect();
      const target = rect.left + rect.width / 2 - containerRect.left - containerRect.width / 2;
      el.scrollLeft = Math.max(0, el.scrollLeft + target);
    }, 100);
    return () => clearTimeout(timer);
  }, [n]);

  // Remove empty overlays
  useEffect(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
    for (let i = 0; i < n; i++) {
      const ovs = cellTextOverlays[i] ?? [];
      for (const ov of ovs) {
        if (!ov.text.trim()) removeTextOverlay(i, ov.id);
      }
    }
  }, []);

  const openBgPicker = useCallback(() => { setShowBgPicker(true); setTextPanelMode(null); setEditingTextId(null); }, []);
  const openTextMain = useCallback(() => { setTextPanelMode('main'); setShowBgPicker(false); }, []);

  // Pinch zoom
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && e.cancelable) e.preventDefault();
    if (e.touches.length === 2) {
      pinching.current = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.current = Math.sqrt(dx * dx + dy * dy);
      if (editingTextId && editingOverlay) {
        lastPinchScale.current = editingOverlay.fontSize;
      } else {
        lastPinchScale.current = transform.scale;
      }
    }
  }, [transform.scale, editingTextId, editingOverlay]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = dist / lastPinchDist.current;
      if (editingTextId && editingOverlay) {
        updateTextOverlay(textCellIndex, editingTextId, { fontSize: Math.max(8, Math.min(120, Math.round(lastPinchScale.current * ratio))) });
      } else {
        setTransform((t) => ({ ...t, scale: Math.max(0.3, Math.min(3, lastPinchScale.current * ratio)) }));
      }
    }
  }, [editingTextId, editingOverlay, textCellIndex, updateTextOverlay]);

  const onTouchEnd = useCallback(() => { pinching.current = false; }, []);

  // Wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setTransform((t) => ({ ...t, scale: Math.max(0.3, Math.min(3, t.scale + delta)) }));
  }, []);

  // Export — navigate to save page
  const handleExport = useCallback(() => {
    track('download', { page: 'editor' });
    setPage('save');
  }, [setPage]);

  const applyBgToAll = useCallback((color: string) => {
    useAppStore.getState().setAllCellBackgrounds(color);
  }, []);

  // Text actions
  const handleNewText = useCallback(() => {
    const imgs = scrollRef.current?.querySelectorAll('.cell-img') as NodeListOf<HTMLImageElement> | undefined;
    let ci = 0;
    if (imgs) {
      const vw = window.innerWidth, cx = vw / 2;
      for (let i = 0; i < imgs.length; i++) {
        const r = imgs[i].getBoundingClientRect();
        if (r.left <= cx && r.right >= cx) { ci = i; break; }
      }
    }
    const id = addTextOverlay(ci);
    setTextCellIndex(ci);
    setEditingTextId(id);
    setTextPanelMode('edit');
  }, [addTextOverlay]);

  const handleEditText = useCallback(() => {
    if (!editingTextId) {
      const first = currentOverlays.find(o => o.text.trim());
      if (first) setEditingTextId(first.id);
    }
    setTextPanelMode('edit');
  }, [editingTextId, currentOverlays]);

  const handleCopyText = useCallback(() => {
    if (!editingTextId || !editingOverlay) return;
    const id = addTextOverlay(textCellIndex);
    updateTextOverlay(textCellIndex, id, {
      text: editingOverlay.text, fontFamily: editingOverlay.fontFamily,
      fontSize: editingOverlay.fontSize, color: editingOverlay.color,
      fontWeight: editingOverlay.fontWeight, fontStyle: editingOverlay.fontStyle,
      textAlign: editingOverlay.textAlign,
      x: Math.min(1, editingOverlay.x + 0.05), y: Math.min(1, editingOverlay.y + 0.05),
    });
    setEditingTextId(id);
  }, [textCellIndex, editingTextId, editingOverlay, addTextOverlay, updateTextOverlay]);

  const handleDeleteText = useCallback(() => {
    if (!editingTextId) return;
    removeTextOverlay(textCellIndex, editingTextId);
    setEditingTextId(null);
    setTextPanelMode('main');
  }, [textCellIndex, editingTextId, removeTextOverlay]);

  // First click: lock + open text menu. Second click: open edit panel.
  const selectOverlay = useCallback((id: string, cellIdx: number) => {
    setTextCellIndex(cellIdx);
    if (editingTextId === id) {
      setTextPanelMode('edit');
    } else {
      setEditingTextId(id);
      setTextPanelMode('main');
      setShowBgPicker(false);
    }
  }, [editingTextId]);

  // Drag text overlay
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent, ovId: string, cellIdx: number) => {
    e.stopPropagation();
    const ovs = cellTextOverlays[cellIdx] ?? [];
    const ov = ovs.find(o => o.id === ovId);
    if (!ov) return;
    let cx: number, cy: number;
    if ('touches' in e) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else { cx = e.clientX; cy = e.clientY; }
    const startOx = ov.x, startOy = ov.y;

    const onMove = (me: MouseEvent | TouchEvent) => {
      if ('touches' in me && me.cancelable) me.preventDefault();
      let mx: number, my: number;
      if ('touches' in me) { mx = me.touches[0].clientX; my = me.touches[0].clientY; }
      else { mx = me.clientX; my = me.clientY; }
      const imgs = document.querySelectorAll('.cell-img');
      const img = imgs[cellIdx] as HTMLImageElement;
      if (!img) return;
      const rect = img.getBoundingClientRect();
      updateTextOverlay(cellIdx, ovId, { x: startOx + (mx - cx) / rect.width, y: startOy + (my - cy) / rect.height });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp, { passive: false });
  }, [cellTextOverlays, updateTextOverlay]);

  if (n === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-secondary text-sm">暂无生成图</div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 bg-[#1a1a1a] safe-top">
        <button onClick={() => setShowBackConfirm(true)} className="text-text text-sm font-medium glass-btn active:scale-95">← 返回</button>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage('preview')} className="text-text text-sm font-medium glass-btn active:scale-95">预览</button>
          <button onClick={handleExport} className="text-text text-sm font-medium glass-btn active:scale-95">下载</button>
        </div>
      </div>

      {/* Infinite canvas — horizontal strip */}
      <div
        ref={scrollRef}
        className={`flex-1 bg-[#1a1a1a] select-none flex items-center ${editingTextId ? 'overflow-hidden' : 'overflow-x-auto overflow-y-hidden'}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={onWheel}
      >
        <div className="flex items-center gap-0 px-[50vw] py-6" style={{ transform: `scale(${transform.scale})`, transformOrigin: 'center center' }} onClick={() => { setEditingTextId(null); setTextPanelMode(null); }}>
          {displayUrls.map((url, i) => (
            <div
              key={i}
              className="relative shrink-0"
              style={{ borderRight: `1px solid ${isLightBg(currentBg) ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}` }}
            >
              <img src={url} alt={`拼图 ${i + 1}`} className="h-[358px] w-auto object-contain block cell-img" draggable={false} />

              {/* Cell number label */}
              <div className="absolute bottom-2 right-2 bg-black/40 text-white text-[10px] px-1.5 py-0.5 rounded">{i + 1}/{n}</div>
            </div>
          ))}
          {/* Global text overlay — inside flex container, z-10 */}
          <div className="absolute inset-0 pointer-events-none z-10" onClick={() => { setEditingTextId(null); setTextPanelMode(null); }}>
            {cellTextOverlays.map((ovs, i) => (ovs ?? []).map((ov) => {
              const isLocked = ov.id === editingTextId && i === textCellIndex;
              const imgs = scrollRef.current?.querySelectorAll('.cell-img') as NodeListOf<HTMLImageElement> | undefined;
              const cellImg = imgs?.[i];
              const cellLeft = cellImg ? cellImg.offsetLeft + (cellImg.parentElement?.offsetLeft ?? 0) : i * 370;
              const cellTop = cellImg ? cellImg.offsetTop + (cellImg.parentElement?.offsetTop ?? 0) : 24;
              const cellW = cellImg?.offsetWidth ?? 358;
              const cellH = cellImg?.offsetHeight ?? 358;
              return (
                <div key={ov.id} data-ov-id={ov.id} className="absolute group pointer-events-auto" style={{ left: `${cellLeft + ov.x * cellW}px`, top: `${cellTop + ov.y * cellH}px`, textAlign: ov.textAlign }}>
                  <div className="inline-block cursor-grab active:cursor-grabbing"
                    onMouseDown={(e) => handleDragStart(e, ov.id, i)}
                    onTouchStart={(e) => { if (e.touches.length === 1) handleDragStart(e, ov.id, i); }}
                    onClick={(e2) => { e2.stopPropagation(); selectOverlay(ov.id, i); }}>
                    {ov.text.trim() ? (
                      <span style={{ fontFamily: ov.fontFamily, fontSize: `${ov.fontSize}px`, color: ov.color, fontWeight: ov.fontWeight, fontStyle: ov.fontStyle, whiteSpace: 'pre', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{ov.text}</span>
                    ) : (
                      <span className="text-white/60 text-xs bg-white/10 rounded px-1.5 py-0.5 whitespace-nowrap">点击输入文字</span>
                    )}
                  </div>
                  <button onClick={(e2) => { e2.stopPropagation(); removeTextOverlay(i, ov.id); if (editingTextId === ov.id) setEditingTextId(null); }}
                    className={`absolute -top-2 -left-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] leading-none shadow-sm transition-opacity ${isLocked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>✕</button>
                  {isLocked && (
                    <button onClick={(e2) => { e2.stopPropagation(); setTextPanelMode('edit'); }}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-[10px] leading-none shadow-sm">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  )}
                </div>
              );
            }))}
          </div>
        </div>
      </div>

      {/* Undo/Redo — outside black bar */}
      <div className="flex items-center gap-2 px-4 py-1">
        <button onClick={undo} disabled={undoStack.length === 0} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 disabled:opacity-25 transition-all" title="撤销">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" /></svg>
        </button>
        <button onClick={redo} disabled={redoStack.length === 0} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 disabled:opacity-25 transition-all" title="重做">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" /></svg>
        </button>
      </div>

      {/* Bottom menu bar */}
      <div className="bg-black flex-shrink-0">
        {/* Background picker */}
        {showBgPicker && (
          <div className="px-4 pt-2 pb-2 animate-slide-up mt-1">
            <div className="flex flex-wrap gap-2">
              {BG_COLORS.map((color) => (
                <button key={color} onClick={() => applyBgToAll(color)} className={`w-8 h-8 rounded-full border-2 transition-all active:scale-90 hover:scale-110 ${currentBg === color ? 'border-primary scale-110 ring-2 ring-primary/30' : 'border-gray-200'}`} style={{ backgroundColor: color }} title={color} />
              ))}
            </div>
          </div>
        )}

        {/* Text main menu */}
        {textPanelMode === 'main' && (
          <div className="px-4 pt-2 pb-2 animate-slide-up  mt-1">
            <div className="flex justify-between gap-1">
              <button onClick={handleNewText} className="flex flex-col items-center gap-1 active:scale-95 transition-all">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14" /></svg>
                <span className="text-[10px] text-white/80">新建</span>
              </button>
              <button onClick={handleEditText} disabled={!hasText} className={`flex flex-col items-center gap-1 active:scale-95 transition-all ${!hasText ? 'opacity-25' : ''}`}>
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <span className="text-[10px] text-white/80">修改</span>
              </button>
              <button onClick={handleCopyText} disabled={!editingTextId || !editingOverlay} className={`flex flex-col items-center gap-1 active:scale-95 transition-all ${!editingTextId || !editingOverlay ? 'opacity-25' : ''}`}>
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                <span className="text-[10px] text-white/80">复制</span>
              </button>
              <button onClick={handleDeleteText} disabled={!editingTextId} className={`flex flex-col items-center gap-1 active:scale-95 transition-all ${!editingTextId ? 'opacity-25' : ''}`}>
                <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                <span className="text-[10px] text-red-400/80">删除</span>
              </button>
            </div>
          </div>
        )}

        {/* Text edit panel */}
        {textPanelMode === 'edit' && editingOverlay && (
          <div className="px-4 pt-2 pb-2 animate-slide-up  mt-1 space-y-3">
            <button onClick={() => setTextPanelMode('main')} className="text-xs text-white/60 hover:text-white flex items-center gap-1">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
              返回
            </button>
            <textarea placeholder="输入文字..." value={editingOverlay.text} onChange={(e) => updateTextOverlay(textCellIndex, editingTextId, { text: e.target.value })} className="w-full px-3 py-2 text-sm border border-white/10 bg-white/5 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-primary resize-none" rows={3} autoFocus />
            <div className="flex gap-2 border-b border-border">
              <button onClick={() => setEditSubTab('font')} className={`text-xs font-medium px-3 py-1.5 border-b-2 transition-all ${editSubTab === 'font' ? 'text-primary border-primary' : 'text-text-secondary border-transparent'}`}>字体</button>
              <button onClick={() => setEditSubTab('style')} className={`text-xs font-medium px-3 py-1.5 border-b-2 transition-all ${editSubTab === 'style' ? 'text-primary border-primary' : 'text-text-secondary border-transparent'}`}>样式</button>
            </div>
            {editSubTab === 'font' && (
              <div className="grid grid-cols-3 gap-2">
                {FONT_OPTIONS.map((font, i) => (
                  <button key={font} onClick={() => updateTextOverlay(textCellIndex, editingTextId, { fontFamily: font })} className={`p-3 rounded-xl border transition-all text-center ${editingOverlay.fontFamily === font ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-gray-50'}`} style={{ fontFamily: font }}>
                    <span className="text-sm">{FONT_LABELS[i]}</span>
                  </button>
                ))}
              </div>
            )}
            {editSubTab === 'style' && (
              <div className="space-y-3">
                <div>
                  <span className="text-[10px] text-text-secondary mb-1.5 block">字号</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => updateTextOverlay(textCellIndex, editingTextId, { fontSize: Math.max(8, editingOverlay.fontSize - 4) })} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-sm hover:bg-gray-50">−</button>
                    <span className="text-base font-medium min-w-[2rem] text-center">{editingOverlay.fontSize}</span>
                    <button onClick={() => updateTextOverlay(textCellIndex, editingTextId, { fontSize: Math.min(120, editingOverlay.fontSize + 4) })} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-sm hover:bg-gray-50">+</button>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-text-secondary mb-1.5 block">样式</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateTextOverlay(textCellIndex, editingTextId, { fontWeight: editingOverlay.fontWeight === 'bold' ? 'normal' : 'bold' })} className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${editingOverlay.fontWeight === 'bold' ? 'bg-primary text-white border-primary' : 'border-border hover:bg-gray-50'}`}>B</button>
                    <button onClick={() => updateTextOverlay(textCellIndex, editingTextId, { fontStyle: editingOverlay.fontStyle === 'italic' ? 'normal' : 'italic' })} className={`px-3 py-1.5 text-xs rounded-lg border transition-all italic ${editingOverlay.fontStyle === 'italic' ? 'bg-primary text-white border-primary' : 'border-border hover:bg-gray-50'}`}>I</button>
                    <div className="w-px h-5 bg-border mx-1" />
                    {(['left', 'center', 'right'] as const).map((a) => (
                      <button key={a} onClick={() => updateTextOverlay(textCellIndex, editingTextId, { textAlign: a })} className={`px-2 py-1.5 text-[10px] rounded-lg border transition-all ${editingOverlay.textAlign === a ? 'bg-primary text-white border-primary' : 'border-border hover:bg-gray-50'}`}>{a === 'left' ? '左' : a === 'center' ? '中' : '右'}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-text-secondary mb-1.5 block">字色</span>
                  <div className="flex flex-wrap gap-1.5">
                    {BG_COLORS.map((color) => (
                      <button key={color} onClick={() => updateTextOverlay(textCellIndex, editingTextId, { color })} className={`w-7 h-7 rounded-full border-2 transition-all active:scale-90 ${editingOverlay.color === color ? 'border-primary scale-110 ring-2 ring-primary/30' : 'border-gray-200'}`} style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Menu items row */}
        <div className="flex items-center gap-4 px-4 py-2">
          <button
            onClick={() => !bgLocked && (showBgPicker ? setShowBgPicker(false) : openBgPicker())}
            disabled={bgLocked}
            className={`text-xs font-medium px-3 py-2 rounded-lg transition-all min-w-[56px] ${bgLocked ? 'opacity-40 cursor-not-allowed text-text-secondary' : showBgPicker ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-gray-50 active:bg-gray-100'}`}
          >{bgLocked ? '已锁定' : '背景'}</button>
          <button
            onClick={() => textPanelMode ? (setTextPanelMode(null), setEditingTextId(null)) : openTextMain()}
            className={`text-xs font-medium px-3 py-2 rounded-lg transition-all min-w-[56px] ${textPanelMode ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-gray-50 active:bg-gray-100'}`}
          >文字</button>
        </div>

      </div>

      {/* Back confirm modal */}
      {showBackConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowBackConfirm(false)}>
          <div className="glass-strong max-w-xs w-full p-5 shadow-xl animate-[slideUp_0.2s_ease-out]" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-text text-center mb-4">确认放弃当前精修的图片？</p>
            <div className="flex gap-3">
              <button onClick={() => setShowBackConfirm(false)} className="flex-1 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium active:scale-[0.98]">取消</button>
              <button onClick={() => { setShowBackConfirm(false); setPage('upload'); }} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium active:scale-[0.98]">放弃</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
