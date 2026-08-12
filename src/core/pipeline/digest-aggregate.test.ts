import { describe, it, expect } from "vitest";
import {
  isGarbageSummary,
  buildTimelineDigest,
  buildStorylineDigest,
  formatStorylineEvents,
  MAX_TIMELINE_CHAPTERS,
  type RawChapterOutline,
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

describe("buildTimelineDigest（v2.0.4：直接抄章纲）", () => {
  const mk = (order: number, title: string, outline: string): RawChapterOutline => ({
    chapterId: `c${order + 1}`,
    order,
    title,
    outline,
  });

  it("空输入返回空串", () => {
    expect(buildTimelineDigest([])).toBe("");
  });

  it("无章纲 / 过短章纲不入大纲；章纲按章序排列，章间空一行", () => {
    const chapters: RawChapterOutline[] = [
      mk(0, "第一章 启航", "林夜在龙骨滩苏醒，发现整座新城建立在巨龙骸骨之上。"),
      mk(1, "潮痕", ""), // 无章纲，跳过
      mk(2, "第三章 迷雾", "短"), // 过短，跳过
      mk(3, "第四章 暗涌", "阿芸在潮痕崖边拾得一枚龙鳞，预示着风暴将至，三人连夜撤离。"),
    ];
    const out = buildTimelineDigest(chapters);
    expect(out).toContain("第1章 启航");
    expect(out).toContain("第4章 暗涌");
    expect(out).not.toContain("第2章 潮痕"); // 空章纲章节块未出现（注意：第4章正文提及「潮痕崖边」属正常）
    expect(out).not.toContain("第3章 迷雾"); // 过短章节块未出现
    // 章间空一行：存在连续两个换行
    expect(out).toContain("\n\n");
  });

  it("2~11 字脏片段（生成失败 / 占位 / 过渡废话）不进大纲，与 isGarbageSummary 阈值一致", () => {
    const chapters: RawChapterOutline[] = [
      mk(0, "第一章 启航", "林夜在龙骨滩苏醒，发现整座新城建立在巨龙骸骨之上。"),
      mk(1, "第二章 迷雾", "过渡章节"), // 4 字占位，应过滤
      mk(2, "第三章 暗涌", "本章待补充"), // 5 字占位，应过滤
      mk(3, "第四章 潮痕", "略"), // 单字占位，应过滤
    ];
    const out = buildTimelineDigest(chapters);
    expect(out).toContain("第1章 启航"); // 真实长章纲保留
    expect(out).not.toContain("第2章 迷雾"); // 4 字片段未出现
    expect(out).not.toContain("第3章 暗涌"); // 5 字片段未出现
    expect(out).not.toContain("第4章 潮痕"); // 单字片段未出现
  });

  it("恰好 12 字的有效章纲被保留（与 isGarbageSummary 的 12 字边界一致）", () => {
    const outline = "林夜决定潜入龙庭总部调查"; // 恰好 12 字
    const chapters = [mk(0, "第一章 启航", outline)];
    const out = buildTimelineDigest(chapters);
    expect(out).toContain("第1章 启航");
    expect(out).toContain(outline); // 12 字边界保留
  });

  it("章纲文本自身以『第N章』开头时不叠加前缀", () => {
    const chapters = [mk(0, "第一章 启航", "第1章：林夜在龙骨滩苏醒，发现新城建立在巨龙骸骨之上。")];
    const out = buildTimelineDigest(chapters);
    expect(out).toContain("第1章 启航");
    expect(out).toContain("林夜在龙骨滩苏醒");
    expect(out).not.toContain("第1章 第1章");
  });

  it("畸形标题『第三章：第3章』循环剥离，不出现三重前缀", () => {
    const chapters = [mk(2, "第三章：第3章", "叶凌云以茶探访龙渊，察觉其有暗器旧伤。")];
    const out = buildTimelineDigest(chapters);
    expect(out).toContain("第3章");
    expect(out).toContain("叶凌云以茶探访龙渊");
    expect(out).not.toContain("第三章");
    expect(out).not.toContain("第3章 第3章");
  });

  it("垃圾模板章纲被过滤（保留章需 ≥12 字，与 isGarbageSummary 阈值一致）", () => {
    const chapters = [
      mk(0, "第一章", "林夜在龙骨滩苏醒，发现整座新城建在巨龙骸骨之上。"),
      mk(1, "第二章", "您提供的章节内容似乎为空——没有实际正文，请粘贴进来。"),
    ];
    const out = buildTimelineDigest(chapters);
    expect(out).toContain("第1章");
    expect(out).not.toContain("您提供的章节内容似乎为空");
  });

  it("超过 MAX_TIMELINE_CHAPTERS 章时只保留最近 N 章", () => {
    const chapters: RawChapterOutline[] = [];
    for (let i = 0; i < 25; i++) {
      chapters.push(mk(i, `第${i + 1}章`, `第${i + 1}章的真实章纲内容，足够长不会被判为垃圾行，用于测试截断。`));
    }
    const out = buildTimelineDigest(chapters);
    const blocks = out.split("\n\n").filter((b) => b.trim().length > 0);
    expect(blocks.length).toBe(MAX_TIMELINE_CHAPTERS);
    expect(out).not.toContain("第1章"); // 最旧被淘汰
    expect(out).toContain("第25章");
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
