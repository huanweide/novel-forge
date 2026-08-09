"use client";

/**
 * 弹窗内通用表单小部件。
 *
 * 注意：遮罩层 / 关闭行为 / focus trap 已由 `src/components/ui/Modal.tsx` 统一提供，
 * 业务弹窗请勿再手写 `fixed inset-0` 遮罩，也不要使用已删除的 `DialogOverlay`，
 * 统一用 <Modal open onClose bare panelClassName="..."> 包裹即可。
 */

export function DialogField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-[var(--nv-text-secondary)] mb-1 block">
        {label}
        {required && <span className="text-[var(--nv-danger)] ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}

export function DialogInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  rows,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  rows?: number;
  className?: string;
}) {
  if (rows && rows > 1) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className={`input-glass w-full rounded-lg px-3 py-2 text-xs resize-none focus:border-[var(--nv-primary)] placeholder:text-[var(--nv-text-tertiary)] ${className ?? ""}`}
      />
    );
  }
  return (
    <input
      className={`input-glass w-full rounded px-3 py-2 text-sm focus:border-[var(--nv-primary)] ${className ?? ""}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
    />
  );
}
