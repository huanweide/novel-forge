import { describe, it, expect } from "vitest";
import { analyzeText } from "./index";
import {
  detectAiVocab,
  detectNotBut,
  detectProgressivePair,
  detectNegativeParallel,
  detectTripleParallel,
  detectActionStack,
  detectEmotionStack,
  detectParenOveruse,
  detectSentenceStartRepeat,
  detectUniformSentence,
  detectDashOveruse,
  detectWeakVocabDensity,
  splitParagraphs,
  splitSentences,
  countChars,
} from "./rules";

/** 取某条规则的命中数 */
function countOf(text: string, ruleId: string): number {
  return analyzeText(text).hits.filter((h) => h.ruleId === ruleId).length;
}
function hasRule(text: string, ruleId: string): boolean {
  return countOf(text, ruleId) > 0;
}

describe("切分工具", () => {
  it("按空行切段落并记录全文偏移", () => {
    const ps = splitParagraphs("第一段。\n\n第二段。");
    expect(ps).toHaveLength(2);
    expect(ps[1].start).toBeGreaterThan(ps[0].end);
    expect(ps[0].text).toBe("第一段。");
  });

  it("按句中英标点切句", () => {
    const ss = splitSentences("他来了。他看见！她走了？");
    expect(ss.length).toBe(3);
  });

  it("统计字数忽略空白", () => {
    expect(countChars("  a b\n c  ")).toBe(3);
  });
});

describe("规则1 · AI 高频词", () => {
  it("命中强特征词并给出证据与建议", () => {
    const hits = detectAiVocab("值得注意的是，天亮了。");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].excerpt).toContain("值得注意的是");
    expect(hits[0].reason.length).toBeGreaterThan(0);
    expect(hits[0].suggestion.length).toBeGreaterThan(0);
  });

  it("偏移加上 offset 后仍是全文坐标", () => {
    const text = "前面八个字占位。值得注意的是，天亮了。";
    const off = 8;
    const hits = detectAiVocab(text.slice(off), off);
    expect(text.slice(hits[0].start, hits[0].end)).toContain("值得");
  });

  it("干净文本不命中", () => {
    expect(detectAiVocab("他推开门，坐下。" )).toHaveLength(0);
  });
});

describe("规则2 · 「不是…而是…」", () => {
  it("命中对照句式", () => {
    expect(hasRule("他不是害怕，而是愤怒。", "not-but")).toBe(true);
  });
  it("干净文本不命中", () => {
    expect(hasRule("他害怕，也很愤怒。", "not-but")).toBe(false);
  });
});

describe("规则2b · 「不仅…而且…」递进句", () => {
  it("命中递进句式", () => {
    expect(hasRule("这不仅关乎过去，而且关乎未来。", "progressive-pair")).toBe(true);
  });
  it("「不但…还…」同样命中", () => {
    expect(hasRule("他不但没走，还坐了下来。", "progressive-pair")).toBe(true);
  });
  it("干净文本不命中", () => {
    expect(hasRule("关乎过去，也关乎未来。", "progressive-pair")).toBe(false);
  });
});

describe("规则3 · 三段式排比", () => {
  it("命中「A的a，B的b，C的c」", () => {
    expect(hasRule("清晨的风，黄昏的雨，夜里的灯。", "triple-parallel")).toBe(true);
  });
  it("只有两个并列不命中", () => {
    expect(hasRule("清晨的风，黄昏的雨。", "triple-parallel")).toBe(false);
  });
});

describe("规则4 · 否定式排比", () => {
  it("命中「不是A，不是B，而是C」", () => {
    expect(hasRule("他不是怕死，不是贪生，而是舍不得。", "negative-parallel")).toBe(true);
  });
  it("纯三重否定「不是A，不是B，不是C」同样命中（回归：此前只认「而是」收尾会漏）", () => {
    expect(hasRule("他不是一个轻言放弃的人，不是一个轻易妥协的人，不是一个甘于平庸的人。", "negative-parallel")).toBe(true);
  });
  it("单次否定不命中", () => {
    expect(hasRule("他不是怕死。", "negative-parallel")).toBe(false);
  });
});

