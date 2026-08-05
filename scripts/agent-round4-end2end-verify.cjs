// MaxLoop round-4 端到端集成验证（真机，真实 LLM）：
// 建项目 → 写原正文 → 开游戏 → action×1 → 结束并导出 → 校验原正文保留（IMP-001/003 链路）
//         → markdown 导出抓 filename*=（IMP-013）→ 再导入（forceNew）校验 round-trip
// 用法：node scripts/agent-round4-end2end-verify.cjs （需 dev 在 http://127.0.0.1:3001）
const BASE = process.env.BASE || "http://127.0.0.1:3001";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ PASS: ${name}${extra ? " " + extra : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name}${extra ? " " + extra : ""}`); }
};
const j = (r) => r.json().catch(() => ({}));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function consumeSSE(resp) {
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let last = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() || "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      try { const evt = JSON.parse(line.slice(5)); if (evt.type === "game_done") last = evt; if (evt.type === "error") last = evt; } catch {}
    }
  }
  return last;
}

(async () => {
  const stamp = Date.now();
  console.log("[1] 建项目");
  const projRes = await fetch(`${BASE}/api/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `R4集成 ${stamp}`, genre: ["科幻"] }) });
  const proj = await j(projRes);
  ok("建项目", projRes.ok && !!proj.id, `status=${projRes.status}`);
  if (!proj.id) { console.log("中止"); process.exit(1); }
  const projectId = proj.id;

  console.log("[2] 建章并写作者原正文");
  const originalContent = "林澈站在废弃码头的边缘，咸湿的海风卷起他的衣角。脚下礁石缝隙里渗出幽蓝的光，像是某种活物在呼吸。他想起三天前那封没有署名的信——「海下有城，等你来拆封。」";
  const nodeRes = await fetch(`${BASE}/api/story/nodes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, title: "第一章 海下之城", order: 1, status: "draft", content: originalContent }) });
  const node = await j(nodeRes);
  const nodeId = node.id || (node.node && node.node.id);
  ok("建章含原正文", nodeRes.ok && !!nodeId && (node.content === originalContent || (node.node && node.node.content === originalContent)), `status=${nodeRes.status}`);

  console.log("[3] 开游戏（start，真实 LLM）");
  let sessionId = null;
  try {
    const sRes = await fetch(`${BASE}/api/game/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, nodeId }) });
    const sData = await j(sRes);
    ok("game/start", sRes.ok && !!sData.sessionId, `status=${sRes.status}`);
    sessionId = sData.sessionId;
  } catch (e) { ok("game/start", false, e.message); }

  console.log("[4] 游戏 action×1（SSE，真实 LLM）");
  let acted = false;
  if (sessionId) {
    try {
      const aRes = await fetch(`${BASE}/api/game/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, actionType: "custom", actionText: "林澈沿着蓝光走向礁石深处" }) });
      const evt = await consumeSSE(aRes);
      acted = !!evt && evt.type === "game_done";
      ok("game/action SSE game_done", acted, `evtType=${evt && evt.type}`);
    } catch (e) { ok("game/action", false, e.message); }
  }

  console.log("[5] 结束并导出（真实 LLM 结尾叙事）");
  let finalContent = null, autoFilled = false;
  if (sessionId) {
    try {
      const eRes = await fetch(`${BASE}/api/game/end`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
      const eData = await j(eRes);
      ok("game/end", eRes.ok && !!eData.finalContent, `status=${eRes.status}`);
      finalContent = eData.finalContent;
      autoFilled = !!eData.autoFilled;
      console.log(`    autoFilled=${autoFilled} finalLen=${finalContent ? finalContent.length : 0}`);
    } catch (e) { ok("game/end", false, e.message); }
  }

  console.log("[6] 校验 IMP-001：导出后作者原正文保留在 finalContent 开头");
  if (finalContent) {
    ok("原正文前置保留", finalContent.startsWith(originalContent), `startsWith=${finalContent.startsWith(originalContent)}`);
  }

  console.log("[7] 导出 markdown 抓 Content-Disposition（IMP-013）");
  try {
    const expRes = await fetch(`${BASE}/api/projects/${projectId}/export?format=markdown`);
    const cd = expRes.headers.get("content-disposition") || "";
    ok("导出 200", expRes.status === 200, `status=${expRes.status}`);
    ok("filename*= 含 UTF-8", cd.includes("filename*=UTF-8''"), `cd=${cd.slice(0, 80)}`);
  } catch (e) { ok("导出 markdown", false, e.message); }

  console.log("[8] 备份包 round-trip（.nfproject 导出→导入，IMP-014）");
  try {
    // 8.1 备份导出（真正的整项目备份包）
    const bakRes = await fetch(`${BASE}/api/projects/${projectId}/backup`);
    const bakText = await bakRes.text();
    ok("备份导出 200", bakRes.status === 200, `status=${bakRes.status}`);
    let bakJson = null;
    try { bakJson = JSON.parse(bakText); } catch {}
    ok("备份含 project", !!bakJson && !!bakJson.project, `hasProject=${!!(bakJson && bakJson.project)}`);
    // 8.2 导入备份包为新项目（forceNew=true 跳过幂等）
    if (bakJson) {
      const importRes = await fetch(`${BASE}/api/projects/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...bakJson, forceNew: true }) });
      const imp = await j(importRes);
      const impId = imp.id || (imp.project && imp.project.id);
      ok("备份导入成功", importRes.ok && !!impId, `status=${importRes.status} id=${impId}`);
      if (impId) {
        const reProj = await fetch(`${BASE}/api/projects/${impId}`).then((r) => r.json());
        const nameOk = reProj.name && reProj.name.includes("R4集成") && !reProj.name.includes("（副本）（副本）");
        ok("副本名未叠加", nameOk, `name=${reProj.name}`);
        // 清理导入副本
        await fetch(`${BASE}/api/projects/${impId}`, { method: "DELETE" });
      }
    }
  } catch (e) { ok("备份包 round-trip", false, e.message); }

  console.log("[9] 清理：软删原项目");
  const delRes = await fetch(`${BASE}/api/projects/${projectId}`, { method: "DELETE" });
  const del = await j(delRes);
  ok("软删项目", delRes.ok && del.recycled === true, `recycled=${del.recycled}`);

  console.log(`\n${fail === 0 ? "✅ round-4 端到端集成全部通过" : `❌ ${fail} 项失败`}（PASS=${pass} FAIL=${fail}）`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
