#!/usr/bin/env node
/**
 * ARCH-7 · 颜色守卫（CI 视觉回归软门）
 *
 * 目的：扫描 src 下的 TS/TSX 源码，找出"任意十六进制色值"（如 `text-[#ff0000]` /
 * `bg-[#1a2b3c]` / `border-[#fff]`），提醒开发者改用 --nv-* 设计令牌，
 * 防止"今天修完观感、明天又写死一个红"的回归。
 *
 * 定位：本地单用户工具，CI 是可选增强；本脚本**非阻塞**——只报告、exit 0。
 * 若希望硬性拦截，可在 CI 把 `npm run lint:colors` 改为 `node scripts/lint-colors.mjs && exit 1`（按需）。
 *
 * 排除：generated/（Prisma 生成）、node_modules、.next，以及已注明的合法硬编码（如游戏节点强调色 cyan）。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

// 匹配 Tailwind 任意值里的十六进制色：bg-[#xxx] / text-[#xxx] / border-[#xxx] ...
const HEX_RE = /(?:text|bg|border|fill|stroke|from|to|via|shadow|ring|divide|outline|accent|caret|decoration|gradient)-\[#([0-9a-fA-F]{3,8})\]/g;
const SKIP_DIRS = new Set(["generated", "node_modules", ".next"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const lines = [];
let hits = 0;

for (const f of files) {
  const content = readFileSync(f, "utf8");
  const rel = relative(ROOT, f);
  const rows = content.split("\n");
  rows.forEach((row, i) => {
    let m;
    HEX_RE.lastIndex = 0;
    while ((m = HEX_RE.exec(row))) {
      hits++;
      lines.push(`  ${rel}:${i + 1}  ${m[0]}`);
    }
  });
}

if (hits === 0) {
  console.log("✅ 颜色守卫通过：未发现硬编码十六进制色值（src 下均走 --nv-* 令牌）。");
  process.exit(0);
}

console.log(`⚠️ 颜色守卫发现 ${hits} 处硬编码十六进制色值（建议改用 --nv-* 设计令牌）：`);
console.log(lines.join("\n"));
console.log("\n（此为软性提醒，不阻断构建；如需硬拦截请在 CI 改为 `exit 1`。）");
process.exit(0);
