// 马斯克 Round3 #517 真机生成验收：验证「生成一本书 → 人工零点击全确认」
// 真实 LLM 生成一章（SSE 流式）→ 断言生成完节点直接 confirmed 且 reviewLogs 含 auto-confirm（自动审定，无人点按钮）

const BASE = "http://localhost:3001";

const j = async (method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};

// 解析 write 端点的 SSE 流，等 done / error
async function streamWrite(projectId, nodeId, targetWordCount) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 180000);
  try {
    const res = await fetch(BASE + "/api/generate/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, nodeId, targetWordCount }),
      signal: ac.signal,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error("write HTTP " + res.status + ": " + t);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let done = false;
    let lastStatus = null;
    let tokens = 0;
    while (true) {
      const { value, done: d } = await reader.read();
      if (d) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = chunk.trim();
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          try {
            const ev = JSON.parse(payload);
            if (ev.type === "token") tokens += (ev.content || "").length;
            if (ev.type === "auto_confirm") console.log("  [SSE] auto_confirm:", ev.content);
            if (ev.type === "done") { done = true; lastStatus = ev.status; }
            if (ev.type === "error") throw new Error("SSE error: " + ev.content);
          } catch (e) {
            if (e.message && e.message.startsWith("SSE error")) throw e;
          }
        }
      }
    }
    return { done, lastStatus, tokens };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  console.log("=== 建沙盒项目（autoConfirmEnabled 默认开）===");
  const p = await j("POST", "/api/projects", {
    name: "GEN_AC_VERIFY_" + Date.now(),
    genre: ["科幻"],
    synopsis: "火星殖民基地日常，工程师林越的故事",
  });
  if (p.status !== 201 && p.status !== 200) { console.log("建项目失败", p); process.exit(1); }
  const projectId = p.data.id;
  console.log("项目:", projectId, "autoConfirmEnabled =", p.data.autoConfirmEnabled);

  console.log("=== 建 1 章 outline_only ===");
  const n = await j("POST", "/api/story/nodes", {
    projectId,
    title: "第一章 晨光中的穹顶",
    type: "chapter",
    order: 1,
    status: "outline_only",
    outline: "林越推开气闸，望向红色荒原，回想三年前登陆只剩七人，如今地下城容纳两万居民。她关掉警报走向中央控制室。",
  });
  if (n.status !== 200 && n.status !== 201) { console.log("建章失败", n); process.exit(1); }
  const nodeId = n.data.id;
  console.log("章:", nodeId);

  console.log("=== 真实 LLM 生成（SSE 流式，target 1500 字）===");
  const r = await streamWrite(projectId, nodeId, 1500).catch((e) => {
    console.log("生成异常:", e.message);
    return null;
  });
  if (!r || !r.done) { console.log("✗ 生成未完成"); await j("DELETE", "/api/projects/" + projectId).catch(() => {}); process.exit(1); }
  console.log("生成完成：SSE done status =", r.lastStatus, "，正文约", r.tokens, "字");

  console.log("=== 查章最终态（验证 auto-confirm 挂载生效）===");
  const fn = await j("GET", "/api/story/nodes/" + nodeId);
  const status = fn.data.status;
  const reviewLogs = Array.isArray(fn.data.reviewLogs) ? fn.data.reviewLogs : [];
  const hasAuto = reviewLogs.some((l) => l && l.action === "auto-confirm");
  console.log("最终 status =", status);
  console.log("reviewLogs 含 auto-confirm =", hasAuto, "（明细:", JSON.stringify(reviewLogs.filter((l) => l && l.action === "auto-confirm")), "）");

  let ok = true;
  if (status !== "confirmed") { console.log("✗ 生成完未自动确认（status=" + status + "），人工零点击目标未达成"); ok = false; }
  if (!hasAuto) { console.log("✗ reviewLogs 无 auto-confirm 标记，自动审定未落痕"); ok = false; }

  console.log(ok ? "VERIFY_PASS ✓ （真机生成 → 自动确认 → 人工零点击）" : "VERIFY_FAIL ✗");

  await j("DELETE", "/api/projects/" + projectId).catch(() => {});
  process.exit(ok ? 0 : 1);
})();
