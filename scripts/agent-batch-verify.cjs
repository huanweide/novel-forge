// 批量确认本卷 端到端验证：放行正常章 + 拦截低分章 + 跳过非待确认章
const BASE = "http://localhost:3001";

const GOOD = "沈烛推开控制室的门，冷风裹着金属味扑面而来。她望向窗外，火星的橙色弧线正缓缓沉入地平线。『燃料舱的压力读数正常吗？』副手林越递来一杯温水。沈烛接过，指节在杯壁上停顿了一瞬。『还不够，』她轻声说，『我们要在窗口关闭前把第三枚胶囊推入转移轨道。』走廊尽头传来脚步声，工程师们陆续就位。屏幕上，地球的坐标早已被标注为一枚暗淡的蓝点。她想起七年前那个雨夜，父亲把一枚旧怀表塞进她手心，说有些东西值得赌上全部去守护。如今怀表仍在口袋里，而她守护的已是一整颗文明的记忆。";
const BAD = "我觉得今天天气很好。我觉得她今天心情很好。我觉得这本书很有趣。我觉得那个地方很漂亮。我觉得他的话很真诚。我觉得这件事很麻烦。我觉得未来很迷茫。我觉得自己很没用。我觉得世界很喧闹。我觉得安静很珍贵。我觉得时间过得很慢。我觉得命运很不公平。";

async function j(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

(async () => {
  // 1) 建沙盒项目
  const p = await j("POST", "/api/projects", {
    name: "批量确认验证沙盒",
    description: "Round2 批量确认本卷端到端验证",
    genre: ["测试"],
    targetWordCount: 3000,
    synopsis: "验证批量确认端点",
    toneKeywords: ["测试"],
  });
  const projectId = p.data.id;
  console.log("项目:", projectId, "status", p.status);

  // 2) 建 3 章
  const mk = async (title, order) => {
    const r = await j("POST", "/api/story/nodes", {
      projectId, parentId: null, type: "chapter", title, order, status: "outline_only",
    });
    return r.data.id;
  };
  const a = await mk("A章(正常)", 1);
  const b = await mk("B章(正常)", 2);
  const c = await mk("C章(低质)", 3);
  console.log("建章:", { a, b, c });

  // 3) PUT 写正文并置 drafting。
  //    A/B 留 qualityScore=null → 触发后端实时 analyzer（预期高分放行）；
  //    C 直接置 qualityScore=30（模拟流水线已分析出低分章）→ 触发拦截分支。
  await j("PUT", `/api/story/nodes/${a}`, { content: GOOD, status: "drafting", wordCount: GOOD.length, title: "A章(正常)", order: 1 });
  await j("PUT", `/api/story/nodes/${b}`, { content: GOOD, status: "drafting", wordCount: GOOD.length, title: "B章(正常)", order: 2 });
  await j("PUT", `/api/story/nodes/${c}`, { content: BAD, status: "drafting", wordCount: BAD.length, title: "C章(低质)", order: 3, qualityScore: 30 });

  // 4) submit → pending_confirm（前置 drafting）
  const sA = await j("PATCH", `/api/story/nodes/${a}`, { action: "submit" });
  const sB = await j("PATCH", `/api/story/nodes/${b}`, { action: "submit" });
  const sC = await j("PATCH", `/api/story/nodes/${c}`, { action: "submit" });
  console.log("submit:", { a: sA.data.status, b: sB.data.status, c: sC.data.status });

  // 5) 批量确认（仅 A,B 应放行；C 低分应拦截）
  const batch = await j("POST", "/api/story/nodes/batch-confirm", { projectId, nodeIds: [a, b, c] });
  console.log("批量确认返回:", JSON.stringify(batch.data, null, 0));

  // 6) 核验每章最终状态
  const fa = await j("GET", `/api/story/nodes/${a}`);
  const fb = await j("GET", `/api/story/nodes/${b}`);
  const fc = await j("GET", `/api/story/nodes/${c}`);
  console.log("最终状态:", { a: fa.data.status, b: fb.data.status, c: fc.data.status });

  // 7) 断言
  const pass = batch.data.ok && batch.data.summary.confirmed === 2 && batch.data.summary.blocked === 1 && fa.data.status === "confirmed" && fb.data.status === "confirmed" && fc.data.status === "pending_confirm";
  console.log(pass ? "VERIFY_PASS ✓" : "VERIFY_FAIL ✗");

  // 8) 清理沙盒项目（避免污染）
  await j("DELETE", `/api/projects/${projectId}`).catch(() => {});
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error("ERR", e.message || e); process.exit(1); });
