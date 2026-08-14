// agents.js —— 5 个真实干活的 Worker Agent 定义
// 每个 agent 都有 run({ log, setProgress }) 接口，log 流式输出，setProgress 0~100。
// 它们真的在分析 novel-forge 项目，不是假的。

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = 'C:/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge';
const SRC = path.join(PROJECT_ROOT, 'src');

// 递归遍历目录，收集指定后缀文件
function walk(dir, exts, exclude) {
  const results = [];
  function rec(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (exclude.includes(e.name)) continue;
        rec(full);
      } else if (exts.includes(path.extname(e.name))) {
        results.push(full);
      }
    }
  }
  rec(dir);
  return results;
}

function countMatches(content, re) {
  let m, c = 0;
  re.lastIndex = 0;
  while ((m = re.exec(content)) !== null) c++;
  return c;
}

const AGENTS = [
  {
    id: 'typescript',
    name: '类型门禁 Agent',
    icon: '🔍',
    desc: '运行 tsc 类型检查，拦截编译错误',
    async run({ log, setProgress }) {
      log('启动 tsc --noEmit 类型检查（最多 90 秒）...');
      const child = spawn('npx', ['tsc', '--noEmit'], { cwd: PROJECT_ROOT, shell: true, windowsHide: true });
      let out = '';
      const onData = d => {
        out += d;
        String(d).split('\n').forEach(l => { const t = l.trim(); if (t) log(t); });
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      const closed = new Promise(r => child.on('close', r));
      const timeout = new Promise(r => setTimeout(() => { try { child.kill(); } catch {} r('TIMEOUT'); }, 90000));
      setProgress(10);
      const code = await Promise.race([closed, timeout]);
      setProgress(100);
      if (code === 'TIMEOUT') return { ok: null, summary: '类型检查超时（>90s），跳过', detail: out.slice(0, 1500) };
      if (code === 0) return { ok: true, summary: '类型检查通过，0 个错误 ✅' };
      const errLines = out.split('\n').filter(l => l.includes('error TS')).length;
      return { ok: false, summary: `发现 ${errLines} 个类型错误 ❌`, detail: out.slice(0, 2000) };
    }
  },
  {
    id: 'struct',
    name: '架构体检 Agent',
    icon: '🏗️',
    desc: '扫描项目结构，统计源码规模',
    async run({ log, setProgress }) {
      log('扫描 src 目录结构...');
      const files = walk(SRC, ['.ts', '.tsx'], ['node_modules', '.next', 'out']);
      const total = files.length || 1;
      let loc = 0;
      const big = [];
      files.forEach((f, i) => {
        try {
          const c = fs.readFileSync(f, 'utf8');
          const lines = c.split('\n').length;
          loc += lines;
          big.push({ f: path.relative(SRC, f), lines });
        } catch {}
        setProgress(Math.round(((i + 1) / total) * 100));
        if (i % 30 === 0) log(`已扫描 ${i + 1}/${total} 个文件`);
      });
      big.sort((a, b) => b.lines - a.lines);
      const top = big.slice(0, 6).map(b => `  • ${b.f} —— ${b.lines} 行`).join('\n');
      return { ok: true, summary: `共 ${files.length} 个源文件，${loc.toLocaleString()} 行代码`, detail: '体积最大的文件:\n' + top };
    }
  },
  {
    id: 'consistency',
    name: '版本一致性 Agent',
    icon: '🔗',
    desc: '校验 package.json 与 changelog 版本一致',
    async run({ log, setProgress }) {
      log('读取 package.json 与 changelog-data.ts...');
      let pkgVersion = '未知';
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
        pkgVersion = pkg.version;
      } catch (e) { log('package.json 读取失败: ' + e.message); }
      setProgress(40);
      let latest = '未找到';
      try {
        const cl = fs.readFileSync(path.join(SRC, 'lib', 'changelog-data.ts'), 'utf8');
        const m = cl.match(/LATEST_VERSION\s*=\s*["']([^"']+)["']/);
        if (m) latest = m[1];
      } catch (e) { log('changelog-data.ts 读取失败: ' + e.message); }
      setProgress(80);
      const match = pkgVersion && latest !== '未找到' && latest.includes(pkgVersion);
      setProgress(100);
      return {
        ok: match,
        summary: match ? `版本一致: ${latest} ✅` : `不一致: pkg=${pkgVersion}, changelog=${latest} ❌`,
        detail: `package.json version: ${pkgVersion}\nchangelog-data LATEST_VERSION: ${latest}`
      };
    }
  },
  {
    id: 'quality',
    name: '代码质量 Agent',
    icon: '🧹',
    desc: '扫描 any 类型、console.log、TODO 残留',
    async run({ log, setProgress }) {
      log('扫描代码异味（any / console / TODO）...');
      const files = walk(SRC, ['.ts', '.tsx'], ['node_modules', '.next', 'out']);
      const total = files.length || 1;
      const stats = { any: 0, console: 0, todo: 0 };
      files.forEach((f, i) => {
        try {
          const c = fs.readFileSync(f, 'utf8');
          stats.any += countMatches(c, /:\s*any\b/g) + countMatches(c, /\bas\s+any\b/g);
          stats.console += countMatches(c, /console\.(log|warn|error|debug)/g);
          stats.todo += countMatches(c, /\b(TODO|FIXME|XXX)\b/g);
        } catch {}
        setProgress(Math.round(((i + 1) / total) * 100));
      });
      log(`统计完成: any 类型 ×${stats.any}, console ×${stats.console}, TODO/FIXME ×${stats.todo}`);
      setProgress(100);
      const ok = stats.any === 0 && stats.todo === 0;
      return {
        ok,
        summary: ok ? '无明显代码异味 ✅' : `发现 any×${stats.any}, TODO×${stats.todo}`,
        detail: JSON.stringify(stats, null, 2)
      };
    }
  },
  {
    id: 'secret',
    name: '安全扫描 Agent',
    icon: '🔐',
    desc: '检测硬编码密钥与敏感信息泄露',
    async run({ log, setProgress }) {
      log('扫描敏感信息泄露...');
      const files = walk(SRC, ['.ts', '.tsx'], ['node_modules', '.next', 'out']);
      const total = files.length || 1;
      const findings = [];
      const patterns = [
        /sk-[A-Za-z0-9]{10,}/g,
        /apiKey\s*[:=]\s*["'][^"']+["']/g,
        /secret\s*[:=]\s*["'][^"']+["']/gi
      ];
      files.forEach((f, i) => {
        try {
          const c = fs.readFileSync(f, 'utf8');
          patterns.forEach(p => {
            const ms = c.match(p);
            if (ms) ms.forEach(x => findings.push(`${path.relative(SRC, f)}: ${x.slice(0, 40)}`));
          });
        } catch {}
        setProgress(Math.round(((i + 1) / total) * 100));
      });
      setProgress(100);
      if (findings.length === 0) return { ok: true, summary: '未发现硬编码密钥 ✅' };
      return { ok: false, summary: `发现 ${findings.length} 处疑似敏感信息 ⚠️`, detail: findings.slice(0, 25).join('\n') };
    }
  }
];

module.exports = { PROJECT_ROOT, SRC, AGENTS };
