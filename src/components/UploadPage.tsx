import { useRef, useCallback, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getSplitOptions } from '../engine/splitter';
import type { SplitOption } from '../engine/splitter';
import SplitModal from './SplitModal';
import { track } from '../utils/analytics';

export default function UploadPage() {
  const uploadedImages = useAppStore((s) => s.uploadedImages);
  const collageCount = useAppStore((s) => s.collageCount);
  const addImages = useAppStore((s) => s.addImages);
  const removeImage = useAppStore((s) => s.removeImage);
  const setPage = useAppStore((s) => s.setPage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);
  const [splitOptions, setSplitOptions] = useState<SplitOption[] | null>(null);
  const [showSplitModal, setShowSplitModal] = useState(false);

  const handleAddMore = () => fileRef.current?.click();

  const handleFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) await addImages(files);
    if (fileRef.current) fileRef.current.value = '';
  }, [addImages]);

  const doGenerate = useCallback(async (splitParts: number[]) => {
    setGenerating(true);
    const t0 = Date.now();
    track('generate_start', { imageCount: uploadedImages.length, splitOption: splitParts.join('+') });
    useAppStore.setState({ aspectRatio: { key: '1:1', label: '1:1', width: 1, height: 1 }, isProcessing: true, progress: { phase: 'generating', current: 0, total: 1, message: '正在生成...' } });

    try {
      const { analyzeImage } = await import('../engine/analyzer');
      const { generatePlansFromSplit } = await import('../engine/layout');
      const { loadImageElements, renderCellCanvases } = await import('../engine/renderer');

      const imgs: HTMLImageElement[] = [];
      for (const ui of uploadedImages) {
        const el = new Image(); el.src = ui.objectUrl;
        await new Promise<void>(r => { el.onload = () => r(); });
        imgs.push(el);
      }
      const analyses = [...useAppStore.getState().imageAnalyses];
      for (let i = 0; i < uploadedImages.length; i++) {
        if (!analyses[i]) analyses[i] = await analyzeImage(imgs[i], i);
      }

      try {
        const faceResults = await Promise.all(uploadedImages.map(async (ui) => {
          const blob = await fetch(ui.objectUrl).then(r => r.blob());
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => { reader.onload = () => resolve((reader.result as string).split(',')[1]); reader.readAsDataURL(blob); });
          const ctrl = new AbortController();
          setTimeout(() => ctrl.abort(), 60000);
          const resp = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8765'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base64 }), signal: ctrl.signal });
          return resp.json();
        }));
        for (let i = 0; i < analyses.length; i++) {
          if (faceResults[i]?.face && faceResults[i]?.faceRegion) {
            analyses[i] = { ...analyses[i], faceRegion: faceResults[i].faceRegion };
          }
        }
      } catch (e) { /* face server unavailable */ }

      const plans = generatePlansFromSplit(uploadedImages, analyses, useAppStore.getState().aspectRatio, splitParts, useAppStore.getState().layoutMode);
      const elements = await loadImageElements(uploadedImages);
      const cells = renderCellCanvases(plans, elements, uploadedImages);
      useAppStore.setState({
        imageAnalyses: analyses, canvasPlans: plans, cellCanvases: cells,
        cellBackgrounds: cells.map(() => '#000000'), cellTextOverlays: [], isProcessing: false, progress: null,
      });
      track('generate_done', { imageCount: uploadedImages.length, canvasCount: cells.length, genDuration: Math.round((Date.now() - t0) / 1000), splitOption: splitParts.join('+') });
      setPage('editor');
    } catch (e: any) {
      useAppStore.setState({ isProcessing: false, progress: null });
      alert('生成失败：' + (e?.message ?? '未知错误'));
    } finally { setGenerating(false); }
  }, [uploadedImages, setPage]);

  const doGenerateLegacy = useCallback(async () => {
    setGenerating(true);
    useAppStore.setState({ aspectRatio: { key: '1:1', label: '1:1', width: 1, height: 1 }, isProcessing: true, progress: { phase: 'generating', current: 0, total: 1, message: '正在生成...' } });
    try {
      const { analyzeImage } = await import('../engine/analyzer');
      const { generatePlans } = await import('../engine/layout');
      const { loadImageElements, renderCellCanvases } = await import('../engine/renderer');
      const imgs: HTMLImageElement[] = [];
      for (const ui of uploadedImages) {
        const el = new Image(); el.src = ui.objectUrl;
        await new Promise<void>(r => { el.onload = () => r(); });
        imgs.push(el);
      }
      const analyses = [...useAppStore.getState().imageAnalyses];
      for (let i = 0; i < uploadedImages.length; i++) {
        if (!analyses[i]) analyses[i] = await analyzeImage(imgs[i], i);
      }
      try {
        const faceResults = await Promise.all(uploadedImages.map(async (ui) => {
          const blob = await fetch(ui.objectUrl).then(r => r.blob());
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => { reader.onload = () => resolve((reader.result as string).split(',')[1]); reader.readAsDataURL(blob); });
          const ctrl = new AbortController();
          setTimeout(() => ctrl.abort(), 60000);
          const resp = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8765'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base64 }), signal: ctrl.signal });
          return resp.json();
        }));
        for (let i = 0; i < analyses.length; i++) {
          if (faceResults[i]?.face && faceResults[i]?.faceRegion) {
            analyses[i] = { ...analyses[i], faceRegion: faceResults[i].faceRegion };
          }
        }
      } catch (e) { /* face server unavailable */ }
      const plans = generatePlans(uploadedImages, analyses, useAppStore.getState().aspectRatio, useAppStore.getState().collageCount, useAppStore.getState().layoutMode);
      const elements = await loadImageElements(uploadedImages);
      const cells = renderCellCanvases(plans, elements, uploadedImages);
      useAppStore.setState({
        imageAnalyses: analyses, canvasPlans: plans, cellCanvases: cells,
        cellBackgrounds: cells.map(() => '#000000'), cellTextOverlays: [], isProcessing: false, progress: null,
      });
      setPage('editor');
    } catch (e: any) {
      useAppStore.setState({ isProcessing: false, progress: null });
      alert('生成失败：' + (e?.message ?? '未知错误'));
    } finally { setGenerating(false); }
  }, [uploadedImages, setPage]);

  const handleGenerate = useCallback(async () => {
    if (uploadedImages.length < 3) return;

    const effectiveN = Math.min(uploadedImages.length, 24);
    const options = getSplitOptions(effectiveN);

    if (options.length === 0) {
      await doGenerateLegacy();
      return;
    }

    if (options.length === 1) {
      await doGenerate(options[0].parts);
      return;
    }

    setSplitOptions(options);
    setShowSplitModal(true);
  }, [uploadedImages.length, doGenerate, doGenerateLegacy]);

  const handleSplitSelect = useCallback(async (option: SplitOption) => {
    setShowSplitModal(false);
    setSplitOptions(null);
    await doGenerate(option.parts);
  }, [doGenerate]);

  const handleSplitCancel = useCallback(() => {
    setShowSplitModal(false);
    setSplitOptions(null);
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-3 pb-3 flex items-center justify-between glass-bar safe-top">
        <button onClick={() => useAppStore.getState().reset()} className="text-sm text-text-secondary glass-btn active:scale-95">取消</button>
        <h1 className="text-base font-semibold text-text">上传素材</h1>
        <button onClick={handleAddMore} disabled={uploadedImages.length >= 24} className={`text-sm font-medium glass-btn active:scale-95 ${uploadedImages.length >= 24 ? 'opacity-30 cursor-not-allowed' : 'text-text'}`}>+ 添加</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-text">已选 {uploadedImages.length}/24 张</h2>
          </div>

          {uploadedImages.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {uploadedImages.map((img, i) => (
                <div key={img.id} className="relative">
                  <div className="aspect-square rounded-lg overflow-hidden bg-border">
                    <img src={img.objectUrl} alt={`${i + 1}`} className="w-full h-full object-cover" draggable={false} />
                  </div>
                  {!generating && (
                    <button onClick={() => removeImage(i)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/50 text-white flex items-center justify-center text-[10px]">✕</button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-text-secondary text-sm">暂无照片</div>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
        </div>
      </div>

      <div className="glass px-4 py-3">
        <button
          onClick={handleGenerate}
          disabled={uploadedImages.length < 3 || generating || showSplitModal}
          className="w-full py-3.5 rounded-xl text-white font-semibold text-base active:scale-[0.98] transition-all disabled:opacity-40 shadow-md relative overflow-hidden"
          style={{ backgroundColor: '#FB9BAD' }}>
          {uploadedImages.length < 3 ? `还需 ${3 - uploadedImages.length} 张照片` : showSplitModal ? '生成中...' : generating ? (
            <span className="inline-flex items-center justify-center gap-2">
              生成中
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </span>
          ) : '生成拼图'}
        </button>
      </div>

      {showSplitModal && splitOptions && (
        <SplitModal options={splitOptions} onSelect={handleSplitSelect} onCancel={handleSplitCancel} />
      )}
    </div>
  );
}
