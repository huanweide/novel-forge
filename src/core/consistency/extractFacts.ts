/**
 * 一致性事实基线（v1.6.51 新功能支柱）
 *
 * 从已归档章节摘要（ChapterSummary）+ 角色卡（CharacterCard）+ 世界书缓存（Project.globalPrompt）
 * 抽取"事实清单"——每条描述一个主体(subject)的某个属性(attribute)的确定值(value)，
 * 落库到 ConsistencyFact，供生成时注入提示词、打长篇小说前后不一致痛点。
 *
 * 设计要点：
 *  - parseFactsFromLLM 是纯函数，独立单测（LLM 返回的 JSON 常有 code fence / 前后废话，必须容错）。
 *  - extractConsistencyFacts 幂等：先 deleteMany 再 createMany，重复抽取不会堆积。
 */

import { prisma } from "@/lib/prisma";
import { completeText } from "@/core/llm/client";

export type ConsistencyCategory = "character" | "world" | "plot" | "relationship";

export interface RawFact {
  category: ConsistencyCategory;
  subject: string;
  attribute: string;
  value: string;
  source: string;
  confidence: number;
}

const CATEGORIES: ConsistencyCategory[] = [
  "character",
  "world",
  "plot",
  "relationship",
];

/**
 * 从 LLM 返回文本中解析事实清单数组。容错策略：
 *  1. 剥掉 ```json ... ``` 代码围栏
 *  2. 截取第一个 [ 到最后一个 ] 之间的内容（容忍前后废话）
 *  3. JSON.parse 失败整体返回空（不抛，避免一次坏响应炸掉整轮）
 */
export function parseFactsFromLLM(text: string): RawFact[] {
  if (!text || typeof text !== "string") return [];
  let s = text.trim();

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
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

  const facts: RawFact[] = [];
  for (const item of parsed) {
    const f = normalizeFact(item);
    if (f) facts.push(f);
  }
  return facts;
}

function normalizeFact(item: unknown): RawFact | null {
  if (!item || typeof item !== "object") return null;
  const x = item as Record<string, unknown>;

  const subject = String(x.subject ?? x.name ?? "").trim();
  const attribute = String(x.attribute ?? x.key ?? "").trim();
  const value = String(x.value ?? x.fact ?? "").trim();
  if (!subject || !attribute || !value) return null;

  const rawCat = String(x.category ?? "").toLowerCase();
  const category: ConsistencyCategory = (CATEGORIES as string[]).includes(rawCat)
    ? (rawCat as ConsistencyCategory)
    : "world";

  let confidence = typeof x.confidence === "number" ? x.confidence : 1.0;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    category,
    subject,
    attribute,
    value,
    source: String(x.source ?? "").trim(),
    confidence,
  };
}

interface ExtractProjectShape {
  name: string;
  synopsis: string;
  globalPrompt: string;
  characters: Array<{ name: string; description?: string | null }>;
  chapterSummaries: Array<{
    chapterId: string;
    chapterTitle: string;
    summary: string;
  }>;
}

/**
 * 聚集抽取上下文：角色卡 + 已归档章节摘要（世界书已并入 globalPrompt）。
 */
function buildExtractionContext(project: ExtractProjectShape): string {
  const parts: string[] = [];

  if (project.characters?.length) {
    parts.push(
      "【角色卡】\n" +
        project.characters
          .map((c) => `- ${c.name}: ${String(c.description ?? "").slice(0, 200)}`)
          .join("\n"),
    );
  }
  if (project.chapterSummaries?.length) {
    parts.push(
      "【已归档章节摘要】\n" +
        project.chapterSummaries
          .map((s) => `第${s.chapterId}章《${s.chapterTitle}》: ${s.summary}`)
          .join("\n"),
    );
  }
  return parts.join("\n\n");
}

const EXTRACTION_SYSTEM = `你是一致性事实抽取器。从给定的小说设定与已写章节摘要中，抽取可被后续写作引用的"事实清单"。
每条事实描述一个主体(subject)的某个属性(attribute)的确定值(value)。
类别(category)限四选一：character(人物) / world(世界) / plot(情节) / relationship(关系)。
只抽取文中明确陈述或可高置信推断的事实，严禁编造。
返回 JSON 数组，每条字段：category, subject, attribute, value, source, confidence(0~1)。`;

/**
 * 抽取并落库一致性事实基线（幂等）。
 * @returns 抽取到的条数与事实清单
 */
export async function extractConsistencyFacts(
  projectId: string,
  opts?: { model?: string },
): Promise<{ count: number; facts: RawFact[] }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      chapterSummaries: { orderBy: { createdAt: "asc" } },
      characters: true,
    },
  });
  if (!project) throw new Error(`Project ${projectId} not found`);

  const context = buildExtractionContext(project as unknown as ExtractProjectShape);
  const prompt =
    `【作品】${project.name}\n` +
    `【主线总纲】${project.synopsis || "（无）"}\n` +
    `【世界书/风格缓存】${project.globalPrompt || "（无）"}\n\n` +
    `${context}\n\n请输出事实清单 JSON 数组。`;

  const text = await completeText(EXTRACTION_SYSTEM, prompt, {
    temperature: 0.2,
    maxTokens: 2500,
    model: opts?.model,
  });

  const facts = parseFactsFromLLM(text);

  // 幂等：先清后插，重复抽取不堆积
  await prisma.consistencyFact.deleteMany({ where: { projectId } });
  if (facts.length > 0) {
    await prisma.consistencyFact.createMany({
      data: facts.map((f) => ({ projectId, ...f })),
    });
  }
  return { count: facts.length, facts };
}

/**
 * 读取项目的一致性事实基线。
 */
export async function getConsistencyFacts(projectId: string) {
  return prisma.consistencyFact.findMany({
    where: { projectId },
    orderBy: [{ category: "asc" }, { subject: "asc" }, { attribute: "asc" }],
  });
}

/**
 * 生成可注入提示词的一致性基线文本块（供 prompt 注入层调用）。
 */
export async function getConsistencyBaselineText(projectId: string): Promise<string> {
  const facts = await getConsistencyFacts(projectId);
  if (facts.length === 0) return "";
  const lines = facts.map(
    (f) => `- [${f.category}] ${f.subject} 的${f.attribute} = ${f.value}${f.source ? `（来源：${f.source}）` : ""}`,
  );
  return `【一致性事实基线——写作时务必严格遵守，前后不得矛盾】\n${lines.join("\n")}`;
}
