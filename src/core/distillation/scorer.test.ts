import { describe, it, expect } from "vitest";
import {
  classifyEventCategory,
  scoreEvent,
  scoreAndClassifyEvents,
  formatEventsForPrompt,
} from "./scorer";
import type { EventImportance } from "@/core/types";

// ─── 分类：关键词命中 + 优先级 ───────────────────────────────

describe("classifyEventCategory —— 关键词分类与优先级", () => {
  it("死亡类：含「死/杀/陨落/牺牲」归 death", () => {
    expect(classifyEventCategory("主角陨落")).toBe("death");
    expect(classifyEventCategory("他杀死了敌人")).toBe("death");
    expect(classifyEventCategory("战士牺牲了")).toBe("death");
  });

  it("「击杀」命中 death 而非 battle（死亡优先级高于战斗）", () => {
    expect(classifyEventCategory("主角击杀强敌")).toBe("death");
  });

  it("突破类：含「突破/渡劫/顿悟/瓶颈」归 breakthrough", () => {
    expect(classifyEventCategory("他突破了自己的瓶颈")).toBe("breakthrough");
    expect(classifyEventCategory("渡劫飞升")).toBe("breakthrough");
    expect(classifyEventCategory("战斗中顿悟")).toBe("breakthrough");
  });

  it("传承类：含「传承/血脉/认主/觉醒」归 inheritance", () => {
    expect(classifyEventCategory("获得上古神器认主")).toBe("inheritance");
    expect(classifyEventCategory("觉醒血脉")).toBe("inheritance");
  });

  it("转折类：含「背叛/反转/阴谋」归 plot_twist", () => {
    expect(classifyEventCategory("盟友背叛了他")).toBe("plot_twist");
    expect(classifyEventCategory("揭开惊天阴谋")).toBe("plot_twist");
  });

  it("揭露类：含「秘密/发现/线索/情报」归 revelation", () => {
    expect(classifyEventCategory("发现了地下城的秘密")).toBe("revelation");
    expect(classifyEventCategory("截获敌方情报")).toBe("revelation");
  });

  it("战斗类：含「战/对决/交锋」归 battle", () => {
    expect(classifyEventCategory("两军对决")).toBe("battle");
    expect(classifyEventCategory("激烈交锋")).toBe("battle");
  });

  it("互动类：含「对话/见面/和解」归 interaction", () => {
    expect(classifyEventCategory("两人见面交谈")).toBe("interaction");
    expect(classifyEventCategory("他们和解了")).toBe("interaction");
  });

  it("无关键词归 daily（兜底）", () => {
    expect(classifyEventCategory("今天天气真好，吃了顿饭")).toBe("daily");
    expect(classifyEventCategory("")).toBe("daily");
  });

  it("纯英文描述无中文关键词时归 daily（分类器仅匹配中文关键词）", () => {
    // classifyEventCategory 的命中词表为中文，英文「death」等不命中
    expect(classifyEventCategory("THE DEATH OF HERO")).toBe("daily");
  });
});

// ─── 评分：组件 + 分层 ─────────────────────────────────────

