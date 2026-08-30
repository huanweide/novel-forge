/**
 * globalPrompt 同步引擎
 *
 * 将三卡（角色+世界书+风格）预编译为系统提示词，存入 Project.globalPrompt。
 * 卡有变动 → 调 syncGlobalPrompt(projectId) → 刷新缓存。
 * 生成路由直接读 project.globalPrompt，不需要再逐个查卡。
 *
 * v3.1.50：project.genre/toneKeywords 已是 String（v3.1.49 修了数组 vs String 类型），
 * safeJoin 统一兼容 String / string[] / 逗号顿号分隔文本。
 */
import { safeJoin } from "@/lib/utils";

import { prisma } from "@/lib/prisma";
import { getApprovedCharacters, getApprovedLore } from "@/lib/approved-cards";
import { getTemplate } from "@/core/templates";
import { ALL_WORLD_CATEGORIES, WORLD_CATEGORY_LABELS } from "@/lib/world-category-classifier";
import type { BuildConfig } from "@/core/explore/types";
import { PLOT_STRUCTURE_LABEL } from "@/core/explore/build-prompt";

/**
 * 全局提示词预算（中文按字符计）。目标把全量设定压到 ≈14K 字符（约 8~9K token），
 * 远小于 CONTEXT_WINDOW_SIZE=131072 窗口，给「章节正文 + 输出」留足空间。
 * 这是「单章速率」与「token 成本」的头号优化点（v2.52.0）。
 */
const GLOBAL_PROMPT_BUDGET = 14000;

/** buildGlobalPrompt 预算裁剪的降级梯度：从「宽松保真」逐档收紧直到 fit 预算。 */
const BUDGET_TIERS: Array<{ loreCap: number; bgCap: number; maxPerCat: number; maxChars: number }> = [
  { loreCap: 400, bgCap: 320, maxPerCat: 99, maxChars: 99 }, // 宽松：单条充分保留
  { loreCap: 250, bgCap: 200, maxPerCat: 12, maxChars: 24 }, // 轻度收紧
  { loreCap: 150, bgCap: 120, maxPerCat: 8, maxChars: 14 }, // 中度收紧
  { loreCap: 90, bgCap: 80, maxPerCat: 5, maxChars: 9 }, // 最紧：只留骨架
];

/** 角色定位分组顺序（决定重要度，超预算时靠后的角色先被省略）。 */
const ROLE_ORDER = ["protagonist", "antagonist", "mentor", "love_interest", "supporting", "background"];
const ROLE_LABEL: Record<string, string> = {
  protagonist: "★ 主角", antagonist: "◆ 反派", mentor: "◈ 导师",
  love_interest: "♡ 恋爱", supporting: "● 配角", background: "○ 背景",
};

/**
 * 世界卡按 title 去重：套用创意工坊预设会累积同名世界卡（同 title 多条），
 * 只保留最长的一条，避免重复内容无限撑大 globalPrompt。无 title 的卡用
 * category+内容前缀做引用去重，避免丢数据。
 */
export function dedupeLore(entries: any[]): any[] {
  const map = new Map<string, any>();
  for (const e of entries) {
    const key = (e?.title || "").trim();
    if (!key) {
      const refKey = `::${e?.category || "custom"}:${(e?.content || "").slice(0, 40)}`;
      if (!map.has(refKey)) map.set(refKey, e);
      continue;
    }
    const prev = map.get(key);
    if (!prev || (e.content?.length || 0) > (prev.content?.length || 0)) map.set(key, e);
  }
  return [...map.values()];
}

/**
 * 构建并写入 globalPrompt。
 * 调用时机：角色卡/世界书/风格卡 创建、更新、删除后。
 */
export async function syncGlobalPrompt(projectId: string): Promise<string | null> {
  try {
    const [project, characters, loreEntries, styleCard] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true, genre: true, synopsis: true, toneKeywords: true, authorNote: true, llmConfig: true, buildConfig: true } }),
      getApprovedCharacters(prisma, projectId),
      getApprovedLore(prisma, projectId),
      prisma.styleCard.findFirst({ where: { projectId }, orderBy: { updatedAt: "desc" } }),
    ]);

    if (!project) return null;

    const prompt = buildGlobalPrompt(project, characters, loreEntries, styleCard as Record<string, unknown> | null);

    await prisma.project.update({
      where: { id: projectId },
      data: { globalPrompt: prompt },
    });

    // #316/#317：把本次刷新写入版本快照（独立 try，失败仅 log 不阻断主流程）。
    // 版本号取「该项目当前最大 version + 1」，回写 Project.currentPromptVersion 作为当前生效版本指针。
    recordGlobalPromptRevision(projectId, prompt, "sync").catch((e) => {
      console.error(`❌ [sync] globalPrompt 版本快照写入失败 (${projectId.slice(0, 8)}...):`, e instanceof Error ? e.message : String(e));
    });

    return prompt;
  } catch (e) {
    console.error(`❌ [sync] globalPrompt 刷新失败 (${projectId.slice(0, 8)}...):`, e instanceof Error ? e.message : String(e));
    return null;
  }
}

