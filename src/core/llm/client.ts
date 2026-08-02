/**
 * LLM API 客户端 —— 兼容 OpenAI 协议的通用封装
 *
 * 支持 DeepSeek、硅基流动、OpenAI 等任何 OpenAI 兼容 API。
 * 核心能力：同步调用 + 流式调用（SSE）。
 *
 * ⚠️ 模型名/API Key 统一从 AppSettings 数据库读取，不再硬编码。
 *    用户设置页改什么模型，所有 API 调用即时生效。
 */

import { getSettings, mapLLMError, recordLlmCall } from "@/lib/llm";
import type { LLMConfig, FallbackModel } from "@/core/types";

// ─── LLM 请求超时（BE-8：统一散落的三档为单常量）────────────
/** 单次 LLM 请求最长等待时间（毫秒）。所有 chat / chatStream 共用此值，避免超时语义不一致、排查慢调用更简单。 */
export const LLM_REQUEST_TIMEOUT_MS = 300_000;

// ─── 类型定义 ───────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** tool_calls 的 ID（role=tool 时必填） */
  tool_call_id?: string;
  /** assistant 消息可能包含 tool_calls */
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface LLMRequest {
  messages: ChatMessage[];
  model: string;
  /** 业务语义标签（writer/reviewer/summarize/extractor...），用于成本看板按角色聚合；不传则记 general */
  role?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stream?: boolean;
  /** 推理模式：仅 DeepSeek 官方 API 支持，硅基流动等第三方不用传 */
  thinking?: { type: "enabled" | "disabled" };
  /** OpenAI 兼容的工具定义 */
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
}

export interface LLMResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 工具调用请求（LLM 要求执行工具时返回） */
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string; // JSON string
  }>;
}

export type LLMClient = ReturnType<typeof createLLMClient>;

// ─── 重试 / 故障转移 基础设施 ──────────────────────────────

/** 单次调用最大尝试次数（含首次）。故障转移链长度由 fallbackModels 决定 */
const DEFAULT_RETRIES = 3;

/** 指数退避延迟（含 ±20% 抖动），封顶 8s */
function backoffDelay(attempt: number, baseMs = 600, maxDelayMs = 8000): number {
  const raw = baseMs * Math.pow(2, attempt - 1);
  const capped = Math.min(maxDelayMs, raw);
  const jitter = capped * 0.2 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(capped + jitter));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 是否可重试：网络层错误（无状态码）/429 限流/5xx 服务端异常可重试；4xx 鉴权与请求错误不可重试 */
