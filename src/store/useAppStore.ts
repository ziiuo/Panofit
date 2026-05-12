import { create } from 'zustand';
import type { AppState, UploadedImage, AspectRatio, TextOverlay } from '../types';
import { DEFAULT_ASPECT_RATIO } from '../types';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Auto-detect best output count: 2-3 source images per output, valid counts [1,2,3,4,6,9] */
export function autoDetectCount(imageCount: number): number {
  const valid = [1, 2, 3, 4, 6, 9];
  // 3 → 2 (Layout 0.1), 4 → 3 (Layout 1.1), 5 → 3 (Layout 2.1), 6 → 3 (Layout 3.1), 7-8 → 3
  if (imageCount === 3) return 2;
  if (imageCount === 4) return 3;
  if (imageCount === 5) return 3;
  if (imageCount === 6) return 3;
  if (imageCount === 7) return 3;
  if (imageCount === 8) return 3;
  if (imageCount >= 9) return 6;
  const ideal = Math.round(imageCount / 2.5);
  let best = valid[0];
  for (const v of valid) {
    if (Math.abs(v - ideal) < Math.abs(best - ideal)) best = v;
    if (v >= ideal) break;
  }
  return Math.min(best, Math.ceil(imageCount / 2));
}

export const useAppStore = create<AppState>((set, get) => ({
  page: 'home',
  collageCount: 4,
  aspectRatio: DEFAULT_ASPECT_RATIO,
  uploadedImages: [],
  imageAnalyses: [],
  layoutMode: 'A',
  canvasPlans: [],
  cellCanvases: [],
  cellBackgrounds: [],
  cellTextOverlays: [],
  isProcessing: false,
  progress: null,
  editorIndex: 0,
  undoStack: [],
  redoStack: [],
  manualGroups: [],

  setCollageCount: (count) => set({ collageCount: count }),
  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),

  addImages: async (files) => {
    const existing = get().uploadedImages;
    if (existing.length >= 24) { alert('最多上传 24 张照片'); return; }
    const remaining = 24 - existing.length;
    if (files.length > remaining) alert(`最多还能上传 ${remaining} 张，已自动截取`);
    const toAdd = files.slice(0, remaining);

    const newImages: UploadedImage[] = [];
    for (const file of toAdd) {
      const objectUrl = URL.createObjectURL(file);
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = objectUrl;
      });
      newImages.push({
        id: generateId(),
        file,
        objectUrl,
        naturalWidth: dims.w,
        naturalHeight: dims.h,
      });
    }

    const allImages = [...existing, ...newImages].slice(0, 24);
    // Auto-detect count
    const count = autoDetectCount(allImages.length);
    set({ uploadedImages: allImages, collageCount: count });
  },

  removeImage: (index) => {
    const images = get().uploadedImages;
    const removed = images[index];
    if (removed) URL.revokeObjectURL(removed.objectUrl);
    const next = images.filter((_, i) => i !== index);
    set({
      uploadedImages: next,
      collageCount: autoDetectCount(next.length),
      imageAnalyses: [],
      canvasPlans: [],
      cellCanvases: [],
    });
  },

  setLayoutMode: (mode) => set({ layoutMode: mode }),
  processLayouts: async () => {},
  renderPreview: async () => {},
  exportAll: async () => {},

  goToStep: (step) => set({ currentStep: step }),
  nextStep: () => {},
  prevStep: () => {},

  setPage: (page) => set({ page }),
  setEditorIndex: (i) => set({ editorIndex: i }),
  setManualGroups: (groups) => set({ manualGroups: groups }),

  addTextOverlay: (cellIndex) => {
    const overlays = [...get().cellTextOverlays];
    while (overlays.length <= cellIndex) overlays.push([]);
    const id = generateId();
    const overlay: TextOverlay = {
      id, text: '', x: 0.1, y: 0.3, fontSize: 36,
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      color: '#FFFFFF', fontWeight: 'normal', fontStyle: 'normal', textAlign: 'left',
    };
    overlays[cellIndex] = [...overlays[cellIndex], overlay];
    const undo = [...get().undoStack];
    undo.push({ type: 'text-add', cellIndex, overlayId: id });
    set({ cellTextOverlays: overlays, undoStack: undo, redoStack: [] });
    return id;
  },

  updateTextOverlay: (cellIndex, overlayId, changes) => {
    const overlays = [...get().cellTextOverlays];
    if (!overlays[cellIndex]) return;
    const idx = overlays[cellIndex].findIndex(o => o.id === overlayId);
    if (idx < 0) return;
    const from = { ...overlays[cellIndex][idx] };
    overlays[cellIndex] = [...overlays[cellIndex]];
    overlays[cellIndex][idx] = { ...from, ...changes };
    const undo = [...get().undoStack];
    undo.push({ type: 'text-edit', cellIndex, overlayId, from, to: { ...overlays[cellIndex][idx] } });
    set({ cellTextOverlays: overlays, undoStack: undo, redoStack: [] });
  },

  removeTextOverlay: (cellIndex, overlayId) => {
    const overlays = [...get().cellTextOverlays];
    if (!overlays[cellIndex]) return;
    const idx = overlays[cellIndex].findIndex(o => o.id === overlayId);
    if (idx < 0) return;
    const overlay = { ...overlays[cellIndex][idx] };
    overlays[cellIndex] = overlays[cellIndex].filter(o => o.id !== overlayId);
    const undo = [...get().undoStack];
    undo.push({ type: 'text-remove', cellIndex, overlayId, overlay });
    set({ cellTextOverlays: overlays, undoStack: undo, redoStack: [] });
  },

  setCellBackground: (index, color) => {
    const bgs = [...get().cellBackgrounds];
    while (bgs.length <= index) bgs.push('#000000');
    // Save previous for undo
    const prev = bgs[index];
    bgs[index] = color;
    const undo = [...get().undoStack];
    undo.push({ type: 'bg', index, from: prev, to: color });
    set({ cellBackgrounds: bgs, undoStack: undo, redoStack: [] });
  },

  setAllCellBackgrounds: (color) => {
    const bgs = [...get().cellBackgrounds];
    const from = [...bgs];
    const count = get().cellCanvases.length;
    while (bgs.length < count) bgs.push('#000000');
    for (let i = 0; i < count; i++) bgs[i] = color;
    while (from.length < count) from.push('#000000');
    const undo = [...get().undoStack];
    undo.push({ type: 'bg-all', from: from.slice(0, count), to: color });
    set({ cellBackgrounds: bgs, undoStack: undo, redoStack: [] });
  },

  undo: () => {
    const undo = [...get().undoStack];
    if (undo.length === 0) return;
    const action = undo.pop()!;
    const redo = [...get().redoStack];
    redo.push(action);
    const cell = get().cellTextOverlays;
    if (action.type === 'bg') {
      const bgs = [...get().cellBackgrounds];
      bgs[action.index] = action.from;
      set({ cellBackgrounds: bgs, undoStack: undo, redoStack: redo });
    } else if (action.type === 'bg-all') {
      set({ cellBackgrounds: [...action.from], undoStack: undo, redoStack: redo });
    } else if (action.type === 'text-add') {
      const overlays = [...cell];
      if (overlays[action.cellIndex]) overlays[action.cellIndex] = overlays[action.cellIndex].filter(o => o.id !== action.overlayId);
      set({ cellTextOverlays: overlays, undoStack: undo, redoStack: redo });
    } else if (action.type === 'text-remove') {
      const overlays = [...cell];
      while (overlays.length <= action.cellIndex) overlays.push([]);
      overlays[action.cellIndex] = [...overlays[action.cellIndex], action.overlay];
      set({ cellTextOverlays: overlays, undoStack: undo, redoStack: redo });
    } else if (action.type === 'text-edit') {
      const overlays = [...cell];
      if (overlays[action.cellIndex]) {
        const idx = overlays[action.cellIndex].findIndex(o => o.id === action.overlayId);
        if (idx >= 0) {
          overlays[action.cellIndex] = [...overlays[action.cellIndex]];
          overlays[action.cellIndex][idx] = action.from;
        }
      }
      set({ cellTextOverlays: overlays, undoStack: undo, redoStack: redo });
    }
  },

  redo: () => {
    const redo = [...get().redoStack];
    if (redo.length === 0) return;
    const action = redo.pop()!;
    const undo = [...get().undoStack];
    undo.push(action);
    const cell = get().cellTextOverlays;
    if (action.type === 'bg') {
      const bgs = [...get().cellBackgrounds];
      bgs[action.index] = action.to;
      set({ cellBackgrounds: bgs, undoStack: undo, redoStack: redo });
    } else if (action.type === 'bg-all') {
      const bgs = [...get().cellBackgrounds];
      for (let i = 0; i < Math.min(bgs.length, get().cellCanvases.length); i++) bgs[i] = action.to;
      set({ cellBackgrounds: bgs, undoStack: undo, redoStack: redo });
    } else if (action.type === 'text-add') {
      const overlays = [...cell];
      while (overlays.length <= action.cellIndex) overlays.push([]);
      const ov = { id: action.overlayId, text: '', x: 0.1, y: 0.3, fontSize: 36, fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif', color: '#FFFFFF', fontWeight: 'normal' as const, fontStyle: 'normal' as const, textAlign: 'left' as const };
      overlays[action.cellIndex] = [...overlays[action.cellIndex], ov];
      set({ cellTextOverlays: overlays, undoStack: undo, redoStack: redo });
    } else if (action.type === 'text-remove') {
      const overlays = [...cell];
      if (overlays[action.cellIndex]) overlays[action.cellIndex] = overlays[action.cellIndex].filter(o => o.id !== action.overlayId);
      set({ cellTextOverlays: overlays, undoStack: undo, redoStack: redo });
    } else if (action.type === 'text-edit') {
      const overlays = [...cell];
      if (overlays[action.cellIndex]) {
        const idx = overlays[action.cellIndex].findIndex(o => o.id === action.overlayId);
        if (idx >= 0) {
          overlays[action.cellIndex] = [...overlays[action.cellIndex]];
          overlays[action.cellIndex][idx] = action.to;
        }
      }
      set({ cellTextOverlays: overlays, undoStack: undo, redoStack: redo });
    }
  },

  reset: () => {
    const images = get().uploadedImages;
    for (const img of images) URL.revokeObjectURL(img.objectUrl);
    const canvases = get().cellCanvases;
    for (const c of canvases) c.width = 0;
    set({
      page: 'home',
      collageCount: 4,
      aspectRatio: DEFAULT_ASPECT_RATIO,
      uploadedImages: [],
      imageAnalyses: [],
      layoutMode: 'A',
      canvasPlans: [],
      cellCanvases: [],
      cellBackgrounds: [],
      cellTextOverlays: [],
      isProcessing: false,
      progress: null,
      editorIndex: 0,
      undoStack: [],
      redoStack: [],
      manualGroups: [],
    });
  },
}));
