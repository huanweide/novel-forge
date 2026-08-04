/**
 * POST /api/import/parse
 *
 * AI 解析导入——人物提取 + 世界设定 + 文风。
 * 角色≥30个自动分块处理，每块独立调 Flash，杜绝 token 截断。
 * JSON 修复层——去尾逗号等 AI 常见语法错误。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getSettings, recordLlmCall } from "@/lib/llm";
import { countTokens } from "@/core/assembly/tokenizer";
import { THREE_CARD_BOUNDARIES } from "@/core/settings";

export const maxDuration = 300;

const CHUNK_SIZE = 30; // 每块最多30个角色（仅作分块触发参考）
const CHUNK_CHAR_BUDGET = 16000; // 单块文本字符预算：超过即强制分块，避免大长文单路超模型上下文（P1-3）
const CHUNK_OVERLAP = 300;       // 块间重叠字符，保留上下文连续性（P1-3）

// ─── JSON 修复 + 解析 ──────────────────────────────

/** 清洗 AI 常见 JSON 语法错误 */
function repairJSON(raw: string): string {
  let s = raw.trim();
  // BOM
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  // 去掉 markdown 代码块
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) s = md[1].trim();
  // 截取最外层花括号
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);

  // 去尾逗号：},] 和 ,] 和 ,}
  s = s.replace(/,(\s*[}\]])/g, "$1");
  // 去尾逗号在数组末尾：...]\n 之后多余的逗号
  // 修字符串内的未转义换行符（AI有时在字符串值里直接换行）
  // 注：这个比较激进，只在 JSON.parse 失败后才尝试

  return s;
}

function parseJSON(raw: string): Record<string, unknown> {
  // 第一轮：标准修复
  let s = repairJSON(raw);
  try { return JSON.parse(s) as Record<string, unknown>; } catch { /* */ }

  // 第二轮：更激进的修复——尝试补全截断的JSON
  // 如果JSON在中间被截断（maxTokens限制），补上闭合括号
  try {
    // 数花括号和方括号，补上缺失的闭合
    let braces = 0, brackets = 0;
    let inString = false, escape = false;
    for (const ch of s) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"' && !escape) { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') braces++;
      if (ch === '}') braces--;
      if (ch === '[') brackets++;
      if (ch === ']') brackets--;
    }
    // 补闭合
    while (brackets > 0) { s += ']'; brackets--; }
    while (braces > 0) { s += '}'; braces--; }
    // 如果数组未结束，补]
    if (s.endsWith(',')) s = s.slice(0, -1);

    return JSON.parse(s) as Record<string, unknown>;
  } catch { /* */ }

  throw new Error(`JSON parse fail: ${s.slice(0, 200)}`);
}

function normChar(c: Record<string, unknown>): Record<string, unknown> {
  const p = c.personality;
  const personality = (typeof p === "object" && p !== null && !Array.isArray(p)) ? p : { dominant: "", drive: "", contradiction: "", habits: [], socialMask: "" };
  const app = c.appearance;
  const appearance = (typeof app === "object" && app !== null && !Array.isArray(app)) ? app : {};
  const ds = c.dialogueStyle;
  const dialogueStyle = (typeof ds === "object" && ds !== null && !Array.isArray(ds)) ? ds : {};
  const timeline = Array.isArray(c.timeline) ? c.timeline.map((t: unknown) => {
    if (typeof t === "object" && t !== null) {
      const tt = t as Record<string, unknown>;
      return { age: tt.age ?? 0, event: String(tt.event || ""), era: String(tt.era || "") };
    }
    return { age: 0, event: "", era: "" };
  }) : [];
  return {
    name: String(c.name || ""), aliases: Array.isArray(c.aliases) ? c.aliases.filter((a: unknown) => typeof a === "string") : [],
    role: String(c.role || "supporting"), age: String(c.age || "未知"), gender: String(c.gender || "未知"),
    appearance, personality,
    background: typeof c.background === "string" ? c.background : (typeof c.background === "object" && c.background !== null ? JSON.stringify(c.background) : ""),
    abilities: Array.isArray(c.abilities) ? c.abilities.filter((a: unknown) => typeof a === "string") : [],
    hiddenMotives: Array.isArray(c.hiddenMotives) ? c.hiddenMotives.filter((a: unknown) => typeof a === "string") : [],
    relationships: Array.isArray(c.relationships) ? c.relationships : [],
    dialogueStyle, timeline, arcProgress: String(c.arcProgress || ""), currentStatus: String(c.currentStatus || "alive"),
    tags: Array.isArray(c.tags) ? c.tags.filter((t: unknown) => typeof t === "string") : ["📥导入"],
  };
}

