"use client";

/**
 * 指针跟随设计师：包裹任意卡片，鼠标在卡片上移动时，
 * 冷色系渐变光斑以 transform 硬件加速平滑跟随指针（rAF 线性插值）。
 * 光斑样式由 globals.css 的 .pointer-blob / .pointer-card 定义，随游戏模式换色。
 */

import { useRef, type ReactNode } from "react";

export function PointerGlow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: -9999, y: -9999 });
  const cur = useRef({ x: -9999, y: -9999 });
  const raf = useRef<number | null>(null);

  const loop = () => {
    const c = cur.current;
    const t = target.current;
    c.x += (t.x - c.x) * 0.18;
    c.y += (t.y - c.y) * 0.18;
    if (blobRef.current) {
      blobRef.current.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) translate(-50%, -50%)`;
    }
    if (Math.abs(t.x - c.x) > 0.5 || Math.abs(t.y - c.y) > 0.5) {
      raf.current = requestAnimationFrame(loop);
    } else {
      raf.current = null;
    }
  };

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    target.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (raf.current == null) raf.current = requestAnimationFrame(loop);
  };

  return (
    <div ref={wrapRef} className={`pointer-card ${className}`} onMouseMove={onMove}>
      <div ref={blobRef} className="pointer-blob" aria-hidden="true" />
      {children}
    </div>
  );
}

export default PointerGlow;
