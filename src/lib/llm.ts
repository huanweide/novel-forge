/**
 * 多提供商 LLM 调用共享库
 *
 * 所有 API 路由的非流式 LLM 调用统一走这里。
 * 支持 OpenAI / SiliconFlow / DeepSeek / Groq / 自定义 OpenAI 兼容 API。
 *
 * 配置优先级：数据库 AppSettings > 环境变量 LLM_API_KEY
 * 设置缓存 60 秒，避免每次调用查库。
 */
import { prisma } from "@/lib/prisma";

// ─── 提供商默认 Base URL ────────────────────────────────

const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  siliconflow: "https://api.siliconflow.cn/v1",
  deepseek: "https://api.deepseek.com",
  groq: "https://api.groq.com/openai/v1",
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
    if (db?.llmApiKey && db?.llmModel) {
      const provider = db.llmProvider;
      if (!provider) throw new Error("LLM 提供商未配置——请在设置页面选择提供商");
      const baseUrl = db.llmBaseUrl || PROVIDER_BASE_URLS[provider];
      if (!baseUrl) throw new Error(`无法解析提供商 "${provider}" 的 API 地址——请在设置页面手动填写 Base URL`);
      cachedSettings = {
        provider,
        apiKey: db.llmApiKey,
        model: db.llmModel,
        baseUrl,
      };
      cacheTimestamp = now;
      return cachedSettings;
    }
    if (db?.llmApiKey && !db?.llmModel) {
      throw new Error("LLM 模型未配置——请在设置页面选择模型");
    }
  } catch (e) {
    // 如果是我们主动抛出的配置错误，直接向上传播
    if (e instanceof Error && e.message.includes("LLM")) throw e;
    // DB 不可用时退到环境变量
  }

  // 回退到环境变量（不硬编码模型名——没配就报错）
  const envKey = process.env.LLM_API_KEY;
  const envModel = process.env.LLM_MODEL;
  if (!envKey) throw new Error("LLM API Key 未配置——请在设置页面填入 Key，或在 .env 中设置 LLM_API_KEY");
  if (!envModel) throw new Error("LLM 模型未配置——请在 .env 中设置 LLM_MODEL，或在设置页面选择模型");

  const envProvider = process.env.LLM_PROVIDER || "deepseek";
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

// ─── 公共接口 ────────────────────────────────────────────

export interface LLMCallOptions {
  /** 模型 ID，不传则用全局设置 */
  model?: string;
  /** 系统提示 */
  system: string;
  /** 用户提示 */
  prompt: string;
  /** 温度，默认 0.3 */
  temperature?: number;
  /** 最大输出 token，默认 4096 */
  maxTokens?: number;
  /** 超时毫秒，默认 120s */
  timeoutMs?: number;
}

/**
 * 调用 LLM Chat Completions（非流式）
 * 自动根据数据库设置选择提供商和 API Key
 */
export async function callLLM(options: LLMCallOptions): Promise<string> {
  const {
    model: modelOverride,
    system,
    prompt,
    temperature = 0.3,
    maxTokens = 4096,
    timeoutMs = 120_000,
  } = options;

  const settings = await getSettings();
  const model = modelOverride || settings.model;
  const baseUrl = settings.baseUrl;

  if (!settings.apiKey || settings.apiKey.length < 10) {
    throw new Error("LLM API Key 未配置——请在设置页面填入 Key");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(mapLLMError(res.status, err, model));
    }

    const data = await res.json().catch(() => null);
    const raw = data?.choices?.[0]?.message?.content?.trim() || "";

    if (!raw || raw.length < 10) {
      throw new Error("LLM 返回空响应");
    }

    return raw;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 测试连接——用于设置页面验证 Key 是否有效
 * @returns { ok: true } 如果连接成功，否则 { ok: false, error: string }
 */
export async function testLLMConnection(provider: string, apiKey: string, baseUrl?: string, model?: string): Promise<{ ok: boolean; error?: string }> {
  const resolvedBaseUrl = baseUrl || PROVIDER_BASE_URLS[provider] || PROVIDER_BASE_URLS.siliconflow;
  const resolvedModel = model || "gpt-3.5-turbo";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);

  try {
    const res = await fetch(`${resolvedBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
        stream: false,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${err.slice(0, 150)}` };
    }

    const data = await res.json().catch(() => null);
    if (!data?.choices?.[0]?.message?.content) {
      return { ok: false, error: "返回格式异常（不是 OpenAI 兼容 API？）" };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// ─── 向后兼容别名（旧代码引用 callSiliconFlow 不报错）───

/** @deprecated 使用 callLLM 替代 */
export const callSiliconFlow = callLLM;
