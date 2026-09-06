/**
 * Codex 活注入引擎单测（M1）
 *
 * 重点锁死四条铁律：
 *   1. 小项目零行为变化（候选 ≤ 名额时全保留，绝不误伤）
 *   2. 长篇无关角色被裁（这是 M1 要解决的真问题）
 *   3. 用户勾选的角色永不裁剪（人机关系里人说了算）
 *   4. 已完结伏笔直接排除、临近回收的优先
 */
import { describe, it, expect } from "vitest";
import {
  selectCodex,
  formatCodexAttentionBlock,
  type CharacterLike,
  type CommitmentLike,
  type LoreLike,
} from "./codex-selector";

function char(id: string, name: string, extra: Partial<CharacterLike> = {}): CharacterLike {
  return { id, name, ...extra };
}

describe("selectCodex —— 角色筛选", () => {
  it("小项目（候选 ≤ 名额）全保留，零行为变化", () => {
    const chars = [char("c1", "苏苏"), char("c2", "青砚"), char("c3", "林动")];
    const sel = selectCodex("苏苏走进青砚镇", { characters: chars });
    expect(sel.characters).toHaveLength(3);
    expect(sel.stats.dropped).toBe(0);
  });

  it("长篇场景：本章提到的角色高分保留，无关角色被裁到名额内", () => {
    // 12 个角色，只有 2 个被本章大纲提到
    const chars: CharacterLike[] = [
      char("c1", "苏苏"),
      char("c2", "青砚"),
      ...Array.from({ length: 10 }, (_, i) => char(`x${i}`, `路人${i}`)),
    ];
    const sel = selectCodex("苏苏在青砚镇发现了玉佩", { characters: chars });
    // 名额默认 8
    expect(sel.characters.length).toBeLessThanOrEqual(8);
    expect(sel.stats.dropped).toBeGreaterThan(0);

    const names = sel.items.filter((i) => i.kind === "character").map((i) => i.title);
    expect(names).toContain("苏苏");
    expect(names).toContain("青砚");

    // 被提到的角色理由明确写了「本章提到了」
    const susu = sel.items.find((i) => i.title === "苏苏");
    expect(susu?.reason).toContain("本章提到了");
    expect(susu?.score).toBeGreaterThan(50);
  });

  it("用户勾选的角色即使本章完全没提到也强制保留", () => {
    const chars: CharacterLike[] = [
      char("c1", "苏苏"),
      char("f1", "被勾选的路人"),
      ...Array.from({ length: 10 }, (_, i) => char(`x${i}`, `路人${i}`)),
    ];
    const sel = selectCodex("苏苏独自赶路", {
      characters: chars,
    }, { forcedCharacterIds: ["f1"] });

    const names = sel.characters.map((c: any) => c.name);
    expect(names).toContain("被勾选的路人");
    const forced = sel.items.find((i) => i.title === "被勾选的路人");
    expect(forced?.forced).toBe(true);
    expect(forced?.reason).toBe("你勾选的出场角色");
  });

  it("别名命中也算相关", () => {
    const chars = [char("c1", "苏苏", { aliases: JSON.stringify(["阿苏", "小苏"]) })];
    const sel = selectCodex("阿苏提着灯笼走在前面", { characters: chars });
    const item = sel.items.find((i) => i.id === "c1");
    expect(item?.reason).toContain("别名");
    expect(item?.score).toBeGreaterThan(40);
  });

  it("excludedIds 能让用户手动排除条目", () => {
    const chars = [char("c1", "苏苏"), char("c2", "青砚")];
    const sel = selectCodex("苏苏和青砚同行", { characters: chars }, { excludedIds: ["c2"] });
    expect(sel.characters.map((c: any) => c.id)).toEqual(["c1"]);
  });
});

describe("selectCodex —— 伏笔筛选", () => {
  const commits: CommitmentLike[] = [
    { id: "p1", description: "苏苏的玉佩来历需要交代", status: "pending", closureConditions: "第5章前回收" },
    { id: "p2", description: "青砚的师门秘密", status: "pending" },
    { id: "p3", description: "早就解决掉的旧事", status: "fulfilled" },
  ];

  it("已完结的伏笔直接排除", () => {
    const sel = selectCodex("苏苏和青砚", { commitments: commits });
    const ids = sel.commitments.map((c: any) => c.id);
    expect(ids).not.toContain("p3");
    expect(ids).toContain("p1");
  });

  it("临近回收章节的伏笔排在前面", () => {
    const sel = selectCodex("苏苏和青砚", { commitments: commits }, { currentOrder: 4 });
    const ids = sel.commitments.map((c: any) => c.id);
    // p1 回收章节第5章，距当前第4章仅 1 章 → 优先于无章节提示的 p2
    expect(ids.indexOf("p1")).toBeLessThan(ids.indexOf("p2"));
    const p1 = sel.items.find((i) => i.id === "p1");
    expect(p1?.reason).toContain("临近回收");
  });

  it("无描述的空伏笔被淘汰", () => {
    const sel = selectCodex("随便写点什么", {
      commitments: [{ id: "empty", description: "   ", status: "pending" }],
    });
    expect(sel.commitments).toHaveLength(0);
  });
});

describe("selectCodex —— 世界观与内容截断", () => {
  it("常驻设定（depth ≤ 2）永不裁剪", () => {
    const lore: LoreLike[] = [
      { id: "l1", title: "青龙镇", content: "镇上有口古井", depth: 1, keys: JSON.stringify(["青龙镇"]) },
      { id: "l2", title: "无关设定", content: "八竿子打不着", depth: 3, keys: JSON.stringify(["天山"]) },
    ];
    const sel = selectCodex("完全不相干的正文", { lore });
    const titles = sel.items.filter((i) => i.kind === "lore").map((i) => i.title);
    expect(titles).toContain("青龙镇");
    const resident = sel.items.find((i) => i.id === "l1");
    expect(resident?.forced).toBe(true);
    expect(resident?.reason).toBe("常驻设定");
  });

  it("超长内容按 contentLimit 截断，防爆上下文", () => {
    const long = "很".repeat(900);
    const chars = [char("c1", "苏苏", { currentStatus: long })];
    const sel = selectCodex("苏苏", { characters: chars }, { contentLimit: 100 });
    const item = sel.items.find((i) => i.id === "c1");
    expect(item!.content.length).toBeLessThanOrEqual(101); // 100 + 省略号
    expect(item!.content.endsWith("…")).toBe(true);
  });
});

describe("formatCodexAttentionBlock —— 注意力引导块", () => {
  it("空选择返回空串", () => {
    const sel = selectCodex("", {});
    expect(formatCodexAttentionBlock(sel)).toBe("");
  });

  it("列出重点设定，并在有略过时透明告知数量", () => {
    const chars: CharacterLike[] = [
      char("c1", "苏苏"),
      ...Array.from({ length: 10 }, (_, i) => char(`x${i}`, `路人${i}`)),
    ];
    const sel = selectCodex("苏苏独自赶路", { characters: chars });
    const block = formatCodexAttentionBlock(sel);

    expect(block).toContain("本次重点设定");
    expect(block).toContain("苏苏");
    expect(block).toContain("已自动略过");
    // 有略过时才出现「另有 N 项」
    const m = block.match(/另有 (\d+) 项设定/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
  });

  it("无略过时不显示略过提示", () => {
    const sel = selectCodex("苏苏", { characters: [char("c1", "苏苏")] });
    const block = formatCodexAttentionBlock(sel);
    expect(block).toContain("本次重点设定");
    expect(block).not.toContain("已自动略过");
  });
});
