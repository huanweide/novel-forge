import { describe, it, expect } from "vitest";
import {
  chapterNodesOf,
  allConfirmedOf,
  narrativeStageOf,
} from "./workspace-derive";
import { computeNarrativeStage } from "./pipeline/narrative-stage";
import type { ProjectData, StoryNodeData } from "@/components/workspace/types";

/** 构造最小 StoryNodeData 测试夹具（仅填外提逻辑用到的字段）。 */
const makeNode = (
  id: string,
  type: string,
  status = "draft",
): StoryNodeData => ({ id, type, status } as unknown as StoryNodeData);

describe("chapterNodesOf", () => {
  it("null / undefined project → 空数组", () => {
    expect(chapterNodesOf(null)).toEqual([]);
    expect(chapterNodesOf(undefined)).toEqual([]);
  });

  it("无 storyNodes 字段 → 空数组", () => {
    expect(chapterNodesOf({} as ProjectData)).toEqual([]);
  });

  it("过滤掉卷，仅保留 章/节/幕", () => {
    const project = {
      storyNodes: [
        makeNode("v1", "volume"),
        makeNode("c1", "chapter"),
        makeNode("s1", "section"),
        makeNode("sc1", "scene"),
      ],
    } as unknown as ProjectData;
    const res = chapterNodesOf(project);
    expect(res.map((n) => n.id)).toEqual(["c1", "s1", "sc1"]);
  });
});

describe("allConfirmedOf", () => {
  it("空列表 → false", () => {
    expect(allConfirmedOf([])).toBe(false);
  });

  it("全部 confirmed → true", () => {
    expect(
      allConfirmedOf([
        makeNode("a", "section", "confirmed"),
        makeNode("b", "chapter", "confirmed"),
      ]),
    ).toBe(true);
  });

  it("存在一个未确认 → false", () => {
    expect(
      allConfirmedOf([
        makeNode("a", "section", "confirmed"),
        makeNode("b", "chapter", "draft"),
      ]),
    ).toBe(false);
  });
});

describe("narrativeStageOf", () => {
  const nodes = [
    makeNode("n1", "section"),
    makeNode("n2", "section"),
    makeNode("n3", "section"),
  ];

  it("未选中 → null", () => {
    expect(narrativeStageOf(null, nodes, [])).toBeNull();
    expect(narrativeStageOf(undefined, nodes, [])).toBeNull();
  });

  it("选中节点不在列表 → null", () => {
    expect(narrativeStageOf("nope", nodes, [])).toBeNull();
  });

  it("章节列表为空 → null", () => {
    expect(narrativeStageOf("n1", [], [])).toBeNull();
  });

  it("推导结果与 computeNarrativeStage 一致", () => {
    expect(narrativeStageOf("n2", nodes, [])).toEqual(
      computeNarrativeStage(1, 3, { mainQuestComplete: false }),
    );
  });

  it("主线 Storyline 标记 completed → 直接收尾阶段", () => {
    const storylines = [{ type: "main", status: "completed" }];
    const stage = narrativeStageOf("n1", nodes, storylines as any);
    expect(stage?.key).toBe("ending");
    expect(stage?.percent).toBe(100);
  });
});
