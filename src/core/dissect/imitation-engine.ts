// ============================================================
// 仿写引擎 —— 基于拆书维度数据生成仿写内容
//
// 三种模式：
//   full    → 高度还原原作结构、设定、风格
//   partial → 保留核心框架，部分创新
//   creative → 借鉴灵感，大幅创新
//
// 相似度参数控制与原作的接近程度（0-100）。
// ============================================================

import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import type { LLMClient } from "@/core/llm/client";
import { prisma } from "@/lib/prisma";
import type {
  ImitationRequest,
  DimensionKey,
  DimensionResult,
  ImitationMode,
} from "./types";
import { DIMENSION_LABELS } from "./types";

// ─── 仿写上下文构建 ──────────────────────────────────────

interface ImitationContext {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
}

/**
 * 构建仿写 prompt 上下文。
 * 根据模式和相似度混合原作设定 vs 创新空间。
 */
export async function buildImitationContext(
  req: ImitationRequest,
): Promise<ImitationContext> {
  const task = await prisma.dissectionTask.findUnique({
    where: { id: req.dissectionId },
  });
  if (!task) throw new Error("拆书任务不存在");

  const dims = task.dimensions as unknown as Record<string, DimensionResult>;
  const selectedInfo = assembleSelectedDimensions(dims, req.selectedDimensions);

  const { systemPrompt, temperature } = buildSystemPrompt(
    req.mode,
    req.similarity,
    selectedInfo,
    req.genre,
  );

  const userPrompt = buildUserPrompt(
    req.mode,
    req.similarity,
    req.targetWordCount,
    req.chapterCount,
    req.customRequirement,
  );

  return { systemPrompt, userPrompt, temperature };
}

/**
 * 流式仿写——返回 SSE AsyncGenerator。
 */
export async function* streamImitation(
  req: ImitationRequest,
): AsyncGenerator<{ type: "token" | "done"; content: string }> {
  const config = await getEffectiveConfig();
  const client = createLLMClient(config);
  const model = config.writerModel;

  const ctx = await buildImitationContext(req);

  const stream = client.chatStream({
    model,
    messages: [
      { role: "system", content: ctx.systemPrompt },
      { role: "user", content: ctx.userPrompt },
    ],
    temperature: ctx.temperature,
    maxTokens: Math.min(req.targetWordCount * 3, 16384),
  });

  for await (const chunk of stream) {
    if (chunk.type === "token") {
      yield { type: "token", content: chunk.content };
    } else if (chunk.type === "done") {
      yield { type: "done", content: "" };
    }
  }
}

// ─── Prompt 构建 ─────────────────────────────────────────

function buildSystemPrompt(
  mode: ImitationMode,
  similarity: number,
  selectedInfo: string,
  genre?: string,
): { systemPrompt: string; temperature: number } {
  const genreHint = genre ? `\n题材类型：${genre}` : "";

  if (mode === "full") {
    return {
      systemPrompt: `你是一位模仿写作专家。请严格基于以下原作设定，进行高度还原的仿写创作。${genreHint}

【原作设定——仿写时必须遵循】
${selectedInfo}

【仿写要求】
- 高度还原原作的风格、节奏、设定体系
- 可以在细节上调整，但核心框架保持不变
- 人物性格、力量体系、世界观与原著一致
- 剧情可以新编但要符合原作的因果逻辑
- 相似度要求：${similarity}%（越高越还原）

你是这本书的"续写者"——你做的是换皮重述，而不是重写。`,
      temperature: 0.7 - similarity * 0.003, // 高相似=低温度
    };
  }

  if (mode === "partial") {
    return {
      systemPrompt: `你是一位创意写作助手。参考以下原作设定进行部分仿写——保留核心框架，在细节上创新。${genreHint}

【原作设定——作为参考】
${selectedInfo}

【仿写要求】
- 保留原作的核心设定框架（力量体系/世界观/势力格局）
- 角色可以重新设计，但要符合世界的规则
- 剧情可以走不同的方向，但高潮结构可以参考原作
- 在保留原作"灵魂"的前提下发挥创造力
- 相似度要求：${similarity}%

你是这本书的"改编者"——保留骨架，换血肉。`,
      temperature: 0.85,
    };
  }

  // creative
  return {
    systemPrompt: `你是一位有创意的作家。以下原作设定仅供参考和灵感来源，你可以大幅创新。${genreHint}

【原作设定——仅作灵感参考】
${selectedInfo}

【仿写要求】
- 从原作中提取灵感，但不被束缚
- 可以改变世界观、力量体系、角色关系
- 可以只借用某个设定然后走完全不同方向
- 优先保证故事本身好看，不拘泥于还原度
- 相似度要求：${similarity}%

你是这本书的"重写者"——借一个火种，烧自己的荒原。`,
    temperature: 0.9 + (100 - similarity) * 0.002, // 低相似=高温度=更多创意
  };
}

function buildUserPrompt(
  mode: ImitationMode,
  similarity: number,
  targetWordCount: number,
  chapterCount: number,
  customRequirement?: string,
): string {
  const base = `请生成 ${chapterCount} 章的仿写内容，每章约 ${Math.round(targetWordCount / chapterCount)} 字，总计约 ${targetWordCount} 字。

仿写模式：${mode === "full" ? "完全仿写" : mode === "partial" ? "部分仿写" : "创意改写"}
相似度：${similarity}%`;

  const custom = customRequirement
    ? `\n\n自定义要求：${customRequirement}`
    : "";

  return `${base}${custom}\n\n请直接开始创作正文。每章用【第X章 标题】分隔。`;
}

// ─── 辅助函数 ────────────────────────────────────────────

function assembleSelectedDimensions(
  dims: Record<string, DimensionResult>,
  selected: DimensionKey[],
): string {
  const parts: string[] = [];

  for (const key of selected) {
    const dim = dims[key];
    if (!dim || dim.status !== "completed" || !dim.content) continue;

    const label = DIMENSION_LABELS[key];
    parts.push(`### ${label}\n${dim.content.slice(0, 3000)}`);
  }

  if (parts.length === 0) {
    // 如果没选任何维度或维度都为空，用全部有效维度
    for (const [key, dim] of Object.entries(dims)) {
      if (dim?.status === "completed" && dim.content) {
        parts.push(
          `### ${DIMENSION_LABELS[key as DimensionKey]}\n${dim.content.slice(0, 2000)}`,
        );
      }
    }
  }

  return parts.join("\n\n") || "（无可用设定数据）";
}
