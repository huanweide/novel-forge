// 宝宝流写作闭环（共享模块）
//
// 把「写章节 / 微调 refine / 续写 continue」三条生成路由共用的
// 「记忆召回（剧情推进 = 记忆召回）」与「写后自动填表（正文 → 填表 → 召回 → 正文）」
// 沉淀到此处作为单一事实来源，避免三套重复逻辑、并保证行为一致。
//
// - buildRecallBlock: 生成前，按上下文召回世界书/结构化表格记忆，返回可注入指令的块与命中项。
// - safeFillAfterWriting: 生成后，自动用 DeepSeek 抽取事实回填表格；失败不影响正文交付，
//   并（可选）通过 send 推送 babylore_fill 事件。

import { prisma } from "@/lib/prisma";
import { recallContext, RecallItem } from "./recall";
import { babyloreFill, FillResult } from "./fill";

export interface RecallBuildInput {
  projectId: string;
  /** 召回上下文文本：章节大纲 / 作者指令 / 前文 / 角色名 等拼接 */
  recallText: string;
  /** 世界书条目（LorebookEntry 数组） */
  loreEntries: any[];
}

export interface RecallBuildOutput {
  /** 追加到 writingInstruction 的召回块；无命中为空串 */
  block: string;
  /** 命中的记忆项，供 SSE 推送 babylore_recall 事件 */
  items: RecallItem[];
}

export async function buildRecallBlock(input: RecallBuildInput): Promise<RecallBuildOutput> {
  const { projectId, recallText, loreEntries } = input;

  const loreTablesRaw = await prisma.loreTable.findMany({ where: { projectId } });

  // 过滤"自动发现"占位世界书：内容含 [自动发现] 仅为待补充设定，召回会污染 prompt
  const cleanLore = (loreEntries || []).filter(
    (e: any) => !((e.content || "") as string).includes("[自动发现]"),
  );

  const recallRaw = recallContext(
    recallText,
    cleanLore as any,
    loreTablesRaw.map((t: any) => ({
      name: t.name,
      columns: t.columns || [],
      rows: t.rows || [],
    })),
  );

  // 优先保留结构化表格命中（精确），限制总数避免 prompt 膨胀
  const recallItems = [
    ...recallRaw.filter((i) => i.source === "table"),
    ...recallRaw.filter((i) => i.source === "lorebook"),
  ].slice(0, 12);

  if (recallItems.length === 0) return { block: "", items: [] };

  const block =
    "\n\n## 🧠 宝宝流记忆召回（剧情推进 = 记忆召回——请在写作中自然呼应，保持设定一致，但不要复述原文）\n" +
    recallItems
      .map(
        (it) =>
          `【${it.source === "lorebook" ? "世界书" : "结构化表格"}｜${it.title}】\n${it.content}`,
      )
      .join("\n\n");

  return { block, items: recallItems };
}

export interface FillAfterWritingInput {
  projectId: string;
  content: string;
  /** 可选的 SSE 发送函数；提供则推送 babylore_fill 事件 */
  send?: (o: object) => void;
}

/**
 * 生成后自动填表：用 DeepSeek 从正文抽取结构化事实回填表格。
 * 失败不影响正文交付；返回 FillResult，并（若提供 send）推送事件。
 */
export async function safeFillAfterWriting(input: FillAfterWritingInput): Promise<FillResult> {
  const { projectId, content, send } = input;

  let babylore: FillResult = { ok: false, operations: 0, applied: 0, error: "" };
  try {
    const fillRes = await babyloreFill(projectId, content);
    babylore = {
      ok: fillRes.ok,
      operations: fillRes.operations,
      applied: fillRes.applied,
      error: fillRes.error || "",
    };
  } catch (e) {
    babylore = {
      ok: false,
      operations: 0,
      applied: 0,
      error: e instanceof Error ? e.message : "填表异常",
    };
  }

  if (send) send({ type: "babylore_fill", ...babylore });
  return babylore;
}
