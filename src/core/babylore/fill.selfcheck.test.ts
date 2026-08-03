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
