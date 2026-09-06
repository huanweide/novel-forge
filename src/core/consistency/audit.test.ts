/**
 * 长篇一致性巡检单测（M3 · 防崩坏雷达）
 *
 * 重点锁死：
 *   1. 真能抓到四类穿帮（性别代词 / 外貌 / 已故仍活动 / 伏笔拖延）
 *   2. 回忆闪回、他人转述不误伤——正常写法不能当 bug 报
 *   3. 空输入不炸、单章短篇不刷屏
 */
import { describe, it, expect } from "vitest";
import { auditConsistency, type AuditNode } from "./audit";

function node(order: number, content: string, title?: string): AuditNode {
  return { id: `n${order}`, order, content, title: title ?? `第${order + 1}章` };
}

describe("auditConsistency —— 基础行为", () => {
  it("空输入不炸，返回空清单", () => {
    const r = auditConsistency({});
    expect(r.issues).toEqual([]);
    expect(r.stats.chapters).toBe(0);
  });

  it("正常一致的稿件不报错（不制造噪音）", () => {
    const r = auditConsistency({
      nodes: [
        node(0, "苏苏拿起剑，他走向门口。"),
        node(1, "苏苏转过身，他笑了笑，黑发在风中飘动。"),
      ],
      characters: [{ id: "c1", name: "苏苏", currentStatus: "在世" }],
    });
    const kinds = r.issues.map((i) => i.kind);
    expect(kinds).not.toContain("pronoun");
    expect(kinds).not.toContain("appearance");
    expect(kinds).not.toContain("dead-active");
  });

  it("统计信息如实反映扫描规模", () => {
    const r = auditConsistency({
      nodes: [node(0, "第一章的内容。"), node(1, "第二章的内容。")],
      characters: [{ id: "c1", name: "苏苏" }],
    });
    expect(r.stats.chapters).toBe(2);
    expect(r.stats.characters).toBe(1);
    expect(r.stats.chars).toBeGreaterThan(0);
  });
});

describe("auditConsistency —— 性别代词冲突", () => {
  it("同一角色前章用「他」、后章用「她」，抓到并给证据", () => {
    const r = auditConsistency({
      nodes: [node(0, "苏苏拿起剑，他走向门口。"), node(1, "苏苏转过身，她笑了笑。")],
      characters: [{ id: "c1", name: "苏苏" }],
    });
    const issue = r.issues.find((i) => i.kind === "pronoun");
    expect(issue).toBeDefined();
    expect(issue!.title).toContain("苏苏");
    expect(issue!.severity).toBe("high");
    // 证据里两种指代都要能看到
    expect(issue!.excerpt).toContain("他");
    expect(issue!.excerpt).toContain("她");
  });

  it("只有一侧指代时不报（不构成冲突）", () => {
    const r = auditConsistency({
      nodes: [node(0, "苏苏拿起剑，他走向门口。"), node(1, "苏苏转过身，他笑了笑。")],
      characters: [{ id: "c1", name: "苏苏" }],
    });
    expect(r.issues.filter((i) => i.kind === "pronoun")).toHaveLength(0);
  });

  it("偶发单侧笔误（占比极低）只给低优先级提示", () => {
    const nodes = [node(0, "苏苏拿起剑，她走向门口。")];
    // 补 12 句用「他」的正常叙述，让「她」成为极少数
    for (let i = 1; i <= 12; i++) {
      nodes.push(node(i, `苏苏继续赶路，他看了看前方。`));
    }
    const r = auditConsistency({ nodes, characters: [{ id: "c1", name: "苏苏" }] });
    const issue = r.issues.find((i) => i.kind === "pronoun");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("low");
  });
});

describe("auditConsistency —— 外貌冲突", () => {
  it("同一角色出现两种发色，抓到", () => {
    const r = auditConsistency({
      nodes: [node(0, "苏苏的黑发在风中飘动。"), node(1, "苏苏的银发闪着冷光。")],
      characters: [{ id: "c1", name: "苏苏" }],
    });
    const issue = r.issues.find((i) => i.kind === "appearance");
    expect(issue).toBeDefined();
    expect(issue!.title).toContain("发色");
  });

  it("同一角色出现两种眸色，抓到", () => {
    const r = auditConsistency({
      nodes: [node(0, "苏苏的黑眸盯着他。"), node(1, "苏苏抬起蓝眸看向远方。")],
      characters: [{ id: "c1", name: "苏苏" }],
    });
    const issue = r.issues.find((i) => i.kind === "appearance");
    expect(issue).toBeDefined();
    expect(issue!.title).toContain("眸色");
  });

  it("发色前后一致不报", () => {
    const r = auditConsistency({
      nodes: [node(0, "苏苏的黑发飘动。"), node(1, "苏苏的黑发垂在肩上。")],
      characters: [{ id: "c1", name: "苏苏" }],
    });
    expect(r.issues.filter((i) => i.kind === "appearance")).toHaveLength(0);
  });
});

