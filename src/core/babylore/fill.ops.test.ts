import { describe, it, expect, vi, beforeEach } from "vitest";

// 单元自测：墨白 P0-3（空 ops / 全失效 → 不标已填、可重试）与 P1-1（update 未命中非身份列不静默建伪行）。
// 通过 mock prisma / llm / fetch，无需真实 LLM 与数据库即可驱动 babyloreFill 内部逻辑。

const updateCalls: any[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    loreTable: {
      findMany: vi.fn(async () => [makeTable()]),
      update: vi.fn(async (args: any) => {
        updateCalls.push(args);
        return { id: args.where.id, ...(args.data || {}) };
      }),
    },
    storyNode: {
      findMany: vi.fn(async () => [
        { id: "c1", order: 1, title: "第一章", content: CHAPTER },
        { id: "c2", order: 2, title: "第二章", content: "第二章 少年远行，踏入江湖。" },
      ]),
    },
  },
}));

vi.mock("@/lib/llm", () => ({
  getSettings: vi.fn(async () => ({ baseUrl: "https://api.deepseek.com/v1", apiKey: "k", model: "m" })),
  recordLlmCall: vi.fn(),
}));

vi.mock("@/core/llm/client", () => ({
  buildProjectOverrides: vi.fn(() => ({})),
}));

// mock 文件系统，隔离「已填标记」持久化（.runtime/babylore-filled.json），避免跨测试串味
vi.mock("fs", () => {
  const store: Record<string, string> = {};
  const mocked = {
    readFileSync: vi.fn((p: string) => {
      if (store[p] !== undefined) return store[p];
      throw new Error("ENOENT");
    }),
    writeFileSync: vi.fn((p: string, d: string) => {
      store[p] = d;
    }),
    mkdirSync: vi.fn(),
  };
  return { ...mocked, default: mocked };
});

import { prisma } from "@/lib/prisma";
import { babyloreFill, babyloreFillAll, markChapterFilled, inferEntityType, tableGroupOf } from "@/core/babylore/fill";

function makeTable() {
  return {
    id: "t1",
    key: "geo",
    name: "地点",
    note: "",
    category: "geo",
    columns: [
      { key: "name", label: "名称", type: "text" },
      { key: "related", label: "关联", type: "text" },
    ],
    rows: [{ row_id: 1, name: "青龙镇", related: "" }],
  };
}

function mockFetch(content: string) {
  (globalThis as any).fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  }));
}

const CHAPTER = "第一章 青龙镇外，少年踏入江湖。";

beforeEach(() => {
  updateCalls.length = 0;
});

describe("P0-3 空 ops 章节不标已填（applied=0 视为失败可重试）", () => {
  it("模型连续返回空 ops → babyloreFill 返回 ok:false 且 applied:0", async () => {
    mockFetch(JSON.stringify({ operations: [] }));
    const r = await babyloreFill("proj-x", CHAPTER);
    expect(r.ok).toBe(false);
    expect(r.applied).toBe(0);
    // 失败章必须带 error/warning 暴露，便于重试而非静默吞掉
    const exposed = (r.error || "") + (r.warnings || []).join("");
    expect(exposed).toMatch(/未落地任何事实|模型未返回任何有效操作/);
  });

  it("正常 insert ops → applied>0 且 ok:true（对照）", async () => {
    mockFetch(JSON.stringify({ operations: [{ table: "geo", op: "insert", values: { name: "新地点" } }] }));
    const r = await babyloreFill("proj-x", CHAPTER);
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(1);
    expect(updateCalls.length).toBe(1);
  });
});

