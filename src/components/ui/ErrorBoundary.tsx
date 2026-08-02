"use client";

import React from "react";
import { Icon } from "./icons";

interface Props {
  /** 模块名，用于出错时友好提示（如「大纲」「编辑器」「侧栏」） */
  name?: string;
  children: React.ReactNode;
  /** 自定义降级 UI；不传则用内置的轻量兜底 */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 局部错误边界：包裹某个独立面板，捕获其渲染/生命周期抛错，
 * 将其降级为「该模块出错」的兜底 UI，而不让整页白屏。
 * 这是成品必备的容错层——任一小组件抛错都不应摧毁作者正在进行的写作会话。
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 仅记录，不阻断——真实错误上下文交给控制台与未来接入的日志系统
    console.error(
      `[ErrorBoundary${this.props.name ? "·" + this.props.name : ""}]`,
      error,
      info?.componentStack,
    );
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-[var(--nv-text-secondary)] h-full">
          <Icon name="alert" size={26} className="text-[var(--nv-accent)]" />
          <div className="text-sm font-medium">
            {this.props.name ? `「${this.props.name}」模块出错` : "模块出错"}
          </div>
          <div className="text-xs text-[var(--nv-text-muted)] max-w-xs leading-relaxed">
            这个区域暂时无法显示，其他功能不受影响。可点击下方按钮重试恢复。
          </div>
          <button
            onClick={this.reset}
            className="btn-ghost text-xs px-3 py-1.5 rounded-xl mt-1 inline-flex items-center gap-1.5"
          >
            <Icon name="refresh" size={12} /> 重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
