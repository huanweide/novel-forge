/**
 * LLM 配置 / 错误 / 成本工具库
 *
 * ⚠️ 非流式「发起 LLM 请求」已统一收敛到 core/llm/client.ts 的 completeText()，
 * 本文件不再承载裸 fetch 调用封装。这里保留的是被核心门面与设置页依赖的
 * 配置读取（getSettings）、错误翻译（mapLLMError）、成本记录（recordLlmCall）与连通性测试（testLLMConnection）。
 *
 * 提供商默认 Base URL / 默认模型：供 getSettings 在数据库未配置时兜底。
 * 配置优先级：数据库 AppSettings > 环境变量 LLM_API_KEY；设置缓存 60 秒，避免每次调用查库。
 */
import { prisma } from "@/lib/prisma";

// ─── 提供商默认 Base URL ────────────────────────────────

export const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  siliconflow: "https://api.siliconflow.cn/v1",
  deepseek: "https://api.deepseek.com",
  groq: "https://api.groq.com/openai/v1",
  local: "http://localhost:11434/v1",
};

// ─── 各提供商默认模型（未显式配置时使用，避免「模型未配置」硬报错）───
const DEFAULT_MODELS: Record<string, string> = {
  deepseek: "deepseek-v4-flash",
  openai: "gpt-3.5-turbo",
  siliconflow: "deepseek-ai/DeepSeek-V4-Flash",
  groq: "llama-3.3-70b-versatile",
};

// ─── 错误翻译 ────────────────────────────────────────────

/**
 * 将 LLM HTTP 错误翻译成用户可读的中文提示。
 * 上游 API 返回的状态码 / 原始报错对用户不友好，统一在此收敛，
 * 避免出现 "LLM API Error 401: ..." 这类让人不知所措的报错。
 */
export function mapLLMError(status: number, bodyText: string, model?: string): string {
  const hint = bodyText ? `（服务端返回：${bodyText.slice(0, 160)}）` : "";
  switch (status) {
    case 401:
      return `AI 服务拒绝访问（401）：API Key 无效、已过期或格式错误。请到「设置」页确认 Key 是否正确、是否已失效、是否还有余额。${hint}`;
    case 403:
      return `AI 服务无权限（403）：该 API Key 无权访问当前模型或接口。请检查 Key 的权限范围与所属账号。${hint}`;
    case 404:
      return `模型不存在（404）：${model ? `当前模型「${model}」` : "请求的模型"}在服务商处找不到。请检查模型名格式（硅基流动 deepseek-ai/DeepSeek-V4-Flash 与 DeepSeek 官方 deepseek-v4-flash 勿混用）。${hint}`;
    case 429:
      return `触发限流（429）：请求过于频繁或额度已耗尽。请稍后重试，或到提供商后台升级套餐 / 充值。${hint}`;
    default:
      if (status >= 500) return `AI 服务端异常（${status}）：服务暂时不可用，请稍后重试。${hint}`;
      return `AI 服务调用失败（${status}）。${hint}`;
  }
}

// ─── 配置缓存 ────────────────────────────────────────────

export interface LLMSettings {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
}

let cachedSettings: LLMSettings | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 60 秒

