import { describe, it, expect } from "vitest";
import {
  isCjkChar,
  matchKeyword,
  matchNameStrict,
  scoreKeyword,
  dedupSubstring,
} from "./match";

// 这些测试验证「三卡检索 / 填表」的 CJK 词边界匹配引擎 —— 其核心目标：
// 中文无空格，"林" 不应误命中 "森林"，"潮痕" 不应误命中 "暗潮痕迹"。
describe("isCjkChar", () => {
  it("汉字返回 true", () => {
    expect(isCjkChar("林")).toBe(true);
    expect(isCjkChar("镇")).toBe(true);
  });
  it("非汉字返回 false", () => {
    expect(isCjkChar("a")).toBe(false);
    expect(isCjkChar("1")).toBe(false);
    expect(isCjkChar(" ")).toBe(false);
  });
});

describe("matchKeyword —— 灭错名核心", () => {
  it("单字关键词直接拒绝（杜绝「林」误命中「森林」）", () => {
    expect(matchKeyword("森林里有一只老虎", "林")).toBe(false);
    expect(matchKeyword("他在林中", "林")).toBe(false);
  });

  it("长度≥3 直接命中（含子串）", () => {
    expect(matchKeyword("青龙镇坐落在海边", "青龙镇")).toBe(true);
    expect(matchKeyword("新城的夜色", "新城")).toBe(true);
  });

  it("长度=2 需词边界：真实词「潮痕」在边界处命中", () => {
    // 「潮痕」位于句尾，尾部是边界 → 命中
    expect(matchKeyword("他一路追到潮痕", "潮痕")).toBe(true);
    // 句首边界
    expect(matchKeyword("潮痕是古老的记号", "潮痕")).toBe(true);
  });

  it("长度=2 非边界不命中（「潮痕」≠「暗潮痕迹」中的片段）", () => {
    // 暗(0)潮(1)痕(2)迹(3)：潮痕两侧都是汉字 → 非边界 → 不命中
    expect(matchKeyword("暗潮痕迹渐渐清晰", "潮痕")).toBe(false);
  });

  it("长度=2 跨真实词边界不匹配（「青龍」不在「青龙镇」中，繁简不同）", () => {
    expect(matchKeyword("青龙镇灯火通明", "青龍")).toBe(false);
  });

  it("否定用例：关键词不在文本中", () => {
    expect(matchKeyword("新城的夜色", "龙渊")).toBe(false);
  });
});

describe("scoreKeyword —— 最长匹配优先", () => {
  it("单字得 0 分（单字被 matchKeyword 拒绝，不参与召回打分）", () => {
    expect(scoreKeyword("林")).toBe(0);
    expect(scoreKeyword("镇")).toBe(0);
  });
  it("长度≥2 时越长越具体得分越高", () => {
    expect(scoreKeyword("青龙镇")).toBe(3);
    expect(scoreKeyword("青龙")).toBe(2);
  });
});

describe("matchNameStrict —— 角色名/OOC 召回专用", () => {
  it("单字「云」：句尾命中、被 CJK 包围不命中", () => {
    expect(matchNameStrict("乌云", "云")).toBe(true); // 「乌」后接「云」→ 后侧边界
    expect(matchNameStrict("云。", "云")).toBe(true); // 句尾
    expect(matchNameStrict("云海", "云")).toBe(false); // 后接 CJK「海」→ 闭边界不成立
  });

  it("2字「叶凡」：无空格场景各位置均命中（P0 修复）", () => {
    expect(matchNameStrict("叶凡怒喝", "叶凡")).toBe(true); // 句首，后被包围
    expect(matchNameStrict("他喊叶凡", "叶凡")).toBe(true); // 句中，前后 CJK
    expect(matchNameStrict("村头叶凡走过", "叶凡")).toBe(true); // 句中
    expect(matchNameStrict("叶帆", "叶凡")).toBe(false); // 错字（非繁简）不匹配
  });

  it("3字「李星云」：直接子串命中（撤销 Round5 前缀守卫，修复常规行文漏检）", () => {
    expect(matchNameStrict("李星云剑法", "李星云")).toBe(true); // 无 knownNames → 直接命中
    expect(matchNameStrict("李星云看见", "李星云")).toBe(true); // 常规行文命中
    expect(matchNameStrict("李星云。", "李星云")).toBe(true); // 紧后标点
    expect(matchNameStrict("李星云", "李星云")).toBe(true); // 文末
  });

  it("纯数字 2049：独立命中、被包入长数字串不命中", () => {
    expect(matchNameStrict("年份是2049", "2049")).toBe(true);
    expect(matchNameStrict("120499", "2049")).toBe(false); // 子串误伤防护
  });

  it("4字「星云剑法」：文末命中", () => {
    expect(matchNameStrict("李星云剑法", "星云剑法")).toBe(true); // 后接文末
  });
});

