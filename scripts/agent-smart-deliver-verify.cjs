// Round3 #518 验证：一键智能交付全书闭环
// 建项目→建3章(A/B优质 drafting, C低质qualityScore=30)→auto-confirm扫全书→断言放行/拦截→
// confirm 应 409(因C未确认)→改C为优质→auto-confirm再跑→C放行→confirm 整本交付→断言 confirmedAt + 自动放行率100%

const BASE = "http://localhost:3001";
const j = async (method, path, body) => {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};
const GOOD = "火星殖民基地的穹顶在晨光中泛起淡蓝。工程师林越推开气闸，呼吸面罩里传来氧流量稳定的轻响。她回头望向那片红色的荒原，想起三年前登陆时只剩七个人。如今地下城已容纳两万居民，水循环系统昼夜不息。农业舱的麦浪在人造阳光下起伏，孩子们在里面追逐。林越知道，真正的文明不靠飞船，靠这些琐碎的日常。";

(async () => {
  const p = await j("POST", "/api/projects", { name: "SMART_DELIVER_" + Date.now(), genre: ["测试"], synopsis: "验证" });
  const projectId = p.data.id;
  const a = await j("POST", "/api/story/nodes", { projectId, title: "A", type: "chapter", order: 1, status: "drafting", content: GOOD, wordCount: GOOD.length });
  const b = await j("POST", "/api/story/nodes", { projectId, title: "B", type: "chapter", order: 2, status: "drafting", content: GOOD, wordCount: GOOD.length });
  const c = await j("POST", "/api/story/nodes", { projectId, title: "C", type: "chapter", order: 3, status: "drafting", content: GOOD, wordCount: GOOD.length });
  const aid = a.data.id, bid = b.data.id, cid = c.data.id;

  // 建章路由不接收 qualityScore（仅 PUT 透传），用 PUT 置低分逼出拦截分支
  await j("PUT", "/api/story/nodes/" + cid, { qualityScore: 30 });
  const ac1 = await j("POST", "/api/story/nodes/auto-confirm", { projectId });
  console.log("首次扫描: confirmed=", ac1.data.confirmed.length, "blocked=", ac1.data.blocked.length);

  const cf1 = await j("POST", "/api/projects/" + projectId + "/confirm");
  console.log("首次整本交付:", cf1.status, cf1.data.error || "");

  // 改 C 为优质
  await j("PUT", "/api/story/nodes/" + cid, { qualityScore: 90 });
  const ac2 = await j("POST", "/api/story/nodes/auto-confirm", { projectId });
  console.log("二次扫描(C改优质): confirmed=", ac2.data.confirmed.length, "blocked=", ac2.data.blocked.length);

  const cf2 = await j("POST", "/api/projects/" + projectId + "/confirm");
  console.log("二次整本交付:", cf2.status, cf2.data.confirmedAt || "");

  const m = await j("GET", "/api/stats/monitor?projectId=" + projectId);
  const cs = m.data.confirmStats;
  console.log("confirmStats:", JSON.stringify(cs));

  let ok = true;
  if (!ac1.data.confirmed.map(x=>x.id).includes(aid) || !ac1.data.confirmed.map(x=>x.id).includes(bid)) { console.log("✗ A/B 未首发放行"); ok = false; }
  if (!ac1.data.blocked.map(x=>x.id).includes(cid)) { console.log("✗ C 未拦截"); ok = false; }
  if (cf1.status !== 409) { console.log("✗ 首次整本交付应 409(有未确认章)"); ok = false; }
  if (ac2.data.confirmed.map(x=>x.id).includes(cid) !== true) { console.log("✗ C 二次未放行"); ok = false; }
  if (cf2.status !== 200 || !cf2.data.confirmedAt) { console.log("✗ 二次整本交付未成功"); ok = false; }
  if (!cs || cs.autoRate !== 100) { console.log("✗ 自动放行率非 100%:", cs && cs.autoRate); ok = false; }

  console.log(ok ? "VERIFY_PASS ✓ （智能交付闭环 + 自动放行率100%）" : "VERIFY_FAIL ✗");
  await j("DELETE", "/api/projects/" + projectId).catch(() => {});
  process.exit(ok ? 0 : 1);
})();
