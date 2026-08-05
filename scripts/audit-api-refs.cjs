const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const routes = new Set(
  fs
    .readFileSync(path.join(ROOT, "scripts", ".api-routes.txt"), "utf8")
    .split("\n")
    .filter(Boolean)
);

// 规范化：将动态段 [xxx] 归一为 [id]
function normUrl(u) {
  return u.replace(/\[.*?\]/g, "[id]").replace(/\/$/, "").replace(/^\/api\//, "");
}

const refs = new Map();
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (f === "node_modules" || f === ".next" || f === "generated") continue;
      walk(p);
    } else if (/\.(ts|tsx)$/.test(f)) {
      const c = fs.readFileSync(p, "utf8");
      const m = c.matchAll(/[`"'](\/api\/[^`"'?}]+)/g);
      for (const x of m) {
        const k = normUrl(x[1]);
        if (!k) continue;
        const list = refs.get(k) || [];
        list.push(p.replace(/\\/g, "/").replace(/^.*novel-forge\//, ""));
        refs.set(k, list);
      }
    }
  }
}
walk("src");

let missing = 0;
const misses = [];
for (const [k, v] of refs) {
  if (routes.has(k)) continue;
  // 动态段匹配：段数相同且前缀匹配
  let hit = false;
  for (const r of routes) {
    const rs = r.split("/");
    const ks = k.split("/");
    if (rs.length !== ks.length) continue;
    let ok = true;
    for (let i = 0; i < rs.length; i++) {
      if (rs[i] === ks[i]) continue;
      if (rs[i].startsWith("[") && ks[i] !== "") continue;
      ok = false;
      break;
    }
    if (ok) { hit = true; break; }
  }
  if (!hit) {
    missing++;
    misses.push({ k, v: v.slice(0, 2) });
  }
}
console.log("TOTAL_REFS", refs.size, "MISSING", missing);
for (const { k, v } of misses) console.log("MISS", k, "<=", v.join(","));
