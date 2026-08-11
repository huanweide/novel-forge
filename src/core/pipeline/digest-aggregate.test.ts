import { describe, it, expect } from "vitest";
import {
  isGarbageSummary,
  buildTimelineDigest,
  buildStorylineDigest,
  formatStorylineEvents,
  MAX_TIMELINE_CHAPTERS,
} from "./digest-aggregate";

describe("isGarbageSummary", () => {
  it("空 / 空白 / null / undefined 判为垃圾", () => {
    expect(isGarbageSummary(null)).toBe(true);
    expect(isGarbageSummary(undefined)).toBe(true);
    expect(isGarbageSummary("")).toBe(true);
    expect(isGarbageSummary("   ")).toBe(true);
  });

  it("过短（< 12 字）判为垃圾", () => {
    expect(isGarbageSummary("很短的摘要")).toBe(true); // 5 字
    expect(isGarbageSummary("这是一段刚好十二字的摘要")).toBe(false); // 12 字真实摘要边界
  });

  it("命中模板元应答关键词判为垃圾（真实坏样本）", () => {
    expect(isGarbageSummary("您提供的章节内容似乎为空——没有「出场角色」「章末原文」和「完整正文」的实际文本。请将第二章《潮痕》的正文内容粘贴进来")).toBe(true);
    expect(isGarbageSummary("我注意到您提供了模板和章节标题（第三章），但**没有提供实际的正文内容**")).toBe(true);
    expect(isGarbageSummary("需要以下信息才能完成：出场角色、章末原文、完整正文")).toBe(true);
    expect(isGarbageSummary("等待您补充内容后我再为您摘要")).toBe(true);
  });

  it("真实章节摘要不误判", () => {
    const real =
      "林夜在龙骨滩发现一枚发光的龙元碎片，引来了龙庭集团的密探。他与阿芸被迫连夜撤离，却在逃亡途中结识了神秘的老渔夫。";
    expect(isGarbageSummary(real)).toBe(false);
  });
});

