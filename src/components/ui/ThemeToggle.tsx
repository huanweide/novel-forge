"use client";

/**
 * 主题切换器 —— 三档 UI 风格：夜航（暗色·默认）/ 白昼（浅色）/ 苍青（青绿深色）。
 *
 * 状态持久化在 localStorage('nf-theme')，根布局防闪烁脚本会在首屏渲染前
 * 读取该值并加好 class，因此切换不会造成白屏闪烁。
 */

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icons";

type ThemeId = "dark" | "light" | "azure";
const THEMES: { id: ThemeId; name: string; desc: string; icon: IconName }[] = [
  { id: "dark", name: "夜航", desc: "虚空暗色 · 默认", icon: "moon" },
  { id: "light", name: "白昼", desc: "浅色 · 日光", icon: "sun" },
  { id: "azure", name: "苍青", desc: "青绿深色 · 新风格", icon: "sparkles" },
];

function applyTheme(id: ThemeId) {
  const d = document.documentElement;
  d.classList.remove("light", "dark", "azure");
  if (id === "light") d.classList.add("light");
  else if (id === "azure") { d.classList.add("azure"); d.classList.add("dark"); } // 苍青=深色风格，保留 dark: 变体
  else d.classList.add("dark");
  try {
    localStorage.setItem("nf-theme", id);
  } catch {
    /* 无痕模式可能禁用 localStorage，忽略即可 */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", id === "light" ? "#EEF0F4" : id === "azure" ? "#04090C" : "#4f46e5");
  }
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeId>("dark");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = document.documentElement;
    setTheme(d.classList.contains("light") ? "light" : d.classList.contains("azure") ? "azure" : "dark");
  }, []);

  useEffect(() => {
    const onDocDown = (e: PointerEvent) => {
      if (open && wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [open]);

  const cur = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  const pick = (id: ThemeId) => {
    applyTheme(id);
    setTheme(id);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="切换界面风格"
        title={`界面风格：${cur.name}（${cur.desc}）`}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] hover:border-[var(--nv-border-3)] transition-all duration-150 active:scale-[0.97] px-2.5 py-1.5"
      >
        <Icon name={cur.icon} size={15} />
        <span className="text-xs font-medium">{cur.name}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[11rem] rounded-xl border border-[var(--nv-border-3)] bg-[var(--nv-surface-3)] p-1 shadow-xl backdrop-blur-md">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                t.id === theme
                  ? "bg-[var(--nv-primary-soft)] text-[var(--nv-text-primary)]"
                  : "text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
              }`}
            >
              <Icon name={t.icon} size={14} />
              <span className="flex flex-col items-start leading-tight">
                <span>{t.name}</span>
                <span className="text-[10px] opacity-60">{t.desc}</span>
              </span>
              {t.id === theme && <span className="ml-auto opacity-70">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
