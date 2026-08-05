// 护栏统一验证（Max Loop Round1·Step2）：batch-confirm 收编 confirm-guard 后，
// 空正文/过短章必须被批量确认拦截（与 auto-confirm 同源，消除阈值分裂）。
// 用法：node scripts/agent-batch-guard-verify.cjs（需 dev 3001 运行）

const BASE = process.env.BASE || "http://127.0.0.1:3001";

async function post(p, body) {
  const r = await fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`POST ${p} ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function put(p, body) {
  const r = await fetch(BASE + p, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`PUT ${p} ${r.status} ${JSON.stringify(j)}`);
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
  "夜幕降临时，林澈站在旧港口的灯塔下，望着远处海平线上最后一抹暗红。他想起十年前父亲说过的话：海不会背叛，只会沉默。潮水漫过脚踝，他握紧了口袋里那枚生锈的钥匙，转身走进被遗弃的灯塔。黑暗里传来一声极轻的呼吸。他屏住呼吸，缓缓推开那扇锈蚀的铁门，门后是一条通向海床的螺旋阶梯。灯光在身后熄灭的瞬间，他听见阶梯尽头有人在低声唤他的名字。";

async function run() {
  console.log("[1] 创建测试项目 ...");
  const proj = await post("/api/projects", { name: "护栏统一验证 " + Date.now(), genre: ["科幻"] });
  const projectId = proj.id;

  console.log("[2] 建章 A（空正文 + 伪造 qualityScore=90）与 B（优质正文 + 88）...");
  const nodeA = await post("/api/story/nodes", { projectId, title: "空正文章A", order: 1, status: "pending_confirm", content: "" });
  await put("/api/story/nodes/" + nodeA.id, { qualityScore: 90 });
  const nodeB = await post("/api/story/nodes", { projectId, title: "优质章B", order: 2, status: "pending_confirm", content: GOOD_TEXT });
  await put("/api/story/nodes/" + nodeB.id, { qualityScore: 88 });

  console.log("[3] batch-confirm 同时提交 A+B ...");
  const bc = await post("/api/story/nodes/batch-confirm", { nodeIds: [nodeA.id, nodeB.id] });
  console.log("    结果: blocked=", bc.blocked.map((b) => b.title + ":" + b.reason), "confirmed=", bc.confirmed.map((c) => c.title));
  assert(bc.blocked.some((b) => b.id === nodeA.id), "batch-confirm：空正文章被拦截（不再被伪造高分蒙混）");
  assert(bc.confirmed.some((c) => c.id === nodeB.id), "batch-confirm：优质章正常放行（回归不受影响）");

  console.log("[4] auto-confirm 对 A 对照 ...");
  const ac = await post("/api/story/nodes/auto-confirm", { nodeIds: [nodeA.id] });
  assert(ac.blocked.some((b) => b.id === nodeA.id), "auto-confirm：空正文章同样被拦截（两入口行为一致）");

  console.log("[5] 终态断言 ...");
  const detailA = await get("/api/story/nodes/" + nodeA.id);
  assert(detailA.status !== "confirmed", "空正文章 A 未变成 confirmed（保持待确认/被拦态）");
  const detailB = await get("/api/story/nodes/" + nodeB.id);
  assert(detailB.status === "confirmed", "优质章 B 已 confirmed");

  console.log("[6] 清理 ...");
  await del("/api/projects/" + projectId);
  console.log("\n✅ 护栏统一验证通过：batch-confirm 与 auto-confirm 对空正文行为一致，均拦截");
}

run().catch((e) => { console.error("\n❌ 验证失败:", e.message); process.exit(1); });
