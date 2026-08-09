/**
 * 后台生成任务执行器单测（v1.8.6 #174）。
 * 用 vi.hoisted + vi.mock 注入假 prisma / completeText，验证状态机两条路径：
 *   - LLM 成功 → status:done + result.suggestions
 *   - LLM 失败 → status:failed + error（且不抛出，fire-and-forget 安全）
 */
import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  findUnique: vi.fn(),
  projectFind: vi.fn(),
  storylineFind: vi.fn(),
  completeText: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    generationTask: { update: mocks.update, findUnique: mocks.findUnique },
    project: { findUnique: mocks.projectFind },
    storyline: { findMany: mocks.storylineFind },
  },
}));

vi.mock("@/lib/approved-cards", () => ({
  getApprovedCharacters: vi.fn(async () => []),
  getApprovedLore: vi.fn(async () => []),
}));

vi.mock("@/core/llm/client", () => ({
  completeText: mocks.completeText,
}));

import { runStorylineGenerationTask } from "./execute-task";

const SAMPLE_LLM = JSON.stringify({
  lines: [
    {
      type: "main",
      title: "主线A",
      description: "d",
      desire: "x",
      obstacle: "y",
      action: "z",
      result: "r",
      twist: "w",
      turn: "u",
      ending: "e",
    },
  ],
});

describe("runStorylineGenerationTask 状态机", () => {
  it("LLM 成功 → status:done 且 result.suggestions 非空", async () => {
    mocks.update.mockReset();
    mocks.findUnique.mockReset();
    mocks.projectFind.mockReset();
    mocks.storylineFind.mockReset();
    mocks.completeText.mockReset();

    mocks.findUnique.mockResolvedValueOnce({
      id: "t1",
      projectId: "p1",
      prompt: "",
      status: "pending",
      progress: 0,
    });
    mocks.projectFind.mockResolvedValueOnce({
      name: "X",
      genre: ["奇幻"],
      synopsis: "",
      toneKeywords: [],
      buildConfig: {},
    });
    mocks.storylineFind.mockResolvedValueOnce([]);
    mocks.completeText.mockResolvedValueOnce(SAMPLE_LLM);

    await runStorylineGenerationTask("t1");

    // 先 running，再 done
    expect(mocks.update).toHaveBeenCalledTimes(2);
    const running = mocks.update.mock.calls[0][0];
    const done = mocks.update.mock.calls[1][0];
    expect(running.data.status).toBe("running");
    expect(done.data.status).toBe("done");
    expect(done.data.progress).toBe(100);
    const suggestions = (done.data.result as { suggestions: unknown[] }).suggestions;
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBe(1);
    expect((suggestions[0] as { type: string }).type).toBe("main");
  });

  it("LLM 失败 → status:failed 且写入 error，且不抛出", async () => {
    mocks.update.mockReset();
    mocks.findUnique.mockReset();
    mocks.projectFind.mockReset();
    mocks.storylineFind.mockReset();
    mocks.completeText.mockReset();

    mocks.findUnique.mockResolvedValueOnce({
      id: "t2",
      projectId: "p2",
      prompt: "",
      status: "pending",
      progress: 0,
    });
    mocks.projectFind.mockResolvedValueOnce({
      name: "X",
      genre: [],
      synopsis: "",
      toneKeywords: [],
      buildConfig: {},
    });
    mocks.storylineFind.mockResolvedValueOnce([]);
    mocks.completeText.mockRejectedValueOnce(new Error("网络不可达：Base URL 超时"));

    // 不应抛错（fire-and-forget 无人 await，抛错会成未捕获拒绝）
    await expect(runStorylineGenerationTask("t2")).resolves.toBeUndefined();

    expect(mocks.update).toHaveBeenCalledTimes(2);
    const failed = mocks.update.mock.calls[1][0];
    expect(failed.data.status).toBe("failed");
    expect(failed.data.error).toContain("网络不可达");
  });

  it("任务不存在（findUnique 返回 null）→ 静默退出，不写 failed", async () => {
    mocks.update.mockReset();
    mocks.findUnique.mockReset();
    mocks.findUnique.mockResolvedValueOnce(null);

    await runStorylineGenerationTask("gone");

    // 只写过一次 running，之后因 task 为 null 直接 return，不再 update
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0][0].data.status).toBe("running");
  });
});
