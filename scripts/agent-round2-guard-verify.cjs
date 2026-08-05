// Max Loop Round2 护栏审查修复真机验证（agent-round2-guard-verify.cjs）
// 覆盖：R2-2 手动 PATCH confirm 空正文 422 + 幂等 409；R2-3 auto-confirm 审校 passed=false 不自动放行
// 用法：node scripts/agent-round2-guard-verify.cjs（需 dev 3001 运行）

const BASE = process.env.BASE || "http://127.0.0.1:3001";

async function req(method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => null);
  return { status: r.status, json: j };
}
function assert(c, m) {
  if (!c) { console.error("  ✗ FAIL: " + m); process.exitCode = 1; throw new Error(m); }
  console.log("  ✓ PASS: " + m);
}

const GOOD_TEXT =
  "林澈站在灯塔下，想起父亲的话。海不会背叛，只会沉默。潮水漫过脚踝，他握紧口袋里生锈的钥匙，推开铁门，门后是通向海床的螺旋阶梯。灯光熄灭，阶梯尽头有人低声唤他的名字。远处传来汽笛声，他意识到自己已经站了很久，灯光在水面上拖出一道长长的影子。既然门后是光，那就没有回头路可言，他迈开步子走了进去。夜色像潮水一样漫上来，淹过堤岸，淹过灯塔的基石。他听见自己的心跳和远处钟声叠在一起，风从海面吹来，带着咸涩的气息，仿佛在提醒他有些选择一旦迈出就无法回头。他握紧拳头，走进那道光里。";

async function run() {
  console.log("[1] 建项目 ...");
  const proj = (await req("POST", "/api/projects", { name: "R2护栏验证 " + Date.now(), genre: ["科幻"] })).json;
  const projectId = proj.id;

  console.log("[2] R2-2：手动 PATCH confirm 空正文拦截 ...");
  const A = (await req("POST", "/api/story/nodes", { projectId, title: "空正文A", order: 1, status: "pending_confirm", content: "" })).json;
  const pa = await req("PATCH", `/api/story/nodes/${A.id}`, { action: "confirm" });
  console.log("    PATCH confirm 空正文 → HTTP", pa.status, pa.json?.error || "");
  assert(pa.status === 422, "空正文 PATCH confirm 被 422 拦截（人工护栏）");

  console.log("[3] R2-2：手动 PATCH confirm 幂等 ...");
  const B = (await req("POST", "/api/story/nodes", { projectId, title: "优质B", order: 2, status: "pending_confirm", content: GOOD_TEXT })).json;
  const pb1 = await req("PATCH", `/api/story/nodes/${B.id}`, { action: "confirm" });
  assert(pb1.status === 200, "首次 confirm 200");
  const pb2 = await req("PATCH", `/api/story/nodes/${B.id}`, { action: "confirm" });
  console.log("    重复 confirm → HTTP", pb2.status, pb2.json?.error || "");
  assert(pb2.status === 409, "重复 confirm 被 409 拦截（幂等）");
  const bd = (await req("GET", `/api/story/nodes/${B.id}`)).json;
  const bConfirmLogs = (bd.reviewLogs || []).filter((l) => l.action === "confirm").length;
  assert(bd.revisionCount === 1 && bConfirmLogs === 1, `幂等：revisionCount=${bd.revisionCount}、confirm日志=${bConfirmLogs} 均未重复`);

  console.log("[4] R2-3：auto-confirm 审校 passed=false 不自动放行 ...");
  const C = (await req("POST", "/api/story/nodes", { projectId, title: "审校失败C", order: 3, status: "drafting", content: GOOD_TEXT })).json;
  await req("PUT", `/api/story/nodes/${C.id}`, { qualityScore: 88, reviewLogs: [{ id: "logic_check", passed: false, timestamp: Date.now() }] });
  const ac1 = await req("POST", "/api/story/nodes/auto-confirm", { nodeIds: [C.id] });
  console.log("    auto-confirm 审校失败章 → blocked:", ac1.json.blocked?.map((b) => b.reason));
  assert(ac1.json.blocked?.some((b) => b.id === C.id), "审校 passed=false 不自动放行（blocked，需人工）");

  console.log("[5] R2-3 对照：无审校失败时正常放行 ...");
  const D = (await req("POST", "/api/story/nodes", { projectId, title: "优质D", order: 4, status: "drafting", content: GOOD_TEXT })).json;
  await req("PUT", `/api/story/nodes/${D.id}`, { qualityScore: 88 });
  const ac2 = await req("POST", "/api/story/nodes/auto-confirm", { nodeIds: [D.id] });
  assert(ac2.json.confirmed?.some((c) => c.id === D.id), "对照：无审校失败时正常放行 confirmed");

  console.log("[6] 清理 ...");
  await req("DELETE", `/api/projects/${projectId}`);
  console.log("\n✅ R2 护栏审查修复验证全部通过");
}

run().catch((e) => { console.error("\n❌ 验证失败:", e.message); process.exit(1); });
