/**
 * 平台级过审预检单测（M2）
 *
 * 重点锁死：
 *   1. 纯本地不误判（空文本 / 短样本不给出高分）
 *   2. 真能区分「套路念稿」与「有人味的稿」
 *   3. 平台差异化加权真的生效——同一份稿子投番茄和投起点，风险点不同
 */
import { describe, it, expect } from "vitest";
import { analyzePlatformRisk, PLATFORM_PROFILES } from "./platform-risk";

/** 高套路、无对话、句长整齐的典型「AI 味」稿件 */
const DIRTY = [
  "就在这时，他缓缓抬起头，眸子里闪过一丝深邃的光芒，空气仿佛凝固了。",
  "她静静地凝视着远方，嘴角勾起一抹淡淡的苦涩，心中一凛。",
  "他默默握紧了拳头，眼神一沉，下定决心要从今往后改变这一切。",
  "冥冥之中，命运的齿轮开始转动，这一刻，所有人都感到了无奈。",
  "她悄然转身，眼神里带着一丝复杂，似乎有什么话要说却又忍住了。",
  "他轻轻叹了口气，似乎在思考着什么，显然已经做好了决定。",
  "就在这时，远处传来一声轻响，两人同时转头，眸子里闪过警觉。",
  "她微微点头，表情平静，仿佛整个世界都与她没有了关系。",
].join("\n\n");

/** 有人味的稿：口语对话 + 长短错落 + 少修饰 */
const CLEAN = [
  "老张把搪瓷缸往桌上一磕。「喝口热的？」",
  "「不喝。」李四摆手，「我胃疼，大夫让少吃刺激的东西。你怎么想起问这个了？」",
  "「看你脸色跟纸似的。」",
  "「嗯，昨儿夜里没睡好。」李四顿了顿，忽然压低声音，「哎，你听说三车间那事了吗？」",
  "老张愣了一下：「啥事？」",
  "「亏了三十万。」",
  "「多少？！」老张手一抖，茶水泼了一裤腿，「……真的假的？」",
  "「千真万确。我表哥在财务科。」李四叹气，「这厂子，悬了。」",
].join("\n\n");

describe("analyzePlatformRisk —— 基础行为", () => {
  it("空文本不给风险分（不误伤）", () => {
    const r = analyzePlatformRisk("");
    expect(r.riskScore).toBe(0);
    expect(r.riskLevel).toBe("low");
    expect(r.dimensions).toHaveLength(0);
  });

  it("非字符串入参不炸", () => {
    const r = analyzePlatformRisk(null as unknown as string);
    expect(r.riskScore).toBe(0);
  });

  it("返回五个维度且都带可解释的原始统计说明", () => {
    const r = analyzePlatformRisk(DIRTY);
    expect(r.dimensions).toHaveLength(5);
    for (const d of r.dimensions) {
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
      expect(d.detail.length).toBeGreaterThan(0);
    }
  });

  it("风险分恒在 0-100 之间", () => {
    for (const p of Object.keys(PLATFORM_PROFILES) as Array<keyof typeof PLATFORM_PROFILES>) {
      const r = analyzePlatformRisk(DIRTY, p);
      expect(r.riskScore).toBeGreaterThanOrEqual(0);
      expect(r.riskScore).toBeLessThanOrEqual(100);
    }
  });
});

describe("analyzePlatformRisk —— 真能区分人味与机器味", () => {
  it("套路念稿的风险分明显高于有人味的稿", () => {
    const dirty = analyzePlatformRisk(DIRTY, "general");
    const clean = analyzePlatformRisk(CLEAN, "general");
    expect(dirty.riskScore).toBeGreaterThan(clean.riskScore);
  });

  it("套路稿能给出可定位的证据（带原文片段与位置）", () => {
    const r = analyzePlatformRisk(DIRTY, "general");
    expect(r.findings.length).toBeGreaterThan(0);
    const first = r.findings[0];
    expect(first.excerpt.length).toBeGreaterThan(0);
    expect(first.start).toBeGreaterThanOrEqual(0);
    expect(first.end).toBeGreaterThan(first.start);
    expect(first.suggestion.length).toBeGreaterThan(0);
  });

  it("对话里有口语标记的稿，对话维度风险更低", () => {
    const dirty = analyzePlatformRisk(DIRTY, "general");
    const clean = analyzePlatformRisk(CLEAN, "general");
    const dOf = (r: typeof dirty) => r.dimensions.find((d) => d.key === "dialogue")!.score;
    // CLEAN 通篇是口语对话 → 对话维度风险应低于 DIRTY（无对话，给中性 35）
    expect(dOf(clean)).toBeLessThan(dOf(dirty));
  });
});

describe("analyzePlatformRisk —— 平台差异化加权真的生效", () => {
  it("对话念稿型（套路描写多、对话少）在起点比番茄更危险", () => {
    // 番茄重对话权重 30（本稿无对话 → 该维度中性 35），起点重套路 30 + AI 词 25（本稿都很高）
    const fanqie = analyzePlatformRisk(DIRTY, "fanqie");
    const qidian = analyzePlatformRisk(DIRTY, "qidian");
    expect(qidian.riskScore).toBeGreaterThan(fanqie.riskScore);
    expect(fanqie.platformLabel).toContain("番茄");
    expect(qidian.platformLabel).toContain("起点");
  });

  it("不同平台给出的口味说明不同（不是换个标签的同一个分数）", () => {
    const a = analyzePlatformRisk(DIRTY, "fanqie");
    const b = analyzePlatformRisk(DIRTY, "qidian");
    expect(a.platformNote).not.toBe(b.platformNote);
  });

  it("未指定平台走通用口径（五维等权）", () => {
    const r = analyzePlatformRisk(DIRTY);
    expect(r.platform).toBe("general");
    expect(PLATFORM_PROFILES.general.weights).toEqual({
      cliche: 20,
      vocab: 20,
      rhythm: 20,
      dialogue: 20,
      emotion: 20,
    });
  });
});

describe("analyzePlatformRisk —— 统计型维度不误判", () => {
  it("句长完全整齐时节奏维度告警", () => {
    // 8 个长度高度一致的句子
    const text = Array.from({ length: 8 }, () => "他慢慢地走向那扇门并且停下了脚步。").join("");
    const r = analyzePlatformRisk(text, "general");
    const rhythm = r.dimensions.find((d) => d.key === "rhythm")!;
    expect(rhythm.score).toBeGreaterThan(50);
    expect(rhythm.detail).toContain("CV");
  });

  it("样本不足时不判节奏（detail 如实说明）", () => {
    const r = analyzePlatformRisk("就一句话而已。", "general");
    const rhythm = r.dimensions.find((d) => d.key === "rhythm")!;
    expect(rhythm.score).toBe(0);
    expect(rhythm.detail).toContain("样本不足");
  });

  it("无对话的稿，对话维度给中性分并如实说明（不假装判得出来）", () => {
    const r = analyzePlatformRisk("他独自走在街上，没有人说话。\n\n风很大，吹得人睁不开眼。\n\n远处有灯亮着。", "general");
    const dialogue = r.dimensions.find((d) => d.key === "dialogue")!;
    expect(dialogue.detail).toContain("没有对话");
  });
});
