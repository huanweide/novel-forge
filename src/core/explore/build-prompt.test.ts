import { describe, it, expect } from "vitest";
import { buildGlobalPromptFromExplore } from "./build-prompt";
import { DEFAULT_BUILD_CONFIG } from "./types";
import type { AdoptedItem, ExploreStep } from "./types";

function makeConfig(overrides: Partial<typeof DEFAULT_BUILD_CONFIG> = {}) {
  return { ...DEFAULT_BUILD_CONFIG, ...overrides };
}

function adopted(step: ExploreStep, title: string, content: string): AdoptedItem {
  return { id: `a-${title}`, step, title, content, timestamp: 0 };
}

describe("buildGlobalPromptFromExplore", () => {
  it("默认配置：以基本信息段开头，布尔默认 true 渲染正确，空段不输出", () => {
    const out = buildGlobalPromptFromExplore(makeConfig(), []);
    expect(out.startsWith("## 基本信息")).toBe(true);
    expect(out).toContain("原创人名：强制");
    expect(out).toContain("自动生成故事线：是");
    // 默认值均为空串 → 对应段不出现
    expect(out).not.toContain("## 核心冲突");
    expect(out).not.toContain("## 力量体系");
    expect(out).not.toContain("## 金手指");
    expect(out).not.toContain("## 风格偏好");
    expect(out).not.toContain("## 流派标签");
  });

  it("完整配置：所有段落按固定顺序出现", () => {
    const out = buildGlobalPromptFromExplore(
      makeConfig({
        novelName: "测试之书",
        genre: "玄幻",
        audience: "男频·青年向",
        wordCount: "50-200万字",
        plotStructure: "five_act",
        styleTags: ["系统流", "升级流"],
        coreConflict: "主角对抗天道",
        powerSystem: "修仙体系",
        goldenFinger: "签到系统",
        stylePreference: "热血燃向",
      }),
      [],
    );
    const idxInfo = out.indexOf("## 基本信息");
    const idxTags = out.indexOf("## 流派标签");
    const idxConflict = out.indexOf("## 核心冲突");
    const idxPower = out.indexOf("## 力量体系");
    const idxGold = out.indexOf("## 金手指");
    const idxStyle = out.indexOf("## 风格偏好");
    expect(idxInfo).toBeGreaterThan(-1);
    expect(idxTags).toBeGreaterThan(idxInfo);
    expect(idxConflict).toBeGreaterThan(idxTags);
    expect(idxPower).toBeGreaterThan(idxConflict);
    expect(idxGold).toBeGreaterThan(idxPower);
    expect(idxStyle).toBeGreaterThan(idxGold);
    expect(out).toContain("书名：测试之书");
    expect(out).toContain("类型：玄幻");
    expect(out).toContain("受众：男频·青年向");
    expect(out).toContain("字数：50-200万字");
    expect(out).toContain("## 核心冲突");
    expect(out).toContain("主角对抗天道");
    expect(out).toContain("## 力量体系");
    expect(out).toContain("修仙体系");
    expect(out).toContain("## 金手指");
    expect(out).toContain("签到系统");
    expect(out).toContain("## 风格偏好");
    expect(out).toContain("热血燃向");
  });

  it("genre/audience/wordCount 为空时对应行不出现", () => {
    const out = buildGlobalPromptFromExplore(
      makeConfig({ genre: "", audience: "", wordCount: "" }),
      [],
    );
    expect(out).not.toContain("类型：");
    expect(out).not.toContain("受众：");
    expect(out).not.toContain("字数：");
  });

  it("styleTags 空数组不输出流派标签段", () => {
    const out = buildGlobalPromptFromExplore(makeConfig({ styleTags: [] }), []);
    expect(out).not.toContain("## 流派标签");
  });

  it("styleTags 多项用中文顿号连接", () => {
    const out = buildGlobalPromptFromExplore(
      makeConfig({ styleTags: ["系统流", "升级流", "无敌流"] }),
      [],
    );
    expect(out).toContain("## 流派标签");
    expect(out).toContain("系统流、升级流、无敌流");
  });

  it("plotStructure 映射为中文标签，未知 id 回退原值", () => {
    const a = buildGlobalPromptFromExplore(makeConfig({ plotStructure: "five_act" }), []);
    expect(a).toContain("情节结构：五幕式");
    const b = buildGlobalPromptFromExplore(makeConfig({ plotStructure: "unknown_x" }), []);
    expect(b).toContain("情节结构：unknown_x");
  });

  it("coreConflict 为空不输出核心冲突段", () => {
    const out = buildGlobalPromptFromExplore(makeConfig({ coreConflict: "" }), []);
    expect(out).not.toContain("## 核心冲突");
  });

  it("forceOriginalNames false 渲染「不强制」", () => {
    const out = buildGlobalPromptFromExplore(makeConfig({ forceOriginalNames: false }), []);
    expect(out).toContain("原创人名：不强制");
  });

  it("autoGenerateStoryline false 渲染「否」", () => {
    const out = buildGlobalPromptFromExplore(makeConfig({ autoGenerateStoryline: false }), []);
    expect(out).toContain("自动生成故事线：否");
  });

  it("单个 adopted 段出现在基本信息之后，按 STEP_LABELS 标题渲染", () => {
    const out = buildGlobalPromptFromExplore(
      makeConfig(),
      [adopted("opening", "开篇设定", "主角从废柴起步")],
    );
    const idxInfo = out.indexOf("## 基本信息");
    const idxOpening = out.indexOf("## 开篇");
    expect(idxOpening).toBeGreaterThan(idxInfo);
    expect(out).toContain("### 开篇设定");
    expect(out).toContain("主角从废柴起步");
  });

  it("多 step adopted 按固定 stepOrder 排序（开篇段在之前）", () => {
    const out = buildGlobalPromptFromExplore(
      makeConfig(),
      [
        adopted("protagonist", "主角", "少年樊斯瑞"),
        adopted("opening", "开篇", "废柴开局"),
      ],
    );
    const idxOpening = out.indexOf("## 开篇");
    const idxProtagonist = out.indexOf("## 主角身份");
    expect(idxOpening).toBeGreaterThan(-1);
    expect(idxProtagonist).toBeGreaterThan(-1);
    expect(idxOpening).toBeLessThan(idxProtagonist);
  });

  it("adopted content 超过 600 字被截断", () => {
    const long = "字".repeat(1200);
    const out = buildGlobalPromptFromExplore(
      makeConfig(),
      [adopted("opening", "长文", long)],
    );
    expect(out).not.toContain(long);
    expect(out).toContain("字".repeat(600));
  });

  it("某 step 无 adopted 内容时跳过该段", () => {
    const out = buildGlobalPromptFromExplore(
      makeConfig(),
      [adopted("opening", "开篇", "仅开篇有内容")],
    );
    expect(out).toContain("## 开篇");
    expect(out).not.toContain("## 主角身份");
    expect(out).not.toContain("## 世界观");
  });

  it("同一 step 多个 adopted 全部出现", () => {
    const out = buildGlobalPromptFromExplore(
      makeConfig(),
      [
        adopted("opening", "开篇A", "内容A"),
        adopted("opening", "开篇B", "内容B"),
      ],
    );
    expect(out).toContain("### 开篇A");
    expect(out).toContain("内容A");
    expect(out).toContain("### 开篇B");
    expect(out).toContain("内容B");
  });

  it("中文与特殊字符原样保留", () => {
    const out = buildGlobalPromptFromExplore(
      makeConfig({ coreConflict: "「龙陨之地」的诅咒 & 复仇" }),
      [],
    );
    expect(out).toContain("「龙陨之地」的诅咒 & 复仇");
  });
});
