import { describe, it, expect } from "vitest";
import { isSimilarName, isHonorificVariant, samePersonByHonorific, resolveHonorificTarget, resolveVariantTarget, resolveEntityCategory, shouldAutoCreateCharacterCard, MIN_CHARACTER_APPEARANCES } from "./entity-auto-creator";

// 验证 entity-auto-creator 的相似名去重（尤其中文短名繁简归一化，青砚 P2）。
describe("isSimilarName —— 短名繁简去重", () => {
  it("2字繁简变体判重复（萧炎/蕭炎）", () => {
    expect(isSimilarName("萧炎", "蕭炎")).toBe(true);
    expect(isSimilarName("蕭炎", "萧炎")).toBe(true);
  });

  it("2字无关词不误并（白云/白衣，证明未引入编辑距离）", () => {
    expect(isSimilarName("白云", "白衣")).toBe(false);
  });

  it("2字纯错字不去重（叶凡/叶帆，已知留待后续）", () => {
    expect(isSimilarName("叶凡", "叶帆")).toBe(false);
  });

  it("长名编辑距离≤1 仍判重复（青龙镇/青龍镇）", () => {
    expect(isSimilarName("青龙镇", "青龍镇")).toBe(true);
  });

  it("P1-2 长名编辑距离1 语义不同不误并（青云宗/青云山 → false）", () => {
    expect(isSimilarName("青云宗", "青云山")).toBe(false);
    expect(isSimilarName("青云山", "青云宗")).toBe(false);
  });

  it("P1-2 长名编辑距离1 其他语义不同实体不误并（剑/刀）", () => {
    expect(isSimilarName("玄铁剑", "玄铁刀")).toBe(false);
  });
});

describe("同人异称融合（v1.6.3）—— resolveHonorificTarget 唯一性闸门", () => {
  it("唯一同姓正主：尊称变体并入（韩先生→韩立）", () => {
    expect(resolveHonorificTarget(["韩立"], "韩先生")).toBe("韩立");
  });
  it("唯一同姓正主：描述性变体并入（韩姓男子→韩立）", () => {
    expect(resolveHonorificTarget(["韩立"], "韩姓男子")).toBe("韩立");
  });
  it("唯一同姓正主：某称/前缀/夫人/拉丁变体并入", () => {
    expect(resolveHonorificTarget(["韩立"], "韩某")).toBe("韩立");
    expect(resolveHonorificTarget(["韩立"], "老韩")).toBe("韩立");
    expect(resolveHonorificTarget(["王立"], "王夫人")).toBe("王立");
    expect(resolveHonorificTarget(["A全名"], "A先生")).toBe("A全名");
  });
  it("同姓正主不唯一：拒绝合并，避免错并（韩先生 遇 韩立+韩雪 → null）", () => {
    expect(resolveHonorificTarget(["韩立", "韩雪"], "韩先生")).toBeNull();
  });
  it("自身已是正主则无目标（韩立 不是变体）", () => {
    expect(resolveHonorificTarget(["韩立"], "韩立")).toBeNull();
  });
  it("真实姓名含尊称字不误判（韩山君 非变体）", () => {
    expect(isHonorificVariant("韩山君")).toBe(false);
    expect(resolveHonorificTarget(["韩立"], "韩山君")).toBeNull();
  });
});

describe("resolveVariantTarget（合并重复判定分支的规范入口，v2.0.7）", () => {
  it("尊称变体并入唯一同姓正主（韩先生→韩立）", () => {
    expect(resolveVariantTarget(["韩立"], "韩先生")).toBe("韩立");
  });
  it("单字缩写并入唯一同姓正主（樊→樊斯瑞）——覆盖 resolveHonorificTarget 不处理单字缩写的旧缺口", () => {
    expect(resolveVariantTarget(["樊斯瑞"], "樊")).toBe("樊斯瑞");
  });
  it("姓+描述词并入唯一同姓正主（韩姓男子→韩立）", () => {
    expect(resolveVariantTarget(["韩立"], "韩姓男子")).toBe("韩立");
  });
  it("同姓正主不唯一：拒绝合并（韩先生 遇 韩立+韩雪 → null）", () => {
    expect(resolveVariantTarget(["韩立", "韩雪"], "韩先生")).toBeNull();
  });
  it("单字缩写同姓正主不唯一：拒绝合并（樊 遇 樊斯瑞+樊雪 → null）", () => {
    expect(resolveVariantTarget(["樊斯瑞", "樊雪"], "樊")).toBeNull();
  });
  it("自身已是正主则无目标（樊斯瑞 非变体）", () => {
    expect(resolveVariantTarget(["樊斯瑞"], "樊斯瑞")).toBeNull();
  });
});

