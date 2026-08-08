import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { scanBannedWords } from "@/lib/banned-words";
import { NextResponse } from "next/server";
import { buildChapterList, buildHtmlDoc, buildEpub, buildEpubStream } from "@/core/epub";
import { buildDocx, buildDocxStream } from "@/core/docx";
import { PassThrough, Readable } from "stream";

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

    // F7 修复：格式白名单校验。仅 markdown|txt|html|epub|docx 有语义，
    // 传入未定义值（如 pdf/rtf）时不再静默降级为纯文本，而是明确返回 400，
    // 避免「pdf 请求却拿到 .txt 文件」的误导行为。已支持格式行为不变。
    const SUPPORTED_FORMATS = ["markdown", "txt", "html", "epub", "docx"];
    if (!SUPPORTED_FORMATS.includes(format)) {
      return NextResponse.json(
        { error: `不支持的导出格式：${format}（仅支持 ${SUPPORTED_FORMATS.join(" / ")}）` },
        { status: 400 },
      );
    }
    const author = url.searchParams.get("author")?.trim() || undefined;
    const check = url.searchParams.get("check") === "1"; // FE-N7 违禁词预检模式

    const project = await prisma.project.findUnique({
      where: { id },
      select: { name: true },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    // 获取所有节点，按树结构排序
    let allNodes = await prisma.storyNode.findMany({
      where: { projectId: id, deletedAt: null },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    if (allNodes.length === 0) {
      return NextResponse.json({ error: "没有内容可导出" }, { status: 400 });
    }

    // 范围过滤：指定章节时只导出这些章及其后代（选章导出）
    const chapterIdsParam = url.searchParams.get("chapterIds");
    if (chapterIdsParam) {
      const wanted = new Set(chapterIdsParam.split(",").filter(Boolean));
      if (wanted.size > 0) {
        const keep = new Set<string>();
        const addDesc = (nid: string) => {
          if (keep.has(nid)) return;
          keep.add(nid);
          for (const n of allNodes) if (n.parentId === nid) addDesc(n.id);
        };
        for (const id of wanted) addDesc(id);
        allNodes = allNodes.filter((n) => keep.has(n.id));
      }
    }

    // R2-008/P1：选章导出时若级联展开后没有任何节点（选中节点不存在或无下属内容），
    // 直接返回结构化错误，避免后端静默产出一个空白文件让作者误以为成功。
    if (chapterIdsParam && allNodes.length === 0) {
      return NextResponse.json(
        { error: "未选中任何有效章节（选中节点不存在或不含下属内容）" },
        { status: 400 }
      );
    }

    // v1.6.19 修复 B：全本导出（未指定章节范围）时，若整本书所有节点均无正文，
    // 返回友好错误而非静默导出空白文件。与选章导出的「所选范围无可导出正文」拦截对齐，
    // 避免作者误以为导出成功、实则拿到空壳文件。
    if (!chapterIdsParam && !allNodes.some((n) => n.content)) {
      return NextResponse.json(
        { error: "整本书还没有任何正文可导出（所有章节均为空壳，请先写作正文）" },
        { status: 400 }
      );
    }

    // R3-IO：选章导出时若级联展开后的整棵子树「没有任何正文」（即所有节点均无 content，
    // 例如单独选中一个尚未动笔的 section/scene，或选中的节点及其后代都还是空壳），
    // 视为空导出范围，返回结构化错误而非静默产出空白文件。
    // 仅当展开后仍无任何正文章才拦截；若选中节点本身或其后代存在正文则正常放行。
    if (chapterIdsParam && !allNodes.some((n) => n.content)) {
      return NextResponse.json(
        { error: "所选范围无可导出正文" },
        { status: 400 }
      );
    }

    // 构建树结构
    const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
    // R3-IO：roots 重定义为「父节点不在当前选中集合内」的子树顶层节点，而非仅取 parentId 为空。
    // 这样选中「非根节点」（如某 section / scene / 父级为 volume 的 chapter）时，该节点及其后代
    // 能正确成为渲染根，避免级联展开后 roots 为空、进而静默产出空文件。
    const idsInScope = new Set(allNodes.map((n) => n.id));
    const roots = allNodes.filter((n) => !n.parentId || !idsInScope.has(n.parentId));

    // L1-009：一次性构建 parentId → 子节点 映射（O(N)），消除递归建树/目录的 O(N²) 过滤
    const childrenMap = new Map<string, any[]>();
    for (const n of allNodes) {
      const pid = n.parentId;
      if (!pid) continue;
      let arr = childrenMap.get(pid);
      if (!arr) {
        arr = [];
        childrenMap.set(pid, arr);
      }
      arr.push(n);
    }

    // FE-N7 违禁词预检：扫描全部节点的正文，返回命中清单（不下载文件）
    if (check) {
      const hits: Array<{ word: string; chapter: string; context: string }> = [];
      for (const n of allNodes) {
        if (!n.content) continue;
        const found = scanBannedWords(n.content);
        for (const h of found) {
          hits.push({ word: h.word, chapter: n.title || "未命名", context: h.context });
        }
      }
      return NextResponse.json({ total: hits.length, hits: hits.slice(0, 200) });
    }

    // 统计（所有格式共用）
    const totalWords = allNodes.reduce((sum, n) => sum + (n.wordCount || 0), 0);
    const completedNodes = allNodes.filter((n) => n.content).length;

    // HTML 单文件导出：自带轻量散文→HTML 转换，可直接浏览器打开 / 被 Word 导入
    if (format === "html") {
      const chapters = buildChapterList(roots, allNodes, includeOutline);
      const htmlDoc = buildHtmlDoc(project.name, chapters, totalWords, completedNodes, author);
      const filename = `${project.name}_${new Date().toISOString().slice(0, 10)}.html`;
      return new Response(htmlDoc, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }

    // EPUB 电子书导出（零依赖 stored ZIP + CRC32）——流式写入响应，章节 Buffer 写完即释放，防大书 OOM
    if (format === "epub") {
      const chapters = buildChapterList(roots, allNodes, includeOutline);
      const stream = new PassThrough();
      buildEpubStream(stream, project.name, chapters, totalWords, completedNodes, author).catch(
        (e) => stream.destroy(e)
      );
      const filename = `${project.name}_${new Date().toISOString().slice(0, 10)}.epub`;
      return new Response(Readable.toWeb(stream) as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/epub+zip",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }

    // DOCX（Word）导出：零依赖 OOXML ZIP 流式写入响应（与 epub 同源），去掉整本 Buffer.concat 防大书 OOM
    if (format === "docx") {
      const chapters = buildChapterList(roots, allNodes, includeOutline);
      const stream = new PassThrough();
      buildDocxStream(stream, project.name, chapters, { includeOutline, author }).catch(
        (e) => stream.destroy(e)
      );
      const filename = `${project.name}_${new Date().toISOString().slice(0, 10)}.docx`;
      return new Response(Readable.toWeb(stream) as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    }

    // v1.6.38 大书导出流式分块（F4 收口）：markdown/txt 改为 async generator + Readable.from，
    // 逐章 yield 单章内容，由 Readable 背压调度（内部 buffer 满自动暂停生成器），
    // 内存峰值从「整本字符串」降到「单章 + ~16KB buffer」，彻底防几十万字大书导出 OOM。
    // 与原同步拼接逻辑逐字等价（目录锚点、空节提示一致），仅传输方式改流式。
    const isMd = format === "markdown";
    const filename = `${project.name}_${new Date().toISOString().slice(0, 10)}.${isMd ? "md" : "txt"}`;
    const exportStream = Readable.from(
      buildExportStream(isMd, project, roots, childrenMap, includeOutline, author, totalWords, completedNodes)
    );
    return new Response(Readable.toWeb(exportStream) as unknown as BodyInit, {
      headers: {
        "Content-Type": isMd ? "text/markdown" : "text/plain",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}

function slugify(title: string): string {
  // IMP-026：固定 slug 规则（小写、空白转连字符、保留 CJK/字母数字、去标点），
  // 与正文标题前注入的 <a id> 锚点使用同一算法，确保严格渲染器目录可跳转。
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
}

async function* buildExportStream(
  isMd: boolean,
  project: { name: string },
  roots: any[],
  childrenMap: Map<string, any[]>,
  includeOutline: boolean,
  author: string | undefined,
  totalWords: number,
  completedNodes: number
): AsyncGenerator<string> {
  if (isMd) {
    yield `# ${project.name}\n\n`;
    if (author) yield `**作者：${author}**\n\n`;
    yield "## 目录\n\n";
    for (const root of roots) {
      const children = childrenMap.get(root.id) || [];
      yield `- [${root.title}](#${slugify(root.title)})`;
      if (root.wordCount) yield ` (${root.wordCount}字)`;
      yield "\n";
      for (const child of children) {
        yield `  - [${child.title}](#${slugify(child.title)})`;
        if (child.wordCount) yield ` (${child.wordCount}字)`;
        yield "\n";
      }
    }
    yield "\n---\n\n";
    for (const root of roots) {
      yield* markdownNodeGen(root, childrenMap, includeOutline, 1);
    }
  } else {
    yield `${project.name}\n${"=".repeat(project.name.length)}\n\n`;
    if (author) yield `作者：${author}\n\n`;
    for (const root of roots) {
      yield* textNodeGen(root, childrenMap, includeOutline);
    }
  }
  yield `\n\n---\n\n`;
  yield `*共 ${completedNodes} 个章节，${totalWords.toLocaleString()} 字*\n`;
  yield `*由 Novel Forge 生成*\n`;
}

async function* markdownNodeGen(
  node: any,
  childrenMap: Map<string, any[]>,
  includeOutline: boolean,
  depth: number
): AsyncGenerator<string> {
  const prefix = "#".repeat(Math.min(depth + 1, 6));
  const slug = slugify(node.title);
  yield `${prefix} <a id="${slug}"></a>${node.title}\n\n`;
  if (includeOutline && node.outline) {
    yield `> *大纲：${node.outline}*\n\n`;
  }
  if (node.content) {
    yield node.content + "\n\n";
  } else {
    yield `*（此节暂无内容）*\n\n`;
  }
  const children = childrenMap.get(node.id) || [];
  for (const child of children) {
    yield* markdownNodeGen(child, childrenMap, includeOutline, depth + 1);
  }
}

async function* textNodeGen(
  node: any,
  childrenMap: Map<string, any[]>,
  includeOutline: boolean
): AsyncGenerator<string> {
  yield `${node.title}\n${"-".repeat(node.title.length)}\n\n`;
  if (includeOutline && node.outline) {
    yield `[大纲：${node.outline}]\n\n`;
  }
  if (node.content) {
    yield node.content + "\n\n";
  }
  const children = childrenMap.get(node.id) || [];
  for (const child of children) {
    yield* textNodeGen(child, childrenMap, includeOutline);
  }
}