describe("scoreEvent —— 评分与分层", () => {
  it("S 级：死亡+本章+主角 = 45 分 ≥40 → S", () => {
    const r = scoreEvent({
      description: "主角陨落牺牲",
      chapterDiff: 0,
      characterIds: ["c1"],
      characterRoleMap: { c1: "protagonist" },
    });
    expect(r.score).toBe(45); // 10(时效)+25(死亡)+10(主角)
    expect(r.tier).toBe("S");
    expect(r.importance.isBreakthrough).toBe(false);
  });

  it("A 级：突破+本章+配角 = 33 分 ≥20 → A", () => {
    const r = scoreEvent({
      description: "他突破了瓶颈",
      chapterDiff: 0,
      characterIds: ["c1"],
      characterRoleMap: { c1: "supporting" },
    });
    expect(r.score).toBe(33); // 10+20+3
    expect(r.tier).toBe("A");
  });

  it("B 级：互动+本章+无角色 = 13 分 ≥10 → B", () => {
    const r = scoreEvent({
      description: "两人对话",
      chapterDiff: 0,
    });
    expect(r.score).toBe(13); // 10+3
    expect(r.tier).toBe("B");
  });

  it("C 级：日常+远章+无角色 = 1 分 <10 → C", () => {
    const r = scoreEvent({
      description: "吃了一顿饭",
      chapterDiff: 20,
    });
    expect(r.score).toBe(1); // 0(时效)+1(日常)
    expect(r.tier).toBe("C");
  });

  it("阈值边界：恰好 40 → S（含等号）", () => {
    const r = scoreEvent({
      description: "主角陨落",
      chapterDiff: 0,
      characterIds: ["c1"],
      characterRoleMap: { c1: "love_interest" }, // 25+10+5=40
    });
    expect(r.score).toBe(40);
    expect(r.tier).toBe("S");
  });

  it("阈值边界：39 → A（<40）", () => {
    const r = scoreEvent({
      description: "主角陨落",
      chapterDiff: 0,
      characterIds: ["c1"],
      characterRoleMap: { c1: "catalyst" }, // 25+10+4=39
    });
    expect(r.score).toBe(39);
    expect(r.tier).toBe("A");
  });

  it("阈值边界：恰好 20 → A（含等号）", () => {
    const r = scoreEvent({
      description: "他突破了",
      chapterDiff: 20, // 时效0
    });
    expect(r.score).toBe(20);
    expect(r.tier).toBe("A");
  });

  it("阈值边界：19 → B（<20）", () => {
    const r = scoreEvent({
      description: "发现了线索", // revelation=10
      chapterDiff: 2, // 10-1=9
    });
    expect(r.score).toBe(19);
    expect(r.tier).toBe("B");
  });

  it("阈值边界：恰好 10 → B（含等号）", () => {
    const r = scoreEvent({
      description: "发现秘密", // revelation=10
      chapterDiff: 20, // 时效0
    });
    expect(r.score).toBe(10);
    expect(r.tier).toBe("B");
  });

  it("阈值边界：9 → C（<10）", () => {
    const r = scoreEvent({
      description: "两人对话", // interaction=3
      chapterDiff: 8, // 10-4=6
    });
    expect(r.score).toBe(9);
    expect(r.tier).toBe("C");
  });

  it("时效性：距今越远分越低，最低为 0", () => {
    const near = scoreEvent({ description: "主角陨落", chapterDiff: 0 });
    const far = scoreEvent({ description: "主角陨落", chapterDiff: 20 });
    expect(near.score - far.score).toBe(10); // 仅时效差 10
    const veryFar = scoreEvent({ description: "主角陨落", chapterDiff: 100 });
    expect(veryFar.score).toBe(far.score); // 时效已触底 0，不再负
  });

  it("角色重要性取最高值（多个角色取 max）", () => {
    const r = scoreEvent({
      description: "主角陨落",
      chapterDiff: 0,
      characterIds: ["c1", "c2", "c3"],
      characterRoleMap: { c1: "background", c2: "supporting", c3: "protagonist" },
    });
    expect(r.score).toBe(45); // 取 protagonist=10
  });

  it("未登记角色按 background(1) 计", () => {
    const r = scoreEvent({
      description: "主角陨落",
      chapterDiff: 0,
      characterIds: ["c1"], // 无映射
    });
    expect(r.score).toBe(36); // 10+25+1
  });

  it("伏笔回收(+20) 高于 仅关联(+15)", () => {
    const related = scoreEvent({
      description: "主角陨落",
      chapterDiff: 0,
      isForeshadowRelated: true,
    });
    const recycled = scoreEvent({
      description: "主角陨落",
      chapterDiff: 0,
      isForeshadowRelated: true,
      isForeshadowPlanted: true,
    });
    expect(related.score).toBe(50); // 10(时效)+25(死亡)+15(关联伏笔)
    expect(recycled.score).toBe(55); // 多埋设 +5 → 20
    expect(recycled.importance.isForeshadowRelated).toBe(true);
    expect(recycled.importance.isBreakthrough).toBe(false);
  });

  it("显式传入 category 覆盖自动推断", () => {
    const r = scoreEvent({
      description: "今天吃饭聊天", // 实际会推断 daily=1
      chapterDiff: 0,
      category: "battle", // 强制战斗=5
    });
    expect(r.importance.category).toBe("battle");
    expect(r.score).toBe(15); // 10+5
  });
});

// ─── 批量：排序 + 截断 ─────────────────────────────────────

