// 验证色子（抽卡）采用结果持久化写入剧情线 chapterBindings（element:"preset"）
const BASE = "http://localhost:3001";
const PROJECT = "f1cae288-d3cb-46e1-803a-7c057bc055fe"; // 已存在的测试项目
const TEST_NODE = "test-node-dice";

const get = async (p) => (await fetch(BASE + p)).json();
const put = async (p, body) =>
  fetch(BASE + p, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const pj = await get(`/api/projects/${PROJECT}`);
const sl = (pj.storylines || []).find((s) => s.status === "active" || s.type === "main") || pj.storylines?.[0];
if (!sl) { console.log("❌ 该项目无 storyline，跳过"); process.exit(0); }
const slId = sl.id;
const original = sl.chapterBindings || [];
console.log("剧情线:", slId);
console.log("原 chapterBindings:", JSON.stringify(original));

// 模拟 handleDrawSelect 采用色子后的回写：追加 preset 条目（同 node 重采用先去重）
const preset = { element: "preset", chapterId: TEST_NODE, note: "🎴测试抽卡路线｜核心冲突X｜🎭紧张" };
const next = [...original.filter((e) => !(e.element === "preset" && e.chapterId === TEST_NODE)), preset];
const putRes = await put(`/api/storylines/${slId}`, { chapterBindings: next });
console.log("PUT /api/storylines/[id] 状态:", putRes.status);

// 回读确认（经项目接口，含 storylines.chapterBindings）
const afterPj = await get(`/api/projects/${PROJECT}`);
const afterSl = afterPj.storylines.find((s) => s.id === slId);
const afterBindings = afterSl.chapterBindings || [];
console.log("回读 chapterBindings:", JSON.stringify(afterBindings));
const ok = afterBindings.some((e) => e.element === "preset" && e.chapterId === TEST_NODE && String(e.note).includes("测试抽卡路线"));
console.log(ok ? "✅ 色子 preset 已持久化到剧情线 chapterBindings" : "❌ 未写入剧情线");

// 去重验证：再采用一次同 node，应更新而非堆叠
const next2 = [...afterBindings.filter((e) => !(e.element === "preset" && e.chapterId === TEST_NODE)), { ...preset, note: "🎴测试抽卡路线v2｜核心冲突Y｜🎭轻松" }];
await put(`/api/storylines/${slId}`, { chapterBindings: next2 });
const dupPj = await get(`/api/projects/${PROJECT}`);
const dupSl = dupPj.storylines.find((s) => s.id === slId);
const presetCount = (dupSl.chapterBindings || []).filter((e) => e.element === "preset" && e.chapterId === TEST_NODE).length;
console.log(`去重后 preset(node=${TEST_NODE}) 条数: ${presetCount}（应为 1）`);
console.log(presetCount === 1 ? "✅ 同 node 重采用已去重" : "❌ 出现堆叠");

// 还原：移除测试 preset，恢复原 chapterBindings
await put(`/api/storylines/${slId}`, { chapterBindings: original });
const restoredPj = await get(`/api/projects/${PROJECT}`);
const restoredSl = restoredPj.storylines.find((s) => s.id === slId);
const restoredHasTest = (restoredSl.chapterBindings || []).some((e) => e.chapterId === TEST_NODE);
console.log(restoredHasTest ? "❌ 还原失败" : "✅ 已还原（测试数据清除）");
