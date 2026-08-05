// 马斯克 Round1 遗留边界 #519 真机验证：游戏导出轻确认闭环
// 主路径：autoConfirm 默认开启 → 游戏导出节点 status=confirmed + reviewLogs 含 auto-confirm + qualityScore 回写
// 边界：切 autoConfirmEnabled=false → 游戏导出节点 status=drafting（与正式章节确认流程统一）
//
// 用法：node scripts/musk-game-light-confirm-verify.cjs   （需 dev 服务在 http://127.0.0.1:3001 运行）

const { execSync } = require("child_process");
const path = require("path");

const BASE = process.env.BASE || "http://127.0.0.1:3001";
const ROOT = path.resolve(__dirname, "..");

const prismaCmd = path.join(ROOT, "node_modules", ".bin", "prisma.cmd");
function dbExec(sql) {
  // Windows 下 execSync 默认 cmd.exe：需用绝对路径 + .cmd 包装（正斜杠 / 在 cmd 中不被识别为路径分隔符）
  execSync(`"${prismaCmd}" db execute --stdin`, { input: sql, cwd: ROOT, stdio: "pipe" });
}

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

async function del(p) {
  const r = await fetch(BASE + p, { method: "DELETE" });
  return r.ok;
}

async function get(p) {
  const r = await fetch(BASE + p);
  const j = await r.json();
  if (!r.ok) throw new Error(`GET ${p} ${r.status}`);
  return j;
}

// 驱动一个游戏回合（SSE），直到 game_done 或 error
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

async function run() {
  const stamp = Date.now();
  console.log("[1] 创建测试项目 ...");
  const proj = await post("/api/projects", {
    name: `游戏轻确认验证 ${stamp}`,
    synopsis: "马斯克智能体真机验证游戏导出轻确认闭环。",
    genre: ["科幻"],
  });
  const projectId = proj.id;
  console.log("    projectId =", projectId);

  console.log("[2] 创建测试章节节点（含章尾悬念钩子）...");
  const node = await post("/api/story/nodes", {
    projectId,
    title: "游戏测试章",
    order: 1,
    status: "outline_only",
    outline: "主角潜入废弃空间站。【章尾悬念】：主角发现舱门后有微光闪烁。",
  });
  const nodeId = node.id;

  console.log("[3] 游戏 start ...");
  const start = await post("/api/game/start", { projectId, nodeId });
  assert(!!start.sessionId, "game/start 返回 sessionId");

  console.log("[4] 游戏 action ×2（SSE）...");
  await gameAction(start.sessionId, 1);
  await gameAction(start.sessionId, 1);

  console.log("[5] 游戏 end（主路径：autoConfirm 默认开启）...");
  const end1 = await post("/api/game/end", { sessionId: start.sessionId });
  console.log("    end 返回:", JSON.stringify({
    status: end1.status,
    autoConfirmed: end1.autoConfirmed,
    qualityScore: end1.qualityScore,
    totalWords: end1.totalWords,
  }));
  assert(end1.status === "confirmed", "主路径：导出节点 status=confirmed");
  assert(end1.autoConfirmed === true, "主路径：autoConfirmed=true");

  console.log("[6] 节点详情断言 reviewLogs + qualityScore ...");
  const detail = await get("/api/story/nodes/" + nodeId);
  assert(
    Array.isArray(detail.reviewLogs) &&
      detail.reviewLogs.some((l) => l.action === "auto-confirm"),
    "reviewLogs 含 auto-confirm 动作标记（自动填表已触发）"
  );
  assert(detail.qualityScore != null, "qualityScore 已回写（看板可见）");

  console.log("[7] 边界：切 autoConfirmEnabled=false ...");
  dbExec(`UPDATE "Project" SET "autoConfirmEnabled" = false WHERE id = '${projectId}';`);

  console.log("[8] 新节点 + 新游戏 + end（边界：关闭智能审阅）...");
  const node2 = await post("/api/story/nodes", {
    projectId,
    title: "游戏测试章2",
    order: 2,
    status: "outline_only",
    outline: "续章：微光背后是退役宇航员。",
  });
  const start2 = await post("/api/game/start", { projectId, nodeId: node2.id });
  await gameAction(start2.sessionId, 1);
  await gameAction(start2.sessionId, 1);
  const end2 = await post("/api/game/end", { sessionId: start2.sessionId });
  console.log("    end2 返回:", JSON.stringify({
    status: end2.status,
    autoConfirmed: end2.autoConfirmed,
    qualityScore: end2.qualityScore,
  }));
  assert(end2.status === "drafting", "边界：关闭智能审阅时导出节点 status=drafting");
  assert(end2.autoConfirmed === false, "边界：autoConfirmed=false");

  console.log("[9] 清理：软删测试项目 ...");
  await del("/api/projects/" + projectId);

  console.log("\n✅ 游戏导出轻确认 #519 真机闭环全部通过");
}

run().catch((e) => {
  console.error("\n❌ 验证失败:", e.message);
  process.exit(1);
});
