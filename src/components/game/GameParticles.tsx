"use client";

/**
 * 简单星空粒子背景
 *
 * 纯 CSS + 极少 JS，不依赖任何第三方库
 * 暗紫色调，缓慢飘浮，安静不喧宾夺主
 */

import { useEffect, useRef } from "react";

export default function GameParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
}