function normLore(l: Record<string, unknown>): Record<string, unknown> {
  return { title: String(l.title || ""), category: String(l.category || "custom"), keys: Array.isArray(l.keys) ? l.keys.filter((k: unknown) => typeof k === "string") : [String(l.title || "")], content: String(l.content || ""), subFields: (typeof l.subFields === "object" && l.subFields !== null && !Array.isArray(l.subFields)) ? l.subFields : {} };
}

// ─── 角色边界扫描 ──────────────────────────────

/** 用正则找出文本中所有角色编号行的位置，返回 {startIndex, endIndex}[] */
function findCharBlocks(text: string): Array<{ start: number; end: number; headerLine: string }> {
  const NUM = [
    "\\d+", "[一二三四五六七八九十百]+", "第[一二三四五六七八九十百]+[位名个]?",
    "[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]", "[（(]\\d+[）)]",
  ].join("|");
  const HEADER_RE = new RegExp(`^\\s*(?:#{1,3}\\s*)?\\s*(${NUM})[.、．，)\\)\\s:：·\\-—]+\\s*(.+)$`, "gm");

  const blocks: Array<{ start: number; end: number; headerLine: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = HEADER_RE.exec(text)) !== null) {
    const name = match[2].trim().slice(0, 40);
    // 过滤明显不是人名的行
    if (name.length < 2 || /^(第|章|节|卷|部|篇)/.test(name)) continue;
    blocks.push({ start: match.index, end: match.index + match[0].length, headerLine: match[0] });
  }

  // 计算每个角色的文本范围（从这个编号行到下一个编号行之前）
  const ranges: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < blocks.length; i++) {
    const blockStart = blocks[i].start;
    const blockEnd = i + 1 < blocks.length ? blocks[i + 1].start : text.length;
    ranges.push({ start: blockStart, end: blockEnd });
  }
  return blocks;
}

/**
 * 按字符预算分块：无论是否有编号行，都尽量在段落边界（\n\n 或 \n）切分，
 * 并在块尾保留 CHUNK_OVERLAP 字符重叠，避免句子被切断、上下文断裂（P1-3）。
 * 解决原「只看编号行数」导致大段未编号长文单路全量发送超上下文的问题。
 */
function chunkByBudget(text: string, budget: number, overlap: number): string[] {
  if (text.length <= budget) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + budget, text.length);
    if (end < text.length) {
      // 回退到最近的段落边界，避免从句中切断
      const slice = text.slice(start, end);
      const dbl = slice.lastIndexOf("\n\n");
      const sgl = slice.lastIndexOf("\n");
      const cut = dbl > budget * 0.5 ? dbl : sgl > budget * 0.5 ? sgl : budget;
      end = start + cut;
    }
    chunks.push(text.slice(start, end));
    start = Math.max(end - overlap, start + 1); // 重叠推进，保证前进避免死循环
  }
  return chunks;
}

/**
 * P1-4 修复：世界/文风提取长文覆盖。
 * 分块模式下原实现只喂 `text.slice(0, 16000)`，>16k 字的后段设定永不进 LLM；
 * 且原「单点中段窗口」对 >32k 长文仍存在大块中段盲区（永不采样），仅标 partial 难以察觉。
 * 改为：头 16k + 中段按长度均匀分 1~4 段采样（相邻重叠）+ 尾 14k，
 * 覆盖长文中段，避免设定静默缺失。仍标注 worldCoverage="sampled" 供前端提示「非全文」。
 */
