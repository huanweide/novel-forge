// server.js —— 编排器（主代理）+ SSE 实时推送 + 静态服务
// 主代理并行调度 agents.js 里的 5 个 Worker Agent，把每个的状态/进度/日志实时推给前端。

const http = require('http');
const path = require('path');
const fs = require('fs');
const { AGENTS } = require('./agents');

const PORT = 8787;
const clients = [];   // SSE 连接
let running = false;

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch {}
  }
}

function runOrchestration() {
  if (running) { broadcast('run:busy', {}); return; }
  running = true;
  broadcast('run:start', {
    agents: AGENTS.map(a => ({ id: a.id, name: a.name, icon: a.icon, desc: a.desc }))
  });

  let done = 0;
  Promise.all(AGENTS.map(async (spec) => {
    broadcast('agent:start', { id: spec.id, name: spec.name, icon: spec.icon, desc: spec.desc });
    let progress = 0;
    const log = (line) => broadcast('agent:log', { id: spec.id, line });
    const setProgress = (p) => { progress = Math.max(0, Math.min(100, p | 0)); broadcast('agent:progress', { id: spec.id, progress }); };
    try {
      const result = await spec.run({ log, setProgress });
      broadcast('agent:done', { id: spec.id, progress: 100, result });
    } catch (e) {
      broadcast('agent:error', { id: spec.id, error: e.message });
    }
    done++;
    broadcast('run:progress', { done, total: AGENTS.length });
  })).then(() => {
    running = false;
    broadcast('run:end', {});
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  // SSE 实时流
  if (url === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 3000\n\n');
    clients.push(res);
    broadcast('hello', { ts: Date.now() });
    req.on('close', () => { const i = clients.indexOf(res); if (i >= 0) clients.splice(i, 1); });
    return;
  }

  // 触发一次编排运行
  if (url === '/api/run' || url === '/api/run/') {
    runOrchestration();
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // 静态文件
  const rel = url === '/' ? '/public/index.html' : url;
  const full = path.join(__dirname, rel);
  if (!full.startsWith(__dirname)) { res.writeHead(403); res.end(); return; }
  fs.readFile(full, (err, content) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'text/plain; charset=utf-8' });
    res.end(content);
  });
});

server.listen(PORT, () => console.log(`Agent Forge 控制台已启动: http://localhost:${PORT}`));
