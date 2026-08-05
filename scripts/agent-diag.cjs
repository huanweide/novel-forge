// 诊断（纯 API）：auto-confirm 未触发根因。建项目→看 GET 项目字段→生成→看节点 qualityScore/reviewLogs/status。
const BASE = "http://localhost:3001";
const j = async (method, path, body) => {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};
(async () => {
  const p = await j("POST", "/api/projects", { name: "DIAG_" + Date.now(), genre: ["x"], synopsis: "y" });
  const projectId = p.data.id;
  console.log("[GET项目] 返回 keys =", Object.keys(p.data).join(","));
  console.log("[GET项目] autoConfirmEnabled =", p.data.autoConfirmEnabled);

  const n = await j("POST", "/api/story/nodes", { projectId, title: "诊断章", type: "chapter", order: 1, status: "outline_only", outline: "林越推开气闸望向荒原。" });
  const nodeId = n.data.id;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 180000);
  try {
    const res = await fetch(BASE + "/api/generate/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, nodeId, targetWordCount: 1500 }), signal: ac.signal });
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    while (true) {
      const { value, done: d } = await reader.read(); if (d) break;
      buf += dec.decode(value, { stream: true });
      let idx; while ((idx = buf.indexOf("\n\n")) >= 0) { const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 2); if (line.startsWith("data:")) { try { const ev = JSON.parse(line.slice(5).trim()); if (ev.type === "auto_confirm") console.log("[SSE] auto_confirm:", ev.content); if (ev.type === "done") console.log("[SSE] done status =", ev.status); if (ev.type === "error") console.log("[SSE] error:", ev.content); } catch {} } }
    }
  } finally { clearTimeout(timer); }

  const fn = await j("GET", "/api/story/nodes/" + nodeId);
  console.log("[GET节点] status =", fn.data.status, "qualityScore =", fn.data.qualityScore, "wordCount =", fn.data.wordCount);
  console.log("[GET节点] reviewLogs =", JSON.stringify(fn.data.reviewLogs));
  await j("DELETE", "/api/projects/" + projectId).catch(() => {});
  process.exit(0);
})();
