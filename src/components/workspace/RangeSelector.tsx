"use client";

import { useState } from "react";

/**
 * 范围选择器——解析用户输入的范围表达式，返回选中索引集合（0-based）
 *
 * 支持格式：
 *   "1-50"    → 0..49
 *   "1,3,5"   → [0,2,4]
 *   "1-5,8,10-15" → 混合
 *   "10-"     → 10 到末尾
 *   "-30"     → 开头到 30
 *   "all" / "*" → 全选
 *   ""        → 清空
 */

export function parseRange(raw: string, total: number): Set<number> {
  const s = raw.trim().toLowerCase();
  if (!s) return new Set();
  if (s === "all" || s === "*") return new Set(Array.from({ length: total }, (_, i) => i));

  const result = new Set<number>();
  const parts = s.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.includes("-")) {
      const dashIdx = trimmed.indexOf("-");
      const left = trimmed.slice(0, dashIdx).trim();
      const right = trimmed.slice(dashIdx + 1).trim();

      const start = left ? parseInt(left, 10) - 1 : 0; // 1-based → 0-based
      const end = right ? parseInt(right, 10) - 1 : total - 1;

      if (isNaN(start) && isNaN(end)) continue;

      const from = Math.max(0, isNaN(start) ? 0 : start);
      const to = Math.min(total - 1, isNaN(end) ? total - 1 : end);

      for (let i = from; i <= to; i++) {
        if (i >= 0 && i < total) result.add(i);
      }
    } else {
      const n = parseInt(trimmed, 10);
      if (!isNaN(n)) {
        const idx = n - 1; // 1-based → 0-based
        if (idx >= 0 && idx < total) result.add(idx);
      }
    }
  }

  return result;
}

export function RangeSelector({
  total,
  placeholder,
  onSelect,
  className = "",
}: {
  total: number;
  placeholder?: string;
  onSelect: (indices: Set<number>) => void;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [lastApplied, setLastApplied] = useState("");

  const apply = (raw: string) => {
    const indices = parseRange(raw, total);
    setLastApplied(raw.trim());
    onSelect(indices);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      apply(value);
    }
    if (e.key === "Escape") {
      setValue("");
      apply("");
    }
  };

  const handleBlur = () => {
    if (value !== lastApplied) {
      apply(value);
    }
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder || `1-${total}`}
        className="w-24 bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-0.5 text-[10px] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-amber-700"
      />
      {lastApplied && (
        <span className="text-[10px] text-zinc-600">
          {lastApplied === "all" || lastApplied === "*" ? "全部" : lastApplied}
        </span>
      )}
    </div>
  );
}
