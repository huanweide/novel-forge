/**
 * LLM API 客户端 —— 兼容 OpenAI 协议的通用封装
 *
 * 支持 DeepSeek、硅基流动、OpenAI 等任何 OpenAI 兼容 API。
 * 核心能力：同步调用 + 流式调用（SSE）。
 *
 * ⚠️ 模型名/API Key 统一从 AppSettings 数据库读取，不再硬编码。
 *    用户设置页改什么模型，所有 API 调用即时生效。
 */

import { getSettings } from "@/lib/llm";
import type { LLMConfig } from "@/core/types";

// ─── 类型定义 ───────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stream?: boolean;
  /** 推理模式：仅 DeepSeek 官方 API 支持，硅基流动等第三方不用传 */
  thinking?: { type: "enabled" | "disabled" };
}

export interface LLMResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type LLMClient = ReturnType<typeof createLLMClient>;

// ─── 客户端工厂 ─────────────────────────────────────────────

/**
 * 创建 LLM 客户端
 */
export function createLLMClient(config: LLMConfig) {
  const baseURL = config.baseURL.replace(/\/+$/, "");

  return {
    /**
     * 同步调用 —— 等全部生成完再返回
     */
    async chat(request: Omit<LLMRequest, "stream">): Promise<LLMResponse> {
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature ?? config.defaultTemperature,
          top_p: request.topP ?? config.defaultTopP,
          max_tokens: request.maxTokens ?? config.maxTokensPerRequest,
          stream: false,
          ...(request.thinking ? { thinking: request.thinking } : {}),
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`LLM API Error ${response.status}: ${err}`);
      }

      const data = await response.json();
      return {
        content: data.choices[0]?.message?.content || "",
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      };
    },

    /**
     * 流式调用 —— 返回 AsyncGenerator
     */
    async *chatStream(request: Omit<LLMRequest, "stream">) {
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature ?? config.defaultTemperature,
          top_p: request.topP ?? config.defaultTopP,
          max_tokens: request.maxTokens ?? config.maxTokensPerRequest,
          stream: true,
          ...(request.thinking ? { thinking: request.thinking } : {}),
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`LLM API Error ${response.status}: ${err}`);
      }

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
              yield {
                type: "done" as const,
                content: "",
                usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
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

      yield {
        type: "done" as const,
        content: "",
        usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      };
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
  };
}

/**
 * 从数据库设置创建 LLM 客户端（非流式调用用）
 */
export async function createLLMClientFromSettings(overrides?: Partial<LLMConfig>): Promise<LLMClient> {
  const config = await getEffectiveConfig(overrides);
  return createLLMClient(config);
}

/**
 * 获取当前设置中的模型名（同步版本——仅用于已缓存的场景）
 *
 * @deprecated 优先使用 getEffectiveConfig()。此函数仅在同步代码路径中作为 fallback。
 */
export function getFallbackModel(): string {
  return process.env.LLM_MODEL || "deepseek-ai/DeepSeek-V4-Flash";
}

// ─── 向后兼容导出 ──────────────────────────────────────────

/**
 * @deprecated 使用 getEffectiveConfig() 替代
 */
export function getDefaultLLMConfig(): LLMConfig {
  return {
    architectModel: getFallbackModel(),
    writerModel: getFallbackModel(),
    reviewerModel: getFallbackModel(),
    summarizeModel: getFallbackModel(),
    extractorModel: getFallbackModel(),
    baseURL: process.env.LLM_BASE_URL || "https://api.siliconflow.cn/v1",
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
