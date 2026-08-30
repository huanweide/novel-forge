import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { selfCheckFill } from "@/core/babylore/fill";
import { asArray } from "@/lib/utils";

// 集成测试：验证「填后自检」能真实捕获错误地名/名称。
// 思路：向项目的 geo 表插入一个【正文里绝对不存在】的地名，
// 调 selfCheckFill，断言它被标红（nameIssues>0 且出现在 issues 中）；
// 测试结束还原该表，保持数据干净。
// Max Loop 审查：本测试直连真实 DB（需 seed 的 geo 表），CI 无 DATABASE_URL 时整组跳过，避免门禁必红。
const hasDb = !!process.env.DATABASE_URL;
const PROJECT_ID = "577ed326-b241-4f67-9481-c9332cb03626";
const WRONG_NAME = "幻海市"; // 正文绝无此名

/**
 * 确保前置 Project 存在。
 *
 * v3.1.55 修复：本测试用固定的 PROJECT_ID，但夹具从未创建对应的 Project 记录。
 * 在干净库（CI 首次运行、或本地删库重来）里，直接 create LoreTable 会因
 * 外键约束而失败（Foreign key constraint violated），整组测试必红 ——
 * 与本测试要验证的业务逻辑无关，纯属夹具缺前置依赖。
 *
 * 用 upsert 保证幂等：库里已有则不改动，没有才建。
 */
async function ensureProject() {
  await prisma.project.upsert({
    where: { id: PROJECT_ID },
    create: { id: PROJECT_ID, name: "自检测试项目", genre: "test" },
    update: {},
  });
}

describe.skipIf(!hasDb)("selfCheckFill —— 灭错名自检检测", () => {
  let geoTableId = "";
  let originalRows: any[] = [];
  let createdByTest = false;

  beforeAll(async () => {
    await ensureProject();
    let t = await prisma.loreTable.findFirst({
      where: { projectId: PROJECT_ID, key: "geo" },
    });
    // v3.1.55：不再硬性要求外部先跑 seed_tables.py —— 测试应当自包含。
    // 库里没有 geo 表时自建一张，跑完由 afterAll 删除，不污染数据库。
    // 否则在干净库（CI 首次运行、本地删库重来）上整组必红。
    if (!t) {
      t = await prisma.loreTable.create({
        data: {
          projectId: PROJECT_ID,
          key: "geo",
          name: "自检geo表",
          category: "geo",
          columns: [{ key: "name", label: "名称", type: "text" }],
          rows: [],
        },
      });
      createdByTest = true;
    }
    geoTableId = t.id;
    // rows 已是数据库原生 Json，读出来可能是数组/字符串/null，统一收敛为数组
    originalRows = asArray<any>(t.rows);
    // 注入一个故意错误（正文不存在）的地名，模拟 LLM 误填
    const injected = [...originalRows, { row_id: 99999, name: WRONG_NAME, desc: "测试注入", firstChapter: "x", related: "" }];
    await prisma.loreTable.update({ where: { id: geoTableId }, data: { rows: injected } });
  });

  afterAll(async () => {
    // 测试自建的表直接删掉；原本就有的表则还原内容、删除注入行
    if (createdByTest) {
      await prisma.loreTable.delete({ where: { id: geoTableId } }).catch(() => {});
      return;
    }
    await prisma.loreTable.update({ where: { id: geoTableId }, data: { rows: originalRows } });
  });

  it("能检出正文检索不到的错误地名", async () => {
    const result = await selfCheckFill(PROJECT_ID);
    expect(result.nameIssues).toBeGreaterThanOrEqual(1);
    const hit = result.issues.find((i) => i.value === WRONG_NAME);
    expect(hit).toBeDefined();
    expect(hit?.issue).toContain("疑似错误地名");
  });

  it("自身为空的 geo 表在还原后不应残留错误地名", async () => {
    await prisma.loreTable.update({ where: { id: geoTableId }, data: { rows: originalRows } });
    const r2 = await selfCheckFill(PROJECT_ID);
    expect(r2.issues.find((i) => i.value === WRONG_NAME)).toBeUndefined();
  });
});

