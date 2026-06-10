/**
 * LLM API 客户端 —— 兼容 OpenAI 协议的通用封装
 *
 * 支持 DeepSeek、硅基流动、OpenAI 等任何 OpenAI 兼容 API。
 * 核心能力：同步调用 + 流式调用（SSE）。
 */

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

// ─── 客户端工厂 ─────────────────────────────────────────────

/**
 * 创建 LLM 客户端
 */
export function createLLMClient(config: LLMConfig) {
  const baseURL = config.baseURL.replace(/\/+$/, ""); // 去掉末尾斜杠

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
     * 流式调用 —— 返回 AsyncGenerator，一个字一个字往外蹦
     *
     * 用法：
     *   for await (const chunk of client.chatStream(req)) {
     *     if (chunk.type === "token") process.stdout.write(chunk.content);
     *     if (chunk.type === "done") console.log("完成!", chunk.usage);
     *   }
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
          buffer = lines.pop() || ""; // 保留最后不完整的行

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

              // 部分 API 在最后一个 chunk 返回 usage
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

export type LLMClient = ReturnType<typeof createLLMClient>;

// ─── 便捷函数：从环境变量创建客户端 ──────────────────────

/** DeepSeek 官方配置 —— 默认客户端，所有非正文生成场景用这个 */
export function getDefaultLLMConfig(): LLMConfig {
  const DS_FLASH = "deepseek-v4-flash";
  const DS_PRO = "deepseek-v4-pro";
  return {
    architectModel: process.env.ARCHITECT_MODEL || DS_PRO,
    writerModel: process.env.WRITER_MODEL || DS_PRO,
    reviewerModel: process.env.REVIEWER_MODEL || DS_FLASH,
    summarizeModel: process.env.SUMMARIZE_MODEL || DS_FLASH,
    extractorModel: process.env.EXTRACTOR_MODEL || DS_FLASH,
    baseURL: "https://api.deepseek.com/v1",
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    defaultTemperature: 0.8,
    defaultTopP: 0.95,
    maxTokensPerRequest: parseInt(process.env.MAX_TOKENS_PER_REQUEST || "4096"),
    contextWindowSize: parseInt(process.env.CONTEXT_WINDOW_SIZE || "65536"),
  };
}

/** 硅基流动配置 —— 仅正文生成(write/continue/refine)用，大量 token 消耗走这里 */
export function getSiliconFlowConfig(): LLMConfig {
  const SF_PRO = "deepseek-ai/DeepSeek-V4-Pro";
  const SF_FLASH = "deepseek-ai/DeepSeek-V4-Flash";
  return {
    architectModel: SF_PRO,
    writerModel: SF_PRO,
    reviewerModel: SF_FLASH,
    summarizeModel: SF_FLASH,
    extractorModel: SF_FLASH,
    baseURL: process.env.LLM_BASE_URL || "https://api.siliconflow.cn/v1",
    apiKey: process.env.LLM_API_KEY || "",
    defaultTemperature: 0.8,
    defaultTopP: 0.95,
    maxTokensPerRequest: parseInt(process.env.MAX_TOKENS_PER_REQUEST || "4096"),
    contextWindowSize: parseInt(process.env.CONTEXT_WINDOW_SIZE || "65536"),
  };
}

/** 默认客户端 → DeepSeek 官方（分类/审校/摘要/分析 等大部分场景） */
export function getDefaultClient(): LLMClient {
  return createLLMClient(getDefaultLLMConfig());
}

/** 硅基客户端 → 仅正文生成（write/continue/refine），大量 token */
export function getSiliconFlowClient(): LLMClient {
  return createLLMClient(getSiliconFlowConfig());
}