function makeImportance(desc: string, score: number, tier: "S" | "A" | "B" | "C"): EventImportance {
  return {
    description: desc,
    score,
    tier,
    category: "daily",
    isBreakthrough: false,
    isForeshadowRelated: false,
    relatedCharacterIds: [],
  };
}

describe("scoreAndClassifyEvents —— 排序与分层截断", () => {
  it("每个事件恰好落入一个分层（不超 cap 时总数守恒、分层精确）", () => {
    const events = [
      { description: "主角陨落1", chapterDiff: 0, characterIds: ["x"], characterRoleMap: { x: "protagonist" } }, // 45 S
      { description: "主角陨落2", chapterDiff: 0, characterIds: ["x"], characterRoleMap: { x: "protagonist" } },
      { description: "主角陨落3", chapterDiff: 0, characterIds: ["x"], characterRoleMap: { x: "protagonist" } },
      { description: "甲突破了", chapterDiff: 20 }, // breakthrough=20 A
      { description: "乙突破了", chapterDiff: 20 },
      { description: "b1", chapterDiff: 0 }, // interaction=13 B
      { description: "b2", chapterDiff: 0 },
      { description: "c1", chapterDiff: 20 }, // daily=1 C
    ];
    const out = scoreAndClassifyEvents(events);
    expect(out.sTier.length).toBe(3);
    expect(out.aTier.length).toBe(2);
    expect(out.bTier.length).toBe(2);
    expect(out.cTier.length).toBe(1);
    const total = out.sTier.length + out.aTier.length + out.bTier.length + out.cTier.length;
    expect(total).toBe(8);
    // 互斥：同一描述只出现一次
    const all = [...out.sTier, ...out.aTier, ...out.bTier, ...out.cTier].map((e) => e.description);
    expect(new Set(all).size).toBe(8);
  });

  it("S 层最多 5 条：超出的 S 级事件降级到 A 层保留（不静默丢弃）", () => {
    const events = Array.from({ length: 7 }, (_, i) => ({
      description: `主角陨落${i}`,
      chapterDiff: 0,
      characterIds: ["x"],
      characterRoleMap: { x: "protagonist" }, // death25+时效10+主角10=45 → S
    }));
    const out = scoreAndClassifyEvents(events);
    expect(out.sTier.length).toBe(5);
    // 超出 5 条的 2 个 S 级事件不再被丢弃，降级进 A 层保留在 AI 上下文中
    expect(out.aTier.length).toBe(2);
    const aDesc = out.aTier.map((e) => e.description);
    expect(aDesc).toContain("主角陨落5");
    expect(aDesc).toContain("主角陨落6");
    // 总数守恒：7 个事件全部保留，无丢失
    expect(out.sTier.length + out.aTier.length + out.bTier.length + out.cTier.length).toBe(7);
  });

  it("A 层最多 15 条：超出的 A 级事件降级到 B 层保留（不静默丢弃）", () => {
    const events = Array.from({ length: 20 }, (_, i) => ({
      description: `他突破了${i}`,
      chapterDiff: 20, // breakthrough=20 → A
    }));
    const out = scoreAndClassifyEvents(events);
    expect(out.aTier.length).toBe(15);
    // 超出 15 条的 5 个 A 级事件降级进 B 层（关键词索引）保留，不丢弃
    expect(out.bTier.length).toBe(5);
    const bDesc = out.bTier.map((e) => e.description);
    expect(bDesc).toContain("他突破了15");
    expect(bDesc).toContain("他突破了19");
    expect(out.sTier.length).toBe(0);
    expect(out.cTier.length).toBe(0);
    // 总数守恒：20 个事件全部保留
    expect(out.aTier.length + out.bTier.length).toBe(20);
  });

  it("降级顺序正确：降级 S 按分数排在原生 A 之前", () => {
    const events = [
      // 3 个 S（score 45）
      ...Array.from({ length: 3 }, (_, i) => ({
        description: `s陨落${i}`,
        chapterDiff: 0,
        characterIds: ["x"],
        characterRoleMap: { x: "protagonist" },
      })),
      // 4 个原生 A（score 30：breakthrough20+时效10）
      ...Array.from({ length: 4 }, (_, i) => ({
        description: `a突破${i}`,
        chapterDiff: 0,
      })),
    ];
    const out = scoreAndClassifyEvents(events);
    // S 取满 3（<5 上限），无降级
    expect(out.sTier.length).toBe(3);
    // 无降级时 A 层为 4 个原生 A，全部保留
    expect(out.aTier.map((e) => e.description)).toEqual([
      "a突破0",
      "a突破1",
      "a突破2",
      "a突破3",
    ]);
  });

  it("降级 S 排在原生 A 之前：S 溢出时溢出项按分数高于 A 而入 A 前列", () => {
    const events = [
      // 7 个 S（score 45）→ 5 入 S，2 降级 A
      ...Array.from({ length: 7 }, (_, i) => ({
        description: `s陨落${i}`,
        chapterDiff: 0,
        characterIds: ["x"],
        characterRoleMap: { x: "protagonist" },
      })),
      // 3 个原生 A（score 30）
      ...Array.from({ length: 3 }, (_, i) => ({
        description: `a突破${i}`,
        chapterDiff: 0,
      })),
    ];
    const out = scoreAndClassifyEvents(events);
    expect(out.sTier.length).toBe(5);
    // A 层 = 降级 S(2, score45) + 原生 A(3, score30)，按分数降序共 5 条（A 上限 15 未触顶）
    expect(out.aTier.length).toBe(5);
    const aDesc = out.aTier.map((e) => e.description);
    // 前 2 个必是降级 S（score 更高），其后为原生 A
    expect(aDesc.slice(0, 2)).toEqual(["s陨落5", "s陨落6"]);
    expect(aDesc.slice(2)).toEqual(["a突破0", "a突破1", "a突破2"]);
  });

  it("分层内按分数降序排列", () => {
    const events = [
      { description: "乙突破了", chapterDiff: 20 }, // breakthrough=20 A
      { description: "主角陨落", chapterDiff: 0, characterIds: ["c"], characterRoleMap: { c: "protagonist" } }, // 死亡25+时效10+主角10=45 S
      { description: "甲突破了", chapterDiff: 0 }, // breakthrough=20+时效10=30 A
    ];
    const out = scoreAndClassifyEvents(events);
    // S 仅 high(45)
    expect(out.sTier[0].description).toBe("主角陨落");
    // A 降序：甲(30) 在 乙(20) 前
    expect(out.aTier.map((e) => e.description)).toEqual(["甲突破了", "乙突破了"]);
  });
});