export function buildGlobalPrompt(
  project: { name: string; genre: unknown; synopsis: string; toneKeywords: unknown; authorNote?: string; llmConfig?: unknown; buildConfig?: unknown },
  characters: any[],
  loreEntries: any[],
  styleCard: Record<string, unknown> | null,
): string {
  // 预算循环：从宽松 tier 逐级收紧，首个 fit 预算的即采用；都超则最紧 tier + 硬截断兜底。
  let lastFull = "";
  for (const tier of BUDGET_TIERS) {
    const full = assembleGlobalPrompt(project, characters, loreEntries, styleCard, tier);
    lastFull = full;
    if (full.length <= GLOBAL_PROMPT_BUDGET) return full;
  }
  return hardTruncate(lastFull, GLOBAL_PROMPT_BUDGET);
}

/** 按给定预算档位拼装完整 globalPrompt（纯函数，无副作用）。 */
function assembleGlobalPrompt(
  project: { name: string; genre: unknown; synopsis: string; toneKeywords: unknown; authorNote?: string; llmConfig?: unknown; buildConfig?: unknown },
  characters: any[],
  loreEntries: any[],
  styleCard: Record<string, unknown> | null,
  tier: { loreCap: number; bgCap: number; maxPerCat: number; maxChars: number },
): string {
  const parts: string[] = [];

  // ═══════════════════════════════════════════
  // 第一部分：作品信息
  // ═══════════════════════════════════════════
  parts.push(`# 作品：《${project.name}》
类型：${safeJoin(project.genre)}
基调：${safeJoin(project.toneKeywords)}
总纲：${project.synopsis || "（未设置）"}`);

  if (project.authorNote?.trim()) {
    parts.push(`\n## 作者指令（最高优先级）
${project.authorNote}`);
  }

  // ═══════════════════════════════════════════
  // 第一部分·补：探讨模式结构配置（buildConfig）
  // v1.6.41：纳为单一真相源。此前 sync 不读 buildConfig，导致 explore 布置的
  // 受众/篇幅/情节结构/原创人名/自动故事线/流派标签/核心冲突/力量体系/金手指/风格偏好
  // 在 sync 重写 globalPrompt 时被静默丢弃（explore 建项目与 build-config PATCH 双漏口）。
  // 非 explore 项目 buildConfig 为空，判空跳过，不影响既有行为。
  // ═══════════════════════════════════════════
  const bc = project.buildConfig as unknown as BuildConfig | null | undefined;
  if (bc && typeof bc === "object") {
    const bcParts: string[] = [];
    bcParts.push(`\n## 探讨布置（结构配置）`);
    if (bc.audience) bcParts.push(`- 受众：${bc.audience}`);
    if (bc.wordCount) bcParts.push(`- 篇幅：${bc.wordCount}`);
    if (bc.plotStructure) bcParts.push(`- 情节结构：${PLOT_STRUCTURE_LABEL[bc.plotStructure] || bc.plotStructure}`);
    bcParts.push(`- 强制原创人名：${bc.forceOriginalNames ? "是" : "否"}`);
    bcParts.push(`- 自动生成故事线：${bc.autoGenerateStoryline ? "是" : "否"}`);
    if (Array.isArray(bc.styleTags) && bc.styleTags.length) bcParts.push(`- 流派标签：${bc.styleTags.join("、")}`);
    if (bc.coreConflict?.trim()) bcParts.push(`- 核心冲突：${bc.coreConflict}`);
    if (bc.powerSystem?.trim()) bcParts.push(`- 力量体系：${bc.powerSystem}`);
    if (bc.goldenFinger?.trim()) bcParts.push(`- 金手指：${bc.goldenFinger}`);
    if (bc.stylePreference?.trim()) bcParts.push(`- 风格偏好：${bc.stylePreference}`);
    parts.push(bcParts.join("\n"));
  }

  // ═══════════════════════════════════════════
  // 第二部分：角色卡（预算档位控制每角色背景长度 + 角色总数上限）
  // ═══════════════════════════════════════════
  parts.push(buildCharacterSection(characters, tier.bgCap, tier.maxChars));

  // ═══════════════════════════════════════════
  // 第三部分：世界书（去重 + 单条内容截断 + 每类条数上限）
  // ═══════════════════════════════════════════
  parts.push(buildLoreSection(loreEntries, tier.loreCap, tier.maxPerCat));

  // ═══════════════════════════════════════════
  // 第四部分：风格卡
  // ═══════════════════════════════════════════
  const styleSec = buildStyleSection(styleCard);
  if (styleSec) parts.push(styleSec);

  // ═══════════════════════════════════════════
  // 第五部分：文风模板（最高优先级）
  // ═══════════════════════════════════════════
  const tplSec = buildTemplateSection(project);
  if (tplSec) parts.push(tplSec);

  return parts.join("\n");
}