describe("buildTimelineDigest", () => {
  const orderMap = new Map<string, { order: number; title: string }>([
    ["c1", { order: 0, title: "第一章 启航" }],
    ["c2", { order: 1, title: "潮痕" }],
    ["c3", { order: 2, title: "第三章 迷雾" }],
  ]);

  it("同章多条遗留行：只保留非垃圾且最长的一条，每章仅出现一次", () => {
    const summaries = [
      { chapterId: "c2", summary: "您提供的章节内容似乎为空——没有实际正文，请粘贴进来" }, // 垃圾
      { chapterId: "c2", summary: "阿芸在潮痕崖边拾得一枚龙鳞，预示着风暴将至。" }, // 真实
      { chapterId: "c2", summary: "阿芸拾得龙鳞。" }, // 真实但更短，应被更长的覆盖
    ];
    const out = buildTimelineDigest(summaries, orderMap);
    // 第2章只出现一次，且为最长那条真实摘要
    const matches = out.match(/第2章/g) ?? [];
    expect(matches.length).toBe(1);
    expect(out).toContain("阿芸在潮痕崖边拾得一枚龙鳞，预示着风暴将至。");
    expect(out).not.toContain("您提供的章节内容似乎为空");
  });

  it("整章都是垃圾：该章不出现在大纲中", () => {
    const summaries = [
      { chapterId: "c3", summary: "我注意到您提供了模板，但没有提供实际的正文内容" },
      { chapterId: "c1", summary: "林夜在龙骨滩苏醒，发现整座新城建立在巨龙骸骨之上。" },
    ];
    const out = buildTimelineDigest(summaries, orderMap);
    expect(out).not.toContain("第三章");
    expect(out).toContain("第1章 启航：林夜在龙骨滩苏醒");
  });

  it("已删节点的遗留行被排除（orderMap 不命中）", () => {
    const summaries = [
      { chapterId: "c1", summary: "林夜在龙骨滩苏醒，发现整座新城建立在巨龙骸骨之上。" },
      { chapterId: "ghost", summary: "这是已删章节的脏数据，不应出现" },
    ];
    const out = buildTimelineDigest(summaries, orderMap);
    expect(out).not.toContain("ghost");
    expect(out).not.toContain("已删章节");
  });

  it("按章序排序，且仅保留最近 MAX_TIMELINE_CHAPTERS 章", () => {
    const bigOrderMap = new Map<string, { order: number; title: string }>();
    const bigSummaries: { chapterId: string; summary: string }[] = [];
    for (let i = 0; i < 25; i++) {
      const id = `k${i}`;
      bigOrderMap.set(id, { order: i, title: `第${i + 1}章` });
      bigSummaries.push({ chapterId: id, summary: `第${i + 1}章的真实摘要内容，足够长不会被判为垃圾行。` });
    }
    const out = buildTimelineDigest(bigSummaries, bigOrderMap);
    const lines = out.split("\n").filter((l) => l.trim().length > 0);
    // 25 章只保留最近 20 章
    expect(lines.length).toBe(MAX_TIMELINE_CHAPTERS);
    // 最旧的 k0（第1章）被淘汰，最新的 k24（第25章）保留
    expect(out).not.toContain("第1章");
    expect(out).toContain("第25章");
  });

  it("标题已含『第X章』前缀时不重复前缀（阿拉伯数字）", () => {
    const sums = [{ chapterId: "c1", summary: "林夜在龙骨滩苏醒，发现整座新城建立在巨龙骸骨之上。" }];
    const om = new Map<string, { order: number; title: string }>([["c1", { order: 0, title: "第一章 启航" }]]);
    const out = buildTimelineDigest(sums, om);
    expect(out).toContain("第1章 启航：林夜在龙骨滩苏醒");
    expect(out).not.toContain("第一章 启航：林夜");
  });

  it("标题为中文数字『第X章』时归一为规范阿拉伯前缀", () => {
    const om = new Map<string, { order: number; title: string }>([["c1", { order: 0, title: "第一章：龙髓石" }]]);
    const out = buildTimelineDigest([{ chapterId: "c1", summary: "高千惠带着契约进入龙庭集团。" }], om);
    expect(out).toContain("第1章 龙髓石：高千惠带着契约进入龙庭集团。");
  });

  it("畸形标题『第三章：第3章』循环剥离，不出现三重前缀", () => {
    const om = new Map<string, { order: number; title: string }>([["c3", { order: 2, title: "第三章：第3章" }]]);
    const out = buildTimelineDigest([{ chapterId: "c3", summary: "叶凌云以茶探访龙渊，察觉其有暗器旧伤。" }], om);
    expect(out).toBe("第3章：叶凌云以茶探访龙渊，察觉其有暗器旧伤。");
    expect(out).not.toContain("第三章");
    expect(out).not.toContain("第3章 第3章");
  });

  it("摘要文本自身以『第N章』开头时剥离，避免前缀叠加", () => {
    const summaries = [
      { chapterId: "c3", summary: "第3章：叶凌云以茶探访龙渊，察觉其有暗器旧伤。" },
    ];
    const out = buildTimelineDigest(summaries, orderMap);
    // 标题"第三章 迷雾"的"第三章"被归一剥离为"迷雾"，摘要自带"第3章："也被剥离
    expect(out).toContain("第3章 迷雾：叶凌云以茶探访龙渊");
    expect(out).not.toContain("第3章 第三章：第3章：");
  });
});

describe("formatStorylineEvents / buildStorylineDigest", () => {
  it("过滤 CLUE 类型，按 position 排序，标注角色与类型", () => {
    const events = [
      { kind: "CLUE", title: "隐藏线索", position: 1 },
      { kind: "MILESTONE", title: "新城初醒", position: 2, role: "advance" },
      { kind: "EVENT", title: "封印的回响", position: 3, role: "probe" },
    ];
    const out = formatStorylineEvents(events);
    expect(out).not.toContain("隐藏线索");
    expect(out).toContain("[推进点]里程碑·新城初醒");
    expect(out).toContain("[卡点]事件·封印的回响");
    // 顺序：position 2 在前，3 在后
    expect(out.indexOf("新城初醒")).toBeLessThan(out.indexOf("封印的回响"));
  });

  it("buildStorylineDigest 拼接多条主线", () => {
    const mainLines = [
      { id: "m1", title: "龙陨之地·主线", description: "龙骨滩上的新城" },
      { id: "m2", title: "支线·渔村秘闻" },
    ];
    const eventsByLine: Record<string, any[]> = {
      m1: [{ kind: "MILESTONE", title: "新城初醒", position: 1 }],
      m2: [],
    };
    const out = buildStorylineDigest(mainLines, eventsByLine);
    expect(out).toContain("【主线：龙陨之地·主线】 龙骨滩上的新城");
    expect(out).toContain("时间轴：里程碑·新城初醒"); // role 缺省时不加角色前缀
    expect(out).toContain("【主线：支线·渔村秘闻】");
  });
});