describe("P1-1 update 未命中且非身份列 → 不静默建伪行", () => {
  it("按 related 列 update 未命中 → 跳过、applied:0、告警、零写库", async () => {
    mockFetch(
      JSON.stringify({
        operations: [{ table: "geo", op: "update", match: { col: "related", val: "不存在之物" }, values: { desc: "x" } }],
      }),
    );
    const r = await babyloreFill("proj-x", CHAPTER);
    expect(r.applied).toBe(0);
    expect(r.ok).toBe(false);
    // 身份列（name）未被污染，未插伪行 → 不应有写库动作
    expect(updateCalls.length).toBe(0);
    expect((r.warnings || []).join("")).toContain("非身份列");
  });

  it("按身份列 name update 未命中 → 仍可正常 upsert 建行", async () => {
    mockFetch(
      JSON.stringify({
        operations: [{ table: "geo", op: "update", match: { col: "name", val: "新角色" }, values: { related: "y" } }],
      }),
    );
    const r = await babyloreFill("proj-x", CHAPTER);
    expect(r.applied).toBe(1);
    expect(r.ok).toBe(true);
    expect(updateCalls.length).toBe(1);
    const written = updateCalls[0].data.rows as any[];
    expect(written.some((row: any) => row.name === "新角色")).toBe(true);
  });
});

// ─── P1-1 babyloreFillAll 不得恒返回 ok:true（静默假完成）───
// 验证汇总态真实反映各章 applied/ok：全章失败 → ok:false；部分失败 → ok:false；
// 全部已填跳过 → ok:true（正常无需重试）。
describe("P1-1 babyloreFillAll 汇总态真实反映成败", () => {
  it("全章填表失败（空 ops）→ 返回 ok:false、failed=章数、带 error（非静默假完成）", async () => {
    mockFetch(JSON.stringify({ operations: [] }));
    const r = await babyloreFillAll("proj-x");
    expect(r.ok).toBe(false);
    expect(r.applied).toBe(0);
    expect(r.processed).toBe(2);
    expect(r.failed).toBe(2);
    expect(r.error).toBeTruthy();
  });

  it("有章成功、有章失败 → 仍 ok:false 且暴露失败章数", async () => {
    let call = 0;
    (globalThis as any).fetch = vi.fn(async () => {
      call++;
      const content =
        call === 1
          ? JSON.stringify({ operations: [{ table: "geo", op: "insert", values: { name: "真地点" } }] })
          : JSON.stringify({ operations: [] });
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
      };
    });
    const r = await babyloreFillAll("proj-x");
    expect(r.failed).toBe(1);
    expect(r.applied).toBe(1);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("1/2");
  });

  it("全部章节已填并被跳过（正常干净态，无幽灵 id）→ 判 ok、不误标脏标记、不诱导重填（P1-② 修复）", async () => {
    mockFetch(JSON.stringify({ operations: [{ table: "geo", op: "insert", values: { name: "全填地点" } }] }));
    await babyloreFillAll("proj-cleanskip"); // 先填满，持久化已填标记
    const r = await babyloreFillAll("proj-cleanskip"); // 再跑，应全部跳过（干净态）
    expect(r.processed).toBe(0);
    expect(r.skipped).toBe(2);
    expect(r.applied).toBe(0);
    // P1-②：全部跳过节点均为真实已校验章节 → 判 ok，不误标脏标记、不诱导破坏性重填。
    expect(r.ok).toBe(true);
    expect(r.error).toBeFalsy();
    expect((r as any).fillErrorMeta?.kind).toBe("all_clean");
  });
});