// ─── A-2 修复验证：跨表同名检测（含同类别漏报）───
// 思路：临时建两张表写入【同名值】，验证 selfCheckFill 把跨表同名标红。
//  - 用例一：两张类别不同的表（customA / customB）共享同名 → 跨类别同名，应报；
//  - 用例二：两张类别均为 custom 的表共享同名 → 同类别多表同名，修复后也应报（原逻辑 categories.size>=2 会漏报）。
// 测试结束删除临时表，保持数据干净。
describe("selfCheckFill —— 跨表同名检测（A-2 修复验证）", () => {
  const SHARED_CROSS = "同名校验物xyz"; // 跨类别用例共享值（小写，与自检收集键 sl 对齐，便于断言）
  const SHARED_SAME = "同类同名校验物xyz"; // 同类别用例共享值
  const createdIds: string[] = [];

  beforeAll(async () => {
    await ensureProject();
    const defs = [
      { key: "selftest_a", name: "自检表A", category: "customA", rows: [{ row_id: 1, name: SHARED_CROSS }] },
      { key: "selftest_b", name: "自检表B", category: "customB", rows: [{ row_id: 1, name: SHARED_CROSS }] },
      { key: "selftest_c", name: "自检表C", category: "custom", rows: [{ row_id: 1, name: SHARED_SAME }] },
      { key: "selftest_d", name: "自检表D", category: "custom", rows: [{ row_id: 1, name: SHARED_SAME }] },
    ];
    for (const d of defs) {
      const t = await prisma.loreTable.create({
        data: {
          projectId: PROJECT_ID,
          key: d.key,
          name: d.name,
          note: "自检测试临时表",
          category: d.category,
          columns: [{ key: "name", label: "名称", type: "text" }],
          rows: d.rows,
        },
      });
      createdIds.push(t.id);
    }
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await prisma.loreTable.delete({ where: { id } }).catch(() => {});
    }
  });

  it("跨类别同名（customA/customB）应被报出（含跨表标记）", async () => {
    const r = await selfCheckFill(PROJECT_ID);
    expect(r.crossTableIssues).toBeGreaterThanOrEqual(1);
    const hit = r.issues.find((i) => i.value === SHARED_CROSS && i.issue.includes("跨类别同名"));
    expect(hit).toBeDefined();
  });

  it("同类别同名（均 custom）也应被报出（验证 categories.size===1 也能报）", async () => {
    const r = await selfCheckFill(PROJECT_ID);
    expect(r.crossTableIssues).toBeGreaterThanOrEqual(1);
    const hit = r.issues.find((i) => i.value === SHARED_SAME && i.issue.includes("同类别多表同名"));
    expect(hit).toBeDefined();
  });
});

// ─── P1 归表错误检测：唯一名写错表（如人名写进 geo 表）───
// 思路：建一张 geo 类表，写入一个仅属于它的唯一名（疑似人物名），同时建一张有值的 characters 类表；
// 验证 selfCheckFill 将其标为「疑似写错表（归表错误）」。测试结束删除临时表。
describe("selfCheckFill —— 唯一名写错表（P1 归表错误检测）", () => {
  const WRONG_TABLE_VAL = "归表校验物张三"; // 仅落在 geo 表的唯一名（疑似人物）
  const REAL_CHAR = "归表校验物李四"; // 正确落在 characters 表的名（不应被误报）
  const createdIds: string[] = [];

  beforeAll(async () => {
    await ensureProject();
    const geo = await prisma.loreTable.create({
      data: {
        projectId: PROJECT_ID,
        key: "selftest_geo_wrong",
        name: "自检geo表",
        note: "自检测试临时表",
        category: "geo",
        columns: [{ key: "name", label: "名称", type: "text" }],
        rows: [{ row_id: 1, name: WRONG_TABLE_VAL }],
      },
    });
    const chars = await prisma.loreTable.create({
      data: {
        projectId: PROJECT_ID,
        key: "selftest_char_wrong",
        name: "自检人物表",
        note: "自检测试临时表",
        category: "characters",
        columns: [{ key: "name", label: "名称", type: "text" }],
        rows: [{ row_id: 1, name: REAL_CHAR }],
      },
    });
    createdIds.push(geo.id, chars.id);
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await prisma.loreTable.delete({ where: { id } }).catch(() => {});
    }
  });

  it("人名写进 geo 表应被报归表错误", async () => {
    const r = await selfCheckFill(PROJECT_ID);
    expect(r.crossTableIssues).toBeGreaterThanOrEqual(1);
    const hit = r.issues.find((i) => i.value === WRONG_TABLE_VAL && i.issue.includes("写错表"));
    expect(hit).toBeDefined();
  });

  it("正确落在 characters 表的名不应被误报写错表", async () => {
    const r = await selfCheckFill(PROJECT_ID);
    const falseHit = r.issues.find((i) => i.value === REAL_CHAR && i.issue.includes("写错表"));
    expect(falseHit).toBeUndefined();
  });
});
