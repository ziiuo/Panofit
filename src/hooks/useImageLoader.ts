import { useState, useCallback } from 'react';
import type { UploadedImage } from '../types';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useImageLoader(onImagesAdded: (images: UploadedImage[]) => void) {
  const [loading, setLoading] = useState(false);

  const loadFiles = useCallback(async (files: File[]) => {
    setLoading(true);
    const results: UploadedImage[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const objectUrl = URL.createObjectURL(file);
      try {
        const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => reject(new Error('Failed to load'));
          img.src = objectUrl;
        });
        results.push({
          id: generateId(),
          file,
          objectUrl,
          naturalWidth: dims.w,
          naturalHeight: dims.h,
        });
      } catch {
        URL.revokeObjectURL(objectUrl);
      }
    }

    if (results.length > 0) {
      onImagesAdded(results);
    }
    setLoading(false);
  }, [onImagesAdded]);

  return { loadFiles, loading };
}
