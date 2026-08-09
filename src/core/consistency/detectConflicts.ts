/**
 * 一致性冲突检测（v1.6.51.4 B 任务）
 *
 * 生成新章节后，把「新章正文」与已确立的「一致性事实基线」比对，找出前后矛盾，
 * 落库到 ConsistencyConflict 供作者逐条「已修正 / 忽略」处理。
 *
 * 设计要点（与 extractFacts.ts 同构）：
 *  - parseConflictsFromLLM 是纯函数，独立单测（LLM 返回常有 code fence / 前后废话，必须容错）。
 *  - detectConsistencyConflicts 在落库前先 deleteMany 同章 open 冲突，再 createMany，
 *    同一章重复检测不会堆积脏数据（幂等，按 nodeId 维度）。
 *  - 只标红、不自动改写：创作主权归作者。
 */

import { prisma } from "@/lib/prisma";
import { completeText } from "@/core/llm/client";
import { getConsistencyFacts } from "@/core/consistency/extractFacts";

export interface RawConflict {
  factId?: string | null;
  category: string;
  description: string;
  excerpt: string;
}

/**
 * 从 LLM 返回文本中解析冲突清单数组。容错策略同 parseFactsFromLLM：
 *  1. 剥掉 ```json ... ``` 代码围栏
 *  2. 截取第一个 [ 到最后一个 ] 之间的内容（容忍前后废话）
 *  3. JSON.parse 失败整体返回空（不抛，避免一次坏响应炸掉整轮）
 */
export function parseConflictsFromLLM(text: string): RawConflict[] {
  if (!text || typeof text !== "string") return [];
  let s = text.trim();

  const fence = s.match(/```(?:json|text|markdown)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];

  const arrText = s.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(arrText);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const conflicts: RawConflict[] = [];
  for (const item of parsed) {
    const c = normalizeConflict(item);
    if (c) conflicts.push(c);
  }
  return conflicts;
}

function normalizeConflict(item: unknown): RawConflict | null {
  if (!item || typeof item !== "object") return null;
  const x = item as Record<string, unknown>;

  const description = String(x.description ?? x.conflict ?? "").trim();
  if (!description) return null; // description 是冲突的核心，缺失即无效

  const category = String(x.category ?? "").trim();
  const excerpt = String(x.excerpt ?? "").trim();
  const factId = x.factId ? String(x.factId) : null;

  return { factId, category, description, excerpt };
}

const DETECTION_SYSTEM = `你是一致性冲突检测员。给定「已确立的事实基线」（写作时不可违背的设定）与「新写章节正文」，
请逐条比对正文是否推翻了基线中的任何事实。只报告真正的矛盾（正文明确说了与基线相反的内容），
不要报告正常的情节推进、不要报告基线上没有对应项的新信息。
返回 JSON 数组，每条字段：
- factId：若冲突对应基线中某条事实，填该事实的 id（[id] 方括号内的值）；无关则省略
- category：冲突所属类别（与基线类别一致，或留空）
- description：人话说明矛盾（例如「正文说主角左眼是黑色，但基线记的是灰色」）
- excerpt：正文中引发冲突的原文摘录（尽量短）
若无矛盾，返回空数组 []。`;

/**
 * 检测并落库一致性冲突（按 nodeId 幂等）。
 * @returns 检测到的冲突清单（已落库）
 */
export async function detectConsistencyConflicts(
  projectId: string,
  nodeId: string,
  chapterContent: string,
): Promise<RawConflict[]> {
  // 无基线可比对则直接返回（避免空对空误报）
  const facts = await getConsistencyFacts(projectId);
  if (facts.length === 0) return [];

  const baselineText = facts
    .map((f) => `- [${f.id}] [${f.category}] ${f.subject} 的${f.attribute} = ${f.value}`)
    .join("\n");

  const prompt =
    `【已确立的一致性事实基线（写作时不可违背）】\n${baselineText}\n\n` +
    `【新写章节正文】\n${chapterContent}\n\n` +
    `请比对正文与上述基线，找出任何前后矛盾，输出冲突 JSON 数组。`;

  const text = await completeText(DETECTION_SYSTEM, prompt, {
    temperature: 0.2,
    maxTokens: 1500,
  });

  const conflicts = parseConflictsFromLLM(text);

  // 幂等：清除本章已有 open 冲突，再写入本次检测结果（避免重复检测堆积）
  await prisma.consistencyConflict.deleteMany({
    where: { projectId, nodeId, status: "open" },
  });
  if (conflicts.length > 0) {
    await prisma.consistencyConflict.createMany({
      data: conflicts.map((c) => ({
        projectId,
        nodeId,
        factId: c.factId ?? null,
        category: c.category,
        description: c.description,
        excerpt: c.excerpt,
        status: "open",
      })),
    });
  }
  return conflicts;
}