/** 角色卡段：按 ROLE_ORDER 分组拼接；background 截断到 bgCap；超 maxChars 时靠后角色省略。 */
function buildCharacterSection(characters: any[], bgCap: number, maxChars: number): string {
  if (!Array.isArray(characters) || characters.length === 0) return "# 角色卡（共0人）";

  // 按重要度平铺：ROLE_ORDER 已把主角/反派排前，超 maxChars 时靠后（背景角色）先省。
  const flat: any[] = [];
  for (const role of ROLE_ORDER) {
    const group = characters.filter((c: any) => c.role === role);
    for (const c of group) flat.push(c);
  }
  const kept = flat.slice(0, maxChars);

  const lines: string[] = [`# 角色卡（共${kept.length}人）`];
  for (const c of kept) {
    const charParts: string[] = [];
    charParts.push(`### ${c.name}${c.aliases?.length ? `（别名：${c.aliases.join("、")}）` : ""}`);
    charParts.push(`- 定位：${ROLE_LABEL[c.role] || c.role} | 状态：${c.currentStatus || "存活"} | 年龄：${c.age || "未知"} | 性别：${c.gender || "未知"}`);

    // 外貌
    const app = typeof c.appearance === "object" && !Array.isArray(c.appearance) ? c.appearance as Record<string, unknown> : {};
    const appParts: string[] = [];
    if (app.hair) appParts.push(`发：${app.hair}`);
    if (app.eyes) appParts.push(`眼：${app.eyes}`);
    if (app.height) appParts.push(`身高：${app.height}`);
    if (app.build) appParts.push(`体型：${app.build}`);
    if (app.distinguishing) appParts.push(`特征：${app.distinguishing}`);
    if (app.attire) appParts.push(`着装：${app.attire}`);
    if (appParts.length) charParts.push(`- 外貌：${appParts.join(" | ")}`);

    // 性格五维
    const p = typeof c.personality === "object" && !Array.isArray(c.personality) ? c.personality as Record<string, unknown> : {};
    if (p.dominant || p.drive || p.contradiction) {
      const pParts: string[] = [];
      if (p.dominant) pParts.push(`主导：${p.dominant}`);
      if (p.drive) pParts.push(`驱动：${p.drive}`);
      if (p.contradiction) pParts.push(`矛盾：${p.contradiction}`);
      if (p.socialMask) pParts.push(`面具：${p.socialMask}`);
      if (Array.isArray(p.habits) && p.habits.length) pParts.push(`习惯：${(p.habits as string[]).join("、")}`);
      charParts.push(`- 性格：${pParts.join(" | ")}`);
    } else if (Array.isArray(c.personality) && c.personality.length) {
      charParts.push(`- 性格：${c.personality.join("、")}`);
    }

    // 背景（截断到 bgCap，保留细节但防超长）
    if (c.background && c.background.length > 10) {
      const bg = c.background.length > bgCap ? `${c.background.slice(0, bgCap)}…` : c.background;
      charParts.push(`- 背景：${bg}`);
    }

    // 能力
    if (Array.isArray(c.abilities) && c.abilities.length) {
      charParts.push(`- 能力：${c.abilities.join("；")}`);
    }

    // 隐藏动机
    if (Array.isArray(c.hiddenMotives) && c.hiddenMotives.length) {
      charParts.push(`- 隐藏动机：${c.hiddenMotives.join("；")}`);
    }

    // 人际关系
    if (Array.isArray(c.relationships) && c.relationships.length) {
      const relText = c.relationships.map((r: any) =>
        `${r.targetName || "?"}(${r.relation || "?"}${r.dynamic ? `·${r.dynamic}` : ""})`
      ).join("、");
      if (relText) charParts.push(`- 关系：${relText}`);
    }

    // 经历时间线（防OOC）
    if (Array.isArray(c.timeline) && c.timeline.length) {
      const tlText = c.timeline.map((t: any) =>
        `${t.age || "?"}岁：${t.event}${t.reference ? `（${t.reference}）` : ""}`
      ).join("；");
      if (tlText) charParts.push(`- 时间线：${tlText}`);
    }

    // 说话风格
    const ds = typeof c.dialogueStyle === "object" ? c.dialogueStyle as Record<string, unknown> : {};
    if (ds?.description || Array.isArray(ds?.examples)) {
      const dsParts: string[] = [];
      if (ds.description) dsParts.push(ds.description as string);
      if (Array.isArray(ds.examples) && ds.examples.length) dsParts.push(`示例：${(ds.examples as string[]).join(" / ")}`);
      charParts.push(`- 说话风格：${dsParts.join("。")}`);
    }

    // 标签
    if (Array.isArray(c.tags) && c.tags.length) {
      charParts.push(`- 标签：${c.tags.join("、")}`);
    }

    lines.push(charParts.join("\n"));
  }
  return lines.join("\n");
}