function isRetryable(status: number | null): boolean {
  if (status === null) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

interface ChatTarget {
  model: string;
  baseURL: string;
  apiKey: string;
}

/** 构建「主模型 → 备用模型」调用链 */
function buildChain(config: LLMConfig, primaryModel: string): ChatTarget[] {
  const primary: ChatTarget = {
    model: primaryModel,
    baseURL: config.baseURL.replace(/\/+$/, ""),
    apiKey: config.apiKey,
  };
  const fallbacks: ChatTarget[] = (config.fallbackModels ?? []).map((f: FallbackModel) => ({
    model: f.model,
    baseURL: (f.baseURL ?? config.baseURL).replace(/\/+$/, ""),
    apiKey: f.apiKey ?? config.apiKey,
  }));
  return [primary, ...fallbacks];
}

type AttemptResult =
  | { ok: true; value: LLMResponse }
  | { ok: false; fatal: boolean; error: Error };

/** 单次非流式请求（含解析）；网络/429/5xx 返回可重试错误，4xx 返回 fatal */
async function attemptChat(
  target: ChatTarget,
  request: Omit<LLMRequest, "stream">,
  config: LLMConfig,
): Promise<AttemptResult> {
  const body: Record<string, unknown> = {
    model: target.model,
    messages: request.messages,
    temperature: request.temperature ?? config.defaultTemperature,
    top_p: request.topP ?? config.defaultTopP,
    max_tokens: request.maxTokens ?? config.maxTokensPerRequest,
    stream: false,
    ...(request.thinking ? { thinking: request.thinking } : {}),
  };
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools;
    body.tool_choice = "auto";
  }

  let response: Response;
  try {
    response = await fetch(`${target.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${target.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LLM_REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof TypeError) {
      return { ok: false, fatal: false, error: new Error(`无法连接 AI 服务：请检查 Base URL（${target.baseURL}）与网络是否可达。`) };
    }
    return { ok: false, fatal: false, error: e instanceof Error ? e : new Error(String(e)) };
  }

  if (!response.ok) {
    const err = await response.text();
    return {
      ok: false,
      fatal: !isRetryable(response.status),
      error: new Error(mapLLMError(response.status, err, target.model)),
    };
  }

  const data = await response.json();

  // 容错：API 可能因内容过滤返回空 choices
  if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
    if (data.error) {
      return { ok: false, fatal: true, error: new Error(`LLM API 拒绝: ${typeof data.error === "string" ? data.error : JSON.stringify(data.error)}`) };
    }
    return { ok: true, value: { content: "", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } } };
  }

  const choice = data.choices[0];
  const message = choice?.message;
  if (!message) {
    return { ok: true, value: { content: "", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } } };
  }
  // 检查 finish_reason——content_filter 表示被拦截
  if (choice.finish_reason === "content_filter") {
    return {
      ok: true,
      value: {
        content: "",
        usage: { promptTokens: data.usage?.prompt_tokens || 0, completionTokens: 0, totalTokens: data.usage?.total_tokens || 0 },
      },
    };
  }

  // 解析工具调用
  let toolCalls: LLMResponse["toolCalls"] | undefined;
  if (message?.tool_calls && Array.isArray(message.tool_calls)) {
    toolCalls = message.tool_calls.map((tc: any) => ({
      id: tc.id || "",
      name: tc.function?.name || "",
      arguments: tc.function?.arguments || "{}",
    }));
  }

  return {
    ok: true,
    value: {
      content: message?.content || "",
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      toolCalls,
    },
  };
}

type EstablishResult =
  | { ok: true; response: Response }
  | { ok: false; fatal: boolean; error: Error };

/** 建立流式连接（仅此阶段可重试 / 故障转移；进入 token 流后不再切换，避免重复输出） */
async function establishStream(
  target: ChatTarget,
  request: Omit<LLMRequest, "stream">,
  config: LLMConfig,
): Promise<EstablishResult> {
  const body: Record<string, unknown> = {
    model: target.model,
    messages: request.messages,
    temperature: request.temperature ?? config.defaultTemperature,
    top_p: request.topP ?? config.defaultTopP,
    max_tokens: request.maxTokens ?? config.maxTokensPerRequest,
    stream: true,
    ...(request.thinking ? { thinking: request.thinking } : {}),
  };

  let response: Response;
  try {
    response = await fetch(`${target.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${target.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LLM_REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof TypeError) {
      return { ok: false, fatal: false, error: new Error(`无法连接 AI 服务：请检查 Base URL（${target.baseURL}）与网络是否可达。`) };
    }
    return { ok: false, fatal: false, error: e instanceof Error ? e : new Error(String(e)) };
  }

  if (!response.ok) {
    const err = await response.text();
    return {
      ok: false,
      fatal: !isRetryable(response.status),
      error: new Error(mapLLMError(response.status, err, target.model)),
    };
  }

  return { ok: true, response };
}

/** 读取 SSE 流并逐 token 产出（与重试 / 故障转移解耦） */
async function* readStream(
  response: Response,
  onUsage?: (u: { promptTokens: number; completionTokens: number; totalTokens: number }) => void,
): AsyncGenerator<{ type: "token" | "done"; content: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("无法获取响应流");

  const decoder = new TextDecoder();
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") {
          const finalUsage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
          onUsage?.(finalUsage);
          yield {
            type: "done" as const,
            content: "",
            usage: finalUsage,
          };
          return;
        }

        try {
          const data = JSON.parse(dataStr);
          const delta = data.choices?.[0]?.delta;

          if (delta?.content) {
            completionTokens++;
            yield {
              type: "token" as const,
              content: delta.content,
              usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
            };
          }

          if (data.usage) {
            promptTokens = data.usage.prompt_tokens;
            completionTokens = data.usage.completion_tokens;
          }
        } catch {
          // 忽略解析失败的行
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const finalUsage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
  onUsage?.(finalUsage);
  yield {
    type: "done" as const,
    content: "",
    usage: finalUsage,
  };
}

// ─── 客户端工厂 ─────────────────────────────────────────────

/**
 * 创建 LLM 客户端
 */
export function createLLMClient(config: LLMConfig) {
  return {
    /**
     * 同步调用 —— 等全部生成完再返回
     */
    async chat(request: Omit<LLMRequest, "stream">): Promise<LLMResponse> {
      const chain = buildChain(config, request.model);
      let lastError: Error | null = null;

      for (const target of chain) {
        let attempt = 0;
        while (attempt < DEFAULT_RETRIES) {
          attempt++;
          const res = await attemptChat(target, request, config);
          if (res.ok) {
            recordLlmCall({
              model: target.model,
              role: request.role,
              promptTokens: res.value.usage.promptTokens,
              completionTokens: res.value.usage.completionTokens,
              totalTokens: res.value.usage.totalTokens,
              baseURL: target.baseURL,
              isFallback: target !== chain[0],
            });
            return res.value;
          }
          // 4xx 鉴权/配置错误：直接抛出，不重试也不切备用模型
          if (res.fatal) throw res.error;
          lastError = res.error;
          if (attempt < DEFAULT_RETRIES) await sleep(backoffDelay(attempt));
        }
      }

      throw lastError ?? new Error("LLM 调用失败（无可用模型）");
    },

    /**
     * 流式调用 —— 返回 AsyncGenerator
     */
    async *chatStream(request: Omit<LLMRequest, "stream">) {
      const chain = buildChain(config, request.model);
      let lastError: Error | null = null;

      for (const target of chain) {
        let attempt = 0;
        while (attempt < DEFAULT_RETRIES) {
          attempt++;
          const est = await establishStream(target, request, config);
          if (est.ok) {
            // 一旦进入 token 流就不再重试 / 切换，避免重复输出
            yield* readStream(est.response, (u) =>
              recordLlmCall({
                model: target.model,
                role: request.role,
                promptTokens: u.promptTokens,
                completionTokens: u.completionTokens,
                totalTokens: u.totalTokens,
                baseURL: target.baseURL,
                isFallback: target !== chain[0],
              }),
            );
            return;
          }
          // 4xx 鉴权/配置错误：直接抛出，不重试也不切备用模型
          if (est.fatal) throw est.error;
          lastError = est.error;
          if (attempt < DEFAULT_RETRIES) await sleep(backoffDelay(attempt));
        }
      }

      throw lastError ?? new Error("LLM 流式调用失败（无可用模型）");
    },
  };
}

// ─── 从数据库设置构建 LLMConfig ──────────────────────────

/**
 * 从全局设置（AppSettings 表）构建 LLMConfig
 *
 * 这是所有 LLM 调用的统一入口——模型名、API Key、Base URL
 * 全部从数据库读取，用户在设置页面改了就全局生效。
 *
 * @param overrides 可选覆盖（如正文生成想用不同的 temperature）
 */
export async function getEffectiveConfig(overrides?: Partial<LLMConfig>): Promise<LLMConfig> {
  const settings = await getSettings();

  // 故障转移备用模型链：从 LLM_FALLBACK 环境变量注入（形如 "modelA@baseURL,modelB"），零 schema 改动。
  // 未配置则该链表为空，不做故障转移；也可经 overrides.fallbackModels 由代码注入。
  const fallbackEnv = process.env.LLM_FALLBACK;
  const parsedFallbacks: FallbackModel[] = fallbackEnv
    ? fallbackEnv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((spec) => {
          const at = spec.indexOf("@");
          if (at === -1) return { model: spec };
          const model = spec.slice(0, at).trim();
          const baseURL = spec.slice(at + 1).trim();
          return { model, baseURL: baseURL || undefined };
        })
    : [];

  return {
    architectModel: overrides?.architectModel || settings.model,
    writerModel: overrides?.writerModel || settings.model,
    reviewerModel: overrides?.reviewerModel || settings.model,
    summarizeModel: overrides?.summarizeModel || settings.model,
    extractorModel: overrides?.extractorModel || settings.model,
    baseURL: overrides?.baseURL || settings.baseUrl,
    apiKey: overrides?.apiKey || settings.apiKey,
    defaultTemperature: overrides?.defaultTemperature ?? 0.8,
    defaultTopP: overrides?.defaultTopP ?? 0.95,
    maxTokensPerRequest: overrides?.maxTokensPerRequest ?? parseInt(process.env.MAX_TOKENS_PER_REQUEST || "4096"),
    contextWindowSize: overrides?.contextWindowSize ?? parseInt(process.env.CONTEXT_WINDOW_SIZE || "65536"),
    fallbackModels: overrides?.fallbackModels ?? parsedFallbacks,
  };
}

/**
 * 把项目级 llmConfig（Json，可能含 model/baseUrl/apiKey/temperature/topP）
 * 映射成 LLMConfig 覆盖项。仅当字段非空才覆盖，确保"项目级留空=继承全局"。
 *
 * 用于 F5 项目配置中心的「per-project LLM 覆盖」：用户在配置面板为某项目指定
 * 不同模型/密钥后，该项目的生成（写/润/续/总结）即优先使用项目级配置。
 */
export function buildProjectOverrides(
  projectLlmConfig?: Record<string, unknown> | null,
): Partial<LLMConfig> {
  if (!projectLlmConfig || typeof projectLlmConfig !== "object") return {};
  const o: Partial<LLMConfig> = {};
  const model = projectLlmConfig.model;
  if (typeof model === "string" && model.trim()) {
    o.architectModel = o.writerModel = o.reviewerModel = o.summarizeModel = o.extractorModel = model.trim();
  }
  const baseURL = projectLlmConfig.baseUrl;
  if (typeof baseURL === "string" && baseURL.trim()) o.baseURL = baseURL.trim();
  const apiKey = projectLlmConfig.apiKey;
  if (typeof apiKey === "string" && apiKey.trim()) o.apiKey = apiKey.trim();
  if (typeof projectLlmConfig.temperature === "number") o.defaultTemperature = projectLlmConfig.temperature;
  if (typeof projectLlmConfig.topP === "number") o.defaultTopP = projectLlmConfig.topP;
  return o;
}

/**
 * 从数据库设置创建 LLM 客户端（非流式调用用）
 */
export async function createLLMClientFromSettings(overrides?: Partial<LLMConfig>): Promise<LLMClient> {
  const config = await getEffectiveConfig(overrides);
  return createLLMClient(config);
}

/**
 * 便捷文本补全：把「system + 单轮 user prompt」封装成一次 chat 调用，返回 content 字符串。
 *
 * 用于迁移旧 `callLLM` / `callSiliconFlow` 调用——让所有「真正发起 LLM 请求」的入口
 * 统一收敛到本文件（core/llm/client），不再有散落在各路由里的裸 fetch 封装。
 * 语义对齐旧 callLLM：自动按 DB 设置选择模型与 Key；退避重试与故障转移由 `chat()` 提供。
 *
 * 注意：旧 callLLM 对「空响应」会当作临时故障重试；`chat()` 不判空，直接返回 content。
 * 空响应属极罕见情况，且 chat 已自带 3 次网络层重试，此处不再单独复刻判空逻辑。
 */
export async function completeText(
  system: string,
  prompt: string,
  opts?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    role?: string;
    config?: LLMConfig;
  },
): Promise<string> {
  const config = opts?.config ?? (await getEffectiveConfig());
  const client = createLLMClient(config);
  const res = await client.chat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    model: opts?.model ?? config.architectModel,
    role: opts?.role,
    temperature: opts?.temperature,
    maxTokens: opts?.maxTokens,
  });
  return res.content;
}

