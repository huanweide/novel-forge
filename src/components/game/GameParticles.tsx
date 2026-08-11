"use client";

/**
 * 游戏模式星空粒子背景 + 检测爆发粒子
 *
 * 三种角色设定集成（粒子场景设计师）：
 * - 漂浮点/线/光点网络，缓慢漂移，alpha 按 8–15s 周期呼吸；
 * - Hover 时鼠标附近粒子局部聚合（离开即自然分散）；
 * - 提供降噪（denoise，压低亮度/数量）与停动（paused，冻结画面）开关；
 * - 粒子色跟随当前游戏模式（读 --game-particle）。
 * 通过 ref.emitBurst() 在「发现新实体/获得物品」时触发一团向外迸发的粒子。
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

interface GameParticlesProps {
  /** 当前游戏模式（night/twilight/day），用于读取对应粒子色 */
  theme?: string;
  /** 降噪：压低粒子亮度与数量，画面更干净 */
  denoise?: boolean;
  /** 停动：冻结粒子动画（保留最后一帧，不消耗重绘） */
  paused?: boolean;
}

const GameParticles = forwardRef<GameParticlesHandle, GameParticlesProps>(
  ({ theme, denoise = false, paused = false }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const burstsRef = useRef<Burst[]>([]);
    const denoiseRef = useRef(denoise);
    const particleRGBRef = useRef("139, 92, 246");
    const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });

    // 读当前模式的粒子色（theme 变化时重新取用）
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rgb = getComputedStyle(canvas).getPropertyValue("--game-particle").trim();
      if (rgb) particleRGBRef.current = rgb;
    }, [theme]);

    // 降噪开关实时作用于亮度（数量在启动时按初值，亮度随开关即时变化）
    useEffect(() => {
      denoiseRef.current = denoise;
    }, [denoise]);

    // 鼠标位置追踪：用于 Hover 局部聚合
    useEffect(() => {
      const onMove = (e: MouseEvent) => {
        mouseRef.current = { x: e.clientX, y: e.clientY, active: true };
      };
      const onLeave = () => {
        mouseRef.current.active = false;
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseout", onLeave);
      return () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseout", onLeave);
      };
    }, []);

    useImperativeHandle(ref, () => ({
      emitBurst: (opts) => {
        const canvas = canvasRef.current;
        const w = canvas?.width ?? window.innerWidth;
        const h = canvas?.height ?? window.innerHeight;
        const x = opts?.x ?? w * (0.3 + Math.random() * 0.4);
        const y = opts?.y ?? h * (0.3 + Math.random() * 0.4);
        const color = opts?.color || `rgb(${particleRGBRef.current})`;
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

      // 重新读取主题粒子色（theme 变化后画布尺寸变更时同步一次）
      const rgb = getComputedStyle(canvas).getPropertyValue("--game-particle").trim();
      if (rgb) particleRGBRef.current = rgb;

      // 粒子池：安静、缓慢；数量随降噪收敛
      const count = denoiseRef.current ? 18 : 40;
      const particles: Array<{
        x: number;
        y: number;
        r: number;
        speedX: number;
        speedY: number;
        baseAlpha: number;
        phase: number;
        period: number; // 8–15s 呼吸周期
      }> = [];
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 1.5 + 0.5,
          speedX: (Math.random() - 0.5) * 0.3,
          speedY: (Math.random() - 0.5) * 0.3 - 0.2,
          baseAlpha: Math.random() * 0.4 + 0.1,
          phase: Math.random() * Math.PI * 2,
          period: 8000 + Math.random() * 7000, // 8–15 秒
        });
      }

      let animId: number;
      const start = performance.now();

      const animate = (t: number) => {
        if (paused) {
          // 停动：冻结，保留最后一帧，不重绘、不推进
          animId = requestAnimationFrame(animate);
          return;
        }
        const elapsed = t - start;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const rgbStr = particleRGBRef.current;
        const maxAlpha = denoiseRef.current ? 0.32 : 0.55;
        const mouse = mouseRef.current;

        // 背景漂浮粒子
        for (const p of particles) {
          p.x += p.speedX;
          p.y += p.speedY;

          // Hover 局部聚合：鼠标附近粒子被轻轻吸引成簇，离开即自然分散
          if (mouse.active) {
            const dx = mouse.x - p.x;
            const dy = mouse.y - p.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 160 * 160) {
              const d = Math.sqrt(d2) || 1;
              const f = (1 - d / 160) * 0.5;
              p.x += (dx / d) * f;
              p.y += (dy / d) * f;
            }
          }

          // 边界循环
          if (p.x < 0) p.x = canvas.width;
          if (p.x > canvas.width) p.x = 0;
          if (p.y < 0) p.y = canvas.height;
          if (p.y > canvas.height) p.y = 0;

          // 8–15s 呼吸：alpha 按各自周期缓慢起伏
          const breath = 0.55 + 0.45 * Math.sin(p.phase + (elapsed / p.period) * Math.PI * 2);
          const alpha = Math.min(maxAlpha, Math.max(0.04, p.baseAlpha * breath));

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${rgbStr}, ${alpha})`;
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

      if (paused) {
        // 停动时不启动循环，画布保留空白（粒子背景本就轻盈），待恢复再绘制
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } else {
        animId = requestAnimationFrame(animate);
      }

      return () => {
        cancelAnimationFrame(animId);
        window.removeEventListener("resize", resize);
      };
    }, [paused, theme]);

    return (
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0"
        style={{ zIndex: 1 }}
        aria-hidden="true"
      />
    );
  }
);

GameParticles.displayName = "GameParticles";

export default GameParticles;
