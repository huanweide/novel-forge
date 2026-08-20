// 测试准备：用本地解析器解析 fixture → 输出 outline JSON（供 explore/create 使用）
import { parseSettingsLocal } from "../src/core/settings/local-parser";
import { readFileSync, writeFileSync } from "node:fs";

const text = readFileSync("scripts/fixtures/fragmented-settings.txt", "utf8");
const r = parseSettingsLocal(text);
const outline = {
  characters: r.characters,
  loreEntries: r.loreEntries,
  plotOutline: r.synopsis.slice(0, 2000),
  toneKeywords: r.toneKeywords,
  styleProfile: r.styleProfile,
};
writeFileSync("scripts/fixtures/outline.json", JSON.stringify(outline, null, 2), "utf8");
console.log(`outline.json 生成：角色 ${outline.characters.length}，世界卡 ${outline.loreEntries.length}，基调 ${outline.toneKeywords.length}，风格卡 ${!!outline.styleProfile}`);
