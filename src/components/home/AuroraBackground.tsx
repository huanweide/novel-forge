"use client";

/**
 * 极光漂移背景层（Layer A · 与 body 三层径向渐变叠加）
 *
 * 三团大模糊光斑在深空底色上缓慢漂移 + 呼吸，隐喻「小说宇宙」的流动星云。
 * 设计纪律：
 *  - 仅动 transform/opacity，不对 filter 做连续动画（性能底线）
 *  - fixed z-0 + pointer-events-none，不拦截任何交互、不影响布局（CLS=0）
 *  - prefers-reduced-motion 下全局兜底把动画时长归零，停在当前帧即静态光斑
 *  - 颜色锁定三色族（靛蓝/紫罗兰/金），与 .text-gradient 标题渐变同源，不引入第四装饰色
 */

export default function AuroraBackground() {
  return (
    <div
      className="aurora-layer fixed inset-0 z-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {/* Blob 1 · 靛蓝（呼应 body 顶部靛蓝渐变，偏左上） */}
      <div
        className="aurora-blob aurora-blob-1"
        style={{
          width: "56vw",
          height: "56vw",
          top: "-20%",
          left: "6%",
          background:
            "radial-gradient(circle at 50% 50%, var(--nv-primary), transparent 66%)",
        }}
      />
      {/* Blob 2 · 紫罗兰（呼应 body 右上紫罗兰，偏右上） */}
      <div
        className="aurora-blob aurora-blob-2"
        style={{
          width: "50vw",
          height: "50vw",
          top: "0%",
          right: "2%",
          background:
            "radial-gradient(circle at 50% 50%, var(--nv-creative), transparent 66%)",
        }}
      />
      {/* Blob 3 · 金（点睛强调色，偏下中） */}
      <div
        className="aurora-blob aurora-blob-3"
        style={{
          width: "52vw",
          height: "52vw",
          bottom: "-22%",
          left: "32%",
          background:
            "radial-gradient(circle at 50% 50%, var(--nv-accent), transparent 68%)",
        }}
      />
    </div>
  );
}