// ─── P1-A / P1-D（墨白聚焦修复）───
// P1-A：全跳过 error 区分「真无脏数据」与「旧版误标脏标记」，并携带结构化元数据 + nodeIds。
// P1-D：每处理完一个 node 后清除脏标记（复用 markChapterFilled 路径），确保 clean 节点下一轮不再重填，灭死循环。
describe("P1-A/P1-D 全跳过 error 结构化 + 脏标记清除", () => {
  it("全 clean（无脏数据：无正文章节）→ ok:false、error 区分「无待填数据」、且不触发二次重填", async () => {
    // 项目有表但无任何带正文章节 → 无脏数据（本轮未检测到任何脏标记）
    vi.mocked(prisma.storyNode.findMany).mockResolvedValueOnce([]);
    const r1 = await babyloreFillAll("proj-p1a-clean");
    expect(r1.ok).toBe(false);
    expect(r1.processed).toBe(0);
    expect(r1.skipped).toBe(0);
    expect(r1.applied).toBe(0);
    // 语义区分：明确「无待填数据」而非笼统的「跳过」
    expect(r1.error).toContain("无待填数据");
    expect(r1.error).toContain("脏标记");
    expect((r1 as any).fillErrorMeta).toMatchObject({
      kind: "no_dirty",
      processed: 0,
      applied: 0,
      skipped: 0,
      failed: 0,
      nodeIds: [],
    });
    // 二次重填：仍无章节 → 不出现任何处理/重填（脏标记已清，无残留待填）
    vi.mocked(prisma.storyNode.findMany).mockResolvedValueOnce([]);
    const r2 = await babyloreFillAll("proj-p1a-clean");
    expect(r2.processed).toBe(0);
    expect(r2.skipped).toBe(0);
  });

  it("含幽灵脏标记 id（DB 无对应正文章节）→ 仅此时判 all_skipped_mislabeled、UI 显示清理按钮（P1-② 精确误标）", async () => {
    mockFetch(JSON.stringify({ operations: [{ table: "geo", op: "insert", values: { name: "全填地点" } }] }));
    await babyloreFillAll("proj-p1a-mis"); // 先填满 c1/c2，持久化已填标记
    // 注入一个 DB 中不存在的「幽灵脏标记 id」（模拟旧版残留/误标），c1/c2 仍为真实已校验章节
    markChapterFilled("proj-p1a-mis", "ghost-999");
    const r = await babyloreFillAll("proj-p1a-mis"); // 再跑：c1/c2 跳过（干净）+ 幽灵 id
    expect(r.processed).toBe(0);
    expect(r.skipped).toBe(2); // c1/c2 仍被干净跳过，不被幽灵 id 计入
    expect(r.applied).toBe(0);
    // 仅当存在幽灵 id 才判误标，诱导清理重填
    expect(r.ok).toBe(false);
    expect(r.error).toContain("脏标记");
    expect(r.error).toContain("ghost-999");
    expect((r as any).fillErrorMeta).toMatchObject({ kind: "all_skipped_mislabeled", processed: 0, skipped: 2 });
  });

  it("P1-D 脏标记清除：成功落地的节点被标为已填，二次运行直接进入 clean 跳过而非重填", async () => {
    // 首章成功落地、次章空 ops 失败（首章应被清除脏标记，次章保留待重试）
    let call = 0;
    (globalThis as any).fetch = vi.fn(async () => {
      call++;
      const content =
        call === 1
          ? JSON.stringify({ operations: [{ table: "geo", op: "insert", values: { name: "落地地点" } }] })
          : JSON.stringify({ operations: [] });
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
      };
    });
    const first = await babyloreFillAll("proj-p1a-clear");
    expect(first.applied).toBe(1); // 仅首章落地
    expect(first.processed).toBe(2);
    expect(first.failed).toBe(1); // 次章失败留待重试

    // 二次运行：首章已标已填（脏标记已清）→ 直接进入 clean 跳过；次章仍 pending → 重填并再次失败
    const second = await babyloreFillAll("proj-p1a-clear");
    expect(second.skipped).toBe(1); // 首章不再重填
    expect(second.processed).toBe(1); // 仅次章被重填
    expect(second.failed).toBe(1);
  });
});

