// ============================================================
// 探讨模式 — 全局提示词构建（共享）
// explore/create 与 projects/[id]/build-config 复用，避免重复
// ============================================================

import type { BuildConfig, AdoptedItem, ExploreStep } from "@/core/explore/types";
import { STEP_LABELS } from "@/core/explore/types";

/**
 * 从 BuildConfig + 已采纳内容构建 globalPrompt 文本。
 * 结构化字段（流派/核心冲突/力量体系/金手指/风格偏好）显式呈现，
 * 已采纳的探讨内容按步骤组织。
 */
export function buildGlobalPromptFromExplore(
  config: BuildConfig,
  adopted: AdoptedItem[],
): string {
  const parts: string[] = [];

  parts.push(`## 基本信息`);
  if (config.novelName) parts.push(`- 书名：${config.novelName}`);
  if (config.genre) parts.push(`- 类型：${config.genre}`);
  if (config.audience) parts.push(`- 受众：${config.audience}`);
  if (config.wordCount) parts.push(`- 字数：${config.wordCount}`);
  if (config.plotStructure) {
    const ps = PLOT_STRUCTURE_LABEL[config.plotStructure] || config.plotStructure;
    parts.push(`- 情节结构：${ps}`);
  }
  parts.push(`- 原创人名：${config.forceOriginalNames ? "强制" : "不强制"}`);
  parts.push(`- 自动生成故事线：${config.autoGenerateStoryline ? "是" : "否"}`);

  if (config.styleTags && config.styleTags.length > 0) {
    parts.push(`\n## 流派标签`);
    parts.push(config.styleTags.join("、"));
  }

  if (config.coreConflict) {
    parts.push(`\n## 核心冲突`);
    parts.push(config.coreConflict);
  }

  if (config.powerSystem) {
    parts.push(`\n## 力量体系`);
    parts.push(config.powerSystem);
  }

  if (config.goldenFinger) {
    parts.push(`\n## 金手指`);
    parts.push(config.goldenFinger);
  }

  if (config.stylePreference) {
    parts.push(`\n## 风格偏好`);
    parts.push(config.stylePreference);
  }

  // 按步骤整理已采纳内容
  const stepOrder: ExploreStep[] = [
    "opening", "worldview", "protagonist", "golden_finger",
    "core_conflict", "factions", "power_system", "currency",
    "map", "plot_thread", "free_talk",
  ];

  for (const step of stepOrder) {
    const stepItems = adopted.filter((a) => a.step === step);
    if (stepItems.length === 0) continue;

    parts.push(`\n## ${STEP_LABELS[step]}`);
    for (const item of stepItems) {
      parts.push(`### ${item.title}`);
      parts.push(item.content.slice(0, 600));
    }
  }

  return parts.join("\n");
}

/** 情节结构 id → 中文标签 */
export const PLOT_STRUCTURE_LABEL: Record<string, string> = {
  five_act: "五幕式",
  three_act: "三幕式",
  hero_journey: "英雄之旅",
  kishotenketsu: "起承转合",
  johakyu: "序破急",
};

/** 从世界书条目反向重建 adopted 列表（用于编辑布置时重建 globalPrompt） */
export function lorebookToAdopted(
  entries: Array<{ title: string; content: string; category: string }>,
  categoryToStep: Record<string, ExploreStep>,
): AdoptedItem[] {
  return entries.map((e, i) => ({
    id: `lb-${i}`,
    step: categoryToStep[e.category] || "worldview",
    title: e.title,
    content: e.content,
    timestamp: 0,
  }));
}
