"use client";

/**
 * 游戏模式星空粒子背景 + 检测爆发粒子
 *
 * 暗紫色调，缓慢飘浮，安静不喧宾夺主；
 * 通过 ref.emitBurst() 在「发现新实体」时触发一团向外迸发的粒子。
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface GameParticlesHandle {
  emitBurst: (opts?: { x?: number; y?: number; color?: string; count?: number }) => void;
}

interface BurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}
interface Burst {
  color: string;
  particles: BurstParticle[];
}

const GameParticles = forwardRef<GameParticlesHandle>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const burstsRef = useRef<Burst[]>([]);

  useImperativeHandle(ref, () => ({
    emitBurst: (opts) => {
      const canvas = canvasRef.current;
      const w = canvas?.width ?? window.innerWidth;
      const h = canvas?.height ?? window.innerHeight;
      const x = opts?.x ?? w * (0.3 + Math.random() * 0.4);
      const y = opts?.y ?? h * (0.3 + Math.random() * 0.4);
      const color = opts?.color || "#a78bfa";
      const n = opts?.count ?? 18;
      const particles: BurstParticle[] = [];
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n + Math.random() * 0.4;
        const sp = 1.6 + Math.random() * 2.6;
        particles.push({
          x,
          y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life: 1,
        });
      }
      burstsRef.current.push({ color, particles });
      // 限制同时存在的爆发数量，避免堆积
      if (burstsRef.current.length > 14) burstsRef.current.shift();
    },
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // 粒子池（少量，安静）
    const particles: Array<{
      x: number;
      y: number;
      r: number;
      speedX: number;
      speedY: number;
      alpha: number;
      alphaDir: number;
    }> = [];

    const count = 40; // 少量粒子，不喧闹
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.5,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.3 - 0.2, // 轻微上浮
        alpha: Math.random() * 0.4 + 0.1,
        alphaDir: Math.random() > 0.5 ? 0.003 : -0.003,
      });
    }

    let animId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 背景星空
      for (const p of particles) {
        p.x += p.speedX;
        p.y += p.speedY;
        p.alpha += p.alphaDir;

        // 边界循环
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // alpha 震荡
        if (p.alpha > 0.5 || p.alpha < 0.05) p.alphaDir *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(139, 92, 246, ${p.alpha})`; // violet-500
        ctx.fill();
      }

      // 检测爆发粒子
      const bursts = burstsRef.current;
      for (let bi = bursts.length - 1; bi >= 0; bi--) {
        const b = bursts[bi];
        let alive = false;
        for (const pt of b.particles) {
          pt.x += pt.vx;
          pt.y += pt.vy;
          pt.vy += 0.02; // 轻微重力
          pt.life -= 0.014;
          if (pt.life > 0) {
            alive = true;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 2.4 * pt.life + 0.6, 0, Math.PI * 2);
            ctx.globalAlpha = Math.max(0, pt.life);
            ctx.fillStyle = b.color;
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        if (!alive) bursts.splice(bi, 1);
      }

      animId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    />
  );
});

GameParticles.displayName = "GameParticles";

export default GameParticles;
