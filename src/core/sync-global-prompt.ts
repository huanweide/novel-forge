/**
 * globalPrompt 同步引擎
 *
 * 将三卡（角色+世界书+风格）预编译为系统提示词，存入 Project.globalPrompt。
 * 卡有变动 → 调 syncGlobalPrompt(projectId) → 刷新缓存。
 * 生成路由直接读 project.globalPrompt，不需要再逐个查卡。
 */

import { prisma } from "@/lib/prisma";
import { getTemplate } from "@/core/templates";
import { ALL_WORLD_CATEGORIES, WORLD_CATEGORY_LABELS } from "@/lib/world-category-classifier";

/**
 * 构建并写入 globalPrompt。
 * 调用时机：角色卡/世界书/风格卡 创建、更新、删除后。
 */
export async function syncGlobalPrompt(projectId: string): Promise<string | null> {
  try {
    const [project, characters, loreEntries, styleCard] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true, genre: true, synopsis: true, toneKeywords: true, authorNote: true, llmConfig: true } }),
      prisma.characterCard.findMany({ where: { projectId } }),
      prisma.lorebookEntry.findMany({ where: { projectId, enabled: true } }),
      prisma.styleCard.findFirst({ where: { projectId }, orderBy: { updatedAt: "desc" } }),
    ]);

    if (!project) return null;

    const prompt = buildGlobalPrompt(project, characters, loreEntries, styleCard as Record<string, unknown> | null);

    await prisma.project.update({
      where: { id: projectId },
      data: { globalPrompt: prompt },
    });

    console.log(`✅ [sync] globalPrompt 已刷新 (${projectId.slice(0, 8)}...) — ${characters.length}角色 · ${loreEntries.length}世界 · 风格${styleCard ? "有" : "无"} · ${prompt.length}字`);
    return prompt;
  } catch (e) {
    console.error(`❌ [sync] globalPrompt 刷新失败 (${projectId.slice(0, 8)}...):`, e instanceof Error ? e.message : String(e));
    return null;
  }
}