function buildLoreSample(text: string): string {
  const HEAD = CHUNK_CHAR_BUDGET; // 16000：头部窗口
  const SEG = 14000;              // 单段采样窗口
  const MID_CAP = 4;              // 中段最多采 4 段，控制总量在模型上下文内
  if (text.length <= HEAD) return text;

  const parts: string[] = [text.slice(0, HEAD)]; // 头
  const tailStart = Math.max(HEAD, text.length - SEG);
  const midStart = HEAD;
  const midEnd = tailStart;
  const midLen = midEnd - midStart;
  // 中段按均匀分段采样（保留相邻重叠），覆盖原单点窗口遗漏的长文中段
  const numMid = Math.min(MID_CAP, Math.max(1, Math.floor(midLen / SEG)));
  for (let i = 1; i <= numMid; i++) {
    const center = midStart + (midLen * i) / (numMid + 1);
    const start = Math.max(midStart, Math.min(Math.round(center - SEG / 2), midEnd - SEG));
    parts.push(text.slice(start, start + SEG));
  }
  parts.push(text.slice(tailStart)); // 尾
  return parts.join("\n\n【…分段采样，仅抽取各段设定，非全文…】\n\n");
}

// ─── API 调用 ──────────────────────────────────

interface CallConfig { baseURL: string; apiKey: string; model: string; label: string; }

// ─── P1-1：callFlash 加固 —— 原实现无超时无重试，上游挂死则 SSE 永久卡到平台强杀 ───
const CALLFLASH_TIMEOUT_MS = 60_000; // 单次 Flash 调用最长等待（毫秒），防止上游挂死
const CALLFLASH_MAX_RETRIES = 2;     // 最多额外重试 2 次（总计 ≤3 次）

async function callFlash(cfg: CallConfig, systemPrompt: string, userPrompt: string, maxTokens: number): Promise<{ raw: string; error?: string; sec: number }> {
  if (!cfg.apiKey || cfg.apiKey.length < 10) {
    return { raw: "", error: `${cfg.label}: API Key 未配置`, sec: 0 };
  }

  const url = cfg.baseURL.endsWith("/v1") ? `${cfg.baseURL}/chat/completions` : `${cfg.baseURL}/v1/chat/completions`;
  let lastErr = "";

  // P1-2：失败调用也记账（与 client.ts FAIL_ROLE_PREFIX 口径一致），避免成本看板盲区/成功率失真
  const recordFail = () => {
    recordLlmCall({ model: cfg.model, role: "fail:import_parse", promptTokens: 0, completionTokens: 0, totalTokens: 0, baseURL: cfg.baseURL });
  };

  for (let attempt = 0; attempt <= CALLFLASH_MAX_RETRIES; attempt++) {
    const t0 = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALLFLASH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.1, max_tokens: maxTokens, stream: false }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const sec = ((Date.now() - t0) / 1000).toFixed(1);

      if (!res.ok) {
        const eb = await res.text().catch(() => "");
        lastErr = `${cfg.label} HTTP ${res.status}: ${eb.slice(0, 200)}`;
        // 4xx 鉴权/配置错误不可重试，直接失败；5xx/429 进入重试
        if (res.status >= 400 && res.status < 500) { recordFail(); return { raw: "", error: lastErr, sec: parseFloat(sec) }; }
        if (attempt < CALLFLASH_MAX_RETRIES) continue;
        recordFail();
        return { raw: "", error: lastErr, sec: parseFloat(sec) };
      }

      const data = await res.json().catch(() => null);
      const raw = data?.choices?.[0]?.message?.content || "";
      // F2：监控记账优先用供应商真实 usage（prompt/completion tokens），缺失才退回 tokenizer 估算，
      // 与 import/commit mergeOneBatch 的真实 usage 口径统一，避免中文分词估算偏差导致成本失真。
      const usage = (data as any)?.usage;
      const promptTokens = usage?.prompt_tokens ?? usage?.promptTokens ?? countTokens(systemPrompt + "\n" + userPrompt);
      const completionTokens = usage?.completion_tokens ?? usage?.completionTokens ?? countTokens(raw);
      recordLlmCall({ model: cfg.model, role: "import_parse", promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, baseURL: cfg.baseURL });
      if (!raw || raw.trim().length < 20) return { raw: "", error: `${cfg.label} 返回空内容`, sec: parseFloat(sec) };
      return { raw, sec: parseFloat(sec) };
    } catch (e) {
      clearTimeout(timer);
      const isAbort = e instanceof Error && e.name === "AbortError";
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      lastErr = `${cfg.label} ${isAbort ? `超时(${CALLFLASH_TIMEOUT_MS / 1000}s)` : (e instanceof Error ? e.message : String(e))}`.slice(0, 200);
      if (attempt < CALLFLASH_MAX_RETRIES) continue; // 网络错误/超时重试
      recordFail();
      return { raw: "", error: lastErr, sec: parseFloat(sec) as any };
    }
  }
  recordFail();
  return { raw: "", error: lastErr || `${cfg.label} 重试耗尽`, sec: 0 };
}

