// 探讨模式一条龙端到端测试（真实 dev server 3001）
// 运行：node scripts/e2e-explore-test.mjs
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";

const BASE = "http://localhost:3001";
const outline = JSON.parse(readFileSync("scripts/fixtures/outline.json", "utf8"));

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => {
  if (ok) { pass++; console.log(`  ✅ ${name} ${extra}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

// ── 1. explore/create：建项目 + outline 三卡落库 ──
console.log("\n【1】POST /api/explore/create（探讨模式建库 + 大纲落库）");
let projectId = "";
try {
  const res = await fetch(`${BASE}/api/explore/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: {
        novelName: "龙陨之地·端到端测试",
        genre: "玄幻",
        direction: "废脉少年逆天改命的史诗故事",
        stylePreference: "热血燃向",
        audience: "男频·青年向",
        wordCount: "100万字",
        protagonistName: "林惊蛰",
      },
      adopted: [],
      mode: "direct",
      outline,
    }),
  });
  const data = await res.json();
  check(`HTTP ${res.status}`, res.ok || res.status === 201, data.message || "");
  if (data.projectId) {
    projectId = data.projectId;
    check("返回 projectId", !!projectId, projectId.slice(0, 8) + "...");
  }
} catch (e) {
  check("create 请求", false, e.message);
}

// ── 2. 数据库直查：验证角色卡/世界卡/风格卡/大纲落库（API 只读接口为 POST 语义，直查最可靠）──
if (projectId) {
  console.log("\n【2】数据库直查（验证三卡 + 大纲落库）");
  const db = new Database("data/novelforge.db", { readonly: true });
  const p = db.prepare("SELECT * FROM Project WHERE id=?").get(projectId);
  check("项目名", p?.name === "龙陨之地·端到端测试", p?.name);
  check("synopsis 非空", !!p?.synopsis && p.synopsis.length > 50, `(${p?.synopsis?.length || 0}字)`);
  check("toneKeywords", Array.isArray(JSON.parse(p?.toneKeywords || "[]")) && (JSON.parse(p?.toneKeywords || "[]")).length >= 4, `(${JSON.parse(p?.toneKeywords || "[]").length}个)`);

  const charList = db.prepare("SELECT * FROM CharacterCard WHERE projectId=?").all(projectId);
  check("角色卡 ≥10", charList.length >= 10, `(${charList.length}张)`);
  const lin = charList.find((c) => c.name === "林惊蛰");
  check("林惊蛰在库", !!lin, lin ? `role=${lin.role}` : "");
  check("林惊蛰有背景", !!lin?.background && lin.background.length > 50, lin ? `(${lin.background?.length || 0}字)` : "");
  const linPers = lin ? JSON.parse(lin.personality || "[]") : [];
  check("林惊蛰有性格", Array.isArray(linPers) && linPers.length > 0, "");

  const loreList = db.prepare("SELECT * FROM LorebookEntry WHERE projectId=?").all(projectId);
  check("世界卡 ≥10", loreList.length >= 10, `(${loreList.length}张)`);
  const titles = loreList.map((l) => l.title);
  check("龙陨之地在库", titles.includes("龙陨之地"));
  check("青冥剑诀在库", titles.includes("青冥剑诀"));
  check("焚天令在库", titles.includes("焚天令"));

  const sc = db.prepare("SELECT * FROM StyleCard WHERE projectId=?").all(projectId);
  check("风格卡存在", sc.length > 0, sc[0] ? `描述:${(sc[0].styleDescription || "").slice(0, 30)}` : "");
  db.close();
} else {
  console.log("  （跳过：无 projectId）");
}

// ── 3. parse-settings：无 key 降级本地解析（写小说界面「整理」入口）──
if (projectId) {
  console.log("\n【3】POST /api/parse-settings mode=all（无 Key 降级整理）");
  const res = await fetch(`${BASE}/api/parse-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      rawText: readFileSync("scripts/fixtures/fragmented-settings.txt", "utf8"),
      mode: "all",
      autoCreate: false,
    }),
  });
  const data = await res.json();
  check(`HTTP ${res.status}（非500即通）`, res.status !== 500, `status=${res.status}`);
  const parsed = data.parsed || data;
  const chars = parsed.characters || [];
  const lore = parsed.loreEntries || [];
  check("解析出角色", chars.length >= 10, `(${chars.length})`);
  check("解析出世界卡", lore.length >= 10, `(${lore.length})`);
  check("林惊蛰 role=protagonist", chars.find((c) => c.name === "林惊蛰")?.role === "protagonist");
} else {
  console.log("  （跳过：无 projectId）");
}

// ── 4. adopt-batch：批量采纳 ──
if (projectId) {
  console.log("\n【4】POST /api/explore/adopt-batch（批量采纳直写）");
  const res = await fetch(`${BASE}/api/explore/adopt-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      items: [
        { title: "青冥宗", content: "天下第一剑宗，立于云巅九千阶之上。镇派绝学青冥剑诀。", step: "worldview", category: "faction" },
        { title: "龙陨封印", content: "以白帝神魂为锁，林惊蛰所得龙骨正是那把钥匙。", step: "worldview", category: "law" },
      ],
    }),
  });
  const data = await res.json();
  check(`HTTP ${res.status}`, res.ok, JSON.stringify(data).slice(0, 120));
  check("返回 characters/loreEntries 计数", "loreEntries" in data || "created" in data, "");
} else {
  console.log("  （跳过：无 projectId）");
}

// ── 5. chat：无 key 时的表现（应可读报错而非裸 500/无限卡）──
console.log("\n【5】POST /api/explore/chat（无 Key 行为）");
try {
  const res = await fetch(`${BASE}/api/explore/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "你好", step: "opening", genre: "玄幻", history: [] }),
  });
  const data = await res.json();
  check(`HTTP ${res.status}（应非 500）`, res.status !== 500, `status=${res.status}`);
  if (data.error) console.log(`      错误信息：${data.error.slice(0, 100)}`);
  else check("返回 reply", !!data.reply, data.reply?.slice(0, 40) || "");
} catch (e) {
  check("chat 请求", false, e.message);
}

// ── 汇总 ──
console.log(`\n════════ 汇总：${pass} 通过 / ${fail} 失败 ════════`);
console.log(`测试项目 ID：${projectId}`);
process.exit(fail > 0 ? 1 : 0);
