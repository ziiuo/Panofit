import { useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { IconOption2V2 } from './IconOption2V2';

export default function HomePage() {
  const addImages = useAppStore((s) => s.addImages);
  const setPage = useAppStore((s) => s.setPage);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleClick = () => fileRef.current?.click();

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      await addImages(imageFiles);
      setPage('upload');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="h-full flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-6">
        <IconOption2V2 size={120} />

        <div className="text-center">
          <h1 className="text-4xl font-bold text-white tracking-wide">Panofit</h1>
          <p className="text-sm text-text-secondary mt-3">一键跨屏拼图</p>
        </div>

        <button
          onClick={handleClick}
          className="glass-strong px-14 py-4 text-text text-lg font-semibold active:scale-95 transition-all mt-10"
        >
          开始拼图
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
