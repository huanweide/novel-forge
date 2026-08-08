import { describe, it, expect, vi, beforeEach } from "vitest";

// v1.6.41 回归：build-config PATCH 漏同步 globalPrompt 修复。
// 旧逻辑用 buildGlobalPromptFromExplore 直写 globalPrompt，会覆盖 sync 渲染的角色/世界观段落，
// 且 sync 不读 buildConfig，导致 explore 布置字段丢失（双写者互相覆盖）。
// 修复后：PATCH 只写 buildConfig/genre/toneKeywords，随后调 syncGlobalPrompt(id) 统一重建。

const { updateCalls, syncMock } = vi.hoisted(() => ({
  updateCalls: [] as any[],
  syncMock: vi.fn(async () => "synced"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      update: vi.fn(async (args: any) => {
        updateCalls.push(args);
        return { id: args.where.id, ...args.data };
      }),
      findUnique: vi.fn(async () => ({
        buildConfig: { novelName: "测试书", genre: "玄幻", styleTags: ["系统流"], audience: "男频·青年向", wordCount: "50-200万字", plotStructure: "five_act", stylePreference: "热血燃向", powerSystem: "", goldenFinger: "", coreConflict: "", forceOriginalNames: true, autoGenerateStoryline: true },
        genre: ["玄幻"],
        toneKeywords: ["热血燃向"],
      })),
    },
  },
}));

vi.mock("@/core/sync-global-prompt", () => ({ syncGlobalPrompt: syncMock }));

import { PATCH } from "@/app/api/projects/[id]/build-config/route";
import type { NextRequest } from "next/server";

function makePatch(body: unknown): NextRequest {
  return new Request("http://localhost/api/projects/p1/build-config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const params = { params: Promise.resolve({ id: "p1" }) };

beforeEach(() => {
  updateCalls.length = 0;
  syncMock.mockClear();
});

describe("v1.6.41 build-config PATCH 漏同步修复", () => {
  it("PATCH build-config → 触发 syncGlobalPrompt(projectId)", async () => {
    const res = await PATCH(makePatch({ wordCount: "200万字以上" }), params);
    expect(res.status).toBe(200);
    expect(syncMock).toHaveBeenCalledWith("p1");
  });

  it("PATCH 不再直接写 explore-only 的 globalPrompt（交给 sync）", async () => {
    await PATCH(makePatch({ stylePreference: "轻松搞笑" }), params);
    // update 只写 buildConfig/genre/toneKeywords，不含 globalPrompt
    expect(updateCalls[0].data.globalPrompt).toBeUndefined();
    expect(updateCalls[0].data.buildConfig.stylePreference).toBe("轻松搞笑");
    // 风格偏好同步进 toneKeywords，供 sync 读取
    expect(updateCalls[0].data.toneKeywords).toEqual(["轻松搞笑"]);
  });

  it("合并旧 buildConfig 后写入（增量生效）", async () => {
    await PATCH(makePatch({ plotStructure: "three_act" }), params);
    expect(updateCalls[0].data.buildConfig.plotStructure).toBe("three_act");
    // 旧字段保留
    expect(updateCalls[0].data.buildConfig.novelName).toBe("测试书");
  });
});
