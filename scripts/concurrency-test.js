/**
 * 硅基流动并发压力测试
 * 测：同模型多请求同时打过去，会不会限流/减速
 */

const BASE = "https://api.siliconflow.cn/v1";
const MODEL = "deepseek-ai/DeepSeek-V4-Flash";

const KEY = process.env.LLM_API_KEY || process.env.SILICONFLOW_API_KEY || "";
if (!KEY) { console.log("❌ 无API KEY"); process.exit(1); }

const TEST_PROMPT = "用50字描述一个修仙宗门的外貌。只输出描述。";
const CONCURRENT = [1, 2, 3, 5, 8, 10];

async function callOne(id) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: TEST_PROMPT }],
        temperature: 0, max_tokens: 200, stream: false,
      }),
    });
    const sec = ((performance.now() - t0) / 1000).toFixed(1);
    const data = await res.json().catch(() => null);
    const preview = (data?.choices?.[0]?.message?.content || "").slice(0, 60);
    return { id, sec: parseFloat(sec), status: res.status, preview };
  } catch (e) {
    const sec = ((performance.now() - t0) / 1000).toFixed(1);
    return { id, sec: parseFloat(sec), status: 0, error: String(e).slice(0, 80), preview: "" };
  }
}

async function test(n) {
  console.log(`\n── 并发 ${n} ──`);
  const t0 = performance.now();
  const results = await Promise.all(
    Array.from({ length: n }, (_, i) => callOne(i + 1))
  );
  const totalSec = ((performance.now() - t0) / 1000).toFixed(1);

  const times = results.map(r => r.sec);
  const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1);
  const min = Math.min(...times).toFixed(1);
  const max = Math.max(...times).toFixed(1);
  const errors = results.filter(r => r.status !== 200);

  console.log(`  单次: ${min}s ~ ${max}s | 平均: ${avg}s | 总耗时: ${totalSec}s`);
  results.forEach(r => {
    const flag = r.status === 200 ? "✅" : r.status === 429 ? "⚠️429" : `❌${r.status}`;
    console.log(`  ${flag} #${r.id} ${r.sec}s ${r.preview}`);
  });
  if (errors.length > 0) {
    console.log(`  ⚠️ ${errors.length} 个错误: ${errors.map(e => `#${e.id}→${e.status} ${e.error}`).join(", ")}`);
  }
}

async function main() {
  console.log(`硅基流动并发测试 — ${MODEL}`);
  console.log(`Key: ${KEY.slice(0, 8)}...`);
  console.log(`Prompt: ${TEST_PROMPT.length} 字符`);

  for (const n of CONCURRENT) {
    await test(n);
    await new Promise(r => setTimeout(r, 1000)); // 间隔1秒，避免触发累计限流
  }

  console.log("\n═══ 结论 ═══");
  console.log("如果出现429 → 有限流");
  console.log("如果并发越高单次越慢 → 排队效应");
  console.log("如果并发越高总耗时≈单次耗时 → 真并行，无排队");
}

main().catch(e => console.error(e));