/** 世界书段：按权威分类派生顺序分组；同 title 去重；单条 content 截断到 loreCap；每组至多 maxPerCat 条。 */
function buildLoreSection(loreEntries: any[], loreCap: number, maxPerCat: number): string {
  const deduped = dedupeLore(loreEntries || []);
  const lines: string[] = [`# 世界书（共${deduped.length}条）`];

  for (const cat of ALL_WORLD_CATEGORIES) {
    let group = deduped.filter((e: any) => (e.category || "custom") === cat);
    if (group.length === 0) continue;
    if (group.length > maxPerCat) group = group.slice(0, maxPerCat);

    lines.push(`\n## ${WORLD_CATEGORY_LABELS[cat] || cat}（${group.length}条）`);
    for (const e of group) {
      lines.push(`- **${e.title}**${e.keys?.length ? ` [触发词：${e.keys.join("、")}]` : ""}`);
      if (e.content?.length > 5) {
        const content = e.content.length > loreCap ? `${e.content.slice(0, loreCap)}…` : e.content;
        lines.push(`  ${content}`);
      }
    }
  }
  return lines.join("\n");
}

/** 风格卡段（字段齐全，不变）。 */
function buildStyleSection(styleCard: Record<string, unknown> | null): string | null {
  if (!styleCard) return null;
  const s = styleCard;
  const sParts: string[] = [];
  sParts.push(`\n# 文风设定`);

  if (s.styleDescription) sParts.push(`- 文风描述：${s.styleDescription}`);
  const POV_MAP: Record<string, string> = {
    first_person: "第一人称（「我」的视角，代入感强）",
    third_person_limited: "第三人称限知（单角色视角，仅展现其感知）",
    third_person_omniscient: "第三人称全知（上帝视角，跨越多角色心理）",
    second_person: "第二人称（「你」的视角，沉浸式互动）",
  };
  const rawPov = (s.povType as string) || "";
  const pov = POV_MAP[rawPov] || rawPov;
  if (pov) sParts.push(`- 叙事视角：${pov}`);
  if (s.narrativeDistance) sParts.push(`- 叙事距离：${s.narrativeDistance}`);
  if (s.avgSentenceLength) sParts.push(`- 平均句长：${s.avgSentenceLength}字`);

  const ratios: string[] = [];
  if (s.dialogueRatio !== undefined) ratios.push(`对话${Math.round((s.dialogueRatio as number) * 100)}%`);
  if (s.descriptionRatio !== undefined) ratios.push(`描写${Math.round((s.descriptionRatio as number) * 100)}%`);
  if (s.actionRatio !== undefined) ratios.push(`动作${Math.round((s.actionRatio as number) * 100)}%`);
  if (s.innerThoughtRatio !== undefined) ratios.push(`内心${Math.round((s.innerThoughtRatio as number) * 100)}%`);
  if (ratios.length) sParts.push(`- 叙事比例：${ratios.join(" / ")}`);

  if (s.tonalMarkers && typeof s.tonalMarkers === "object") {
    const tones = Object.entries(s.tonalMarkers as Record<string, number>)
      .filter(([, v]) => v > 0.15)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `${k}(${Math.round(v * 100)}%)`).join("、");
    if (tones) sParts.push(`- 语气标记：${tones}`);
  }

  if (s.lexicalFeatures && typeof s.lexicalFeatures === "object") {
    const lex = Object.entries(s.lexicalFeatures as Record<string, number>)
      .filter(([, v]) => v > 0.1)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `${k}(${Math.round(v * 100)}%)`).join("、");
    if (lex) sParts.push(`- 词汇特征：${lex}`);
  }

  if (s.sampleText) sParts.push(`- 风格样本：${String(s.sampleText).slice(0, 400)}`);

  return sParts.join("\n");
}

