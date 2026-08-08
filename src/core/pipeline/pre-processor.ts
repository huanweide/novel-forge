/**
 * 预处理管线 —— 角色处理 / 规则注入 / 上下文构建
 *
 * write / refine / continue 三个路由共享的预处理逻辑，
 * 消除每个路由 ~50 行的复制粘贴。
 */

import { prisma } from "@/lib/prisma";
import { getActiveRules, injectRules } from "@/core/rules";
import { buildPromptContext } from "@/core/agents";
import { getTemplate } from "@/core/templates";
import { classifyEvents } from "@/lib/memory-classifier";
import type { CharacterCard, StoryNode } from "@/core/types";
import type { GenerationData, LLMExtract } from "./types";

// ─── 自建角色 ─────────────────────────────────────────────

/**
 * 处理用户请求的自建角色——如果角色名不存在则自动创建。
 * 返回扩展后的角色列表（原列表 + 新创建的角色）。
 */
export async function handleNewCharacters(
  characters: CharacterCard[],
  newCharacterRequests: string[] | undefined,
  projectId: string,
  context: string, // "本章" | "微调" | "续写"
): Promise<CharacterCard[]> {
  const allChars = [...characters] as any[];
  if (!Array.isArray(newCharacterRequests) || newCharacterRequests.length === 0) {
    return allChars;
  }

  for (const req of newCharacterRequests) {
    const name = (typeof req === "string" ? req : String(req)).trim();
    if (!name) continue;
    const exists = allChars.some(
      (c: any) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) continue;

    const created = await prisma.characterCard.create({
      data: {
        projectId,
        name,
        role: "supporting",
        personality: { dominant: `${context}时自建，待丰富` } as any,
        background: `[${context}] 用户要求自建角色`,
        abilities: [],
        tags: [`🆕 ${context}自建`],
        currentStatus: "alive",
        reviewStatus: "pending",
      } as any,
    });
    allChars.push(created as any);
  }

  return allChars;
}

// ─── 角色过滤 ─────────────────────────────────────────────

/**
 * 如果用户在前端确认了卡列表，只保留已确认的角色。
 */
export function filterByConfirmedCards(
  characters: CharacterCard[],
  confirmedCardIds: string[] | undefined,
): CharacterCard[] {
  if (!Array.isArray(confirmedCardIds) || confirmedCardIds.length === 0) {
    return characters;
  }
  const confirmedSet = new Set(confirmedCardIds);
  return characters.filter((c: any) => confirmedSet.has(c.id));
}

// ─── 用户备注 ─────────────────────────────────────────────

/**
 * 将用户对各个角色的备注拼成文本块，注入到 authorNote 中。
 */
export function buildCardNotesText(
  cardNotes: Record<string, string> | undefined,
  characters: CharacterCard[],
): string {
  if (!cardNotes || typeof cardNotes !== "object" || Object.keys(cardNotes).length === 0) {
    return "";
  }

  const noteLines: string[] = [];
  for (const [id, note] of Object.entries(cardNotes)) {
    if (!note || !note.trim()) continue;
    const char = characters.find((c: any) => c.id === id);
    if (char) {
      noteLines.push(`[${char.name}] ${note}`);
    }
  }

  return noteLines.length > 0
    ? "\n【用户角色备注——最高优先级】\n" + noteLines.join("\n")
    : "";
}

// ─── 作者指令 + 规则注入 ─────────────────────────────────

/**
 * 合并原始 authorNote + 角色备注 + 写作规则，返回最终注入的作者指令。
 */
export async function prepareAuthorNote(
  baseNote: string | undefined,
  cardNotes: Record<string, string> | undefined,
  characters: CharacterCard[],
  projectId: string,
): Promise<string> {
  let enriched = baseNote || "";

  const cardNotesText = buildCardNotesText(cardNotes, characters);
  if (cardNotesText) {
    enriched = enriched ? enriched + "\n\n" + cardNotesText : cardNotesText;
  }

  const writeRules = await getActiveRules(projectId, "write_only");
  return injectRules(enriched, writeRules);
}

// ─── LLM 配置提取 ─────────────────────────────────────────

/**
 * 从项目的 llmConfig 中提取温度/topP/禁用词/模板。
 * 优先级：项目自定义 > 文风模板默认值 > 硬编码兜底。
 */
export function extractLLMConfig(data: GenerationData): LLMExtract {
  const llmConfig = ((data.project.llmConfig || {}) as unknown as Record<string, unknown>);
  const templateId = (llmConfig.styleTemplateId as string) || "";
  const template = getTemplate(templateId);
  const customForbidden = (llmConfig.customForbiddenPatterns as string[]) || [];
  const effectiveTemperature =
    (llmConfig.temperature as number) ?? template?.temperature ?? 0.85;
  const effectiveTopP =
    (llmConfig.topP as number) ?? template?.topP ?? 0.95;

  return { template, customForbidden, effectiveTemperature, effectiveTopP };
}

// ─── 上下文构建 ───────────────────────────────────────────

/**
 * 构建统一的 PromptContext（委托给 orchestrator 中的 buildPromptContext）。
 * 这是一个薄封装，确保所有路由用同一套参数。
 */
export function buildGenerationContext(params: {
  data: GenerationData;
  activeCharacters: CharacterCard[];
  authorNote: string;
  previousNodes: StoryNode[];
  pendingCommitments?: any[];
}) {
  const { data, activeCharacters, authorNote, previousNodes, pendingCommitments = [] } = params;
  const pendingItems = (data.pendingItems || []) as any[];

  // ── S/A/B 三级记忆分级 ──
  const currentChapter = (data.currentNode?.order ?? 0) + 1;
  const tieredMemory = classifyEvents(
    data.summaries as any,
    data.storyBeats as any,
    (data.pendingCommitments || []) as any,
    (data.characters || []) as any,
    currentChapter,
  );

  return buildPromptContext({
    project: data.project as any,
    currentNode: data.currentNode,
    previousNodes: previousNodes as any,
    characters: activeCharacters as any,
    loreEntries: data.loreEntries as any,
    chapterSummaries: data.summaries as any,
    storyBeats: data.storyBeats as any,
    styleCard: data.styleCard as any,
    storylines: data.storylines as any,
    authorNote,
    pendingCommitments,
    pendingItems,
    tieredMemory,
    loreTables: data.loreTables as any,
  });
}
