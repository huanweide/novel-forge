import { jsonError } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import { getGenreTemplate } from "@/core/templates/genres";

/**
 * POST /api/seed/genre-project
 * body: { genreId: string }
 *
 * 按题材模板一键生成「开局骨架」项目：世界观倾向 + 剧情推进倾向 + 主角原型 + 卷纲，
 * 并调用 syncGlobalPrompt 让定义/规则真正进入写作上下文。用户选题材即可开写。
 */

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as { genreId?: string }));
    const tpl = getGenreTemplate(body.genreId || "");
    if (!tpl) {
      return NextResponse.json({ error: "未知题材" }, { status: 400 });
    }

    const projectName = `${tpl.name} · 开局骨架`;
    const project = await prisma.project.create({
      data: {
        name: projectName,
        description: `「${tpl.name}」题材开局骨架（由 Novel Forge 题材模板生成）——含世界观倾向、剧情推进倾向与主角原型，可直接续写或调整。`,
        genre: [tpl.name],
        targetWordCount: 300000,
        synopsis: tpl.openingHook,
        toneKeywords: [],
        authorNote: `题材模板：${tpl.name}。世界观与剧情倾向已写入「世界书」，生成时会约束 AI 遵守。`,
        globalPrompt: "（初始化中，稍后由同步生成）",
      },
    });
    const pid = project.id;

    await prisma.lorebookEntry.create({
      data: {
        projectId: pid,
        title: `${tpl.name} · 世界观与铁律`,
        category: "worldview",
        keys: [tpl.name],
        content: tpl.worldview,
        insertionOrder: 10,
        depth: 1,
        enabled: true,
      },
    });

    await prisma.lorebookEntry.create({
      data: {
        projectId: pid,
        title: `${tpl.name} · 剧情推进倾向`,
        category: "story_progression",
        keys: ["推进", "节奏"],
        content: tpl.storyProgression,
        insertionOrder: 20,
        depth: 1,
        enabled: true,
      },
    });

    await prisma.characterCard.create({
      data: {
        projectId: pid,
        name: "主角（按原型取名）",
        role: "protagonist",
        background: tpl.protagonist,
        currentStatus: "alive",
        tags: ["主角", "题材模板"],
      },
    });

    const volume = await prisma.storyNode.create({
      data: {
        projectId: pid,
        parentId: null,
        type: "volume",
        title: "第一卷",
        order: 0,
        status: "draft",
        outline: tpl.outline,
      },
    });

    // 开局钩子作为第一章大纲占位，引导用户续写
    await prisma.storyNode.create({
      data: {
        projectId: pid,
        parentId: volume.id,
        type: "chapter",
        title: "第一章（开局钩子）",
        order: 0,
        status: "outline_only",
        outline: tpl.openingHook,
        wordCount: 0,
      },
    });

    await syncGlobalPrompt(pid);

    return NextResponse.json({ ok: true, id: pid, created: true, message: "题材骨架已创建" });
  } catch (err) {
    return jsonError(err);
  }
}