/** 文风模板段（最高优先级，不变）。 */
function buildTemplateSection(project: { llmConfig?: unknown }): string | null {
  if (!project.llmConfig) return null;
  const config = project.llmConfig as Record<string, unknown>;
  const templateId = (config.styleTemplateId as string) || "";
  if (!templateId || templateId === "custom") return null;
  const template = getTemplate(templateId);
  if (!template) return null;

  const parts: string[] = [];
  parts.push(`\n# 文风模板——${template.name}——最高优先级`);
  if (template.stylePrompt) parts.push(template.stylePrompt);
  if (template.forbiddenPatterns.length > 0) {
    parts.push(`\n## 禁止以下表达`);
    parts.push(template.forbiddenPatterns.map((p) => `- 禁止使用：${p}`).join("\n"));
  }
  if (template.pacingGuide) parts.push(`\n## 节奏指引\n${template.pacingGuide}`);
  if (template.dialogueGuide) parts.push(`\n## 对话指引\n${template.dialogueGuide}`);
  return parts.join("\n");
}

/**
 * 兜底硬截断：把长度压到预算内、附一句精简说明。后缀长度计入预算（总长绝不超 budget）。
 * 截断策略（v2.53.0 钉死契约）：
 *  - 仅在「最后一个换行落在预算 80% 之后」时切到段落边界——即含该换行（slice 到 nl+1），
 *    只丢极少内容、绝不切断半句（写作提示词不能被腰斩，否则世界设定信息断裂）。
 *  - 否则（换行在前 80% 或无换行）硬切到预算边界（maxContent），优先保长度不超预算
 *    （宁可断半句也不能让 globalPrompt 撑爆上下文窗）。
 */
export function hardTruncate(s: string, budget: number): string {
  if (s.length <= budget) return s;
  const suffix = "\n\n# （全局设定因体量已智能精简，完整体请见「角色卡 / 世界书」面板）";
  const maxContent = budget - suffix.length;
  if (maxContent <= 0) return suffix.slice(0, budget); // 预算比后缀还小：只能放下后缀本身
  const nl = s.lastIndexOf("\n", maxContent); // 预算内最后一个换行
  const cut = nl > maxContent * 0.8 && nl + 1 <= maxContent ? nl + 1 : maxContent;
  return `${s.slice(0, cut)}${suffix}`;
}

// ─── prompt 版本化（#316/#317）─────────────────────────────

export type GlobalPromptRevisionSource = "sync" | "manual" | "rollback";

/**
 * 把一个 globalPrompt 全文写入不可变版本快照（GlobalPromptRevision）。
 * - 版本号 = 该项目当前最大 version + 1（(projectId, version) 唯一约束保证权威有序）；
 *   并发竞争时一条会触发 P2002，本函数 catch 后返回 null，不影响调用方主流程。
 * - 同时回写 Project.currentPromptVersion 作为「当前生效版本」指针。
 * - source 区分 sync（卡变动自动刷新）/ manual（手动编辑）/ rollback（回滚还原）。
 *
 * 设计上故意与 syncGlobalPrompt 解耦：sync 失败时主流程仍返回 prompt，
 * 版本快照只是「可观测/可回滚」的增量能力，绝不作为生成的硬依赖。
 */
export async function recordGlobalPromptRevision(
  projectId: string,
  content: string,
  source: GlobalPromptRevisionSource = "sync",
  summary?: string,
): Promise<{ version: number; hash: string } | null> {
  try {
    const maxRev = await prisma.globalPromptRevision.aggregate({
      where: { projectId },
      _max: { version: true },
    });
    const nextVersion = (maxRev._max.version ?? 0) + 1;
    const hash = hashContent(content);
    const wordCount = content.length; // 中文按字符计（最贴近「字数」直觉）
    await prisma.globalPromptRevision.create({
      data: { projectId, version: nextVersion, content, source, hash, wordCount, summary },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { currentPromptVersion: nextVersion },
    });
    return { version: nextVersion, hash };
  } catch (e) {
    console.error(`❌ [sync] globalPrompt 版本快照写入失败 (${projectId.slice(0, 8)}...):`, e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * 轻量内容指纹（djb2）。不追求密码学强度，只用于同项目内版本去重与跨版本快速比对
 * （如「这次 sync 的内容和上一版是否完全相同」），避免无意义的版本堆积。
 */
function hashContent(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0; // h * 33 + c（djb2）
  }
  return (h >>> 0).toString(36);
}
