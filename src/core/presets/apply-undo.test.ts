import { describe, it, expect } from "vitest";
import { computeApplyPlan } from "./plan";
import { executeApplyPlan } from "./apply";
import { executeUndo } from "./undo";
import { createMemoryDb } from "./__fixtures__/memory-db";

const PID = "p1";

/** 走完整链路：算计划 → 执行注入，返回计划与撤销凭证 */
async function applyPreset(db: any, preset: { id: string; type: string; title: string; content: unknown }) {
  const plan = await computeApplyPlan(db, PID, { type: preset.type, content: preset.content });
  const record = await executeApplyPlan(
    db,
    PID,
    { id: preset.id, type: preset.type, title: preset.title },
    plan,
  );
  return { plan, record };
}

describe("预设注入 → 撤销（六类实体可真撤销）", () => {
  it("表格模板：注入建表 → 撤销后表被真删（旧版只抹追踪记录、表残留）", async () => {
    const { db, state } = createMemoryDb({ projectId: PID });
    const { record } = await applyPreset(db, {
      id: "pr_table", type: "table_template", title: "妃嫔表",
      content: {
        tables: [
          { key: "woman_live", name: "妃嫔居住表", columns: [{ key: "name", label: "名称", type: "text" }], rows: [{ row_id: 1, name: "甄嬛" }] },
        ],
      },
    });
    expect(state.loreTables).toHaveLength(1);
    expect(record.created.some((c) => c.kind === "table")).toBe(true);

    const undo = await executeUndo(db, PID, record);
    expect(state.loreTables).toHaveLength(0);
    expect(undo.deleted.join()).toContain("table:");
  });

  it("文风卡（覆盖既有）：撤销后还原成原来的值", async () => {
    const { db, state } = createMemoryDb({
      projectId: PID,
      styleCards: [
        {
          id: "sc_1", projectId: PID, styleDescription: "原文风", povType: "first_person",
          dialogueRatio: 0.2, avgSentenceLength: 20, shortSentenceRatio: 0.3,
          longSentenceRatio: 0.1, descriptionRatio: 0.2, actionRatio: 0.2,
          innerThoughtRatio: 0.1, tonalMarkers: {}, lexicalFeatures: {}, sampleText: null,
        },
      ],
    });
    const { record } = await applyPreset(db, {
      id: "pr_style", type: "style", title: "冷峻文风",
      content: { styleDescription: "冷峻克制", povType: "third_person_limited", dialogueRatio: 0.5 },
    });
    expect(state.styleCards[0].styleDescription).toBe("冷峻克制");
    expect(state.styleCards[0].dialogueRatio).toBe(0.5);
    expect(record.updatedBefore).toHaveLength(1);

    await executeUndo(db, PID, record);
    expect(state.styleCards[0].styleDescription).toBe("原文风");
    expect(state.styleCards[0].dialogueRatio).toBe(0.2);
    expect(state.styleCards[0].povType).toBe("first_person");
  });

  it("文风卡（原本没有）：撤销后整卡删除", async () => {
    const { db, state } = createMemoryDb({ projectId: PID });
    const { record } = await applyPreset(db, {
      id: "pr_style", type: "style", title: "冷峻文风",
      content: { styleDescription: "冷峻", povType: "third_person_limited" },
    });
    expect(state.styleCards).toHaveLength(1);
    await executeUndo(db, PID, record);
    expect(state.styleCards).toHaveLength(0);
  });

  it("词条：新建的撤销后删除，被覆盖的撤销后还原旧内容", async () => {
    const { db, state } = createMemoryDb({
      projectId: PID,
      lorebookEntries: [
        { id: "le_1", projectId: PID, category: "worldview", title: "修炼体系", content: "旧内容", keys: ["修为"], depth: 3, enabled: true },
      ],
    });
    const { record } = await applyPreset(db, {
      id: "pr_wv", type: "worldview", title: "东方玄幻世界观",
      content: {
        entries: [
          { title: "修炼体系", content: "新内容", keys: ["境界"] },
          { title: "货币体系", content: "灵石", keys: [] },
        ],
      },
    });
    expect(state.lorebookEntries).toHaveLength(2);
    expect(state.lorebookEntries.find((e) => e.title === "修炼体系").content).toBe("新内容");

    await executeUndo(db, PID, record);
    expect(state.lorebookEntries.find((e) => e.title === "修炼体系").content).toBe("旧内容");
    expect(state.lorebookEntries.find((e) => e.title === "修炼体系").keys).toEqual(["修为"]);
    expect(state.lorebookEntries.find((e) => e.title === "货币体系")).toBeUndefined();
  });

  it("角色卡：注入新建 → 撤销后删除，且不动同名既有卡", async () => {
    const { db, state } = createMemoryDb({
      projectId: PID,
      characters: [{ id: "cc_1", projectId: PID, name: "林霜" }],
    });
    const { record } = await applyPreset(db, {
      id: "pr_ch", type: "character", title: "沈砚",
      content: { name: "沈砚", role: "supporting", background: "..." },
    });
    expect(state.characters).toHaveLength(2);
    await executeUndo(db, PID, record);
    expect(state.characters).toHaveLength(1);
    expect(state.characters[0].name).toBe("林霜");
  });

  it("角色卡同名：skip 不新建，撤销也不会误删既有卡", async () => {
    const { db, state } = createMemoryDb({
      projectId: PID,
      characters: [{ id: "cc_1", projectId: PID, name: "林霜" }],
    });
    const { record } = await applyPreset(db, {
      id: "pr_ch2", type: "character", title: "林霜",
      content: { name: "林霜", role: "protagonist" },
    });
    expect(state.characters).toHaveLength(1);
    expect(record.created).toHaveLength(0);
    await executeUndo(db, PID, record);
    expect(state.characters).toHaveLength(1);
    expect(state.characters[0].name).toBe("林霜");
  });

  it("regex：撤销删除新增规则，并还原被覆盖的旧规则", async () => {
    const { db, state } = createMemoryDb({
      projectId: PID,
      project: {
        id: PID, name: "t", appliedPresets: [],
        postProcessingRules: [{ name: "删思维链", pattern: "<think>x</think>", flags: "g", replace: "" }],
        llmConfig: {},
      },
    });
    const { record } = await applyPreset(db, {
      id: "pr_rx", type: "regex", title: "清理规则",
      content: {
        rules: [
          { name: "删思维链", pattern: "<think>y</think>", flags: "g", replace: "" },
          { name: "新规则", pattern: "foo", flags: "g", replace: "bar" },
        ],
      },
    });
    expect(state.project.postProcessingRules).toHaveLength(2);
    expect(state.project.postProcessingRules.find((r: any) => r.name === "删思维链").pattern).toBe("<think>y</think>");

    await executeUndo(db, PID, record);
    const rules = state.project.postProcessingRules;
    expect(rules.find((r: any) => r.name === "删思维链").pattern).toBe("<think>x</think>");
    expect(rules.find((r: any) => r.name === "新规则")).toBeUndefined();
  });

  it("api_config：撤销还原旧值并清掉新增键", async () => {
    const { db, state } = createMemoryDb({
      projectId: PID,
      project: {
        id: PID, name: "t", appliedPresets: [], postProcessingRules: [],
        llmConfig: { temperature: 0.7, model: "old" },
      },
    });
    const { record } = await applyPreset(db, {
      id: "pr_api", type: "api_config", title: "高温度",
      content: { temperature: 0.95, maxTokens: 4096 },
    });
    expect(state.project.llmConfig.temperature).toBe(0.95);
    expect(state.project.llmConfig.maxTokens).toBe(4096);
    expect(state.project.llmConfig.model).toBe("old");

    await executeUndo(db, PID, record);
    expect(state.project.llmConfig.temperature).toBe(0.7);
    expect(state.project.llmConfig.maxTokens).toBeUndefined();
    expect(state.project.llmConfig.model).toBe("old");
  });
});

