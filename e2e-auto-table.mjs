// E2E：验证「无结构化表格时自动建表」闭环（不应用表格模板预设）
const BASE = "http://localhost:3001";

async function j(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function postSSE(path, body, log) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const events = [];
  let tokenCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let dataStr = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data:")) dataStr += (dataStr ? "\n" : "") + line.slice(5).trim();
      }
      if (!dataStr) continue;
      let obj;
      try { obj = JSON.parse(dataStr); } catch { obj = { raw: dataStr }; }
      const ev = { event: obj.type || "message", data: obj };
      if (ev.event === "token") { tokenCount++; continue; }
      events.push(ev);
      if (log) log(ev);
    }
  }
  return { events, tokenCount };
}

function line(t) { process.stdout.write(t + "\n"); }

async function main() {
  const r = await j("POST", "/api/projects", {
    name: "E2E-无表自动建表v35",
    genre: ["古风", "悬疑"],
    synopsis: "少年沈砚在宗门试炼中觉醒血脉，踏上追寻身世与守护同门的道路。",
    toneKeywords: ["热血", "成长", "羁绊"],
    targetWordCount: 60000,
  });
  const pid = r.data.id;
  line(`[1] 创建项目 -> ${pid} (HTTP ${r.status})`);

  const styles = await j("GET", "/api/presets?type=style");
  const progs = await j("GET", "/api/presets?type=story_progression");
  line(`[2] 预设读取: style=${styles.data.length} story_progression=${progs.data.length}（本场景故意不应用 table_template）`);
  const style = styles.data.find((s) => s.title.includes("古风")) || styles.data[0];
  const prog = progs.data[0];
  line(`    文风: ${style.title} | 剧情: ${prog.title}`);

  // ── 关键：只应用 style + story_progression，绝不应用 table_template ──
  const a1 = await j("POST", `/api/presets/${style.id}/apply`, { projectId: pid });
  const a2 = await j("POST", `/api/presets/${prog.id}/apply`, { projectId: pid });
  line(`[3] 文风应用 -> ${JSON.stringify(a1.data)}`);
  line(`    剧情应用 -> ${JSON.stringify(a2.data)}`);
  line(`    ⚠️ 未应用任何表格模板（模拟"零配置直接写"场景）`);

  await new Promise((r) => setTimeout(r, 1500));

  const sl = await j("POST", "/api/storylines", {
    projectId: pid,
    title: "主线·血脉觉醒与守护",
    description: "沈砚觉醒血脉，从试炼弟子成长为守护同门的核心。",
    type: "main",
  });
  line(`[4] 创建剧情线 -> ${sl.data.id} status=${sl.data.status}`);

  const cfg = await j("PUT", `/api/projects/${pid}/config`, {
    autoFillEnabled: true, fillFrequency: 1, skipLatestChapter: false, contextKeepChapters: 4,
  });
  line(`[5] 配置 -> ${JSON.stringify(cfg.data)}`);

  const out = await j("POST", "/api/generate/outline", { projectId: pid, chapterCount: 2 });
  line(`[6] 大纲 -> ${out.data.totalGenerated} 章`);
  out.data.chapters?.forEach((c, i) => line(`     第${i + 1}章: ${c.title}`));
  const put = await j("PUT", "/api/generate/outline", { projectId: pid, chapters: out.data.chapters });
  const nodes = put.data.nodes || [];
  line(`[6b] 写入节点 ${nodes.length} 个`);

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    line(`\n[7.${i + 1}] 生成《${n.title}》...`);
    const { events, tokenCount } = await postSSE(
      "/api/generate/write",
      { projectId: pid, nodeId: n.id, targetWordCount: 500 },
      (ev) => {
        const d = ev.data || {};
        if (ev.event === "chapter_plan") line(`     📐 剧情预设规划: ${JSON.stringify(d.plan || {}).slice(0, 120)}`);
        else if (ev.event === "babylore_recall") line(`     🧠 召回 ${Array.isArray(d.items) ? d.items.length : "?"} 条`);
        else if (ev.event === "babylore_fill") {
          if (d.skipped) line(`     📝 填表跳过: ${d.reason}`);
          else if (d.operations !== undefined) line(`     📝 填表: ops=${d.operations} applied=${d.applied}${d.error ? " err=" + d.error : ""}`);
          else line(`     📝 填表: ${JSON.stringify(d).slice(0, 140)}`);
        } else if (ev.event === "done") line(`     ✅ done babylore=${JSON.stringify(d.babylore || {}).slice(0, 140)}`);
        else if (ev.event === "error") line(`     ❌ error: ${JSON.stringify(d).slice(0, 200)}`);
      },
    );
    line(`     (本段 token ${tokenCount}, 关键事件 ${events.length})`);
  }

  line(`\n[8] 最终核对 pid=${pid}`);
  const tbls = await j("GET", `/api/projects/${pid}/lore-tables`);
  const arr = tbls.data || [];
  if (arr.length === 0) {
    line(`    ❌ 无结构化表格——自动建表失败！`);
  } else {
    let rowTotal = 0;
    arr.forEach((t) => { const rows = t.rows || []; rowTotal += rows.length; line(`    ✅ 自动建表成功 表《${t.name}》(key=${t.key}) 行数=${rows.length}`); });
    line(`    结构化表格总行数=${rowTotal}`);
  }
  line(`\n[完成] pid=${pid}`);
}
main().catch((e) => { line("FATAL: " + (e.stack || e.message)); process.exit(1); });
