// 本地解析器测试 harness：跑解析、计时、按答案键评分召回率。
// 运行：node_modules/.bin/tsx scripts/test-local-parser.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseSettingsLocal } from "../src/core/settings/local-parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(__dirname, "fixtures", "fragmented-settings.txt"), "utf8");
const key = JSON.parse(readFileSync(join(__dirname, "fixtures", "answer-key.json"), "utf8"));

const t0 = performance.now();
const result = parseSettingsLocal(text);
const t1 = performance.now();
const ms = +(t1 - t0).toFixed(1);

// ── 评分 ──
const charNames = result.characters.map((c) => c.name);
const loreTitles = result.loreEntries.map((l) => l.title);

const charHit = key.characters.filter((n: string) => charNames.includes(n));
const charMiss = key.characters.filter((n: string) => !charNames.includes(n));
const factionHit = key.factions.filter((n: string) => loreTitles.includes(n));
const factionMiss = key.factions.filter((n: string) => !loreTitles.includes(n));
// 世界卡总召回（含地理/功法/历史/器物/规则/种族等非势力类）
const loreHit = (key.lore || key.factions).filter((n: string) => loreTitles.includes(n));
const loreMiss = (key.lore || key.factions).filter((n: string) => !loreTitles.includes(n));

// 关系匹配：双向 + 类型兼容
const REL_EQUIV: Record<string, string[]> = {
  师徒: ["师徒", "师父", "徒弟"],
  师父: ["师父", "师徒", "徒弟", "弟子"],
  徒弟: ["徒弟", "师徒", "师父", "弟子"],
  弟子: ["弟子", "师徒", "师父", "徒弟"],
  宿敌: ["宿敌", "死敌", "对头"],
  恋人: ["恋人", "爱人", "夫妻"],
  夫妻: ["夫妻", "恋人", "爱人"],
  挚友: ["挚友", "知己", "盟友", "朋友"],
  宿命之敌: ["宿敌", "死敌"],
};
function relMatches(a: string, b: string, type: string): boolean {
  const charA = result.characters.find((c) => c.name === a);
  const charB = result.characters.find((c) => c.name === b);
  const accept = REL_EQUIV[type] || [type];
  const check = (c: typeof charA, other: string) =>
    !!c && c.relations.some((r) => r.target === other && accept.some((t) => r.relation.includes(t)));
  return check(charA, b) || check(charB, a);
}
const relHit = key.relations.filter((r: any) => relMatches(r.a, r.b, r.type));
const relMiss = key.relations.filter((r: any) => !relMatches(r.a, r.b, r.type));

const pct = (n: number, d: number) => (d === 0 ? 100 : Math.round((n / d) * 100));
const charRecall = pct(charHit.length, key.characters.length);
const factionRecall = pct(factionHit.length, key.factions.length);
const loreRecall = pct(loreHit.length, (key.lore || key.factions).length);
const relRecall = pct(relHit.length, key.relations.length);

// ── 输出报告 ──
console.log("═".repeat(60));
console.log(`本地解析器测试报告`);
console.log("═".repeat(60));
console.log(`输入字数：${text.length}`);
console.log(`解析耗时：${ms} ms  （≈ ${Math.round((text.length / Math.max(ms, 1)) * 1000)} 字/秒）`);
console.log("");
console.log(`提取结果：角色 ${result.characters.length} 张 | 世界卡 ${result.loreEntries.length} 张 | 关系 ${result.characters.reduce((s, c) => s + c.relations.length, 0)} 条 | 基调 ${result.toneKeywords.length} | 有风格卡 ${!!result.styleProfile}`);
console.log("");
console.log(`【召回率】角色 ${charRecall}% (${charHit.length}/${key.characters.length}) | 势力 ${factionRecall}% (${factionHit.length}/${key.factions.length}) | 世界卡 ${loreRecall}% (${loreHit.length}/${(key.lore || key.factions).length}) | 关系 ${relRecall}% (${relHit.length}/${key.relations.length})`);
console.log("");
if (charMiss.length) console.log(`✗ 漏检角色：${charMiss.join("、")}`);
if (factionMiss.length) console.log(`✗ 漏检势力：${factionMiss.join("、")}`);
if (loreMiss.length) console.log(`✗ 漏检世界卡：${loreMiss.join("、")}`);
if (relMiss.length) console.log(`✗ 漏检关系：${relMiss.map((r: any) => `${r.a}-${r.type}-${r.b}`).join("，")}`);
console.log("");
console.log(`【提取出的角色名】${charNames.join("、")}`);
console.log(`【提取出的世界卡】${loreTitles.join("、")}`);
console.log("");
console.log("【样例·林惊蛰】");
const lin = result.characters.find((c) => c.name === "林惊蛰");
if (lin) {
  console.log(`  性别=${lin.gender} 年龄=${lin.age} 角色=${lin.role}`);
  console.log(`  外貌=${lin.appearance.hair || "(空)"}`);
  console.log(`  性格=${lin.personality.join("/") || "(空)"}`);
  console.log(`  关系=${lin.relations.map((r) => `${r.target}(${r.relation})`).join("，") || "(空)"}`);
  console.log(`  背景前 80 字：${(lin.background || "").slice(0, 80)}`);
}
console.log("");
console.log(`【基调】${result.toneKeywords.join("、") || "(空)"}`);
console.log(`【总纲前 80 字】${(result.synopsis || "").slice(0, 80) || "(空)"}`);
console.log("═".repeat(60));
