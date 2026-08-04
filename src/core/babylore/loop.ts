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
import { babyloreFill, markChapterFilled, FillResult } from "./fill";
import { evaluateIfCell } from "./ifcell";
import { buildProjectOverrides } from "@/core/llm/client";

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
  // 同时排除 depth<=2 的强制层（已由 assemblePrompt 的 forcedLore 常驻注入，避免重复注入）
  const cleanLore = (loreEntries || []).filter(
    (e: any) =>
      !((e.content || "") as string).includes("[自动发现]") &&
      (typeof e.depth === "number" ? e.depth > 2 : true),
  );

  // 表格形态（供召回匹配 + <if cell> 分阶段人设求值共用）
  const tableShapes = loreTablesRaw.map((t: any) => ({
    name: t.name,
    columns: t.columns || [],
    rows: t.rows || [],
  }));

  const recallRaw = recallContext(recallText, cleanLore as any, tableShapes);

  // 按特异性（score=命中关键词长度）降序，优先保留高价值长词命中（避免 200+ 词条时截掉关键长词），
  // 再 table 精确命中优先于 lorebook，限制总数避免 prompt 膨胀
  const sorted = [...recallRaw].sort((a, b) => b.score - a.score);
  const recallItems = [
    ...sorted.filter((i) => i.source === "table"),
    ...sorted.filter((i) => i.source === "lorebook"),
  ].slice(0, 12);

  console.log(`[recall] project=${projectId} 召回命中 ${recallItems.length} 条 (table/lorebook)`);
  if (recallItems.length === 0) return { block: "", items: [] };

  // 世界书条目若含 <if cell> 分阶段人设语法，则按当前表格数值求值，
  // 注入"当前激活的人设阶段"纯文本（而非把语法标签丢给 LLM）。
  // 同时把求值结果写回 items，使 babylore_recall 事件携带的是已求值内容（透明可见）。
  const evaluatedItems = recallItems.map((it) => {
    if (it.source === "lorebook" && (it.content || "").includes("<if cell")) {
      return { ...it, content: evaluateIfCell(it.content, tableShapes), evaluated: true } as any;
    }
    return it;
  });

  const block =
    "\n\n## 🧠 宝宝流记忆召回（剧情推进 = 记忆召回——请在写作中自然呼应，保持设定一致，但不要复述原文）\n" +
    evaluatedItems
      .map(
        (it) =>
          `【${it.source === "lorebook" ? "世界书" : "结构化表格"}｜${it.title}】\n${it.content}`,
      )
      .join("\n\n");

  return { block, items: evaluatedItems };
}

export interface FillAfterWritingInput {
  projectId: string;
  content: string;
  /** 可选的 SSE 发送函数；提供则推送 babylore_fill 事件 */
  send?: (o: object) => void;
  /** 当前章序号（0-based）；用于频率判断。未传则按"必填"处理。 */
  nodeOrder?: number;
  /** 当前节点是否为最新节点（最后一章）；用于"跳过最近一章"判断。 */
  isLatestChapter?: boolean;
  /** 当前章节节点 ID；填表成功后写入防重复标记，使一键填表 fill-all 真正跳过已填章节（墨白 F1） */
  nodeId?: string;
  /** 项目级 LLM 覆盖（Json）；非空字段覆盖全局设置，使自动填表也走项目 key */
  projectLlmConfig?: Record<string, unknown> | null;
}

/**
 * 生成后自动填表：用 DeepSeek 从正文抽取结构化事实回填表格。
 * 失败不影响正文交付；返回 FillResult，并（若提供 send）推送事件。
 */