// ═══════════════════════════════════════════════
// POST
// ═══════════════════════════════════════════════

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }
  const { projectId, rawText, volumeMode, importMode: userMode, charactersOnly } = body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let taskId: string | undefined;
      const send = (data: Record<string, unknown>) => {
        if (taskId) data.taskId = taskId;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        // 进度同步到任务表（fire-and-forget，不阻塞 SSE 流）
        if (taskId && typeof data.pct === "number") {
          void prisma.importTask.update({ where: { id: taskId }, data: { progress: data.pct as number, status: data.type === "error" ? "failed" : "parsing" } }).catch(() => {});
        }
      };

      try {
        if (!projectId || !rawText) { send({ type: "error", message: "缺少 projectId 或 rawText" }); controller.close(); return; }
        const text = (rawText as string).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        if (text.length < 30) { send({ type: "error", message: "文本太短" }); controller.close(); return; }

        // 建导入任务记录（异步化：断线后可凭 taskId 轮询恢复）
        try {
          const t = await prisma.importTask.create({
            data: { projectId: projectId as string, importMode: (userMode as string) || "settings", status: "parsing", progress: 1, rawTextLen: text.length },
          });
          taskId = t.id;
        } catch { /* 任务表写入失败不阻断主流程 */ }

        send({ type: "progress", stage: "init", message: "连接数据库...", pct: 1 });
        const project = await prisma.project.findUnique({ where: { id: projectId as string } });
        if (!project) { send({ type: "error", message: "项目不存在" }); controller.close(); return; }

        const importMode = (userMode as string) || "settings";
        const pName = project.name;
        const pGenre = project.genre;
        const isCharOnly = charactersOnly === true;

        const settings = await getSettings();
        const dsKey = settings.apiKey || process.env.LLM_API_KEY || "";
        const { model, baseUrl } = settings;
        const dsConfigA: CallConfig = { baseURL: baseUrl, apiKey: dsKey, model, label: "LLM" };
        const dsConfigB: CallConfig = { baseURL: baseUrl, apiKey: dsKey, model, label: "LLM" };

        send({ type: "progress", stage: "ready", message: `${text.length.toLocaleString()} 字 · ${isCharOnly ? "仅人物卡" : "人物+世界"}`, pct: 3 });

        const t0 = Date.now();

        // ── 正则预扫描角色数量 ──
        const charBlocks = findCharBlocks(text);
        const estimatedCount = charBlocks.length;

        send({ type: "progress", stage: "scan", message: `🔍 正则预扫描: ~${estimatedCount}个角色编号行`, pct: 4 });

        // ── 分块决策 ──
        // 触发条件：编号角色 > CHUNK_SIZE，或全文长度超过单块字符预算（大长文/未编号长文强制分块，P1-3）
        const needsChunking = estimatedCount > CHUNK_SIZE || text.length > CHUNK_CHAR_BUDGET;

        // ── 人物提取Prompt模板 ──
        const charSystemPrompt = "角色提取器。编号→人名→全字段提取：外貌、性格、能力、关系、对话风格，每个字段都填满。只输出JSON。";
        const buildCharPrompt = (chunkText: string, chunkInfo = "") => `你是角色提取器。找编号 → 抓人名 → 从原文提取全字段信息。禁止留空。${chunkInfo}

【识别角色行——宽泛匹配所有编号格式】
Markdown标题也认——# / ## / ### 是格式标记，跳过它看后面的编号。
纯文本编号：阿拉伯"1.""2、""3 ""1）""(2)""①"、中文数字"一、""二、""三 "、中文序数"第一位 ""第二，"

【提取规则——每个字段都要从原文找信息填满】
name = 编号后的人名核心部分，去掉——及之后的修饰
background = 从编号行开始到下一个编号行之前，全部内容原封不动搬进去（原文照抄不缩写）
role = 从以下选：protagonist/antagonist/supporting/mentor/love_interest/background，默认supporting

【以下字段——从background和其他原文描述中提取，禁止填"未知"或留空】
- age: 从原文找年龄线索，没有则根据角色定位推断（主角一般16-25岁，师傅一般40+）
- gender: 从名字/代词/描述推断
- appearance: 从外貌描写提取 hair/eyes/height/build/features/attire，没描写则根据角色定位推断
- personality: 从行为/对话/描述中提炼 dominant(主导性格)/drive(核心驱动)/contradiction(内在矛盾)/habits(习惯)/socialMask(社交面具)
- abilities: 从能力/技能描述中逐条提取，格式"能力名·等级·一句话描述"
- relationships: 从关系描述中提取 targetName/relation/dynamic
- dialogueStyle: 从对话示例中提炼 description/examples/vocabulary/speechPatterns
- hiddenMotives: 从背景中推断隐藏动机
- timeline: 从背景中提取年龄+事件节点
- aliases: 从别名/称号中提取
- tags: 固定["📥导入"]

【作品信息】
名称：${pName} · 类型：${pGenre.join("、")}

【文本】
${chunkText}

{"characters":[{"name":"","aliases":[],"role":"supporting","age":"","gender":"","appearance":{"hair":"","eyes":"","height":"","build":"","features":"","attire":""},"personality":{"dominant":"","drive":"","contradiction":"","habits":[],"socialMask":""},"background":"","abilities":[],"hiddenMotives":[],"relationships":[],"dialogueStyle":{"description":"","examples":[],"vocabulary":[],"speechPatterns":[]},"timeline":[],"arcProgress":"","currentStatus":"alive","tags":["📥导入"]}]}`;

        // ── 人物提取 ──
        let chars: Record<string, unknown>[] = [];
        let failedChunks = 0;
        let totalChunks = 1;
        let worldFailed = false; // P1：B路世界设定/文风提取失败独立标记

        if (needsChunking && !isCharOnly) {
          // 分块模式：按字符预算分块（保留重叠），不再纯按编号行数（P1-3）
          const chunks = chunkByBudget(text, CHUNK_CHAR_BUDGET, CHUNK_OVERLAP);
          totalChunks = chunks.length;
          send({ type: "progress", stage: "chunk", message: `📦 分${chunks.length}块处理 · 每块≤${CHUNK_SIZE}个角色`, pct: 5 });
          await new Promise(r => setTimeout(r, 100));

          let totalChars = 0;
          // F4：限流并发解析各块（4 路 Promise.all 池），压短总耗时避免超 maxDuration(300s) 被强杀。
          // 逐块进度按完成顺序回报（不丢块、不重复）；最终按块序聚合，保证角色/词条完整。
          const CONCURRENCY = 4;
          const chunkResults: Record<number, Record<string, unknown>[]> = {};
          let doneCount = 0;
          let nextIdx = 0;
          const workers: Promise<void>[] = [];
          const workerCount = Math.min(CONCURRENCY, chunks.length);
          for (let w = 0; w < workerCount; w++) {
            workers.push((async () => {
              while (nextIdx < chunks.length) {
                const ci = nextIdx++;
                const chunkInfo = `[第${ci + 1}/${chunks.length}块]`;
                send({ type: "progress", stage: `chunk-${ci}`, message: `📡 第${ci + 1}/${chunks.length}块分析中...`, pct: 5 + Math.round((ci / chunks.length) * 75) });

                const res = await callFlash(dsConfigA, charSystemPrompt, buildCharPrompt(chunks[ci], chunkInfo), 32768);
                if (res.error) {
                  failedChunks++;
                  send({ type: "progress", stage: `chunk-${ci}-err`, message: `⚠️ 第${ci + 1}块失败: ${res.error}`, pct: 5 + Math.round(((doneCount + 1) / chunks.length) * 75) });
                } else {
                  try {
                    const p = parseJSON(res.raw);
                    const pc = Array.isArray(p.characters) ? p.characters.map(normChar).filter(c => c.name) : [];
                    chunkResults[ci] = pc;
                    totalChars += pc.length;
                    send({ type: "progress", stage: `chunk-${ci}-ok`, message: `✅ 第${ci + 1}块完成 · ${pc.length}角色`, pct: 5 + Math.round(((doneCount + 1) / chunks.length) * 75) });
                  } catch (e) {
                    failedChunks++;
                    send({ type: "progress", stage: `chunk-${ci}-err`, message: `⚠️ 第${ci + 1}块JSON解析失败`, pct: 5 + Math.round(((doneCount + 1) / chunks.length) * 75) });
                  }
                }
                doneCount++;
              }
            })());
          }
          await Promise.all(workers);
          // 按块序聚合，确保不丢块、不重复
          for (let ci = 0; ci < chunks.length; ci++) {
            if (chunkResults[ci]) chars.push(...chunkResults[ci]);
          }
          send({ type: "progress", stage: "chunk-done", message: `✅ 分块完成 · ${totalChars}角色 · ${chunks.length}块`, pct: 85 });
        } else {
          // 单次调用模式（角色少或仅人物卡模式）
          send({ type: "progress", stage: "launch", message: isCharOnly ? `👤 仅人物卡 · Flash单路` : `A路 Flash→人物 | B路 Flash→世界`, pct: 5 });
          await new Promise(r => setTimeout(r, 100));
          send({ type: "progress", stage: "calling", message: `📡 调用DeepSeek Flash...`, pct: 10 });

          const resA = await callFlash(dsConfigA, charSystemPrompt, buildCharPrompt(text), 32768);
          send({ type: "progress", stage: "api-done", message: `📥 API返回 · 解析中...`, pct: 85 });

          if (resA.error) {
            failedChunks++;
            send({ type: "progress", stage: "path-a-done", message: `⚠️ 人物提取失败: ${resA.error}`, pct: 60 });
          } else {
            try {
              const p = parseJSON(resA.raw);
              const pc = Array.isArray(p.characters) ? p.characters : [];
              chars = pc.map(normChar).filter(c => c.name);
              send({ type: "progress", stage: "path-a-done", message: `✅ 人物提取完成 · ${chars.length}角色 · ${resA.sec}s`, pct: 60 });
            } catch (e) {
              failedChunks++;
              send({ type: "progress", stage: "path-a-done", message: `⚠️ JSON解析失败: ${String(e).slice(0, 100)}`, pct: 60 });
            }
          }
        }

        // ── 世界设定+文风（仅非分块+非仅人物卡模式）──
        let lore: Record<string, unknown>[] = [];
        let style: Record<string, unknown> = {};

        // B路：世界设定+文风——分块模式也执行（独立调用，不跳过）
        if (!isCharOnly) {
          // 分块模式：长文按头/中/尾采样覆盖后段设定；非分块模式用完整文本（P1 修复）
          const loreText = needsChunking ? buildLoreSample(text) : text;
          const chunkNote = needsChunking ? "(长文已按头/中/尾采样抽取)" : "";

          const lorePrompt = `从设定文本中提取世界设定词条和写作风格。${chunkNote}

${THREE_CARD_BOUNDARIES}

【作品信息】
名称：${pName} · 类型：${pGenre.join("、")}

【设定文本】
${loreText}

【输出格式——纯JSON，无markdown】
{"lore":[{"title":"","category":"geography|faction|magic_system|history|culture|creature|item|custom","keys":[],"content":""}],"style":{"povType":"third_person_limited","narrativeDistance":"medium","avgSentenceLength":25,"shortSentenceRatio":0.3,"longSentenceRatio":0.15,"dialogueRatio":0.35,"descriptionRatio":0.25,"actionRatio":0.25,"innerThoughtRatio":0.15,"tonalMarkers":{},"lexicalFeatures":{},"styleDescription":"","sampleText":""}}`;

          const resB = await callFlash(
            dsConfigB,
            "世界设定+文风提取器。严格遵循三卡分界标准。只输出JSON。",
            lorePrompt,
            32768, // 无上限提取——输出拉满
          );

          if (resB.error) {
            worldFailed = true;
            send({ type: "progress", stage: "path-b-done", message: `⚠️ 世界提取失败: ${resB.error}`, pct: 90 });
          } else {
            try {
              const p = parseJSON(resB.raw);
              lore = (Array.isArray(p.lore) ? p.lore : []).map(normLore).filter(l => l.title);
              if (typeof p.style === "object" && p.style !== null) style = p.style as Record<string, unknown>;
              send({ type: "progress", stage: "path-b-done", message: `✅ 世界提取完成 · ${lore.length}词条${chunkNote} · ${resB.sec}s`, pct: 90 });
            } catch (e) {
              worldFailed = true;
              send({ type: "progress", stage: "path-b-done", message: `⚠️ 世界JSON解析失败`, pct: 90 });
            }
          }
        }

        // ── 去重 ──
        const charMap = new Map<string, Record<string, unknown>>();
        for (const c of chars) { const k = String(c.name || "").toLowerCase().trim(); if (k && !charMap.has(k)) charMap.set(k, c); }
        const loreMap = new Map<string, Record<string, unknown>>();
        for (const l of lore) { const k = String(l.title || "").toLowerCase().trim(); if (k && !loreMap.has(k)) loreMap.set(k, l); }

        const finalChars = Array.from(charMap.values());
        const finalLore = Array.from(loreMap.values());
        const totalSec = ((Date.now() - t0) / 1000).toFixed(1);

        send({ type: "progress", stage: "done-pre", message: `${finalChars.length}角色 ${finalLore.length}词条 · ${totalSec}s`, pct: 99 });

        // P1：闭环失败标记——worldFailed 时即使 failedChunks===0 也至少 'partial'
        const anyFailed = failedChunks > 0 || worldFailed;
        const importStatus = anyFailed ? (failedChunks >= totalChunks && !worldFailed ? "failed" : "partial") : "completed";
        send({
          type: "done",
          status: importStatus,
          failedChunks,
          detectedChapters: [],
          extractedCharacters: finalChars,
          extractedLoreEntries: finalLore,
          extractedStyle: style,
          meta: { importMode, chapterCount: 0, characterCount: finalChars.length, loreCount: finalLore.length, inputTokens: countTokens(text), rawCharCount: text.length, modelUsed: model, extractTimeSeconds: parseFloat(totalSec), totalTimeSeconds: parseFloat(totalSec), estimatedTotal: estimatedCount, failedChunks, worldFailed, chunked: needsChunking, worldCoverage: needsChunking ? "sampled" : "full" },
        });
        if (taskId) {
          void prisma.importTask.update({ where: { id: taskId }, data: { status: importStatus, progress: 100, result: { characters: finalChars, lore: finalLore, style, failedChunks, worldFailed } as any } }).catch(() => {});
        }

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg });
        if (taskId) void prisma.importTask.update({ where: { id: taskId }, data: { status: "failed", error: msg } }).catch(() => {});
      } finally { controller.close(); }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
}