describe("规则5 · 肢体动作堆砌", () => {
  it("一句里三个套路动作命中", () => {
    expect(hasRule("他微微一怔，深吸一口气，死死盯着门口。", "action-stack")).toBe(true);
  });
  it("只有两个不命中", () => {
    expect(hasRule("他微微一怔，深吸一口气。", "action-stack")).toBe(false);
  });
});

describe("规则6 · 情感词堆叠", () => {
  it("四个顿号连接的短词命中", () => {
    expect(hasRule("愤怒、恐惧、绝望、不甘一起涌上来。", "emotion-stack")).toBe(true);
  });
  it("三个不命中", () => {
    expect(hasRule("愤怒、恐惧、绝望一起涌上来。", "emotion-stack")).toBe(false);
  });
});

describe("规则7 · 括号补充过度", () => {
  const t = "他来了（比约定晚了十分钟），坐下（一句话没说），又走了（还是没说话）。";
  it("密度超标时命中", () => {
    expect(hasRule(t, "paren-overuse")).toBe(true);
  });
  it("单个括号不命中", () => {
    expect(hasRule("他来了（比约定晚了十分钟），然后坐下。", "paren-overuse")).toBe(false);
  });
});

describe("规则8 · 句首重复", () => {
  it("连续三句同开头命中（判定看前两个字）", () => {
    expect(hasRule("他推开门进去了。他推开窗看了看。他推开她自己走了。", "start-repeat")).toBe(true);
  });
  it("只重复两句不命中", () => {
    expect(hasRule("他推开门进去了。他推开窗看了看。她什么也没说。", "start-repeat")).toBe(false);
  });
});

describe("规则9 · 句长过于均匀", () => {
  it("六句长度几乎一致时命中", () => {
    const s = "这是一个非常标准的句子啊。";
    expect(hasRule(s.repeat(6), "uniform-sentence")).toBe(true);
  });
  it("长短交错不命中", () => {
    expect(hasRule("他来了。她慢慢地转过身，看着窗外那棵被风吹得东倒西歪的老槐树，一言不发。走。", "uniform-sentence")).toBe(false);
  });
  it("少于六句不判（样本不足，避免误报）", () => {
    expect(hasRule("这是一个非常标准的句子啊。".repeat(3), "uniform-sentence")).toBe(false);
  });
});

describe("规则10 · 破折号过多", () => {
  it("长文本高密度破折号命中", () => {
    const body = "他站在门口犹豫了很久很久，不知道该不该进去。".repeat(8);
    const t = body + "门后——是光——也是影子——还有风——以及尘埃——".repeat(1);
    expect(hasRule(t, "dash-overuse")).toBe(true);
  });
  it("短文本不判（200 字以下）", () => {
    expect(hasRule("短短一句话里——有两个破折号——不够判。", "dash-overuse")).toBe(false);
  });
  it("正常密度不命中", () => {
    const t = "他站在门口犹豫了很久很久，不知道该不该进去。".repeat(8) + "门后——是光。";
    expect(hasRule(t, "dash-overuse")).toBe(false);
  });
});

describe("规则11 · 弱特征词密度", () => {
  it("密度超标命中（规则要求 ≥300 字才判，样本必须够长）", () => {
    const t = "似乎仿佛好像隐约悄然微微一丝些许几分".repeat(20);
    expect(countChars(t)).toBeGreaterThanOrEqual(300);
    expect(hasRule(t, "weak-vocab-density")).toBe(true);
  });
  it("短于 300 字不判（避免小样本误报）", () => {
    expect(hasRule("似乎仿佛好像隐约悄然微微一丝些许几分".repeat(5), "weak-vocab-density")).toBe(false);
  });
  it("正常文本不命中", () => {
    const t = "他推开门，看见她坐在窗边，把信折好放进抽屉，然后起身走了。".repeat(8);
    expect(hasRule(t, "weak-vocab-density")).toBe(false);
  });
});

