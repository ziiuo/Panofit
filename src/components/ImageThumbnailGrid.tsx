import type { UploadedImage } from '../types';
import ImageThumbnail from './ImageThumbnail';

interface Props {
  images: UploadedImage[];
  onRemove: (index: number) => void;
}

export default function ImageThumbnailGrid({ images, onRemove }: Props) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {images.map((img, i) => (
        <ImageThumbnail key={img.id} image={img} index={i} onRemove={onRemove} />
      ))}
    </div>
  );
}