export async function safeFillAfterWriting(input: FillAfterWritingInput): Promise<FillResult> {
  const { projectId, content, send, nodeOrder, isLatestChapter, nodeId, projectLlmConfig } = input;

  // ── 频率 / 跳过配置（用户逻辑 2c：填表频率可配 + 默认跳过最近章）──
  let cfg: { autoFillEnabled?: boolean; fillFrequency?: number; skipLatestChapter?: boolean } | null = null;
  try {
    cfg = await prisma.project.findUnique({
      where: { id: projectId },
      select: { autoFillEnabled: true, fillFrequency: true, skipLatestChapter: true },
    });
  } catch {
    /* 配置读取失败则用默认（开启 + 每3章 + 跳过最近章） */
  }
  const autoFill = cfg?.autoFillEnabled ?? true;
  if (!autoFill) {
    if (send) send({ type: "babylore_fill", skipped: true, reason: "disabled" });
    return { ok: false, operations: 0, applied: 0, error: "自动填表已关闭" };
  }
  const freq = typeof cfg?.fillFrequency === "number" && cfg.fillFrequency > 0 ? cfg.fillFrequency : 3;
  const skipLatest = cfg?.skipLatestChapter ?? true;
  // 默认跳过最近一章：用户可能重 roll（重新生成）后改写，避免把临时稿写进表格。
  if (skipLatest && isLatestChapter) {
    if (send) send({ type: "babylore_fill", skipped: true, reason: "skipLatestChapter" });
    return { ok: false, operations: 0, applied: 0, error: "跳过最近一章（用户可能重 roll）" };
  }
  // 频率：每 freq 章填一次（基于 1-based 章序号，整除才填）。未传 nodeOrder 则按必填处理。
  if (typeof nodeOrder === "number" && freq > 0) {
    const chapterNum = nodeOrder + 1;
    if (chapterNum % freq !== 0) {
      const nextAt = freq - (chapterNum % freq);
      if (send) send({ type: "babylore_fill", skipped: true, reason: "frequency", frequency: freq, nextChapter: nextAt });
      return { ok: false, operations: 0, applied: 0, error: `每 ${freq} 章填一次，本张不填` };
    }
  }

  // ── 无结构化表格时自动建默认表，保证"生成一章即自动填表"闭环成立 ──
  const tableCount = await prisma.loreTable.count({ where: { projectId } });
  if (tableCount === 0) {
    await prisma.loreTable.create({
      data: {
        projectId,
        key: "auto_facts",
        name: "章节事实表",
        note: "自动填表默认表：记录角色属性 / 关系 / 资产等结构化事实。可在创意工坊删除或细化。",
        category: "auto",
        columns: [
          { key: "name", label: "名称", type: "text", unique: true },
          { key: "status", label: "状态", type: "text" },
          { key: "note", label: "说明", type: "text" },
        ],
        rows: [],
      },
    });
    console.log(`[babylore] 项目无结构化表格，已自动创建默认「章节事实表」project=${projectId}`);
  }

  let babylore: FillResult = { ok: false, operations: 0, applied: 0, error: "" };
  try {
    // P1-①（墨白）：透传已解构的 nodeOrder，使 fill.ts 写入行的 _src 形如 ch3:batchmanual（章节段非空），
    // 修复「溯源主链路断线」（此前漏传导致 _src 恒为 ch?:batchmanual）。
    const fillRes = await babyloreFill(projectId, content, { projectLlmConfig, chapterOrder: nodeOrder });
    babylore = {
      ok: fillRes.ok,
      operations: fillRes.operations,
      applied: fillRes.applied,
      error: fillRes.error || "",
      selfCheckIssues: fillRes.selfCheckIssues,
    };
  } catch (e) {
    babylore = {
      ok: false,
      operations: 0,
      applied: 0,
      error: e instanceof Error ? e.message : "填表异常",
    };
  }

  // 写章自动填表成功后，复用 fill.ts 的防重复标记，使一键 fill-all 真正跳过已填章节（墨白 F1）
  // P0-3：门槛由 babylore.ok 提升为 ok && applied>0，空 ops/全失效章不标已填，留待重试。
  if (babylore.ok && babylore.applied > 0 && nodeId) {
    try {
      markChapterFilled(projectId, nodeId);
    } catch {
      /* 标记失败不影响正文交付 */
    }
  }

  console.log(`[babylore] 填表 project=${projectId} chapter=${(nodeOrder ?? 0) + 1} ok=${babylore.ok} ops=${babylore.operations} applied=${babylore.applied}${babylore.error ? " err=" + babylore.error : ""}`);
  if (send) send({ type: "babylore_fill", ...babylore });
  return babylore;
}
