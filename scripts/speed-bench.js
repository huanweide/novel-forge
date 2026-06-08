/**
 * Flash 速度对比测试
 *
 * 同 prompt，同参数，对比：
 *   ① 硅基流动 deepseek-ai/DeepSeek-V4-Flash
 *   ② DeepSeek 官方 deepseek-chat（如果有 key）
 *
 * 用法：node scripts/speed-bench.js
 *
 * 环境变量（可选，脚本会尝试多个来源）：
 *   SILICONFLOW_API_KEY  — 硅基流动 key（已设置则用）
 *   DEEPSEEK_API_KEY     — DeepSeek 官方 key
 *   LLM_API_KEY          — 兜底
 */

// ─── 配置 ──────────────────────────────────────────

// 测试用的 prompt：模拟 parse 场景的真实输入
const TEST_PROMPT = `从以下小说片段提取所有出场人物（只输出 JSON 数组，不要 markdown 包裹）：
【片段】
林羽推开木门，酒肆里喧闹的人声扑面而来。掌柜的老陈正用抹布擦着柜台，见他进来，咧嘴一笑："林少侠，今儿怎么有空来？"
"找人。"林羽目光扫过大堂，落在角落那个独酌的白衣女子身上。
苏挽月头也不抬，指尖摩挲着酒杯边沿："坐。"
林羽在她对面坐下。小二端上热茶，他注意到苏挽月腰间那把从未出鞘的短剑——剑鞘上刻着繁复的符文，在烛火下泛着幽蓝的光。
"三年了。"苏挽月终于抬眼，琥珀色的瞳孔里没有一丝情绪，"你还活着。"
"托你的福。"
窗外传来马蹄声。一个黑衣少年翻身下马，径直走向他们这一桌，抱拳道："林师兄，师尊召你回山。"
林羽认出这是师弟叶辰——三年前他离开师门时，这小子才刚入门。

请列出所有出场人物及其角色信息。`;

const SILICONFLOW_BASE = "https://api.siliconflow.cn/v1";
const SILICONFLOW_MODEL = "deepseek-ai/DeepSeek-V4-Flash";

const DEEPSEEK_BASE = "https://api.deepseek.com";
const DEEPSEEK_MODEL = "deepseek-chat";

// ─── 工具 ──────────────────────────────────────────

function pickKey(...envNames) {
  for (const name of envNames) {
    const v = process.env[name];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

function ms(s, e) {
  return ((e - s) / 1000).toFixed(2);
}

function now() {
  return performance.now();
}

function fmtTokens(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ─── 单次流式调用 ─────────────────────────────────

async function streamCall({ baseURL, apiKey, model, label }) {
  const tStart = now();
  let ttft = null;
  let raw = "";
  let tokenCount = 0;

  const body = JSON.stringify({
    model,
    messages: [
      { role: "system", content: "只输出 JSON。不思考。不解释。" },
      { role: "user", content: TEST_PROMPT },
    ],
    temperature: 0.1,
    max_tokens: 8000,
    stream: true,
    thinking: { type: "disabled" },
  });

  const url = baseURL.endsWith("/v1")
    ? `${baseURL}/chat/completions`
    : `${baseURL}/v1/chat/completions`;

  const fetchStart = now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    return { error: `HTTP ${res.status}: ${errBody.slice(0, 300)}`, label };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (ttft === null) ttft = now();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const s = line.slice(6);
      if (s === "[DONE]") continue;
      try {
        const delta = JSON.parse(s)?.choices?.[0]?.delta;
        if (delta?.content) raw += delta.content;
      } catch { /* skip malformed */ }
    }

    // 估算 token 数（粗略：每 3.5 字符 ≈ 1 token）
    tokenCount = Math.round(raw.length / 3.5);
  }

  const tEnd = now();
  const totalTime = (tEnd - tStart) / 1000;
  const genTime = ttft ? (tEnd - ttft) / 1000 : totalTime;
  const ttftTime = ttft ? (ttft - tStart) / 1000 : null;
  const tps = genTime > 0 ? Math.round(tokenCount / genTime) : 0;

  return {
    label,
    model,
    baseURL,
    ok: true,
    ttft: ttftTime,
    totalTime,
    genTime,
    outputChars: raw.length,
    tokensEst: tokenCount,
    tps,
    preview: raw.slice(0, 200),
  };
}

// ─── 主流程 ────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  Flash 速度对比测试");
  console.log("  同 prompt · 同参数 · thinking=disabled");
  console.log("═══════════════════════════════════════════\n");

  // 找 key
  const sfKey = pickKey("SILICONFLOW_API_KEY", "LLM_API_KEY");
  const dsKey = pickKey("DEEPSEEK_API_KEY");

  if (!sfKey && !dsKey) {
    console.log("❌ 没找到任何 API key！");
    console.log("   请设置 SILICONFLOW_API_KEY 或 DEEPSEEK_API_KEY 或 LLM_API_KEY\n");
    process.exit(1);
  }

  console.log(`Prompt: ${TEST_PROMPT.length} 字符\n`);

  const tests = [];

  // ① 硅基流动 Flash
  if (sfKey) {
    console.log("① 硅基流动 Flash 开始...");
    tests.push(
      streamCall({
        baseURL: SILICONFLOW_BASE,
        apiKey: sfKey,
        model: SILICONFLOW_MODEL,
        label: "硅基流动 Flash",
      })
    );
  } else {
    console.log("① 硅基流动 — 跳过（无 key）");
  }

  // ② DeepSeek 官方
  if (dsKey) {
    console.log("② DeepSeek 官方开始...");
    tests.push(
      streamCall({
        baseURL: DEEPSEEK_BASE,
        apiKey: dsKey,
        model: DEEPSEEK_MODEL,
        label: "DeepSeek 官方",
      })
    );
  } else {
    console.log("② DeepSeek 官方 — 跳过（无 DEEPSEEK_API_KEY）");
  }

  console.log("");

  const results = await Promise.all(tests);

  // ─── 输出 ──────────────────────────────────────

  console.log("\n═══════════════════════════════════════════");
  console.log("  结果");
  console.log("═══════════════════════════════════════════\n");

  for (const r of results) {
    if ("error" in r) {
      console.log(`❌ ${r.label}`);
      console.log(`   ${r.error}\n`);
      continue;
    }

    console.log(`✅ ${r.label}`);
    console.log(`   Model:         ${r.model}`);
    console.log(`   Base URL:      ${r.baseURL}`);
    console.log(`   TTFT:          ${r.ttft ? r.ttft.toFixed(2) + "s" : "N/A"}`);
    console.log(`   总耗时:        ${r.totalTime.toFixed(2)}s`);
    console.log(`   生成耗时:      ${r.genTime.toFixed(2)}s`);
    console.log(`   输出字符:      ${r.outputChars.toLocaleString()}`);
    console.log(`   估算 tokens:   ${fmtTokens(r.tokensEst)}`);
    console.log(`   速度:          ${r.tps} tok/s`);
    console.log(`   预览:          ${r.preview.slice(0, 120)}...`);
    console.log("");
  }

  // 对比（如果两个都成功）
  const [a, b] = results;
  if (a && b && "ok" in a && "ok" in b) {
    console.log("───────────────────────────────────────────");
    const ratio = (b.totalTime / a.totalTime).toFixed(2);
    const winner = a.totalTime < b.totalTime ? a.label : b.label;
    console.log(`  速度比: ${a.label} / ${b.label} = ${ratio}x`);
    console.log(`  赢家: ${winner}`);
    console.log("───────────────────────────────────────────\n");
  }
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