export async function getSettings(): Promise<LLMSettings> {
  const now = Date.now();
  if (cachedSettings && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedSettings;
  }

  try {
    const db = await prisma.appSettings.findUnique({ where: { id: "default" } });

    // 本地推理（Ollama 等 OpenAI 兼容服务）：无需 API Key，靠 Base URL + 模型名即可
    if (db?.llmProvider === "local") {
      const baseUrl = db.llmBaseUrl;
      if (!baseUrl) throw new Error("本地推理需填写 Base URL（如 http://localhost:11434/v1）");
      const model = db.llmModel;
      if (!model) throw new Error("本地推理需填写模型名（如 qwen2.5:7b，可在 Ollama 中 pull）");
      cachedSettings = { provider: "local", apiKey: "", model, baseUrl };
      cacheTimestamp = now;
      return cachedSettings;
    }

    if (db?.llmApiKey) {
      const provider = db.llmProvider;
      if (!provider) throw new Error("LLM 提供商未配置——请在设置页面选择提供商");
      const baseUrl = db.llmBaseUrl || PROVIDER_BASE_URLS[provider];
      if (!baseUrl) throw new Error(`无法解析提供商 "${provider}" 的 API 地址——请在设置页面手动填写 Base URL`);
      const model = db.llmModel || DEFAULT_MODELS[provider];
      if (!model) throw new Error("LLM 模型未配置——请在设置页面选择模型");
      cachedSettings = {
        provider,
        apiKey: db.llmApiKey,
        model,
        baseUrl,
      };
      cacheTimestamp = now;
      return cachedSettings;
    }
  } catch (e) {
    // 如果是我们主动抛出的配置错误，直接向上传播
    if (e instanceof Error && e.message.includes("LLM")) throw e;
    // DB 不可用时退到环境变量
  }

  // 回退到环境变量（模型未配时按提供商兜底，避免「模型未配置」硬报错）
  const envKey = process.env.LLM_API_KEY;
  const envProvider = process.env.LLM_PROVIDER || "deepseek";
  if (!envKey) throw new Error("LLM API Key 未配置——请在设置页面填入 Key，或在 .env 中设置 LLM_API_KEY");
  const envModel = process.env.LLM_MODEL || DEFAULT_MODELS[envProvider];
  if (!envModel) throw new Error("LLM 模型未配置——请在 .env 中设置 LLM_MODEL（DeepSeek 可用 deepseek-v4-flash），或在设置页面选择模型");

  cachedSettings = {
    provider: envProvider,
    apiKey: envKey,
    model: envModel,
    baseUrl: process.env.LLM_BASE_URL || PROVIDER_BASE_URLS[envProvider] || "",
  };
  cacheTimestamp = now;
  return cachedSettings;
}

/** 供外部刷新缓存（设置页保存后调用） */
export function clearLLMCache(): void {
  cachedSettings = null;
  cacheTimestamp = 0;
}

// ────────────────────────────────────────────────────────
// ⚠️ 非流式生成调用已统一收敛到 core/llm/client.ts 的 completeText()
//    本文件不再导出 callLLM / callSiliconFlow / LLMCallOptions。
//    保留的工具函数（仍被核心门面与设置页依赖）：
//      getSettings / clearLLMCache / mapLLMError / recordLlmCall / testLLMConnection / estimateCost
// ────────────────────────────────────────────────────────

/**
 * 测试连接——用于设置页面验证 Key 是否有效
 * @returns { ok: true } 如果连接成功，否则 { ok: false, error: string }
 */
