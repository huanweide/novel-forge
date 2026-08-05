// 正式版发布用户旅程验证（Max Loop Round10）：真实用户主流程全链路
// 建项目 → 建章 → 真实 LLM 生成（SSE）→ 提交确认 → 定稿 → 整本交付 → 清理
// 用法：node scripts/agent-release-journey.cjs （需 dev 在 http://127.0.0.1:3001）
const BASE = process.env.BASE || "http://127.0.0.1:3001";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ PASS: ${name}${extra ? " " + extra : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name}${extra ? " " + extra : ""}`); }
};
const j = (r) => r.json().catch(() => ({}));

(async () => {
  const stamp = Date.now();
  console.log("[1] 建项目");
  const projRes = await fetch(`${BASE}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `发布旅程验证 ${stamp}`, genre: ["科幻"] }),
  });
  const proj = await j(projRes);
  ok("建项目", projRes.ok && !!proj.id, `status=${projRes.status}`);
  if (!proj.id) { console.log("中止：无法建项目"); process.exit(1); }
  const projectId = proj.id;

  console.log("[2] 建章（outline_only）");
  const nodeRes = await fetch(`${BASE}/api/story/nodes`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, title: "第一章 启程", order: 1, status: "outline_only", outline: "主角林澈发现海下城市的入口，决定启程。【章尾悬念】：灯光熄灭后，阶梯尽头传来呼唤。" }),
  });
  const node = await j(nodeRes);
  ok("建章", nodeRes.ok && !!node.id, `status=${nodeRes.status}`);
  const nodeId = node.id || (node.node && node.node.id);

  console.log("[3] 真实 LLM 生成（SSE 消费到 done）");
  let finalStatus = null, contentLen = 0, autoConfirmMark = false;
  try {
    const writeRes = await fetch(`${BASE}/api/generate/write`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, nodeId }),
    });
    if (!writeRes.ok) throw new Error(`HTTP ${writeRes.status}`);
    const reader = writeRes.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        try {
          const evt = JSON.parse(line.slice(5));
          if (evt.type === "token" && evt.content) contentLen += evt.content.length;
          if (evt.type === "done") {
            finalStatus = evt.status;
            if (evt.nodeId) autoConfirmMark = true;
          }
        } catch { /* ignore */ }
      }
    }
  } catch (e) {
    ok("真实 LLM 生成", false, e.message);
  }
  ok("生成有正文", contentLen > 150, `contentLen=${contentLen}`);
  ok("done 事件返回状态", !!finalStatus, `status=${finalStatus}`);

  console.log("[4] 查节点最终状态（确认流程结果）");
  const getRes = await fetch(`${BASE}/api/story/nodes/${nodeId}`);
  const nodeData = await j(getRes);
  ok("节点可查", getRes.ok);
  ok("状态为合法终态", ["confirmed", "pending_confirm", "drafting"].includes(nodeData.status), `status=${nodeData.status}`);
  ok("质量分已回写", typeof nodeData.qualityScore === "number", `qualityScore=${nodeData.qualityScore}`);

  console.log("[5] 整本交付");
  const confRes = await fetch(`${BASE}/api/projects/${projectId}/confirm`, { method: "POST" });
  const confData = await j(confRes);
  ok("整本交付响应", confRes.ok, `status=${confRes.status} ${JSON.stringify(confData).slice(0, 120)}`);

  console.log("[6] 清理：软删项目");
  const delRes = await fetch(`${BASE}/api/projects/${projectId}`, { method: "DELETE" });
  const del = await j(delRes);
  ok("软删项目", delRes.ok && del.recycled === true, `recycled=${del.recycled}`);

  console.log(`\n${fail === 0 ? "✅ 正式版用户旅程全部通过" : `❌ ${fail} 项失败`}（PASS=${pass} FAIL=${fail}）`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