// ─── prompt 格式化 ─────────────────────────────────────────

describe("formatEventsForPrompt —— 注入文本格式化", () => {
  const s1 = makeImportance("主角陨落", 45, "S");
  const a1 = makeImportance("他突破瓶颈", 30, "A");
  const b1 = makeImportance("两人对话商议", 13, "B");
  const b2 = makeImportance("短", 11, "B");

  it("含 S/A/B 三层时分别渲染对应区块", () => {
    const text = formatEventsForPrompt({ sTier: [s1], aTier: [a1], bTier: [b1, b2] });
    expect(text).toContain("【🔴 核心事件——必须记住】");
    expect(text).toContain("[S-1] 主角陨落（daily，45分）");
    expect(text).toContain("【🟡 重要事件——相关时引用】");
    expect(text).toContain("[A-1] 他突破瓶颈");
    expect(text).toContain("【🟢 背景事件索引】");
    expect(text).toContain("两人对话商议、短");
  });

  it("空层省略对应区块（只给 B 则无 🔴/🟡）", () => {
    const text = formatEventsForPrompt({ sTier: [], aTier: [], bTier: [b1] });
    expect(text).not.toContain("🔴");
    expect(text).not.toContain("🟡");
    expect(text).toContain("🟢");
  });

  it("B 层描述截断到 30 字", () => {
    const long = makeImportance("一".repeat(50), 12, "B");
    const text = formatEventsForPrompt({ sTier: [], aTier: [], bTier: [long] });
    const seg = text.split("【🟢 背景事件索引】")[1];
    expect(seg.length).toBe(30);
    expect(seg).toBe("一".repeat(30));
  });

  it("S 层多条按序号递增", () => {
    const text = formatEventsForPrompt({
      sTier: [s1, makeImportance("反派陨落", 42, "S")],
      aTier: [],
      bTier: [],
    });
    expect(text).toContain("[S-1]");
    expect(text).toContain("[S-2]");
  });
});