function buildGlobalPrompt(
  project: { name: string; genre: string[]; synopsis: string; toneKeywords: string[]; authorNote?: string; llmConfig?: any },
  characters: any[],
  loreEntries: any[],
  styleCard: Record<string, unknown> | null,
): string {
  const parts: string[] = [];

  // ═══════════════════════════════════════════
  // 第一部分：作品信息
  // ═══════════════════════════════════════════
  parts.push(`# 作品：《${project.name}》
类型：${project.genre.join("、")}
基调：${project.toneKeywords.join("、")}
总纲：${project.synopsis || "（未设置）"}`);

  if (project.authorNote?.trim()) {
    parts.push(`\n## 作者指令（最高优先级）
${project.authorNote}`);
  }

  // ═══════════════════════════════════════════
  // 第二部分：角色卡
  // ═══════════════════════════════════════════
  parts.push(`\n# 角色卡（共${characters.length}人）`);

  // 按角色定位分组
  const roleOrder = ["protagonist", "antagonist", "mentor", "love_interest", "supporting", "background"];
  const roleLabel: Record<string, string> = {
    protagonist: "★ 主角", antagonist: "◆ 反派", mentor: "◈ 导师",
    love_interest: "♡ 恋爱", supporting: "● 配角", background: "○ 背景",
  };

  for (const role of roleOrder) {
    const group = characters.filter((c: any) => c.role === role);
    if (group.length === 0) continue;

    parts.push(`\n## ${roleLabel[role] || role}（${group.length}人）`);

    for (const c of group) {
      const charParts: string[] = [];
      charParts.push(`### ${c.name}${c.aliases?.length ? `（别名：${c.aliases.join("、")}）` : ""}`);
      charParts.push(`- 定位：${roleLabel[role]} | 状态：${c.currentStatus || "存活"} | 年龄：${c.age || "未知"} | 性别：${c.gender || "未知"}`);

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

      // 背景（限制长度但保留细节）
      if (c.background && c.background.length > 10) {
        charParts.push(`- 背景：${c.background}`);
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

      parts.push(charParts.join("\n"));
    }
  }

  // ═══════════════════════════════════════════
  // 第三部分：世界书
  // ═══════════════════════════════════════════
  parts.push(`\n# 世界书（共${loreEntries.length}条）`);

  // 按 category 分组注入世界书。
  // ⚠️ 关键修复（Round-3 / 复检 PIT-1）：catOrder 必须从权威分类常量 ALL_WORLD_CATEGORIES 派生，
  // 禁止再硬编码。硬编码版本曾遗漏 technique / law / currency / character_relationship / fate_system /
  // physics / public_system 共 7 类，导致 entity-sync 已正确写库的这几类世界卡在生成侧被静默丢弃，
  // 形成 R2-002 的"最后一公里"断点。改为派生后，分类增减自动同步，杜绝多源漂移（见 PIT-2）。
  // 注：原 worldview / story_progression 是 15 类 taxonomy 中并不存在的虚构分类
  // （lorebookEntry.category 永远不可能取这两个值），属死代码，已删除——移除前它们本就只遍历空分组。
  // catOrder 与 catLabel 现在全部派生自 world-category-classifier 的权威常量：
  //   - catOrder = ALL_WORLD_CATEGORIES（Round-3 已派生，覆盖 15 类）
  //   - catLabel = WORLD_CATEGORY_LABELS（本次 Round-4 派生，键入 Record<WorldCategory,string>）
  // 两者同源：WORLD_CATEGORY_LABELS 的类型强制覆盖全部 15 类，分类增删/改名时若漏改标签，tsc 直接报错，
  // 彻底消除 Round-3 复检「新坑 2」指出的最后一处手抄漂移根因（原 PIT-2）。
  const catOrder = ALL_WORLD_CATEGORIES;
  const catLabel = WORLD_CATEGORY_LABELS;

  for (const cat of catOrder) {
    const group = loreEntries.filter((e: any) => (e.category || "custom") === cat);
    if (group.length === 0) continue;

    parts.push(`\n## ${catLabel[cat] || cat}（${group.length}条）`);

    for (const e of group) {
      parts.push(`- **${e.title}**${e.keys?.length ? ` [触发词：${e.keys.join("、")}]` : ""}`);
      if (e.content?.length > 5) {
        parts.push(`  ${e.content}`);
      }
    }
  }

  // ═══════════════════════════════════════════
  // 第四部分：风格卡
  // ═══════════════════════════════════════════
  if (styleCard) {
    const s = styleCard;
    const sParts: string[] = [];
    sParts.push(`\n# 文风设定`);

    if (s.styleDescription) sParts.push(`- 文风描述：${s.styleDescription}`);
    // 叙事视角：优先读 StyleCard，兜底读 llmConfig（StyleEditor 写入路径）
    const POV_MAP: Record<string, string> = {
      first_person: "第一人称（「我」的视角，代入感强）",
      third_person_limited: "第三人称限知（单角色视角，仅展现其感知）",
      third_person_omniscient: "第三人称全知（上帝视角，跨越多角色心理）",
      second_person: "第二人称（「你」的视角，沉浸式互动）",
    };
    const rawPov = (s.povType as string) || (project.llmConfig as any)?.povType || "";
    const pov = POV_MAP[rawPov] || rawPov;
    if (pov) sParts.push(`- 叙事视角：${pov}`);
    if (s.narrativeDistance) sParts.push(`- 叙事距离：${s.narrativeDistance}`);
    if (s.avgSentenceLength) sParts.push(`- 平均句长：${s.avgSentenceLength}字`);

    // 比例
    const ratios: string[] = [];
    if (s.dialogueRatio !== undefined) ratios.push(`对话${Math.round((s.dialogueRatio as number) * 100)}%`);
    if (s.descriptionRatio !== undefined) ratios.push(`描写${Math.round((s.descriptionRatio as number) * 100)}%`);
    if (s.actionRatio !== undefined) ratios.push(`动作${Math.round((s.actionRatio as number) * 100)}%`);
    if (s.innerThoughtRatio !== undefined) ratios.push(`内心${Math.round((s.innerThoughtRatio as number) * 100)}%`);
    if (ratios.length) sParts.push(`- 叙事比例：${ratios.join(" / ")}`);

    // 语气标记
    if (s.tonalMarkers && typeof s.tonalMarkers === "object") {
      const tones = Object.entries(s.tonalMarkers as Record<string, number>)
        .filter(([, v]) => v > 0.15)
        .sort(([, a], [, b]) => b - a)
        .map(([k, v]) => `${k}(${Math.round(v * 100)}%)`).join("、");
      if (tones) sParts.push(`- 语气标记：${tones}`);
    }

    // 词汇特征
    if (s.lexicalFeatures && typeof s.lexicalFeatures === "object") {
      const lex = Object.entries(s.lexicalFeatures as Record<string, number>)
        .filter(([, v]) => v > 0.1)
        .sort(([, a], [, b]) => b - a)
        .map(([k, v]) => `${k}(${Math.round(v * 100)}%)`).join("、");
      if (lex) sParts.push(`- 词汇特征：${lex}`);
    }

    // 样本
    if (s.sampleText) sParts.push(`- 风格样本：${String(s.sampleText).slice(0, 400)}`);

    parts.push(sParts.join("\n"));
  }

  // ═══════════════════════════════════════════
  // 第五部分：文风模板（最高优先级）
  // ═══════════════════════════════════════════
  if (project.llmConfig) {
    const config = project.llmConfig as Record<string, unknown>;
    const templateId = (config.styleTemplateId as string) || "";
    if (templateId && templateId !== "custom") {
      const template = getTemplate(templateId);
      if (template) {
        parts.push(`\n# 文风模板——${template.name}——最高优先级`);
        if (template.stylePrompt) {
          parts.push(template.stylePrompt);
        }
        if (template.forbiddenPatterns.length > 0) {
          parts.push(`\n## 禁止以下表达`);
          parts.push(template.forbiddenPatterns.map((p) => `- 禁止使用：${p}`).join("\n"));
        }
        if (template.pacingGuide) {
          parts.push(`\n## 节奏指引\n${template.pacingGuide}`);
        }
        if (template.dialogueGuide) {
          parts.push(`\n## 对话指引\n${template.dialogueGuide}`);
        }
      }
    }
  }

  return parts.join("\n");
}
