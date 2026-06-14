/**
 * POST /api/lorebook/summarize/apply
 *
 * 用户确认整理预览后执行实际写入。
 * 接收 previewId（不是完整 results——避免大 JSON 传输断裂）。
 *
 * 去重链：
 * - Step 1: 自去重——不同聚类可能产出同名词条
 * - Step 2: 与项目已有词条去重（求同存异）
 * - Step 3: 原子删旧建新
 * - Step 4: 全局跨分类去重
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getPreviewFromCache, deletePreviewFromCache } from "../route";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

interface ApplyResult {
  title: string;
  content: string;
  keys: string[];
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      projectId: string;
      entryIds?: string[];
      previewId?: string;
      results?: ApplyResult[]; // 兼容旧前端（降级路径）
    };

    const projectId = body.projectId;
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    // ── 获取结果：优先从缓存取（新路径），其次从请求体取（降级）──
    let entryIds: string[];
    let results: ApplyResult[];

    if (body.previewId) {
      const cached = getPreviewFromCache(body.previewId);
      if (!cached) {
        return NextResponse.json(
          { error: "预览已过期，请重新整理（5分钟后缓存失效）" },
          { status: 410 }
        );
      }
      entryIds = cached.entryIds;
      results = cached.results;
      // 用完后立即清理
      deletePreviewFromCache(body.previewId);
    } else if (body.entryIds && body.results) {
      // 降级：前端直接传了完整数据
      entryIds = body.entryIds;
      results = body.results;
    } else {
      return NextResponse.json(
        { error: "缺少 previewId 或 entryIds+results" },
        { status: 400 }
      );
    }

    if (!entryIds?.length || !results?.length) {
      return NextResponse.json(
        { error: `缺少 entryIds（${entryIds?.length || 0}条）或 results（${results?.length || 0}条）` },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    // ═══════════════════════════════════════════════
    // Step 1: 自去重——结果内部可能有同名词条
    // ═══════════════════════════════════════════════
    const dedupedMap = new Map<string, ApplyResult>();
    for (const r of results) {
      const key = r.title.toLowerCase().trim();
      const existing = dedupedMap.get(key);
      if (existing) {
        const primary = (existing.content?.length || 0) >= (r.content?.length || 0) ? existing : r;
        const secondary = primary === existing ? r : existing;
        const secContent = (secondary.content || "").trim();
        if (secContent && !primary.content?.includes(secContent.slice(0, 50))) {
          dedupedMap.set(key, {
            ...primary,
            content: primary.content + "\n\n---\n" + secContent,
            keys: [...new Set([...primary.keys, ...secondary.keys])],
          });
        } else {
          dedupedMap.set(key, {
            ...primary,
            keys: [...new Set([...primary.keys, ...secondary.keys])],
          });
        }
      } else {
        dedupedMap.set(key, r);
      }
    }
    let finalResults = [...dedupedMap.values()];
    const selfDedupCount = results.length - finalResults.length;

    // ═══════════════════════════════════════════════
    // Step 2: 与项目已有词条去重（不在删除列表中的）
    // ═══════════════════════════════════════════════
    const existingEntries = await prisma.lorebookEntry.findMany({
      where: { projectId, id: { notIn: entryIds } },
      select: { id: true, title: true, content: true, keys: true },
    });

    const existingMap = new Map(existingEntries.map(e => [e.title.toLowerCase().trim(), e]));
    let crossMergeCount = 0;

    for (let i = finalResults.length - 1; i >= 0; i--) {
      const r = finalResults[i];
      const key = r.title.toLowerCase().trim();
      const existing = existingMap.get(key);
      if (existing) {
        const mergedContent = [existing.content, r.content]
          .filter(c => c?.trim()).join("\n\n---\n");
        const mergedKeys = [...new Set([...existing.keys, ...r.keys])];

        await prisma.lorebookEntry.update({
          where: { id: existing.id },
          data: { content: mergedContent, keys: mergedKeys },
        });

        finalResults.splice(i, 1);
        crossMergeCount++;
      }
    }

    // ═══════════════════════════════════════════════
    // Step 3: 原子删旧建新
    // ═══════════════════════════════════════════════
    await prisma.$transaction(async (tx) => {
      await tx.lorebookEntry.deleteMany({
        where: { id: { in: entryIds }, projectId },
      });

      for (const r of finalResults) {
        await tx.lorebookEntry.create({
          data: {
            projectId,
            title: r.title,
            category: "custom",
            keys: r.keys.length > 0 ? r.keys : [r.title],
            content: r.content,
            enabled: true,
            insertionOrder: 50,
          },
        });
      }
    });

    // ═══════════════════════════════════════════════
    // Step 4: 全局跨分类去重
    // ═══════════════════════════════════════════════
    const allEntries = await prisma.lorebookEntry.findMany({
      where: { projectId, enabled: true },
    });

    const nameMap = new Map<string, typeof allEntries>();
    for (const e of allEntries) {
      const key = e.title.toLowerCase().trim();
      if (!nameMap.has(key)) nameMap.set(key, []);
      nameMap.get(key)!.push(e);
    }

    let globalDedupCount = 0;
    for (const [, dupes] of nameMap) {
      if (dupes.length <= 1) continue;

      const primary = dupes.reduce((a, b) =>
        (a.content?.length || 0) >= (b.content?.length || 0) ? a : b
      );
      const others = dupes.filter(e => e.id !== primary.id);

      const allKeys = new Set(primary.keys || []);
      const extraParts: string[] = [];
      for (const o of others) {
        (o.keys || []).forEach((k: string) => allKeys.add(k));
        const oContent = (o.content || "").trim();
        if (oContent && !primary.content?.includes(oContent.slice(0, 50))) {
          extraParts.push(`[${o.category}] ${oContent}`);
        }
      }

      if (extraParts.length > 0) {
        await prisma.lorebookEntry.update({
          where: { id: primary.id },
          data: {
            keys: [...allKeys],
            content: (primary.content || "") + "\n\n---\n" + extraParts.join("\n\n"),
          },
        });
      } else {
        await prisma.lorebookEntry.update({
          where: { id: primary.id },
          data: { keys: [...allKeys] },
        });
      }

      await prisma.lorebookEntry.deleteMany({
        where: { id: { in: others.map(o => o.id) } },
      });
      globalDedupCount++;
    }

    const finalCount = await prisma.lorebookEntry.count({
      where: { projectId, enabled: true },
    });

    // 异步刷新系统提示词
    syncGlobalPrompt(projectId).catch(() => {});

    const parts: string[] = [];
    parts.push(`${entryIds.length}条 → ${finalResults.length}条`);
    if (selfDedupCount > 0) parts.push(`自去重${selfDedupCount}组`);
    if (crossMergeCount > 0) parts.push(`与已有合并${crossMergeCount}组`);
    if (globalDedupCount > 0) parts.push(`全局去重${globalDedupCount}组`);

    return NextResponse.json({
      ok: true,
      deleted: entryIds.length,
      created: finalResults.length,
      selfDedupCount,
      crossMergeCount,
      globalDedupCount,
      finalTotal: finalCount,
      message: `✅ 整理完成：${parts.join("，")}（项目共${finalCount}条）`,
    });
  } catch (err) {
    console.error("整理应用失败:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "应用整理失败" },
      { status: 500 }
    );
  }
}
