// IMP-001 复导出堆叠损坏（P1）真机验证
// 复现路径：建章→写正文 C0→开游戏→game/action×1→game/end 导出 C1
//          → 再次 resetGame→game/action×1→game/end 导出 C2
// 断言：
//   C1.startsWith(C0) === true 且 C1 中 C0 不重复（仅一次前缀）
//   C2 不以 C1 开头（不堆叠）
//   C2.startsWith(C0) === true（仍以作者原正文前置）
//
// 用法：node scripts/agent-game-reexport-stack-verify.cjs  （需 dev 服务在 http://127.0.0.1:3001 运行）

const BASE = process.env.BASE || "http://127.0.0.1:3001";

async function post(p, body) {
  const r = await fetch(BASE + p, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

async function del(p) {
  const r = await fetch(BASE + p, { method: "DELETE" });
  return r.ok;
}

// 驱动一个游戏回合（SSE），直到 game_done
async function gameAction(sessionId, selectedOption) {
  const res = await fetch(BASE + "/api/game/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, actionType: "option", selectedOption }),
  });
  if (!res.ok) throw new Error(`action http ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const ev = JSON.parse(line.slice(6));
      if (ev.type === "error") throw new Error("game error: " + ev.error);
      if (ev.type === "game_done") return ev;
    }
  }
  throw new Error("stream ended without game_done");
}

function assert(cond, msg) {
  if (!cond) {
    console.error("  ✗ FAIL: " + msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log("  ✓ PASS: " + msg);
}

// 判断 s 中是否包含超过一次 target 作为前缀（即堆叠）
function prefixOccurrences(s, target) {
  if (!target) return 0;
  let count = 0;
  let from = 0;
  while ((from = s.indexOf(target, from)) !== -1) {
    count++;
    from += target.length;
  }
  return count;
}

async function run() {
  const stamp = Date.now();
  const C0 =
    `【作者原写作正文-${stamp}】\n` +
    `这是一段用于验证 IMP-001 复导出堆叠修复的原创正文。\n` +
    `主角推开门，冷风裹着铁锈味扑面而来，走廊尽头的灯忽明忽暗。`;

  console.log("[1] 创建测试项目 ...");
  const proj = await post("/api/projects", {
    name: `复导出堆叠验证 ${stamp}`,
    synopsis: "AI 智能体真机验证 IMP-001 复导出堆叠损坏修复。",
    genre: ["科幻"],
  });
  const projectId = proj.id;
  console.log("    projectId =", projectId);

  console.log("[2] 创建章节节点并写入原正文 C0 ...");
  const node = await post("/api/story/nodes", {
    projectId,
    title: "复导出测试章",
    order: 1,
    status: "outline_only",
    outline: "主角潜入废弃空间站。【章尾悬念】：主角发现舱门后有微光闪烁。",
    content: C0,
  });
  const nodeId = node.id;
  console.log("    C0.length =", C0.length);

  console.log("[3] 首次开游戏 start（拍原正文快照）...");
  const start1 = await post("/api/game/start", { projectId, nodeId });
  assert(!!start1.sessionId, "game/start 返回 sessionId");

  console.log("[4] 首次游戏 action ×1 ...");
  await gameAction(start1.sessionId, 1);

  console.log("[5] 首次 game/end 导出 → C1 ...");
  const end1 = await post("/api/game/end", { sessionId: start1.sessionId });
  const nodeDetail1 = await get("/api/story/nodes/" + nodeId);
  const C1 = nodeDetail1.content;
  console.log("    C1.length =", C1.length);
  console.log("    C1.startsWith(C0) =", C1.startsWith(C0));
  assert(C1.startsWith(C0), "C1 以作者原正文 C0 前置（IMP-001 核心目标保留）");
  assert(
    prefixOccurrences(C1, C0) === 1,
    "C1 中 C0 仅出现一次（无重复前置）"
  );

  console.log("[6] 再次 resetGame（二次开局，应复用同一快照）...");
  const start2 = await post("/api/game/start", { projectId, nodeId });
  assert(!!start2.sessionId, "二次 game/start 返回 sessionId");

  console.log("[7] 二次游戏 action ×1 ...");
  await gameAction(start2.sessionId, 1);

  console.log("[8] 二次 game/end 导出 → C2 ...");
  const end2 = await post("/api/game/end", { sessionId: start2.sessionId });
  const nodeDetail2 = await get("/api/story/nodes/" + nodeId);
  const C2 = nodeDetail2.content;
  console.log("    C2.length =", C2.length);
  console.log("    C2.startsWith(C1) =", C2.startsWith(C1));
  console.log("    C2.startsWith(C0) =", C2.startsWith(C0));
  assert(!C2.startsWith(C1), "C2 不以 C1 开头（修复：不再把上一次导出全量当成原正文前置堆叠）");
  assert(C2.startsWith(C0), "C2 仍以作者原正文 C0 前置");
  assert(prefixOccurrences(C2, C0) === 1, "C2 中 C0 仅出现一次（无重复前置）");

  console.log("[9] 清理：删除测试项目 ...");
  await del("/api/projects/" + projectId);

  console.log("\n✅ IMP-001 复导出堆叠修复真机验证全部通过");
  console.log(`   摘要：C0.length=${C0.length}，C1.length=${C1.length}，C2.length=${C2.length}`);
  console.log(`   assertions: C1.startsWith(C0)=true, C1 仅有1次C0前缀, C2.startsWith(C1)=false, C2.startsWith(C0)=true`);
}

run().catch((e) => {
  console.error("\n❌ 验证失败:", e.message);
  process.exit(1);
});
