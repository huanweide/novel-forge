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

// ─── 便捷函数：从环境变量创建默认客户端 ──────────────────────

export function getDefaultLLMConfig(): LLMConfig {
  return {
    architectModel: process.env.ARCHITECT_MODEL || "deepseek-chat",
    writerModel: process.env.WRITER_MODEL || "deepseek-chat",
    reviewerModel: process.env.REVIEWER_MODEL || "deepseek-chat",
    summarizeModel: process.env.SUMMARIZE_MODEL || "deepseek-chat",
    baseURL: process.env.LLM_BASE_URL || "https://api.deepseek.com/v1",
    apiKey: process.env.LLM_API_KEY || "",
    defaultTemperature: parseFloat(process.env.DEFAULT_TEMPERATURE || "0.8"),
    defaultTopP: parseFloat(process.env.DEFAULT_TOP_P || "0.95"),
    maxTokensPerRequest: parseInt(process.env.MAX_TOKENS_PER_REQUEST || "4096"),
    contextWindowSize: parseInt(process.env.CONTEXT_WINDOW_SIZE || "65536"),
  };
}

/**
 * 获取默认 LLM 客户端实例
 */
export function getDefaultClient(): LLMClient {
  return createLLMClient(getDefaultLLMConfig());
}
