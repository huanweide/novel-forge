import { describe, it, expect, beforeEach } from "vitest";
import { useWriterStore } from "./index";

describe("useWriterStore 流式内容下沉（v2.49）", () => {
  beforeEach(() => {
    useWriterStore.getState().resetStream();
  });

  it("appendContent 累加 generatedContent 与 streamBuffer", () => {
    useWriterStore.getState().appendContent("A");
    useWriterStore.getState().appendContent("B");
    const s = useWriterStore.getState();
    expect(s.generatedContent).toBe("AB");
    expect(s.streamBuffer).toBe("AB");
  });

  it("appendContent 在多次调用间保持累积（模拟逐 token）", () => {
    const chunks = ["春", "天", "来", "了"];
    for (const c of chunks) useWriterStore.getState().appendContent(c);
    expect(useWriterStore.getState().generatedContent).toBe("春天来了");
  });

  it("resetStream 清空生成缓冲与计数", () => {
    useWriterStore.getState().appendContent("x");
    useWriterStore.getState().setGeneratedTokens(5);
    useWriterStore.getState().resetStream();
    const s = useWriterStore.getState();
    expect(s.generatedContent).toBe("");
    expect(s.streamBuffer).toBe("");
    expect(s.generatedTokens).toBe(0);
  });

  it("setGenerating 切换生成态", () => {
    useWriterStore.getState().setGenerating(true);
    expect(useWriterStore.getState().isGenerating).toBe(true);
    useWriterStore.getState().setGenerating(false);
    expect(useWriterStore.getState().isGenerating).toBe(false);
  });
});