// ─── P1-C 汇总 skippedOps（丢失的写入与 warning 绑定）───
describe("P1-C 汇总 skippedOps（丢失的写入与 warning 绑定）", () => {
  it("含无效 update 的章节 → fillAllResult.skippedOps 非空且 reason 与 warning 文本一致", async () => {
    let call = 0;
    (globalThis as any).fetch = vi.fn(async () => {
      call++;
      const content =
        call === 1
          ? JSON.stringify({ operations: [{ table: "geo", op: "update", match: { col: "不存在列", val: "x" }, values: {} }] })
          : JSON.stringify({ operations: [{ table: "geo", op: "insert", values: { name: "落地名" } }] });
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
      };
    });
    const r = await babyloreFillAll("proj-p1c-skip");
    expect((r as any).skippedOps?.length ?? 0).toBeGreaterThanOrEqual(1);
    const s = (r as any).skippedOps[0];
    expect(s.table).toBe("地点");
    // skippedOps 与 warning 绑定一一对应：warning 文本包含同一 reason 关键字
    expect(s.reason).toContain("不存在列");
    expect((r.warnings || []).join("")).toContain("不存在列");
  });
});

// ─── P1-F 写入行附加 _src/_ts 溯源 ───
describe("P1-F 写入行附加 _src/_ts 溯源", () => {
  it("insert → 落库 rows 含 _src(ch?:batch?) 与 _ts(ISO 时间)", async () => {
    mockFetch(JSON.stringify({ operations: [{ table: "geo", op: "insert", values: { name: "新地点" } }] }));
    await babyloreFill("proj-p1f", CHAPTER);
    const written = updateCalls[0].data.rows as any[];
    const row = written.find((r: any) => r.name === "新地点");
    expect(row).toBeTruthy();
    expect(row._src).toMatch(/^ch\?:batch/);
    expect(typeof row._ts).toBe("string");
    expect(row._ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── M2（墨白 Round12）填表跨表类型校验：人物不可落地点/建筑表 ───
describe("M2 实体类型推断（纯函数）", () => {
  it("正文中以『说/道/笑』作谓语 → 推断为人物", () => {
    expect(inferEntityType("萧薰儿", "萧薰儿说道：今日入宫。")).toBe("character");
    expect(inferEntityType("萧薰儿", "「快走」，萧薰儿笑道。")).toBe("character");
  });
  it("地名/未在正文作人物谓语 → 保守返回 unknown（不误杀合法地点写入）", () => {
    expect(inferEntityType("青龙镇", "少年踏入青龙镇外。")).toBe("unknown");
    expect(inferEntityType("新地点", "第一章 青龙镇外，少年踏入江湖。")).toBe("unknown");
  });
  it("表类别归类：place/building 归 geo，person/characters 归 entity", () => {
    expect(tableGroupOf("place")).toBe("geo");
    expect(tableGroupOf("building")).toBe("geo");
    expect(tableGroupOf("person")).toBe("entity");
    expect(tableGroupOf("custom")).toBe("other");
  });
});

describe("M2 人物落地点表 → 报错不写错", () => {
  it("人物名写入 geo 表 → 跳过写库、warning 含『类型不匹配』、crossTable issue 并入自检", async () => {
    mockFetch(
      JSON.stringify({
        operations: [{ table: "geo", op: "insert", values: { name: "萧薰儿" } }],
      }),
    );
    const r = await babyloreFill("proj-m2", "萧薰儿说道：今日入宫，踏入碎玉轩。");
    // 不静默污染：geo 表未被写入该行
    const written = updateCalls[0]?.data?.rows as any[] | undefined;
    expect(written?.some((row: any) => row.name === "萧薰儿")).toBeFalsy();
    // 仍须在结果中暴露类型不匹配（报错不写错）
    expect((r.warnings || []).join("")).toContain("类型不匹配");
    expect((r.selfCheckIssues || []).some((i) => i.value === "萧薰儿" && i.issue.includes("类型不匹配"))).toBe(true);
  });

  it("合法地点名写入 geo 表 → 正常落地、不受影响", async () => {
    mockFetch(JSON.stringify({ operations: [{ table: "geo", op: "insert", values: { name: "碎玉轩" } }] }));
    const r = await babyloreFill("proj-m2-ok", "碎玉轩是妃嫔居所，少年走近碎玉轩。");
    expect(r.applied).toBe(1);
    expect(r.ok).toBe(true);
    const written = updateCalls[0].data.rows as any[];
    expect(written.some((row: any) => row.name === "碎玉轩")).toBe(true);
  });
});
