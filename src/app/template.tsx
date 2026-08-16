"use client";

// 全站路由转场（转屏）：
// 每个路由切换时整页淡入。仅用 opacity，不碰 transform / filter / clip-path ——
// 否则会创建包含块，破坏 explore 的 position:fixed 抽屉与全站 sticky 头部定位。
// 更丰富的「位移/弹性」动效放在各页面组件内部（作用域可控、不波及 fixed 元素）。
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-transition">{children}</div>;
}
