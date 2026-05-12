import type { SplitOption } from '../engine/splitter';

interface SplitModalProps {
  options: SplitOption[];
  onSelect: (option: SplitOption) => void;
  onCancel: () => void;
}

export default function SplitModal({ options, onSelect, onCancel }: SplitModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="glass-strong max-w-sm w-full p-5 shadow-xl animate-[slideUp_0.2s_ease-out]" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-text mb-4 text-center">选择生成方案</h2>
        <div className="space-y-2.5">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onSelect(opt)}
              className="w-full flex items-center justify-center gap-3 p-4 rounded-xl border border-white/10 hover:border-primary/40 active:scale-[0.98] transition-all bg-white/5"
            >
              <span className="text-lg font-semibold text-white">{opt.totalOutput}</span>
              <span className="text-sm font-medium text-white/80">张图</span>
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="w-full mt-3 py-2.5 text-sm text-white/50 font-medium active:scale-[0.98] rounded-xl hover:bg-white/5 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
}
