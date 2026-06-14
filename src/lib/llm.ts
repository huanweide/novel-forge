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
  deepseek: "https://api.deepseek.com/v1",
  groq: "https://api.groq.com/openai/v1",
};

// ─── 配置缓存 ────────────────────────────────────────────

interface LLMSettings {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
}

let cachedSettings: LLMSettings | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 60 秒

async function getSettings(): Promise<LLMSettings> {
  const now = Date.now();
  if (cachedSettings && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedSettings;
  }

  try {
    const db = await prisma.appSettings.findUnique({ where: { id: "default" } });
    if (db?.llmApiKey) {
      const provider = db.llmProvider || "siliconflow";
      const baseUrl = db.llmBaseUrl || PROVIDER_BASE_URLS[provider] || PROVIDER_BASE_URLS.siliconflow;
      cachedSettings = {
        provider,
        apiKey: db.llmApiKey,
        model: db.llmModel || "deepseek-ai/DeepSeek-V4-Flash",
        baseUrl,
      };
      cacheTimestamp = now;
      return cachedSettings;
    }
  } catch {
    // DB 不可用时退到环境变量
  }

  // 回退到环境变量
  const envKey = process.env.LLM_API_KEY || "";
  cachedSettings = {
    provider: "siliconflow",
    apiKey: envKey,
    model: "deepseek-ai/DeepSeek-V4-Flash",
    baseUrl: PROVIDER_BASE_URLS.siliconflow,
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
      throw new Error(`LLM API ${res.status}: ${err.slice(0, 200)}`);
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
