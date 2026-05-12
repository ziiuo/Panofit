export type AspectRatioKey = '1:1' | '3:4' | '2:3' | '9:16';
export type LayoutMode = 'A' | 'B';
export type StepId = 0 | 1 | 2 | 3 | 4;

export interface AspectRatio {
  key: AspectRatioKey;
  label: string;
  width: number;
  height: number;
}

export const ASPECT_RATIOS: AspectRatio[] = [
  { key: '1:1', label: '1:1', width: 1, height: 1 },
  { key: '3:4', label: '3:4', width: 3, height: 4 },
  { key: '2:3', label: '2:3', width: 2, height: 3 },
  { key: '9:16', label: '9:16', width: 9, height: 16 },
];

export const DEFAULT_ASPECT_RATIO: AspectRatio = ASPECT_RATIOS[0]; // 1:1 default
export const RECOMMENDED_COUNTS = [1, 2, 3, 4, 6, 9];
export const DISCOURAGED_COUNTS = [5, 7, 8];
export const MODE_B_COUNTS = [4, 6, 9];

export interface UploadedImage {
  id: string;
  file: File;
  objectUrl: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface DominantColor {
  hex: string;
  r: number; g: number; b: number;
  h: number; s: number; v: number;
  proportion: number;
}

export interface ImageAnalysis {
  index: number;
  orientation: 'portrait' | 'landscape' | 'square';
  dominantColors: DominantColor[];
  edgeDensity: number;
  skyScore: number;
  portraitScore: number;
  skinPixelRatio: number;
  faceRegion: { cx: number; cy: number; r: number } | null;
  horizonY: number | null;
  textureComplexity: number;
  warmthScore: number;
  sceneType: 'landscape' | 'portrait' | 'architecture' | 'macro' | 'general';
}

/** Where and how an uploaded image is placed on a canvas */
export interface ImagePlacement {
  imageIndex: number;
  x: number; y: number;
  width: number; height: number;
  zIndex: number;
  // Optional source crop (in original image pixels). If set, only this region is drawn.
  sx?: number; sy?: number; sw?: number; sh?: number;
}

/** A slice (output cell) to cut from the composed canvas */
export interface SliceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One canvas plan: a big canvas with image placements, then sliced into cells */
export interface CanvasPlan {
  index: number;
  canvasWidth: number;
  canvasHeight: number;
  placements: ImagePlacement[];
  slices: SliceRect[];
  fullBgImageIndex: number;
  bgLockedIndices: number[];
  debug: string[];
}

export interface ProcessingProgress {
  phase: string;
  current: number;
  total: number;
  message: string;
}

export type PageId = 'home' | 'upload' | 'editor' | 'preview' | 'save';

export type EditorAction = {
  type: 'bg';
  index: number;
  from: string;
  to: string;
} | {
  type: 'bg-all';
  from: string[];
  to: string;
} | {
  type: 'text-add';
  cellIndex: number;
  overlayId: string;
} | {
  type: 'text-edit';
  cellIndex: number;
  overlayId: string;
  from: TextOverlay;
  to: TextOverlay;
} | {
  type: 'text-remove';
  cellIndex: number;
  overlayId: string;
  overlay: TextOverlay;
};

export interface TextOverlay {
  id: string;
  text: string;
  x: number; y: number;     // normalized 0-1 within cell
  fontSize: number;
  fontFamily: string;
  color: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
}

export interface AppState {
  page: PageId;
  collageCount: number;
  aspectRatio: AspectRatio;
  uploadedImages: UploadedImage[];
  imageAnalyses: (ImageAnalysis | null)[];
  layoutMode: LayoutMode;
  canvasPlans: CanvasPlan[];
  cellCanvases: HTMLCanvasElement[];
  cellBackgrounds: string[];
  cellTextOverlays: TextOverlay[][];
  isProcessing: boolean;
  progress: ProcessingProgress | null;
  editorIndex: number;
  undoStack: EditorAction[];
  redoStack: EditorAction[];
  manualGroups: number[][];

  setCollageCount: (count: number) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  addImages: (files: File[]) => Promise<void>;
  removeImage: (index: number) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  processLayouts: () => Promise<void>;
  renderPreview: () => Promise<void>;
  exportAll: () => Promise<void>;
  goToStep: (step: StepId) => void;
  nextStep: () => void;
  prevStep: () => void;
  setPage: (page: PageId) => void;
  setEditorIndex: (index: number) => void;
  setCellBackground: (index: number, color: string) => void;
  setAllCellBackgrounds: (color: string) => void;
  addTextOverlay: (cellIndex: number) => string;
  updateTextOverlay: (cellIndex: number, overlayId: string, changes: Partial<TextOverlay>) => void;
  removeTextOverlay: (cellIndex: number, overlayId: string) => void;
  undo: () => void;
  redo: () => void;
  setManualGroups: (groups: number[][]) => void;
  reset: () => void;
}
