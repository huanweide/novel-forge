import type { LLMClient } from "@/core/llm/client";
import type { DistantFloor } from "@/core/assembly/engine";

/**
 * 为单个远楼层节点生成 LLM 压缩摘要（中文，≤ maxChars 字）。
 *
 * 远楼层 = 短期记忆预算放不下的较早章节。原实现只给一行"已折叠·非完整原文"标记，
 * 本函数用 LLM 把该章节压缩成情节要义，注入前文回顾区，避免模型把截断片段
 * 误读为完整情节而产生剧情断裂幻觉（酒馆记忆机制迁移的最后一环）。
 *
 * 失败（网络/超时/内容过滤返回空）时返回 null，调用方回退到原折叠标记，绝不阻断出文。
 */
export async function summarizeDistantFloor(
  client: LLMClient,
  floor: DistantFloor,
  model: string,
  maxChars = 240
): Promise<string | null> {
  const src = floor.content || floor.outline || "";
  if (!src.trim()) return null;

  const system =
    "你是小说情节压缩器。用极简中文保留该章节的核心情节推进、关键转折、角色状态变化、未回收伏笔。" +
    "不要评价、不要扩写、不要添加原文没有的信息。";
  const user =
    `章节标题：${floor.title}\n\n原文：\n${src}\n\n` +
    `请压缩成不超过 ${maxChars} 字的中文摘要，只保留对后续剧情连贯必需的信息` +
    `（情节推进 / 关键转折 / 角色变化 / 未回收伏笔）。`;

  try {
    const resp = await client.chat({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      topP: 0.9,
      maxTokens: 400,
    });
    const text = resp?.content?.trim();
    return text || null;
  } catch {
    // 网络/超时等异常：静默回退到折叠标记，不阻断正文生成
    return null;
  }
}
