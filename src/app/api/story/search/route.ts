/**
 * GET /api/story/search?projectId=xxx&q=xxx
 *
 * v3.1.75 全文检索（GLOBAL-SEARCH）：在项目的全部章节正文 / 大纲里搜关键词，
 * 返回命中章节 + 上下文片段，供写作台「全文检索」面板使用。
 *
 * 与「大纲搜索」的区别：大纲搜索只匹配大纲树里的标题和正文开头 200 字（找章节用）；
 * 这里是全文扫描（找某段话在第几章出现用），两者互补、不重复。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { searchStoryNodes } from "@/core/story-search";

/** 搜索词最大长度，防止超长串拖慢扫描 */
const MAX_QUERY_LENGTH = 100;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const q = searchParams.get("q") ?? "";

  if (!projectId) {
    return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
  }
  if (!q.trim()) {
    return NextResponse.json({ error: "缺少搜索词" }, { status: 400 });
  }
  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: `搜索词过长（最多 ${MAX_QUERY_LENGTH} 字）` },
      { status: 400 },
    );
  }

  try {
    // 只取检索必需字段，不拉 wordCount / Json 元数据，避免把整本大书的多余列传进内存。
    // 不过滤分支：分支正文也是用户写的内容，漏掉会让人困惑「明明写过为什么搜不到」。
    const nodes = await prisma.storyNode.findMany({
      where: { projectId },
      select: {
        id: true,
        title: true,
        type: true,
        order: true,
        content: true,
        outline: true,
      },
      orderBy: { order: "asc" },
    });

    const summary = searchStoryNodes(nodes, q);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return jsonError(err);
  }
}
