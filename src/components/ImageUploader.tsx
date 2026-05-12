import { useRef, useCallback } from 'react';

interface Props {
  onFilesSelected: (files: File[]) => void;
  maxCount: number;
  currentCount: number;
  disabled?: boolean;
}

export default function ImageUploader({ onFilesSelected, maxCount, currentCount, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) {
        onFilesSelected(files);
      }
      // Reset so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = '';
    },
    [onFilesSelected]
  );

  const remaining = maxCount - currentCount;

  return (
    <div
      onClick={disabled ? undefined : handleClick}
      className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 transition-colors
        ${disabled ? 'border-border bg-gray-50 cursor-not-allowed' : 'border-primary/30 bg-primary/5 hover:bg-primary/10 cursor-pointer active:scale-[0.98]'}`}
    >
      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1677ff" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
        </svg>
      </div>
      <p className="text-text text-sm font-medium">
        {disabled ? '已达到最大数量' : '点击选择照片'}
      </p>
      <p className="text-text-secondary text-xs">
        {disabled
          ? `最多 ${maxCount} 张`
          : `还可添加 ${remaining} 张（共 ${currentCount}/${maxCount}）`}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  );
}
