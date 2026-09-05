import { describe, it, expect } from "vitest";
import { computeApplyPlan, summarizePlan } from "./plan";
import { validatePresetContent } from "./validate";
import { createMemoryDb } from "./__fixtures__/memory-db";

const PID = "p1";

describe("computeApplyPlan —— 表格模板", () => {
  it("已存在同 key 表 → skip；新表 → create", async () => {
    const { db } = createMemoryDb({
      projectId: PID,
      loreTables: [{ id: "lt_exist", projectId: PID, key: "woman_live", name: "妃嫔居住表" }],
    });
    const plan = await computeApplyPlan(db as any, PID, {
      type: "table_template",
      content: {
        tables: [
          { key: "woman_live", name: "妃嫔居住表", columns: [{ key: "n", label: "名", type: "text" }], rows: [] },
          { key: "new_table", name: "新表", columns: [], rows: [] },
        ],
      },
    });
    expect(plan).toHaveLength(2);
    expect(plan[0].action).toBe("skip");
    expect(plan[0].id).toBe("lt_exist");
    expect(plan[1].action).toBe("create");
    const s = summarizePlan(plan);
    expect(s.created).toBe(1);
    expect(s.skipped).toBe(1);
    expect(s.total).toBe(2);
  });
});

describe("computeApplyPlan —— 文风卡", () => {
  const content = { styleDescription: "冷峻克制", povType: "third_person_limited", dialogueRatio: 0.4 };

  it("项目无文风卡 → create（不带旧值快照）", async () => {
    const { db } = createMemoryDb({ projectId: PID });
    const plan = await computeApplyPlan(db as any, PID, { type: "style", content });
    expect(plan[0].action).toBe("create");
    expect(plan[0].before).toBeUndefined();
  });

  it("已有文风卡 → update 且保存旧值快照供撤销还原", async () => {
    const { db } = createMemoryDb({
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
    const plan = await computeApplyPlan(db as any, PID, { type: "style", content });
    expect(plan[0].action).toBe("update");
    expect(plan[0].id).toBe("sc_1");
    const before = plan[0].before as Record<string, unknown>;
    expect(before.styleDescription).toBe("原文风");
    expect(before.dialogueRatio).toBe(0.2);
  });
});

describe("computeApplyPlan —— 词条类", () => {
  it("已存在同名词条 → update（带旧内容快照）；不存在 → create", async () => {
    const { db } = createMemoryDb({
      projectId: PID,
      lorebookEntries: [
        { id: "le_1", projectId: PID, category: "worldview", title: "修炼体系", content: "旧内容", keys: ["修为"], depth: 3, enabled: true },
      ],
    });
    const plan = await computeApplyPlan(db as any, PID, {
      type: "worldview",
      content: {
        entries: [
          { title: "修炼体系", content: "新内容", keys: ["境界"] },
          { title: "货币体系", content: "灵石", keys: [] },
        ],
      },
    });
    expect(plan[0].action).toBe("update");
    expect((plan[0].before as Record<string, unknown>).content).toBe("旧内容");
    expect(plan[1].action).toBe("create");
  });

  it("lorebook 类型走 category=lorebook，与 worldview 互不干扰", async () => {
    const { db } = createMemoryDb({
      projectId: PID,
      lorebookEntries: [
        { id: "le_1", projectId: PID, category: "lorebook", title: "同名", content: "世界书版", keys: [], depth: 3, enabled: true },
      ],
    });
    const plan = await computeApplyPlan(db as any, PID, {
      type: "lorebook",
      content: { entries: [{ title: "同名", content: "新", keys: [] }] },
    });
    expect(plan[0].action).toBe("update");
    expect(plan[0].id).toBe("le_1");
  });
});

describe("computeApplyPlan —— 角色卡", () => {
  it("同名角色 → skip（保护既有设定，不覆盖）；不同名 → create", async () => {
    const { db } = createMemoryDb({
      projectId: PID,
      characters: [{ id: "cc_1", projectId: PID, name: "林霜" }],
    });
    const same = await computeApplyPlan(db as any, PID, {
      type: "character",
      content: { name: "林霜", role: "protagonist", background: "覆盖测试" },
    });
    expect(same[0].action).toBe("skip");
    expect(same[0].id).toBe("cc_1");

    const diff = await computeApplyPlan(db as any, PID, {
      type: "character",
      content: { name: "沈砚" },
    });
    expect(diff[0].action).toBe("create");
  });
});

describe("computeApplyPlan —— regex", () => {
  it("同名规则 → update（存旧规则）；新规则 → create", async () => {
    const { db } = createMemoryDb({
      projectId: PID,
      project: {
        id: PID, name: "t", appliedPresets: [],
        postProcessingRules: [{ name: "删思维链", pattern: "<think>x</think>", flags: "g", replace: "" }],
        llmConfig: {},
      },
    });
    const plan = await computeApplyPlan(db as any, PID, {
      type: "regex",
      content: {
        rules: [
          { name: "删思维链", pattern: "<think>y</think>", flags: "g", replace: "" },
          { name: "新规则", pattern: "foo", flags: "g", replace: "bar" },
        ],
      },
    });
    expect(plan[0].action).toBe("update");
    expect((plan[0].before as Record<string, unknown>).name).toBe("删思维链");
    expect(plan[1].action).toBe("create");
  });

  it("危险正则（嵌套量词灾难性回溯）抛 422，不产出计划", async () => {
    const { db } = createMemoryDb({ projectId: PID });
    await expect(
      computeApplyPlan(db as any, PID, {
        type: "regex",
        content: { rules: [{ name: "炸弹", pattern: "(a+)+$", flags: "g", replace: "" }] },
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe("computeApplyPlan —— api_config", () => {
  it("只合并白名单键，并记录旧值与新增键供撤销", async () => {
    const { db } = createMemoryDb({
      projectId: PID,
      project: {
        id: PID, name: "t", appliedPresets: [], postProcessingRules: [],
        llmConfig: { temperature: 0.7, model: "old-model" },
      },
    });
    const plan = await computeApplyPlan(db as any, PID, {
      type: "api_config",
      content: { temperature: 0.9, maxTokens: 4096, evilKey: "x" },
    });
    expect(plan[0].action).toBe("update");
    const payload = plan[0].payload as Record<string, unknown>;
    expect(payload.temperature).toBe(0.9);
    expect(payload.maxTokens).toBe(4096);
    expect(payload.evilKey).toBeUndefined(); // 非白名单键被丢弃，防污染
    const before = plan[0].before as { values: Record<string, unknown>; addedKeys: string[] };
    expect(before.values.temperature).toBe(0.7);
    expect(before.addedKeys).toContain("maxTokens");
  });
});

describe("computeApplyPlan —— 未知类型", () => {
  it("抛 400，杜绝静默 no-op", async () => {
    const { db } = createMemoryDb({ projectId: PID });
    await expect(
      computeApplyPlan(db as any, PID, { type: "unknown_type", content: {} }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("validatePresetContent —— 自配置结构把关", () => {
  it("表格模板缺 key → 报错", () => {
    const r = validatePresetContent("table_template", { tables: [{ name: "表" }] });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("key");
  });

  it("表格模板空 rows → 通过但给警告", () => {
    const r = validatePresetContent("table_template", {
      tables: [{ key: "k", name: "表", columns: [], rows: [] }],
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toContain("暂无数据行");
  });

  it("角色预设缺 name → 报错", () => {
    expect(validatePresetContent("character", { role: "protagonist" }).ok).toBe(false);
  });

  it("词条 entries 非数组 → 报错", () => {
    expect(validatePresetContent("lorebook", { entries: "x" }).ok).toBe(false);
  });

  it("depth 越界 → 报错", () => {
    const r = validatePresetContent("lorebook", { entries: [{ title: "A", depth: 9 }] });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("depth");
  });

  it("API 配置全是非白名单键 → 报错；混有未知键 → 通过但警告", () => {
    expect(validatePresetContent("api_config", { evilKey: 1 }).ok).toBe(false);
    const mixed = validatePresetContent("api_config", { temperature: 0.8, evilKey: 1 });
    expect(mixed.ok).toBe(true);
    expect(mixed.warnings.join()).toContain("evilKey");
  });

  it("文风比例 >1 → 警告但不拦截", () => {
    const r = validatePresetContent("style", { styleDescription: "冷峻", dialogueRatio: 3 });
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toContain("dialogueRatio");
  });

  it("文风内容全空 → 报错", () => {
    expect(validatePresetContent("style", {}).ok).toBe(false);
  });

  it("合法表格模板 → 通过且无错误", () => {
    const r = validatePresetContent("table_template", {
      tables: [{ key: "k", name: "表名", columns: [{ key: "a", label: "A", type: "text" }], rows: [{ row_id: 1, a: "值" }] }],
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});
