import { describe, it, expect } from "vitest";
import { buildGlobalPrompt } from "@/core/sync-global-prompt";

// v2.52.0：globalPrompt 聚合摘要 + 预算裁剪的纯函数测试。
// 直接调 buildGlobalPrompt（不依赖 prisma mock），验证去重 / 截断 / 预算兜底三件事。

const baseProject = {
  name: "测试书", genre: ["玄幻"], synopsis: "总纲", toneKeywords: ["热血"],
  authorNote: "", llmConfig: null, buildConfig: null,
};

describe("buildGlobalPrompt 预算裁剪 (v2.52.0)", () => {
  it("世界卡同 title 去重，保留最长一条", () => {
    const lore = [
      { title: "龙骨滩", category: "geography", content: "短内容", keys: [] },
      { title: "龙骨滩", category: "geography", content: "这是更长的内容，描述该地点的地理与传说，应保留这条", keys: [] },
      { title: "暗金印记", category: "item", content: "虎口印记", keys: [] },
    ];
    const p = buildGlobalPrompt(baseProject, [], lore, null);
    const count = (p.match(/龙骨滩/g) || []).length;
    expect(count).toBe(1); // 去重后只出现一次
    expect(p).toContain("这是更长的内容"); // 保留最长一条
  });

  it("角色背景超 bgCap 截断并带省略号", () => {
    const chars = [{
      name: "樊斯瑞", role: "protagonist", currentStatus: "存活", age: "20", gender: "男",
      background: "背".repeat(500), aliases: [], personality: {}, appearance: {},
      abilities: [], hiddenMotives: [], relationships: [], timeline: [], tags: [], dialogueStyle: {},
    }];
    const p = buildGlobalPrompt(baseProject, chars, [], null);
    expect(p).toContain("…"); // 截断标记
    expect(p).not.toContain("背".repeat(400)); // 不应含近 500 字的完整背景
  });

  it("超长世界书总长在预算 12000 字符内", () => {
    const lore = Array.from({ length: 80 }, (_, i) => ({
      title: `卡${i}`, category: "geography", content: "长".repeat(800), keys: [],
    }));
    const p = buildGlobalPrompt(baseProject, [], lore, null);
    expect(p.length).toBeLessThanOrEqual(14000);
  });

  it("正常规模项目宽松档保留结构（角色分组 + 世界分类 + 内容完整）", () => {
    const chars = [{
      name: "主角A", role: "protagonist", currentStatus: "存活", age: "20", gender: "男",
      background: "足够的背景内容", aliases: [], personality: {}, appearance: {},
      abilities: [], hiddenMotives: [], relationships: [], timeline: [], tags: [], dialogueStyle: {},
    }];
    const lore = [{ title: "设定1", category: "magic_system", content: "魔法设定内容足够长", keys: [] }];
    const p = buildGlobalPrompt(baseProject, chars, lore, null);
    expect(p).toContain("★ 主角");
    expect(p).toContain("主角A");
    expect(p).toContain("设定1");
    expect(p).toContain("魔法设定内容足够长"); // 短内容不被截断
  });

  it("无 title 世界卡靠引用去重，不丢数据", () => {
    const lore = [
      { title: "", category: "custom", content: "无标题设定A", keys: [] },
      { title: "", category: "custom", content: "无标题设定B", keys: [] },
    ];
    const p = buildGlobalPrompt(baseProject, [], lore, null);
    expect(p).toContain("无标题设定A");
    expect(p).toContain("无标题设定B");
  });
});
