// API 巡检：交叉核对「前端引用的 /api/... 静态路由」与「后端真实路由」。
// 仅当「前端 fetch/import 了一个后端不存在的静态路由路径」时才报真断链。
//
// 反误报规则（R2-011）：
//   ① 忽略模板字符串/变量插值（捕获路径内含 ${ 的）；
//   ② 忽略文档性字符串文件（changelog-data.ts 等按文件路径白名单跳过）；
//   ③ 后端路由以 .api-routes.txt 清单 + src/app/api 文件系统动态发现 取并集，
//      消除「清单滞后」类误报（清单漏列但实际存在的路由）。

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// 规范化：将动态段 [xxx] / [...slug] 归一为 [id]，去掉 /api/ 前缀与结尾斜杠
function normUrl(u) {
  return u
    .replace(/\[.*?\]/g, "[id]")
    .replace(/\/$/, "")
    .replace(/^\/api\//, "");
}

// 文档性字符串文件白名单：这些文件中的 /api/... 是变更说明/文案，不是真实调用
const DOC_FILE_WHITELIST = [/changelog-data\.ts$/];

// 后端路由来源 1：静态清单（人工/CI 维护）
function loadManifestRoutes() {
  const f = path.join(ROOT, "scripts", ".api-routes.txt");
  if (!fs.existsSync(f)) return new Set();
  return new Set(
    fs
      .readFileSync(f, "utf8")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(normUrl)
  );
}

// 后端路由来源 2：从 src/app/api 目录动态发现真实 route.ts(x) 文件
// 直接消除「清单滞后」——只要后端真有该文件，前端引用就不算断链。
function discoverFsRoutes() {
  const routes = new Set();
  const apiDir = path.join(ROOT, "src", "app", "api");
  if (!fs.existsSync(apiDir)) return routes;
  function walk(dir, prefix) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // 路由组 (group) 不影响 URL，跳过该层括号；其余目录名即路径段
        const seg = e.name.replace(/^\(.*\)$/, "");
        if (seg === "") continue; // 整个段是路由组
        walk(full, prefix ? `${prefix}/${seg}` : seg);
      } else if (e.name === "route.ts" || e.name === "route.tsx") {
        if (prefix) routes.add(normUrl(prefix));
      }
    }
  }
  walk(apiDir, "");
  return routes;
}

// 真实后端路由 = 清单 ∪ 文件系统发现
const routes = new Set([...loadManifestRoutes(), ...discoverFsRoutes()]);

// 前端引用提取
const refs = new Map();
let ignoredTemplate = 0; // ① 模板插值忽略数
let ignoredDoc = 0; // ② 文档性字符串忽略数

function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (f === "node_modules" || f === ".next" || f === "generated") continue;
      walk(p);
    } else if (/\.(ts|tsx)$/.test(f)) {
      const rel = p.replace(/\\/g, "/").replace(/^.*novel-forge\//, "");
      if (DOC_FILE_WHITELIST.some((re) => re.test(rel))) {
        // ② 文档性字符串文件整体跳过（其内部 /api/ 文案不计入调用）
        ignoredDoc++;
        continue;
      }
      const c = fs.readFileSync(p, "utf8");
      const m = c.matchAll(/[`"'](\/api\/[^`"'?}]+)/g);
      for (const x of m) {
        const k = normUrl(x[1]);
        if (!k) continue;
        // ① 变量插值（/api/${...} 等模板字面量截断）忽略
        if (k.includes("${")) {
          ignoredTemplate++;
          continue;
        }
        const list = refs.get(k) || [];
        list.push(rel);
        refs.set(k, list);
      }
    }
  }
}
walk("src");

// 交叉核对：仅当后端路由（清单∪文件系统）中完全不存在才报真断链，
// 含动态段匹配（段数相同且前缀/动态段一致）。
function routeExists(k) {
  if (routes.has(k)) return true;
  const ks = k.split("/");
  for (const r of routes) {
    const rs = r.split("/");
    if (rs.length !== ks.length) continue;
    let ok = true;
    for (let i = 0; i < rs.length; i++) {
      if (rs[i] === ks[i]) continue;
      if (rs[i].startsWith("[") && ks[i] !== "") continue; // 动态段兼容
      ok = false;
      break;
    }
    if (ok) return true;
  }
  return false;
}

let missing = 0;
const misses = [];
for (const [k, v] of refs) {
  if (routeExists(k)) continue;
  missing++;
  misses.push({ k, v: v.slice(0, 2) });
}

console.log("TOTAL_REFS", refs.size, "REAL_BROKEN_LINKS", missing);
console.log("IGNORED_TEMPLATE_INTERPOLATION", ignoredTemplate, "IGNORED_DOC_STRINGS", ignoredDoc);
for (const { k, v } of misses) console.log("BROKEN", k, "<=", v.join(","));
