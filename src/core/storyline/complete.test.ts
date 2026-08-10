import { describe, it, expect } from "vitest";
import {
  deriveSevenElements,
  completeStorylineElements,
  deriveMainElements,
  type EventLike,
} from "./complete";

const ev = (
  position: number,
  content: string,
  kind: string = "EVENT",
): EventLike => ({ position, content, kind });

describe("deriveSevenElements - 主线三要素", () => {
  it("无事件时给出可手动补充的占位（不编造噪声）", () => {
    const r = deriveSevenElements("main", []);
    expect(r).toEqual({
      origin: "（暂无事件，可手动补充起因）",
      process: "（暂无事件，可手动补充起因）",
      result: "（暂无事件，可手动补充结果）",
    });
  });

  it("首尾事件作为起因/结果，中间串联为经过", () => {
    const events = [
      ev(1, "龙陨之地的封印第一次松动"),
      ev(2, "守墓人潜入禁地寻找龙元"),
      ev(3, "七族联盟在裂隙前对峙"),
      ev(4, "封印彻底崩解，龙元现世"),
    ];
    const r = deriveSevenElements("main", events);
    expect(r.origin).toBe("龙陨之地的封印第一次松动");
    expect(r.result).toBe("封印彻底崩解，龙元现世");
    expect(r.process).toContain("守墓人潜入禁地寻找龙元");
    expect(r.process).toContain("七族联盟在裂隙前对峙");
  });

  it("仅一个事件时经过复用起因", () => {
    const r = deriveSevenElements("main", [ev(1, "唯一事件")]);
    expect(r.origin).toBe("唯一事件");
    expect(r.process).toBe("唯一事件");
    expect(r.result).toBe("唯一事件");
  });

  it("CLUE 事件不参与提炼", () => {
    const events = [ev(1, "起因事件"), ev(2, "线索内容", "CLUE"), ev(3, "结果事件")];
    const r = deriveSevenElements("main", events);
    expect(r.origin).toBe("起因事件");
    expect(r.result).toBe("结果事件");
    expect(r.process).not.toContain("线索内容");
  });
});

describe("deriveSevenElements - 支线七要素", () => {
  it("默认七要素键齐全，结局永远留空", () => {
    const r = deriveSevenElements("side", [ev(1, "动机")]);
    expect(Object.keys(r).sort()).toEqual(
      ["action", "desire", "ending", "obstacle", "result", "turn", "twist"].sort(),
    );
    expect(r.ending).toBe("");
    expect(r.desire).toBe("动机");
  });

  it("素材充足时按剧情节点映射到七要素", () => {
    const events = [
      ev(1, "想要龙元"),
      ev(2, "禁地守卫阻路"),
      ev(3, "盗取钥匙"),
      ev(4, "守卫反杀"),
      ev(5, "同伙倒戈"),
      ev(6, "夺得龙元逃亡"),
    ];
    const r = deriveSevenElements("side", events);
    expect(r.desire).toBe("想要龙元");
    expect(r.obstacle).toBe("禁地守卫阻路");
    expect(r.action).toBe("盗取钥匙");
    expect(r.result).toBe("夺得龙元逃亡");
    expect(r.twist).toBe("守卫反杀");
    expect(r.turn).toBe("同伙倒戈");
    expect(r.ending).toBe("");
  });
});

describe("completeStorylineElements - 只补全空白、不覆盖已填", () => {
  const own = [ev(1, "起因"), ev(2, "中段"), ev(3, "结果")];

  it("作者已填的字段被保留", () => {
    const merged = completeStorylineElements("main", { origin: "作者写的起因" }, own, []);
    expect(merged.origin).toBe("作者写的起因");
    expect(merged.process).toBe("中段"); // 未填则补全
    expect(merged.result).toBe("结果");
  });

  it("主线聚合子支线事件参与提炼", () => {
    const child = [ev(1, "支线事件A"), ev(2, "支线事件B")];
    const merged = completeStorylineElements("main", {}, own, child);
    // 自身首尾优先，子线事件进入「经过」串联
    expect(merged.origin).toBe("起因");
    expect(merged.result).toBe("结果");
    expect(merged.process).toContain("支线事件A");
    expect(merged.process).toContain("支线事件B");
  });

  it("返回结果只含当前类型允许的键（清理残留）", () => {
    // 主线不应携带七要素字段，支线不应携带三要素字段
    const mainMerged = completeStorylineElements("main", { desire: "x" }, own, []);
    expect(mainMerged).not.toHaveProperty("desire");
    expect(Object.keys(mainMerged).sort()).toEqual(["origin", "process", "result"]);

    const sideMerged = completeStorylineElements("side", { origin: "y" }, [ev(1, "动")], []);
    expect(sideMerged).not.toHaveProperty("origin");
    expect(sideMerged).toHaveProperty("desire");
  });
});

describe("deriveMainElements（#201 简约/平常模式预填主线三要素）", () => {
  it("有概述时经过/起因用概述，结果留推进中占位", () => {
    const r = deriveMainElements({ title: "龙陨", description: "封印松动，七族对峙" });
    expect(r.origin).toBe("封印松动，七族对峙");
    expect(r.process).toBe("封印松动，七族对峙");
    expect(r.result).toBe("（主线推进中，结果待揭晓）");
  });

  it("无概述时用标题兜底，仍给出可读骨架", () => {
    const r = deriveMainElements({ title: "龙陨" });
    expect(r.origin).toContain("龙陨");
    expect(r.process).toContain("龙陨");
    expect(r.result).toBe("（主线推进中，结果待揭晓）");
  });

  it("完全无信息时三要素仍可落库（不抛错、非空字符串）", () => {
    const r = deriveMainElements({});
    expect(typeof r.origin).toBe("string");
    expect(typeof r.process).toBe("string");
    expect(typeof r.result).toBe("string");
  });
});