/**
 * 获取当前设置中的模型名（同步版本——仅用于已缓存的场景）
 *
 * @deprecated 优先使用 getEffectiveConfig()。不返回硬编码默认值——调用方自行处理 undefined。
 */
export function getFallbackModel(): string | undefined {
  return process.env.LLM_MODEL || undefined;
}

// ─── 向后兼容导出 ──────────────────────────────────────────

/**
 * @deprecated 使用 getEffectiveConfig() 替代
 */
export function getDefaultLLMConfig(): LLMConfig {
  const m = getFallbackModel() || "";
  return {
    architectModel: m,
    writerModel: m,
    reviewerModel: m,
    summarizeModel: m,
    extractorModel: m,
    baseURL: process.env.LLM_BASE_URL || "https://api.deepseek.com",
    apiKey: process.env.LLM_API_KEY || "",
    defaultTemperature: 0.8,
    defaultTopP: 0.95,
    maxTokensPerRequest: parseInt(process.env.MAX_TOKENS_PER_REQUEST || "4096"),
    contextWindowSize: parseInt(process.env.CONTEXT_WINDOW_SIZE || "65536"),
  };
}

/**
 * @deprecated 使用 createLLMClientFromSettings() 替代
 */
export function getSiliconFlowConfig(): LLMConfig {
  return getDefaultLLMConfig();
}

/**
 * @deprecated 使用 createLLMClientFromSettings() 替代
 */
export function getDefaultClient(): LLMClient {
  return createLLMClient(getDefaultLLMConfig());
}

/**
 * @deprecated 使用 createLLMClientFromSettings() 替代
 */
export function getSiliconFlowClient(): LLMClient {
  return createLLMClient(getDefaultLLMConfig());
}