describe("auditConsistency —— 已故角色仍活动", () => {
  const deadChar = [{ id: "c1", name: "老王", currentStatus: "第 5 章已牺牲" }];

  it("角色卡标记死亡、正文里仍在活动，抓到（高优先级）", () => {
    const r = auditConsistency({
      nodes: [node(6, "老王站起身，说道：别怕，我还在。")],
      characters: deadChar,
    });
    const issue = r.issues.find((i) => i.kind === "dead-active");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("high");
    expect(issue!.chapterOrder).toBe(6);
  });

  it("回忆 / 闪回语境不误伤（这是正常写法，不是 bug）", () => {
    const r = auditConsistency({
      nodes: [node(6, "他想起老王当年站起身说话的样子，心里一阵酸楚。")],
      characters: deadChar,
    });
    expect(r.issues.filter((i) => i.kind === "dead-active")).toHaveLength(0);
  });

  it("扫墓 / 遗物语境不误伤", () => {
    const r = auditConsistency({
      nodes: [node(7, "他站在老王的墓前，久久没有说话。")],
      characters: deadChar,
    });
    expect(r.issues.filter((i) => i.kind === "dead-active")).toHaveLength(0);
  });

  it("在世角色正常活动不报", () => {
    const r = auditConsistency({
      nodes: [node(6, "老王站起身，说道：别怕。")],
      characters: [{ id: "c1", name: "老王", currentStatus: "在世" }],
    });
    expect(r.issues.filter((i) => i.kind === "dead-active")).toHaveLength(0);
  });

  it("每个角色每章最多报一次，避免刷屏", () => {
    const r = auditConsistency({
      nodes: [node(6, "老王站起身说道别怕。老王又笑了笑，转身走开。")],
      characters: deadChar,
    });
    expect(r.issues.filter((i) => i.kind === "dead-active")).toHaveLength(1);
  });
});

describe("auditConsistency —— 伏笔久未回收", () => {
  const nodes = Array.from({ length: 15 }, (_, i) => node(i, `第${i + 1}章正文。`));

  it("埋了十几章没回收的伏笔，抓到", () => {
    const r = auditConsistency({
      nodes,
      commitments: [
        { id: "p1", description: "玉佩的真实来历", status: "pending", createdChapterId: "n0" },
      ],
    });
    const issue = r.issues.find((i) => i.kind === "stale-foreshadow");
    expect(issue).toBeDefined();
    expect(issue!.title).toContain("14 章"); // latestOrder(14) - buriedOrder(0)
    expect(issue!.chapterOrder).toBe(0);
  });

  it("刚埋不久的不打扰", () => {
    const r = auditConsistency({
      nodes,
      commitments: [
        { id: "p2", description: "刚埋的线索", status: "pending", createdChapterId: "n13" },
      ],
    });
    expect(r.issues.filter((i) => i.kind === "stale-foreshadow")).toHaveLength(0);
  });

  it("已回收的不报", () => {
    const r = auditConsistency({
      nodes,
      commitments: [
        { id: "p3", description: "已交代的线索", status: "fulfilled", createdChapterId: "n0" },
      ],
    });
    expect(r.issues.filter((i) => i.kind === "stale-foreshadow")).toHaveLength(0);
  });

  it("阈值可调", () => {
    const r = auditConsistency(
      {
        nodes,
        commitments: [
          { id: "p4", description: "埋了 5 章", status: "pending", createdChapterId: "n9" },
        ],
      },
      { staleChapterThreshold: 3 },
    );
    expect(r.issues.filter((i) => i.kind === "stale-foreshadow")).toHaveLength(1);
  });
});

describe("auditConsistency —— 排序与统计", () => {
  it("高优先级问题排在前面", () => {
    const nodes = Array.from({ length: 15 }, (_, i) => node(i, `第${i + 1}章正文。`));
    nodes[8] = node(8, "老王站起身，说道：我在。");
    const r = auditConsistency({
      nodes,
      characters: [{ id: "c1", name: "老王", currentStatus: "已牺牲" }],
      commitments: [{ id: "p1", description: "老线索", status: "pending", createdChapterId: "n0" }],
    });
    expect(r.issues.length).toBeGreaterThan(1);
    expect(r.issues[0].severity).toBe("high");
    expect(r.issues[0].kind).toBe("dead-active");
  });

  it("byKind 统计与实际清单一致", () => {
    const r = auditConsistency({
      nodes: [node(0, "苏苏的黑发飘动，他抬起头。"), node(1, "苏苏的银发闪动，她低下头。")],
      characters: [{ id: "c1", name: "苏苏" }],
    });
    const pronoun = r.issues.filter((i) => i.kind === "pronoun").length;
    const appearance = r.issues.filter((i) => i.kind === "appearance").length;
    expect(r.stats.byKind.pronoun).toBe(pronoun);
    expect(r.stats.byKind.appearance).toBe(appearance);
  });
});
