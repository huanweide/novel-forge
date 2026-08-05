// Round3 #1 真机验证：Auto-Confirm 端点（智能审阅执行器）
// 建沙盒项目 → 建3章(drafting: A/B优质留空质量分实时算, C低质qualityScore=30) → 扫全书自动确认 → 断言放行/拦截 → 清理

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

const GOOD =
  "火星殖民基地的穹顶在晨光中泛起淡蓝。工程师林越推开气闸，呼吸面罩里传来氧流量稳定的轻响。她回头望向那片红色的荒原，想起三年前登陆时只剩七个人。如今地下城已容纳两万居民，水循环系统昼夜不息。农业舱的麦浪在人造阳光下起伏，孩子们在里面追逐。林越知道，真正的文明不靠飞船，靠这些琐碎的日常。她关掉警报，走向中央控制室。";

(async () => {
  console.log("=== 建沙盒项目 ===");
  const p = await j("POST", "/api/projects", {
    name: "AC_VERIFY_" + Date.now(),
    genre: ["测试"],
    synopsis: "验证用",
  });
  if (p.status !== 201 && p.status !== 200) {
    console.log("建项目失败", p);
    process.exit(1);
  }
  const projectId = p.data.id;
  console.log("项目:", projectId);
  if ("autoConfirmEnabled" in p.data) {
    console.log("autoConfirmEnabled(API返回) =", p.data.autoConfirmEnabled);
  } else {
    console.log("（API未透传 autoConfirmEnabled，依赖 DB default=true）");
  }

  console.log("=== 建3章(drafting) ===");
  const a = await j("POST", "/api/story/nodes", { projectId, title: "A章(正常)", type: "chapter", order: 1, status: "drafting", content: GOOD, wordCount: GOOD.length });
  const b = await j("POST", "/api/story/nodes", { projectId, title: "B章(正常)", type: "chapter", order: 2, status: "drafting", content: GOOD, wordCount: GOOD.length });
  const c = await j("POST", "/api/story/nodes", { projectId, title: "C章(低质)", type: "chapter", order: 3, status: "drafting", content: "短", wordCount: 1, qualityScore: 30 });
  if (a.status !== 200 && a.status !== 201) { console.log("建A失败", a); process.exit(1); }
  const aid = a.data.id, bid = b.data.id, cid = c.data.id;
  console.log("建章:", { aid, bid, cid });

  console.log("=== 自动确认扫描全书 ===");
  const ac = await j("POST", "/api/story/nodes/auto-confirm", { projectId });
  console.log("返回:", JSON.stringify(ac.data));

  console.log("=== 最终状态 ===");
  const fa = await j("GET", "/api/story/nodes/" + aid);
  const fb = await j("GET", "/api/story/nodes/" + bid);
  const fc = await j("GET", "/api/story/nodes/" + cid);
  const st = { a: fa.data.status, b: fb.data.status, c: fc.data.status };
  console.log("最终:", st);

  let ok = true;
  const confirmed = ac.data.confirmed.map((x) => x.id);
  const blocked = ac.data.blocked.map((x) => x.id);
  if (!confirmed.includes(aid) || !confirmed.includes(bid)) { console.log("✗ A/B 未放行"); ok = false; }
  if (!blocked.includes(cid)) { console.log("✗ C 未拦截"); ok = false; }
  if (st.a !== "confirmed" || st.b !== "confirmed") { console.log("✗ A/B 终态非confirmed"); ok = false; }
  if (st.c === "confirmed") { console.log("✗ C 被错误放行"); ok = false; }
  if (st.c !== "pending_confirm" && st.c !== "drafting") { console.log("✗ C 终态异常:", st.c); ok = false; }

  console.log(ok ? "VERIFY_PASS ✓" : "VERIFY_FAIL ✗");

  await j("DELETE", "/api/projects/" + projectId).catch(() => {});
  process.exit(ok ? 0 : 1);
})();
