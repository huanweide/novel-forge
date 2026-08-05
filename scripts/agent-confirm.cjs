// AI 智能体：驱动确认流程（全按钮）+ 验证状态机闭环（状态感知版）
const PROJECT_ID = "45bda999-ddd0-4954-b75f-497b17b2f76b";
const NODE_API = "http://localhost:3001/api/story/nodes";
const REVIEW_API = (id) => `http://localhost:3001/api/story/nodes/${id}/review`;
const CONFIRM_PROJECT = `http://localhost:3001/api/projects/${PROJECT_ID}/confirm`;

const NODES = {
  1: "96839dde-55a3-49cc-9c63-6f699f34be32",
  2: "e93b6c6e-8f95-40d6-bdb0-c86d963aefac",
  3: "f5a56d6e-ca5e-4637-80c5-c207060f5e47",
  4: "9774f366-3a85-447e-8be3-1afc5c4ba7e7",
  5: "c27b14d9-d012-4543-ad39-afcdca638353",
  6: "2b084be8-d827-4e9b-836d-0381ffaffc06",
  7: "4635f304-d3d2-48fb-ab18-8e604986fe1d",
  8: "9eaafbc9-562a-4d1c-acf8-df3a6979cdad",
  9: "38218788-45b4-4fbc-918d-45676d6d4de6",
  10: "42930978-04fb-4f03-a165-46f8c15f09e2",
  11: "e6171fbc-337c-4429-a197-febf990f012d",
  12: "72269285-7614-4ab0-86aa-2b8597ec6198",
};
const TITLES = {
  1: "发射窗口", 2: "火种编码", 3: "轨道投送网", 4: "火星前哨", 5: "木卫二冰下",
  6: "资源博弈", 7: "辐射风暴", 8: "比邻星航程", 9: "记忆裂隙", 10: "叛逃者",
  11: "最后一次发射", 12: "火种点亮",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function patch(id, action, extra = {}) {
  const res = await fetch(`${NODE_API}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const d = await res.json().catch(() => ({}));
  return { status: res.status, d };
}
async function getStatus(id) {
  const res = await fetch(`${NODE_API}/${id}`);
  const d = await res.json().catch(() => ({}));
  return d.status;
}
async function diagnose(id) {
  const res = await fetch(REVIEW_API(id), { method: "POST" });
  const d = await res.json().catch(() => ({}));
  return res.status === 200 ? `passed=${d.passed} score=${d.overallScore} grade=${d.grade}` : `ERR${res.status}`;
}

async function processChapter(order) {
  const id = NODES[order];
  const log = [];
  const cur = await getStatus(id);
  log.push(`初始=${cur}`);

  const withReject = order === 5; // 第5章验证打回重写闭环

  if (cur === "confirmed") {
    log.push("已确认·跳过");
    console.log(`#${order} ${TITLES[order].padEnd(6)} | ${log.join(" | ")}`);
    return { order, confirmed: true };
  }

  if (cur === "drafting" || cur === "completed") {
    const s = await patch(id, "submit");
    log.push(`submit=${s.status}/${s.d.status || s.d.error || ""}`);
    if (s.status !== 200) throw new Error(`#${order} submit 失败 ${s.status} ${JSON.stringify(s.d)}`);
  } else if (cur !== "pending_confirm") {
    throw new Error(`#${order} 意外状态 ${cur}`);
  }

  if (withReject) {
    const rj = await patch(id, "reject", { reason: "测试打回：第5章冰下钻探张力不足，需重写危机段落" });
    log.push(`reject=${rj.status}/${rj.d.status || rj.d.error || ""}`);
    if (rj.status !== 200) throw new Error(`#${order} reject 失败 ${rj.status}`);
    const s2 = await patch(id, "submit");
    log.push(`resubmit=${s2.status}/${s2.d.status || s2.d.error || ""}`);
    if (s2.status !== 200) throw new Error(`#${order} resubmit 失败 ${s2.status}`);
  }

  const dg = await diagnose(id);
  log.push(`diagnose=${dg}`);

  const cf = await patch(id, "confirm");
  const cfInfo = cf.status === 200 ? `${cf.d.status}${cf.d.confirmedAt ? "✓" : ""}` : `ERR${cf.status}`;
  log.push(`confirm=${cf.status}/${cfInfo}`);
  if (cf.status !== 200) throw new Error(`#${order} confirm 失败 ${cf.status} ${JSON.stringify(cf.d)}`);

  console.log(`#${order} ${TITLES[order].padEnd(6)} | ${log.join(" | ")}`);
  return { order, confirmed: cf.status === 200 };
}

(async () => {
  const results = [];
  for (const order of Object.keys(NODES).map(Number)) {
    try {
      const r = await processChapter(order);
      results.push(r);
    } catch (e) {
      console.error(`#${order} 异常: ${e.message}`);
      results.push({ order, confirmed: false, err: e.message });
    }
    await sleep(150);
  }
  const ok = results.filter((r) => r.confirmed).length;
  console.log(`\n章节确认完成 ${ok}/${results.length}`);

  const pc = await fetch(CONFIRM_PROJECT, { method: "POST" });
  const pcd = await pc.json().catch(() => ({}));
  console.log(`项目确认交付: ${pc.status} ${JSON.stringify(pcd).slice(0, 200)}`);

  if (ok === results.length && pc.status === 200) {
    console.log("\n✅ 确认流程全闭环：建项目→写12章→逐章确认(含打回重写)→整本交付");
  } else {
    console.log("\n⚠️ 存在未闭环环节，需排查");
    process.exit(3);
  }
})().catch((e) => {
  console.error("ERR", e.message || e);
  process.exit(1);
});