describe("同人异称融合（v1.6.3）—— samePersonByHonorific 成对判定", () => {
  it("共享姓且一为变体 → true（韩先生/韩立、韩姓男子/韩立、A先生/A全名）", () => {
    expect(samePersonByHonorific("韩先生", "韩立")).toBe(true);
    expect(samePersonByHonorific("韩姓男子", "韩立")).toBe(true);
    expect(samePersonByHonorific("A先生", "A全名")).toBe(true);
  });
  it("同姓不同人 → false（韩立/韩雪）", () => {
    expect(samePersonByHonorific("韩立", "韩雪")).toBe(false);
  });
  it("异姓 → false（韩先生/李立）", () => {
    expect(samePersonByHonorific("韩先生", "李立")).toBe(false);
  });
  it("helper：isHonorificVariant 判定", () => {
    expect(isHonorificVariant("韩先生")).toBe(true);
    expect(isHonorificVariant("韩立")).toBe(false);
    expect(isHonorificVariant("韩山君")).toBe(false);
  });
});

describe("resolveEntityCategory（F5）—— 15 类兜底不静默落 custom", () => {
  it("显式映射类型直接命中正确分类", () => {
    expect(resolveEntityCategory("location", "青云山脉")).toBe("geography");
    expect(resolveEntityCategory("pill", "筑基丹")).toBe("item");
    expect(resolveEntityCategory("technique", "焚天诀")).toBe("technique");
  });

  it("未映射 type（如 faction/creature）→ 分类器按名称重路由到正确 15 类，而非 custom", () => {
    // 这些 type 不在显式映射中，旧逻辑会静默落 custom；修复后按名称关键词重路由。
    // 注：命名刻意避开「宗门」（geography 与 faction 共有词，分类器按列表序裁决归 geography），
    // 用 faction 专属词「王朝」确保稳定归 faction。
    expect(resolveEntityCategory("faction", "大周王朝")).toBe("faction");
    expect(resolveEntityCategory("creature", "九幽妖兽")).toBe("creature");
    expect(resolveEntityCategory("currency", "中品灵石")).toBe("currency");
  });

  it("完全未知 type + 含世界关键词的名称 → 重路由到对应 15 类", () => {
    expect(resolveEntityCategory("unknown", "上古遗迹")).toBe("history");
    expect(resolveEntityCategory("whatever", "天道的戒律")).toBe("law");
  });

  it("无法识别的名称 → 安全兜底 custom（不误判）", () => {
    expect(resolveEntityCategory("mystery", "张三")).toBe("custom");
  });
});

// ── 任务 #16：谨慎建卡门槛（次要小角色不入卡）──
// 仅当候选名在全项目正文出现次数 ≥ 阈值（默认 2）才自动建卡，
// 把只出现一两次的路人甲（如某章只出现一次的服务员）拦截，避免污染角色卡数据。
describe("任务#16 谨慎建卡门槛 shouldAutoCreateCharacterCard（次要小角色不入卡）", () => {
  it("默认阈值常量 = 2", () => {
    expect(MIN_CHARACTER_APPEARANCES).toBe(2);
  });
  it("出现 0 次 → false（完全没出现，绝不建卡）", () => {
    expect(shouldAutoCreateCharacterCard(0)).toBe(false);
  });
  it("出现 1 次 → false（疑似路人甲，拦截）", () => {
    expect(shouldAutoCreateCharacterCard(1)).toBe(false);
  });
  it("出现 2 次 → true（刚好达标，主角/重要配角）", () => {
    expect(shouldAutoCreateCharacterCard(2)).toBe(true);
  });
  it("出现 3 次 → true（高频，建卡）", () => {
    expect(shouldAutoCreateCharacterCard(3)).toBe(true);
  });
  it("自定义更高阈值：出现 2 次但阈值=3 → false（新人作者小项目可放宽/收紧）", () => {
    expect(shouldAutoCreateCharacterCard(2, 3)).toBe(false);
    expect(shouldAutoCreateCharacterCard(3, 3)).toBe(true);
  });
});