describe("预览与执行一致性", () => {
  it("计划里的 create 条数 == 实际落库条数（预览说几条就注入几条）", async () => {
    const { db, state } = createMemoryDb({ projectId: PID });
    const preset = {
      id: "pr_mix", type: "lorebook", title: "词条集",
      content: { entries: [{ title: "A", content: "a" }, { title: "B", content: "b" }, { title: "C", content: "c" }] },
    };
    const plan = await computeApplyPlan(db, PID, { type: preset.type, content: preset.content });
    const createCount = plan.filter((p) => p.action === "create").length;
    expect(createCount).toBe(3);
    await executeApplyPlan(db as any, PID, preset, plan);
    expect(state.lorebookEntries).toHaveLength(createCount);
  });

  it("预览不产生任何副作用（纯只读）", async () => {
    const { db, state } = createMemoryDb({ projectId: PID });
    await computeApplyPlan(db as any, PID, {
      type: "character",
      content: { name: "只读测试" },
    });
    expect(state.characters).toHaveLength(0);
    expect(state.calls.created).toHaveLength(0);
  });
});

describe("撤销容错与兼容", () => {
  it("实体已被手动删除时撤销不崩，记进 skipped", async () => {
    const { db, state } = createMemoryDb({ projectId: PID });
    const { record } = await applyPreset(db, {
      id: "pr_t", type: "table_template", title: "表",
      content: { tables: [{ key: "k1", name: "表1", columns: [], rows: [] }] },
    });
    state.loreTables.length = 0; // 模拟用户手动删掉了
    const undo = await executeUndo(db, PID, record);
    expect(undo.skipped.join()).toContain("table");
  });

  it("兼容旧版凭证（只有 ruleNames / configKeys）", async () => {
    const { db, state } = createMemoryDb({
      projectId: PID,
      project: {
        id: PID, name: "t", appliedPresets: [],
        postProcessingRules: [{ name: "旧规则", pattern: "x", flags: "g", replace: "" }],
        llmConfig: { temperature: 0.5 },
      },
    });
    const undo = await executeUndo(db, PID, { ruleNames: ["旧规则"], configKeys: ["temperature"] });
    expect(state.project.postProcessingRules).toHaveLength(0);
    expect(state.project.llmConfig.temperature).toBeUndefined();
    expect(undo.deleted.length).toBeGreaterThan(0);
  });

  it("空凭证 → 返回空结果不报错", async () => {
    const { db } = createMemoryDb({ projectId: PID });
    const undo = await executeUndo(db, PID, null);
    expect(undo.deleted).toHaveLength(0);
    expect(undo.restored).toHaveLength(0);
  });
});
