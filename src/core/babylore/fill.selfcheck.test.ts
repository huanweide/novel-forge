import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { selfCheckFill } from "@/core/babylore/fill";

// 集成测试：验证「填后自检」能真实捕获错误地名/名称。
// 思路：向项目的 geo 表插入一个【正文里绝对不存在】的地名，
// 调 selfCheckFill，断言它被标红（nameIssues>0 且出现在 issues 中）；
// 测试结束还原该表，保持数据干净。
const PROJECT_ID = "577ed326-b241-4f67-9481-c9332cb03626";
const WRONG_NAME = "幻海市"; // 正文绝无此名

describe("selfCheckFill —— 灭错名自检检测", () => {
  let geoTableId = "";
  let originalRows: any[] = [];

  beforeAll(async () => {
    const t = await prisma.loreTable.findFirst({
      where: { projectId: PROJECT_ID, key: "geo" },
    });
    if (!t) throw new Error("geo 表不存在，请先运行 seed_tables.py");
    geoTableId = t.id;
    originalRows = (t.rows as any[]) || [];
    // 注入一个故意错误（正文不存在）的地名，模拟 LLM 误填
    const injected = [...originalRows, { row_id: 99999, name: WRONG_NAME, desc: "测试注入", firstChapter: "x", related: "" }];
    await prisma.loreTable.update({ where: { id: geoTableId }, data: { rows: injected } });
  });

  afterAll(async () => {
    // 还原 geo 表，删除注入行
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
