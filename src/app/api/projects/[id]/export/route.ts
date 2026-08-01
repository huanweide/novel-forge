import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { buildChapterList, buildHtmlDoc, buildEpub } from "@/core/epub";

/**
 * GET /api/projects/[id]/export?format=markdown|txt|html|epub&includeOutline=true|false
 *
 * 导出整本小说 —— 按章节顺序拼接所有节点内容。
 * 支持 Markdown（推荐）/ 纯文本 / 单文件网页 HTML / EPUB 电子书。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "markdown";
    const includeOutline = url.searchParams.get("includeOutline") !== "false";

    const project = await prisma.project.findUnique({
      where: { id },
      select: { name: true },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    // 获取所有节点，按树结构排序
    const allNodes = await prisma.storyNode.findMany({
      where: { projectId: id },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    if (allNodes.length === 0) {
      return NextResponse.json({ error: "没有内容可导出" }, { status: 400 });
    }

    // 构建树结构
    const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
    const roots = allNodes.filter((n) => !n.parentId);

    // 统计（所有格式共用）
    const totalWords = allNodes.reduce((sum, n) => sum + (n.wordCount || 0), 0);
    const completedNodes = allNodes.filter((n) => n.content).length;

    // HTML 单文件导出：自带轻量散文→HTML 转换，可直接浏览器打开 / 被 Word 导入
    if (format === "html") {
      const chapters = buildChapterList(roots, allNodes, includeOutline);
      const htmlDoc = buildHtmlDoc(project.name, chapters, totalWords, completedNodes);
      const filename = `${project.name}_${new Date().toISOString().slice(0, 10)}.html`;
      return new Response(htmlDoc, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        },
      });
    }

    // EPUB 电子书导出（零依赖 stored ZIP + CRC32）
    if (format === "epub") {
      const chapters = buildChapterList(roots, allNodes, includeOutline);
      const epubBuf = buildEpub(project.name, chapters, totalWords, completedNodes);
      const epubBlob = new Blob([new Uint8Array(epubBuf)], { type: "application/epub+zip" });
      const filename = `${project.name}_${new Date().toISOString().slice(0, 10)}.epub`;
      return new Response(epubBlob, {
        headers: {
          "Content-Type": "application/epub+zip",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        },
      });
    }

    let output = "";

    if (format === "markdown") {
      output += `# ${project.name}\n\n`;

      // 目录
      output += "## 目录\n\n";
      for (const root of roots) {
        const children = allNodes.filter((n) => n.parentId === root.id);
        output += `- [${root.title}](#${slugify(root.title)})`;
        if (root.wordCount) output += ` (${root.wordCount}字)`;
        output += "\n";
        for (const child of children) {
          output += `  - [${child.title}](#${slugify(child.title)})`;
          if (child.wordCount) output += ` (${child.wordCount}字)`;
          output += "\n";
        }
      }
      output += "\n---\n\n";

      // 正文
      for (const root of roots) {
        output += buildMarkdownNode(root, allNodes, includeOutline, 1);
      }
    } else {
      // 纯文本
      output += `${project.name}\n${"=".repeat(project.name.length)}\n\n`;

      for (const root of roots) {
        output += buildTextNode(root, allNodes, includeOutline);
      }
    }

    output += `\n\n---\n\n`;
    output += `*共 ${completedNodes} 个章节，${totalWords.toLocaleString()} 字*\n`;
    output += `*由 Novel Forge 生成*\n`;

    const filename = `${project.name}_${new Date().toISOString().slice(0, 10)}.${format === "markdown" ? "md" : "txt"}`;

    return new Response(output, {
      headers: {
        "Content-Type": format === "markdown" ? "text/markdown" : "text/plain",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "导出失败" },
      { status: 500 }
    );
  }
}

function slugify(title: string): string {
  return encodeURIComponent(title.toLowerCase().replace(/\s+/g, "-"));
}

function buildMarkdownNode(
  node: any,
  allNodes: any[],
  includeOutline: boolean,
  depth: number
): string {
  const prefix = "#".repeat(Math.min(depth + 1, 6));
  let result = "";

  result += `${prefix} ${node.title}\n\n`;

  if (includeOutline && node.outline) {
    result += `> *大纲：${node.outline}*\n\n`;
  }

  if (node.content) {
    result += node.content + "\n\n";
  } else {
    result += `*（此节暂无内容）*\n\n`;
  }

  // 子节点
  const children = allNodes.filter((n) => n.parentId === node.id);
  for (const child of children) {
    result += buildMarkdownNode(child, allNodes, includeOutline, depth + 1);
  }

  return result;
}

function buildTextNode(node: any, allNodes: any[], includeOutline: boolean): string {
  let result = "";

  result += `${node.title}\n${"-".repeat(node.title.length)}\n\n`;

  if (includeOutline && node.outline) {
    result += `[大纲：${node.outline}]\n\n`;
  }

  if (node.content) {
    result += node.content + "\n\n";
  }

  const children = allNodes.filter((n) => n.parentId === node.id);
  for (const child of children) {
    result += buildTextNode(child, allNodes, includeOutline);
  }

  return result;
}