describe("matchNameStrict —— Q2 覆盖式吞并（仅 3字+ 生效，2字保召回）", () => {
  it("2字「云山」在「青云山」仍直接命中（2字不吞并，Round4 铁律）", () => {
    expect(matchNameStrict("青云山", "云山", { knownNames: ["青云山", "云山"] })).toBe(true);
  });

  it("2字「云山」独立出现（无更长名覆盖）命中 → true", () => {
    expect(matchNameStrict("云山耸立", "云山", { knownNames: ["青云山", "云山"] })).toBe(true);
    expect(matchNameStrict("云山", "云山", { knownNames: ["青云山", "云山"] })).toBe(true);
  });

  it("2字「叶凡」常见名不被吞并（无更长已知名覆盖）→ true", () => {
    expect(matchNameStrict("叶凡怒喝", "叶凡", { knownNames: ["叶凡"] })).toBe(true);
    expect(matchNameStrict("他喊叶凡", "叶凡", { knownNames: ["萧炎", "叶凡"] })).toBe(true);
  });

  it("3字「星云剑」在「李星云剑法」被覆盖吞并 → false（起点不同也能吞并）", () => {
    expect(matchNameStrict("李星云剑法", "星云剑", { knownNames: ["李星云剑法", "星云剑"] })).toBe(false);
  });

  it("3字「星云剑」在「李星云剑看见」无更长名覆盖 → true", () => {
    expect(matchNameStrict("李星云剑看见", "星云剑", { knownNames: ["星云剑"] })).toBe(true);
  });

  it("2字「云山」在「青云山脉」仍直接命中（2字不吞并）", () => {
    expect(matchNameStrict("青云山脉", "云山", { knownNames: ["青云山脉", "云山"] })).toBe(true);
  });
});

describe("最长匹配优先", () => {
  it("已知更长名时，3字名被吞并 → false", () => {
    expect(
      matchNameStrict("李星云剑法", "李星云", { knownNames: ["李星云剑法", "李星云"] }),
    ).toBe(false);
  });
  it("紧后CJK但拼不出更长已知名 → true", () => {
    expect(matchNameStrict("李星云看见", "李星云", { knownNames: ["李星云"] })).toBe(true);
  });
  it("2字回归：无 knownNames 直接子串", () => {
    expect(matchNameStrict("叶凡怒喝", "叶凡")).toBe(true);
  });
  it("1字守卫：紧后CJK不命中", () => {
    expect(matchNameStrict("李星云", "李")).toBe(false);
  });
});

describe("matchKeyword —— 含数字关键词的数字边界守卫（R-F4 数字子串误伤）", () => {
  // 以下用例仅针对「含数字且非纯数字」的关键词，验证其数字串不会被相邻数字延长误命中。
  it("「2049年」不应误命中「12049年」（数字串被前面「1」延长）", () => {
    expect(matchKeyword("12049年是个节点", "2049年")).toBe(false);
  });

  it("「2049年」应命中「到了2049年发生了」（数字串两侧无相邻数字）", () => {
    expect(matchKeyword("到了2049年发生了", "2049年")).toBe(true);
  });

  it("「2049年」应命中句尾独立年份「2049年」", () => {
    expect(matchKeyword("故事终结于2049年", "2049年")).toBe(true);
  });

  it("「第3章」仍命中「第3章」", () => {
    expect(matchKeyword("本章标题为第3章内容", "第3章")).toBe(true);
  });

  it("「第3章」不命中「第13章」（字符串层面非子串，本来就 false，确认不受影响）", () => {
    expect(matchKeyword("详见第13章说明", "第3章")).toBe(false);
  });

  it("无数字关键词「青龙镇」保持直命中（无回归）", () => {
    expect(matchKeyword("青龙镇坐落在海边", "青龙镇")).toBe(true);
  });

  it("纯数字「2049」仍走词边界逻辑、不命中「120499」（无回归）", () => {
    expect(matchKeyword("年份是2049", "2049")).toBe(true);
    expect(matchKeyword("120499", "2049")).toBe(false);
  });
});

describe("dedupSubstring —— 去除被更长关键词包含的短词", () => {
  it("保留长词、剔除被包含的短词", () => {
    // 假设已命中集合里有「青龙镇」，则「龙镇」应被剔除，避免重复召回
    const out = dedupSubstring(["青龙镇", "龙镇", "新城", "城"]);
    expect(out).toContain("青龙镇");
    expect(out).toContain("新城");
    expect(out).not.toContain("龙镇");
    expect(out).not.toContain("城");
  });
  it("无包含关系时全部保留", () => {
    expect(dedupSubstring(["青龙镇", "龙渊"])).toEqual(["青龙镇", "龙渊"]);
  });
});
