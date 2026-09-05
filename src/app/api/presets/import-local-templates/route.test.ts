import { describe, it, expect, vi } from "vitest";

// 路由模块会 import @/lib/prisma，测试环境无 DB，mock 掉以免加载时报错（GET 不依赖它）
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { GET } from "./route";

describe("GET /api/presets/import-local-templates", () => {
  it("扫描仓库根 templates/*.md 并桥接出可加入市集的预设草稿", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const drafts = (await res.json()) as { type: string; title: string }[];
    expect(Array.isArray(drafts)).toBe(true);

    const types = drafts.map((d) => d.type);
    // 我刚放的三个模板：风格卡→style、角色卡→character、大纲→story_progression
    expect(types).toContain("style");
    expect(types).toContain("character");
    expect(types).toContain("story_progression");
    // 桥接出的草稿必须有非空标题，否则落库会失败
    expect(drafts.every((d) => typeof d.title === "string" && d.title.length > 0)).toBe(true);
  });
});