export async function testLLMConnection(provider: string, apiKey: string, baseUrl?: string, model?: string): Promise<{ ok: boolean; error?: string }> {
  const resolvedBaseUrl = baseUrl || PROVIDER_BASE_URLS[provider] || PROVIDER_BASE_URLS.siliconflow;
  const resolvedModel = model || DEFAULT_MODELS[provider] || "gpt-3.5-turbo";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);

  try {
    const res = await fetch(`${resolvedBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: resolvedModel,
        // 用一句明确指令；给足 token 让推理模型（如 DeepSeek v4）先完成思考再输出正文，
        // 否则推理模型会把全部 token 用在 reasoning_content 上，导致 content 为空被误判失败
        messages: [{ role: "user", content: "请只回复「连接成功」四个字，不要多余内容。" }],
        max_tokens: 1024,
        stream: false,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${err.slice(0, 150)}` };
    }

    const data = await res.json().catch(() => null);
    // 兼容推理模型：只要返回了合法的 choices[0]（无论正文 content 还是 reasoning_content）即视为连接成功
    const choice = data?.choices?.[0];
    if (!choice) {
      return { ok: false, error: "返回格式异常（不是 OpenAI 兼容 API？）" };
    }
    const content = choice.message?.content ?? "";
    const reasoning = choice.message?.reasoning_content ?? "";
    if (!content && !reasoning) {
      return { ok: false, error: "返回内容为空（不是 OpenAI 兼容 API？）" };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Token 价格表与成本估算（成本看板）─────────────────
// 内置常见模型每百万 token 的美元单价（input/output）。供应商调价会失真，仅作估算参考。
// 匹配规则：model 名包含下表任一关键字即采用对应单价；都不匹配则标 unknown（成本记 0）。

interface ModelPrice {
  match: string;
  input: number; // 每百万 input token 美元价
  output: number; // 每百万 output token 美元价
  label: string;
}

const MODEL_PRICING: ModelPrice[] = [
  { match: "deepseek-chat", input: 0.14, output: 0.28, label: "DeepSeek Chat" },
  // 默认硅基流动模型 deepseek-ai/DeepSeek-V4-Flash（AppSettings 默认）。价格为估算值，以官方为准。
  { match: "deepseek-v4-flash", input: 0.14, output: 0.28, label: "DeepSeek V4 Flash（估算价，以官方为准）" },
  { match: "deepseek-reasoner", input: 0.55, output: 2.19, label: "DeepSeek Reasoner" },
  { match: "deepseek-v3", input: 0.27, output: 1.1, label: "DeepSeek V3" },
  { match: "deepseek-v2", input: 0.27, output: 1.1, label: "DeepSeek V2" },
  { match: "gpt-4o-mini", input: 0.15, output: 0.6, label: "GPT-4o mini" },
  { match: "gpt-4o", input: 2.5, output: 10, label: "GPT-4o" },
  { match: "gpt-4-turbo", input: 10, output: 30, label: "GPT-4 Turbo" },
  { match: "gpt-3.5-turbo", input: 0.5, output: 1.5, label: "GPT-3.5 Turbo" },
  { match: "claude-3-5-sonnet", input: 3, output: 15, label: "Claude 3.5 Sonnet" },
  { match: "claude-3-haiku", input: 0.25, output: 1.25, label: "Claude 3 Haiku" },
  { match: "claude-3-opus", input: 15, output: 75, label: "Claude 3 Opus" },
  { match: "qwen", input: 0.4, output: 1.2, label: "通义千问" },
  { match: "glm", input: 0.5, output: 0.5, label: "智谱 GLM" },
  { match: "moonshot", input: 1, output: 1, label: "Kimi" },
  { match: "abab", input: 0.8, output: 0.8, label: "MiniMax" },
  { match: "yi-", input: 0.99, output: 1.98, label: "零一万物" },
  { match: "DeepSeek-V3", input: 0.27, output: 1.1, label: "DeepSeek V3 (SF)" },
  { match: "DeepSeek-V2", input: 0.27, output: 1.1, label: "DeepSeek V2 (SF)" },
  { match: "Qwen", input: 0.4, output: 1.2, label: "通义千问 (SF)" },
  { match: "Llama", input: 0.2, output: 0.2, label: "Llama (SF)" },
];

export interface CostEstimate {
  cost: number; // 美元
  known: boolean; // 是否匹配到已知单价
  label: string; // 匹配到的模型标签（unknown 时为空）
}

/** 按模型名估算单次调用成本（美元）。单价以「每百万 token」计。 */
export function estimateCost(model: string, promptTokens: number, completionTokens: number): CostEstimate {
  const m = (model || "").toLowerCase();
  const hit = MODEL_PRICING.find((p) => m.includes(p.match.toLowerCase()));
  if (!hit) return { cost: 0, known: false, label: "" };
  const cost = (promptTokens / 1_000_000) * hit.input + (completionTokens / 1_000_000) * hit.output;
  return { cost: Math.round(cost * 100000) / 100000, known: true, label: hit.label };
}

export interface LlmCallLogInput {
  model: string;
  role?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  baseURL?: string | null;
  isFallback?: boolean;
  projectId?: string | null;
  /** 单次调用总耗时（毫秒）——生成延迟硬指标数据源 */
  durationMs?: number | null;
  /** 首 token 延迟 / TTFB（毫秒）——流式场景为到首个正文 token 的时间 */
  firstTokenMs?: number | null;
}

/**
 * 记录一次 LLM 调用（fire-and-forget，不阻塞主流程、失败静默）。
 * 在 core/llm/client.ts 的 chat / chatStream 成功返回时调用，单点覆盖所有走 client 的生成。
 */
export function recordLlmCall(input: LlmCallLogInput): void {
  const cost = estimateCost(input.model, input.promptTokens, input.completionTokens);
  void prisma.llmCallLog
    .create({
      data: {
        projectId: input.projectId ?? null,
        model: input.model,
        role: input.role && input.role.length > 0 ? input.role : "general",
        promptTokens: input.promptTokens || 0,
        completionTokens: input.completionTokens || 0,
        totalTokens: input.totalTokens || 0,
        estimatedCost: cost.cost,
        baseURL: input.baseURL ?? null,
        isFallback: input.isFallback ?? false,
        durationMs: input.durationMs ?? null,
        firstTokenMs: input.firstTokenMs ?? null,
      },
    })
    .catch(() => {
      // 落库失败不影响主流程（如 DB 暂不可用），静默忽略
    });
}
