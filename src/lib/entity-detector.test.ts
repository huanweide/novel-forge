import { describe, it, expect } from "vitest";
import { isCompleteEntityName, extractNewEntities, type EntityDetectionResult } from "./entity-detector";

describe("isCompleteEntityName —— Q1 碎片过滤", () => {
  it("句子碎片被过滤", () => {
    expect(isCompleteEntityName("核桃壳在他指")).toBe(false); // 含「在」
    expect(isCompleteEntityName("他六岁那年练功")).toBe(false); // 含「他/那」
    expect(isCompleteEntityName("右手拇指")).toBe(false); // 身体部位片段
    expect(isCompleteEntityName("他在海边")).toBe(false); // 含功能词「在」
    expect(isCompleteEntityName("他在")).toBe(false); // 含功能词
    expect(isCompleteEntityName("青云山。")).toBe(false); // 含标点
    expect(isCompleteEntityName("这是一把剑的情况描述很长很长很长")).toBe(false); // 超长
  });

  it("干净专有名词被保留", () => {
    expect(isCompleteEntityName("青云剑")).toBe(true);
    expect(isCompleteEntityName("培元丹")).toBe(true);
    expect(isCompleteEntityName("苍云山脉")).toBe(true);
    expect(isCompleteEntityName("星辰诀")).toBe(true);
    expect(isCompleteEntityName("聚灵石")).toBe(true);
    expect(isCompleteEntityName("叶凡")).toBe(true); // 短名允许，末字名词性
  });

  it("长度和末字约束", () => {
    expect(isCompleteEntityName("李")).toBe(false); // <2
    expect(isCompleteEntityName("李星云剑法")).toBe(true); // 6字且末字后缀
    expect(isCompleteEntityName("默默修炼")).toBe(false); // 含功能词
    expect(isCompleteEntityName("他看了")).toBe(false); // 末字功能词 + 含功能词
  });

  it("魔王复测回流：真实漏网碎片全拦截（Q1 补强）", () => {
    // 原 e2e 发现的 4 类漏网 + 测试项目真实 lorebook 中抽出的代表碎片
    const leaks = [
      "显得像一根", "潮之后裸露", "地名像一根", "车铃", // e2e 原报 4 类
      "方用圆珠", "问号像雪花", "远处钢铁", "里醒得比城", "退潮后龙骨",
      "玻璃门", "手指骨", "社区中心门", "本子封皮", "龙渊两只手指",
      "位于新城", "第二道拉门", "叶凌云推门", "立起来的骨", "把那扇百叶",
      "窗的叶", "关门的五金", "从拇指根斜进掌", "刺或撬棍", "不是枪",
    ];
    for (const f of leaks) expect(isCompleteEntityName(f), `碎片应被拦截: ${f}`).toBe(false);
  });

  it("魔王复测回流：真实专名零误杀（保召回铁律）", () => {
    const real = [
      "萧炎", "叶凡", "林动", "王林", "乌坦城", "青云宗", "萧薰儿",
      "炎帝", "龙渊", "中南海", "新城", "龙陨之地", "叶凌云", // 含「之/渊/海」等易误杀字仍须放行
      "青云剑", "培元丹", "苍云山脉", "星辰诀", "聚灵石", "李星云剑法",
    ];
    for (const r of real) expect(isCompleteEntityName(r), `真实专名不应被误杀: ${r}`).toBe(true);
  });
});

describe("extractNewEntities —— Q1 漏斗过滤碎片", () => {
  function makeResult(names: string[]): EntityDetectionResult {
    return {
      entities: names.map((name, i) => ({
        name,
        type: "material",
        position: i,
        confidence: 0.8,
        isKnown: false,
        matchedBy: "test",
      })),
      stats: {
        totalDetected: names.length,
        byType: { pill: 0, artifact: 0, technique: 0, location: 0, material: 0, character: 0 },
        knownCount: 0,
        newCount: names.length,
        textLength: 0,
        elapsedMs: 0,
      },
    };
  }

  it("碎片被剔除、干净名词保留", () => {
    const r = makeResult(["右手拇指", "聚灵石", "他六岁那年练功", "青云剑"]);
    const out = extractNewEntities(r).map((e) => e.name);
    expect(out).toContain("聚灵石");
    expect(out).toContain("青云剑");
    expect(out).not.toContain("右手拇指");
    expect(out).not.toContain("他六岁那年练功");
  });
});
