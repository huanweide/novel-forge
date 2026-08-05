// 确认幂等验证（Max Loop Round1·Step2）：重复调用 auto-confirm 不得重复计数/重复追加 reviewLogs
// 用法：node scripts/agent-idempotency-verify.cjs（需 dev 3001 运行）

const BASE = process.env.BASE || "http://127.0.0.1:3001";
async function post(p, body) {
  const r = await fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`POST ${p} ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function get(p) {
  const r = await fetch(BASE + p);
  const j = await r.json();
  if (!r.ok) throw new Error(`GET ${p} ${r.status}`);
  return j;
}
async function del(p) { return (await fetch(BASE + p, { method: "DELETE" })).ok; }
function assert(c, m) {
  if (!c) { console.error("  ✗ FAIL: " + m); process.exitCode = 1; throw new Error(m); }
  console.log("  ✓ PASS: " + m);
}

const GOOD_TEXT =
  "林澈站在灯塔下，想起父亲的话。海不会背叛，只会沉默。潮水漫过脚踝，他握紧口袋里生锈的钥匙，推开铁门，门后是通向海床的螺旋阶梯。灯光熄灭，阶梯尽头有人低声唤他的名字。远处传来汽笛声，他意识到自己已经站了很久，灯光在水面上拖出一道长长的影子。既然门后是光，那就没有回头路可言，他迈开步子走了进去。夜色像潮水一样漫上来，淹过堤岸，淹过灯塔的基石。他听见自己的心跳和远处钟声叠在一起，风从海面吹来，带着咸涩的气息，仿佛在提醒他有些选择一旦迈出就无法回头。他握紧拳头，走进那道光里。";

async function run() {
  console.log("[1] 创建项目 + 优质章 ...");
  const proj = await post("/api/projects", { name: "幂等验证 " + Date.now(), genre: ["科幻"] });
  const node = await post("/api/story/nodes", { projectId: proj.id, title: "幂等章", order: 1, status: "pending_confirm", content: GOOD_TEXT });
  await post("/api/story/nodes/" + node.id + "/route", {}).catch(() => {}); // 无操作，忽略

  console.log("[2] 第一次 auto-confirm ...");
  const ac1 = await post("/api/story/nodes/auto-confirm", { nodeIds: [node.id] });
  assert(ac1.confirmed.some((c) => c.id === node.id), "第一次调用放行 confirmed");
  const d1 = await get("/api/story/nodes/" + node.id);
  const rev1 = d1.revisionCount || 0;
  const logs1 = Array.isArray(d1.reviewLogs) ? d1.reviewLogs.filter((l) => l.action === "auto-confirm").length : 0;
  console.log("    确认后 revisionCount=", rev1, " auto-confirm日志条数=", logs1);
  assert(logs1 === 1, "第一次确认后 auto-confirm 日志恰 1 条");

  console.log("[3] 第二次 auto-confirm（幂等）...");
  const ac2 = await post("/api/story/nodes/auto-confirm", { nodeIds: [node.id] });
  assert(ac2.skipped.some((s) => s.id === node.id), "第二次调用走 skipped（已确认，不重复处理）");
  const d2 = await get("/api/story/nodes/" + node.id);
  const rev2 = d2.revisionCount || 0;
  const logs2 = Array.isArray(d2.reviewLogs) ? d2.reviewLogs.filter((l) => l.action === "auto-confirm").length : 0;
  assert(rev2 === rev1, `revisionCount 未重复递增（${rev1} → ${rev2}）`);
  assert(logs2 === logs1, `auto-confirm 日志未重复追加（${logs1} → ${logs2}）`);

  console.log("[4] 清理 ...");
  await del("/api/projects/" + proj.id);
  console.log("\n✅ 确认幂等验证通过：重复调用不重复计数/追加");
}

run().catch((e) => { console.error("\n❌ 验证失败:", e.message); process.exit(1); });
