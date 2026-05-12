import type { UploadedImage } from '../types';

interface Props {
  image: UploadedImage;
  index: number;
  onRemove: (index: number) => void;
}

export default function ImageThumbnail({ image, index, onRemove }: Props) {
  return (
    <div className="relative aspect-square rounded-lg overflow-hidden bg-border group">
      <img
        src={image.objectUrl}
        alt={`素材 ${index + 1}`}
        className="w-full h-full object-cover"
        draggable={false}
      />
      <button
        onClick={() => onRemove(index)}
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center text-xs hover:bg-red-500 transition-colors"
      >
        ✕
      </button>
    </div>
  );
}
