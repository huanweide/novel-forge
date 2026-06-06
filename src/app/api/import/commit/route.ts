/**
 * POST /api/import/commit
 *
 * 提交导入数据 —— 将用户确认后的分章和三卡写入数据库。
 *
 * 请求体：
 * {
 *   projectId: string;
 *   chapters: [{ volumeTitle?, chapterTitle, order, content, wordCount }];
 *   characters: CharacterCard[];
 *   loreEntries: LorebookEntry[];
 *   style: StyleFeatures;
 *   volumeMode: boolean;
 *   updateSynopsis?: boolean;  // 是否用导入文本更新项目总纲（默认true）
 * }
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      projectId,
      chapters = [],
      characters = [],
      loreEntries = [],
      style = {},
      volumeMode = false,
      updateSynopsis = true,
    } = body;

    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    if (chapters.length === 0 && characters.length === 0 && loreEntries.length === 0) {
      return NextResponse.json({ error: "没有任何要导入的数据" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const created: {
      volumes: number;
      chapters: number;
      characters: number;
      loreEntries: number;
      styleCard: boolean;
    } = { volumes: 0, chapters: 0, characters: 0, loreEntries: 0, styleCard: false };

    // ─── 1. 创建分卷和章节节点 ──────────────────────────────

    if (chapters.length > 0) {
      const volumeMap = new Map<string, string>(); // volumeTitle → volumeNodeId

      // 如果启用分卷，先创建各分卷节点
      if (volumeMode) {
        const seenVolumes = new Set<string>();
        for (const ch of chapters) {
          if (ch.volumeTitle && !seenVolumes.has(ch.volumeTitle)) {
            seenVolumes.add(ch.volumeTitle);
            const volNode = await prisma.storyNode.create({
              data: {
                projectId,
                parentId: null,
                type: "volume",
                title: ch.volumeTitle,
                order: seenVolumes.size - 1,
                status: "completed",
                wordCount: 0,
                activeCharacters: [],
                activeLoreIds: [],
              },
            });
            volumeMap.set(ch.volumeTitle, volNode.id);
            created.volumes++;
          }
        }
      }

      // 创建章节节点
      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        const parentId = volumeMode && ch.volumeTitle
          ? volumeMap.get(ch.volumeTitle) || null
          : null;

        await prisma.storyNode.create({
          data: {
            projectId,
            parentId,
            type: "chapter",
            title: ch.chapterTitle || `第${i + 1}章`,
            order: ch.order ?? i,
            status: "completed",
            content: ch.content,
            outline: ch.content?.slice(0, 200) || null,
            wordCount: ch.wordCount || ch.content?.length || 0,
            activeCharacters: [],
            activeLoreIds: [],
            notes: "📥 从导入文本自动创建",
          },
        });
        created.chapters++;

        // 为长章节自动拆成小节
        if ((ch.wordCount || ch.content?.length || 0) > 5000) {
          // 创建小节占位符（不拆分文本，留给用户手动拆分或用AI续写）
          const chapterNode = await prisma.storyNode.findFirst({
            where: { projectId, title: ch.chapterTitle, type: "chapter" },
            orderBy: { createdAt: "desc" },
          });
          if (chapterNode) {
            const sections = Math.ceil((ch.wordCount || 0) / 3000);
            for (let s = 1; s <= sections; s++) {
              await prisma.storyNode.create({
                data: {
                  projectId,
                  parentId: chapterNode.id,
                  type: "section",
                  title: `${ch.chapterTitle}·${s}`,
                  order: s - 1,
                  status: "outline_only",
                  outline: "由导入文本自动拆分，可按需生成",
                  wordCount: 0,
                  activeCharacters: chapterNode.activeCharacters || [],
                  activeLoreIds: chapterNode.activeLoreIds || [],
                },
              });
            }
          }
        }
      }
    }

    // ─── 2. 创建人物卡 ──────────────────────────────────────

    for (const char of characters) {
      if (!char.name) continue;

      await prisma.characterCard.create({
        data: {
          projectId,
          name: String(char.name || ""),
          aliases: Array.isArray(char.aliases) ? char.aliases.filter(Boolean) : [],
          age: String(char.age || "未知"),
          gender: String(char.gender || "未知"),
          role: String(char.role || "supporting"),
          appearance: (char.appearance || {}) as any,
          personality: Array.isArray(char.personality) ? char.personality.filter(Boolean) : [],
          dialogueStyle: (char.dialogueStyle || {}) as any,
          background: String(char.background || ""),
          abilities: Array.isArray(char.abilities) ? char.abilities.filter(Boolean) : [],
          hiddenMotives: Array.isArray(char.hiddenMotives) ? char.hiddenMotives.filter(Boolean) : [],
          currentStatus: "alive",
          relationships: [],
          tags: ["📥导入"],
        },
      });
      created.characters++;
    }

    // ─── 3. 创建世界书词条 ──────────────────────────────────

    for (const entry of loreEntries) {
      if (!entry.title) continue;

      await prisma.lorebookEntry.create({
        data: {
          projectId,
          title: String(entry.title || ""),
          category: String(entry.category || "custom"),
          keys: Array.isArray(entry.keys) ? entry.keys.filter(Boolean) : [String(entry.title || "")],
          content: String(entry.content || ""),
          insertionOrder: 50,
          enabled: true,
        },
      });
      created.loreEntries++;
    }

    // ─── 4. 创建/更新文风卡 ─────────────────────────────────

    if (style && Object.keys(style).length > 0) {
      // 先删旧文风卡（一个项目只保留一张最新的）
      await prisma.styleCard.deleteMany({ where: { projectId } });

      await prisma.styleCard.create({
        data: {
          projectId,
          avgSentenceLength: (style.avgSentenceLength as number) || 25,
          shortSentenceRatio: (style.shortSentenceRatio as number) || 0.3,
          longSentenceRatio: (style.longSentenceRatio as number) || 0.15,
          dialogueRatio: (style.dialogueRatio as number) || 0.35,
          descriptionRatio: (style.descriptionRatio as number) || 0.25,
          actionRatio: (style.actionRatio as number) || 0.25,
          innerThoughtRatio: (style.innerThoughtRatio as number) || 0.15,
          povType: String(style.povType || "third_person_limited"),
          narrativeDistance: String(style.narrativeDistance || "medium"),
          tonalMarkers: (style.tonalMarkers || {}) as any,
          lexicalFeatures: (style.lexicalFeatures || {}) as any,
          styleDescription: String(style.styleDescription || ""),
          sampleText: String(style.sampleText || ""),
          sourceChapterCount: chapters.length,
        },
      });
      created.styleCard = true;

      // 自动更新项目的文风设置
      if (style.styleDescription) {
        const currentConfig = (project.llmConfig || {}) as Record<string, unknown>;
        const existingNotes = (currentConfig.customStyleNotes as string) || "";
        const styleNote = `\n【从导入文本自动分析】${style.styleDescription}`;
        if (!existingNotes.includes(String(style.styleDescription))) {
          await prisma.project.update({
            where: { id: projectId },
            data: {
              llmConfig: {
                ...currentConfig,
                customStyleNotes: existingNotes + styleNote,
                // 同步量化参数
                temperature: (currentConfig.temperature as number) ?? 0.85,
                topP: (currentConfig.topP as number) ?? 0.95,
              } as any,
            } as any,
          });
        }
      }
    }

    // ─── 5. 更新项目总纲（用导入文本的第一章摘要） ─────────

    if (updateSynopsis && chapters.length > 0) {
      const firstChapterContent = chapters[0].content;
      if (firstChapterContent && firstChapterContent.length > 100 && !project.synopsis) {
        const snippet = firstChapterContent.slice(0, 500).replace(/\n/g, " ");
        const newSynopsis = `导入文本开篇：${snippet}...`;
        await prisma.project.update({
          where: { id: projectId },
          data: { synopsis: newSynopsis },
        });
      }
    }

    return NextResponse.json({
      success: true,
      created,
      message: `导入完成：${created.volumes}卷 ${created.chapters}章 ${created.characters}角色 ${created.loreEntries}词条${created.styleCard ? " +文风卡" : ""}`,
    });
  } catch (err) {
    console.error("导入提交失败:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "导入提交失败" },
      { status: 500 }
    );
  }
}