describe("analyzeText 报告结构", () => {
  const aiText = [
    "在这个喧嚣的世界里，李明不仅感到一种难以言喻的孤独，而且意识到自己必须做出改变。",
    "值得注意的是，这种情况并非偶然，而是必然的结果。",
    "他不是一个轻言放弃的人，不是一个轻易妥协的人，不是一个甘于平庸的人。",
  ].join("");

  it("空文本返回空报告而不是崩", () => {
    const r = analyzeText("");
    expect(r.score).toBe(0);
    expect(r.level).toBe("clean");
    expect(r.hits).toEqual([]);
    expect(r.paragraphs).toEqual([]);
  });

  it("非字符串输入不崩", () => {
    // @ts-expect-error 故意传非法入参，验证防御
    const r = analyzeText(null);
    expect(r.score).toBe(0);
  });

  it("AI 腔文本分数显著高于人写文本", () => {
    const human = "李明朝地上啐了一口。走了。街灯坏了一半，忽明忽暗。他想起昨天那句话，越想越气。管他呢。";
    const a = analyzeText(aiText);
    const h = analyzeText(human);
    expect(a.score).toBeGreaterThan(h.score + 30);
    expect(h.level).toBe("clean");
    expect(a.level).not.toBe("clean");
  });

  it("分数与等级在合法区间内自洽", () => {
    for (const t of ["", aiText, "短句。", "一".repeat(5000)]) {
      const r = analyzeText(t);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(["clean", "mild", "noticeable", "heavy"]).toContain(r.level);
      expect(r.levelLabel.length).toBeGreaterThan(0);
    }
  });

  it("命中按出现顺序排列，且 start 小于 end", () => {
    const r = analyzeText(aiText);
    for (let i = 1; i < r.hits.length; i++) {
      expect(r.hits[i].start).toBeGreaterThanOrEqual(r.hits[i - 1].start);
    }
    for (const h of r.hits) {
      expect(h.end).toBeGreaterThan(h.start);
    }
  });

  it("byRule 聚合数量与 hits 总数一致且按数量降序", () => {
    const r = analyzeText(aiText);
    const sum = r.byRule.reduce((s, x) => s + x.count, 0);
    expect(sum).toBe(r.hits.length);
    for (let i = 1; i < r.byRule.length; i++) {
      expect(r.byRule[i].count).toBeLessThanOrEqual(r.byRule[i - 1].count);
    }
  });

  it("每条命中都能在原文中定位（start/end 指向真实片段）", () => {
    const r = analyzeText(aiText);
    expect(r.hits.length).toBeGreaterThan(0);
    for (const h of r.hits) {
      const slice = aiText.slice(h.start, h.end);
      expect(slice.length).toBeGreaterThan(0);
      // 证据片段应取自该位置附近
      expect(h.excerpt.length).toBeGreaterThan(0);
    }
  });

  it("段落命中被归并进正确段落（全文级规则也能定位）", () => {
    const text = "第一段干干净净，什么都没有。\n\n" + aiText;
    const r = analyzeText(text);
    expect(r.paragraphs).toHaveLength(2);
    expect(r.paragraphs[0].hits).toHaveLength(0);
    expect(r.paragraphs[1].hits.length).toBeGreaterThan(0);
  });

  it("免责声明必带且提示不上传", () => {
    const r = analyzeText(aiText);
    expect(r.disclaimer).toContain("不能保证");
    expect(r.disclaimer).toContain("不会上传");
  });

  it("统计字段都是有限数字", () => {
    const r = analyzeText(aiText);
    for (const v of Object.values(r.stats)) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(r.stats.chars).toBeGreaterThan(0);
  });
});

describe("误报防线：像人写的不该被冤枉", () => {
  const humanSamples = [
    "李明朝地上啐了一口。走了。街灯坏了一半，忽明忽暗。",
    "他把信揉了，扔进垃圾桶。想了想，又捡回来，展平，压在书下面。",
    "“吃饭了吗。”\n\n“吃了。”\n\n“吃的什么。”\n\n“面条。”",
  ];
  it("真人风格样本全部判为干净", () => {
    for (const t of humanSamples) {
      expect(analyzeText(t).level).toBe("clean");
    }
  });
});

describe("性能：长文本分析要够快（浏览器主线程同步跑）", () => {
  it("三万字在 1 秒内跑完", () => {
    const text = "他站在门口，似乎在犹豫什么，仿佛下一秒就要转身离开似的。".repeat(1200);
    expect(countChars(text)).toBeGreaterThan(20000);
    const t0 = Date.now();
    analyzeText(text);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
