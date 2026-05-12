import { useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import ImageUploader from './ImageUploader';
import ImageThumbnailGrid from './ImageThumbnailGrid';

export default function UploadStep() {
  const images = useAppStore((s) => s.uploadedImages);
  const addImages = useAppStore((s) => s.addImages);
  const removeImage = useAppStore((s) => s.removeImage);

  const handleFiles = useCallback(
    (files: File[]) => {
      // Filter to only image files
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        addImages(imageFiles);
      }
    },
    [addImages]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text">上传素材</h2>
        {images.length > 0 && (
          <button
            onClick={() => {
              for (let i = images.length - 1; i >= 0; i--) removeImage(i);
            }}
            className="text-xs text-red-400 hover:text-red-500"
          >
            清空全部
          </button>
        )}
      </div>

      {images.length > 0 && (
        <ImageThumbnailGrid images={images} onRemove={removeImage} />
      )}

      <ImageUploader
        onFilesSelected={handleFiles}
        maxCount={27}
        currentCount={images.length}
        disabled={images.length >= 27}
      />

      <p className="text-xs text-text-secondary text-center">
        支持 JPG、PNG、HEIC、Live Photo 关键帧 · 最多 27 张
      </p>
    </div>
  );
}
