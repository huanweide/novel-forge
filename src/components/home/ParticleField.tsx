"use client";

import { useEffect, useRef } from "react";

/**
 * 星尘粒子场（Layer B · 首页签名元素）
 *
 * canvas 2D 星点隐喻「故事星尘 / 记忆碎片」，契合「小说宇宙」主题。
 * 邻近粒子用极淡连线构成「星图」感。
 *
 * 性能与无障碍底线：
 *  - DPR 适配，避免高分屏模糊
 *  - 启动延后到 requestIdleCallback，不阻塞 LCP
 *  - prefers-reduced-motion：仅绘制一帧静态星点，不进入 rAF 循环
 *  - 页面隐藏（visibilitychange）时暂停 rAF，回到前台再恢复
 *  - 鼠标视差：canvas 整体 transform 位移合成，不重算粒子坐标
 *  - 浅色主题：监听 html.light 切换调色板（深蓝灰星点）
 *  - will-change 仅在动画进行中生效；停止即归位
 */

type Particle = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  baseAlpha: number;
  alpha: number;
  alphaDir: number;
  tint: number; // 0 中性星白 / 1 靛蓝 / 2 紫罗兰 / 3 金
  ox: number; // 聚拢偏移 X（卡片 hover/focus 时向目标点轻微位移）
  oy: number; // 聚拢偏移 Y
};

// 三色族点缀（与 .text-gradient 同源），中性星白单列在调色板内按主题切换
const TINTS: ReadonlyArray<readonly [number, number, number]> = [
  [120, 140, 255], // 靛蓝
  [180, 130, 255], // 紫罗兰
  [255, 210, 130], // 金
];

export default function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const palettes = {
      dark: { neutral: [200, 210, 255] as const, scale: 1 },
      light: { neutral: [60, 70, 110] as const, scale: 0.7 },
    };
    let theme: "dark" | "light" = document.documentElement.classList.contains("light")
      ? "light"
      : "dark";

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    let particles: Particle[] = [];
    let rafId = 0;
    let running = false;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    let attract: { x: number; y: number } | null = null; // 卡片 hover/focus 聚拢目标点（屏幕坐标，经 window 事件注入）

    const seed = () => {
      // 按视口面积动态上限，避免大屏过密 / 小屏过稀（与 GameParticles 思路一致但更克制）
      const area = width * height;
      const count = Math.max(50, Math.min(150, Math.round(area / 16000)));
      particles = [];
      for (let i = 0; i < count; i++) {
        const tint = Math.random() < 0.7 ? 0 : Math.floor(Math.random() * 3) + 1; // 70% 中性 + 30% 三色族
        const baseAlpha = 0.15 + Math.random() * 0.35;
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: Math.random() * 1.4 + 0.4,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25 - 0.08, // 轻微上浮
          baseAlpha,
          alpha: baseAlpha,
          alphaDir: Math.random() > 0.5 ? 0.004 : -0.004,
          tint,
          ox: 0,
          oy: 0,
        });
      }
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const pal = palettes[theme];
      const scale = pal.scale;

      // 星点
      for (const p of particles) {
        const rgb = p.tint === 0 ? pal.neutral : TINTS[p.tint - 1];
        ctx.beginPath();
        ctx.arc(p.x + p.ox, p.y + p.oy, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${p.alpha * scale})`;
        ctx.fill();
      }

      // 星图连线：仅对近距离粒子对绘制极淡线，开销可控（n<90 → <4000 次距离判断）
      const LINK = 120;
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK) {
            const o = (1 - dist / LINK) * 0.06 * scale;
            ctx.strokeStyle = `rgba(${pal.neutral[0]}, ${pal.neutral[1]}, ${pal.neutral[2]}, ${o})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(a.x + a.ox, a.y + a.oy);
            ctx.lineTo(b.x + b.ox, b.y + b.oy);
            ctx.stroke();
          }
        }
      }
    };

    const step = () => {
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha += p.alphaDir;
        if (p.alpha > p.baseAlpha + 0.15 || p.alpha < p.baseAlpha - 0.15) p.alphaDir *= -1;
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;
        // 聚拢偏移：仅目标点附近粒子受微弱吸引力，取消后弹性回位（开销极小，不全局重绘）
        if (attract) {
          const dx = attract.x - p.x;
          const dy = attract.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 320) {
            const f = (1 - dist / 320) * 0.15;
            p.ox += dx * 0.02 * f;
            p.oy += dy * 0.02 * f;
          }
        }
        p.ox *= 0.9;
        p.oy *= 0.9;
      }
      draw();

      // 鼠标视差：整体位移合成，不重算粒子坐标（仅精确指针设备，触屏不做）
      if (finePointer) {
        mouse.tx += (mouse.x - mouse.tx) * 0.05;
        mouse.ty += (mouse.y - mouse.ty) * 0.05;
        const px = (mouse.tx / width - 0.5) * 18;
        const py = (mouse.ty / height - 0.5) * 18;
        canvas.style.transform = `translate3d(${px}px, ${py}px, 0)`;
      }

      rafId = requestAnimationFrame(step);
    };

    const start = () => {
      if (running) return;
      running = true;
      canvas.style.willChange = "transform";
      rafId = requestAnimationFrame(step);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(rafId);
      canvas.style.willChange = "auto";
    };

    const renderStatic = () => {
      // reduced-motion：仅一帧静态星点，无动画循环
      for (const p of particles) p.alpha = p.baseAlpha;
      draw();
    };

    resize();

    const onMouse = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onAttract = (e: Event) => {
      const detail = (e as CustomEvent<{ x: number; y: number } | null>).detail;
      attract = detail ?? null;
    };
    // 监听始终挂载（回调极廉价），动画循环由 reduced-motion 门控——
    // 避免「系统设置中途切换」后鼠标监听与 rAF 状态不同步
    window.addEventListener("mousemove", onMouse, { passive: true });
    window.addEventListener("nf-particle-attract", onAttract as EventListener);

    const onVis = () => {
      if (document.hidden) stop();
      else if (!reduceMotion.matches) start();
    };
    document.addEventListener("visibilitychange", onVis);

    const onReduceChange = () => {
      if (reduceMotion.matches) { stop(); renderStatic(); }
      else start();
    };
    reduceMotion.addEventListener("change", onReduceChange);

    // 主题切换重着色
    const mo = new MutationObserver(() => {
      theme = document.documentElement.classList.contains("light") ? "light" : "dark";
      if (reduceMotion.matches) renderStatic();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    if (reduceMotion.matches) {
      renderStatic();
    } else {
      // idle 启动，不阻塞 LCP
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle(start, { timeout: 1200 });
      else window.setTimeout(start, 300);
    }

    return () => {
      stop();
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("nf-particle-attract", onAttract as EventListener);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      reduceMotion.removeEventListener("change", onReduceChange);
      mo.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed -inset-6 z-0 pointer-events-none"
      aria-hidden="true"
    />
  );
}
