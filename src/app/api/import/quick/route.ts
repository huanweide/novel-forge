/**
 * POST /api/import/quick
 *
 * 快速批量导入——纯正则解析，不用AI。
 *
 * 格式：1.人名 / 1、人名 / 1)人名 这类带序号的名字行
 * 名字后面所有文本抄进 quickImportContent，直接写DB。
 *
 * 智能去重：
 *   - 同名 → 追加内容到已有角色
 *   - 全名vs小名（如"苏挽月"与"挽月"）→ 包含关系检测 → 合并
 *   - 带括号的（如"林羽（主角）"）→ 去掉括号后比较
 *
 * 结构：
 *   parseCharacters → mergeSimilar(内部去重) → dbMerge(数据库去重+写入)
 *   SSE 三阶段：解析 → 去重合并 → 写入
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 120;

// ─── 类型 ──────────────────────────────────────────

interface ParsedChar {
  name: string;
  content: string;
  contentPreview: string;
}

// ─── 名字相似度检测 ──────────────────────────────

/** 标准化名字：去括号、去空格、小写 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[（(][^)）]*[)）]/g, "")  // 去括号及内容
    .replace(/\s+/g, "")
    .trim();
}

/** 两个名字是否指向同一角色 */
function isSameCharacter(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  // 完全匹配
  if (na === nb) return true;
  // 包含关系：小名vs全名（"挽月" ⊂ "苏挽月"）
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

// ─── 阶段1：正则解析 ─────────────────────────────

/**
 * 从设定集文本中解析角色。
 *
 * 匹配行首 "数字. 名称" / "数字、名称" / "数字)名称" 等格式。
 * 相邻两个角色名之间的文本归属前一个角色。
 * 第一个角色名之前的文本忽略。
 */
function parseCharacters(text: string): ParsedChar[] {
  // 换行符归一化：\r\n → \n，去除残余 \r
  const cleanText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // 编号格式全面兼容：
  //   Markdown标题: ### 1. 拉明·亚马尔  /  ## 2、洁世一  / 行首空格+### 1.
  //   纯文本: 1. 2、3) (4)（5）① ②
  //   中文数字: 一、二、三 四）
  //   中文序数: 第一位 第二，
  // 数字捕获到 match[1]，名字+描述捕获到 match[2]
  const NUM = [
    "\\d+",                                          // 阿拉伯数字: 1 2 3
    "[一二三四五六七八九十百]+",                      // 中文数字: 一 二 三 十 二十 百
    "第[一二三四五六七八九十百]+[位名个]?",           // 中文序数: 第一位 第二
    "[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]",            // 圈号
    "[（(]\\d+[）)]",                                // 括号编号: (1)（2）
  ].join("|");
  // \s* → 容忍行首空格
  // (?:#{1,3}\s*)?  → 可选 Markdown 标题前缀（### / ## / #）
  const HEADER_RE = new RegExp(`^\\s*(?:#{1,3}\\s*)?\\s*(${NUM})[.、．，)\）\\s:：·\\-—]+\\s*(.+)$`);

  const lines = cleanText.split("\n");
  const chars: ParsedChar[] = [];
  let currentName = "";
  let currentLines: string[] = [];
  let started = false;

  for (const line of lines) {
    const match = HEADER_RE.exec(line);

    if (match) {
      let rawName = match[2].trim();
      // 分离名字和描述：—— 或 — 之后的部分作为内容
      let extraDesc = "";
      const dashIdx = rawName.indexOf("——");
      const emDashIdx = rawName.indexOf("—"); // U+2014 EM DASH
      const sepIdx = dashIdx >= 0 ? dashIdx : (emDashIdx >= 0 ? emDashIdx : -1);
      if (sepIdx >= 0) {
        extraDesc = rawName.slice(sepIdx + (dashIdx >= 0 ? 2 : 1)).trim();
        rawName = rawName.slice(0, sepIdx).trim();
      }
      const name = rawName;
      // 过滤非人名：太长、太短、标题关键词（名字可含英文/括号，上限放宽到40）
      if (name.length >= 2 && name.length <= 40 && !/^(第|章|节|卷|部|篇)/.test(name)) {
        // 保存上一个角色
        if (started && currentName && currentLines.length > 0) {
          const content = currentLines.join("\n").trim();
          if (content.length > 10) {
            chars.push({
              name: currentName,
              content,
              contentPreview: content.slice(0, 80).replace(/\n/g, " "),
            });
          }
        }
        started = true;
        currentName = name;
        currentLines = extraDesc ? [extraDesc] : [];
        continue;
      }
    }

    if (started && currentName) {
      currentLines.push(line);
    }
  }

  // 最后一个角色
  if (started && currentName && currentLines.length > 0) {
    const content = currentLines.join("\n").trim();
    if (content.length > 10) {
      chars.push({
        name: currentName,
        content,
        contentPreview: content.slice(0, 80).replace(/\n/g, " "),
      });
    }
  }

  return chars;
}

// ─── 阶段2：内部去重（同一次导入内）─────────────

/**
 * 合并同一次导入中的相似角色。
 * "苏挽月" 和 "挽月" → 保留全名，合并内容。
 */
function mergeSimilar(chars: ParsedChar[]): { merged: ParsedChar[]; mergeLog: string[] } {
  const result: ParsedChar[] = [];
  const mergeLog: string[] = [];

  for (const c of chars) {
    const existing = result.find(r => isSameCharacter(r.name, c.name));
    if (existing) {
      // 用更长的名字（全名优先）
      if (c.name.length > existing.name.length) {
        mergeLog.push(`${c.name} ← ${existing.name}`);
        existing.name = c.name;
      } else {
        mergeLog.push(`${existing.name} ← ${c.name}`);
      }
      existing.content += "\n\n---\n\n" + c.content;
      existing.contentPreview = existing.content.slice(0, 80).replace(/\n/g, " ");
    } else {
      result.push({ ...c });
    }
  }

  return { merged: result, mergeLog };
}

// ─── 阶段3：数据库去重 + 写入 ────────────────────

async function dbMerge(
  projectId: string,
  chars: ParsedChar[],
): Promise<{ created: string[]; updated: string[]; mergeLog: string[] }> {
  // 加载项目所有已有角色（含 tags）
  const existing = await prisma.characterCard.findMany({
    where: { projectId },
    select: { id: true, name: true, tags: true, quickImportContent: true, background: true },
  });

  const created: string[] = [];
  const updated: string[] = [];
  const mergeLog: string[] = [];
  const newCharData: Array<{
    projectId: string; name: string; background: string;
    quickImportContent: string; role: string; age: string; gender: string; tags: string[];
  }> = [];

  for (const c of chars) {
    // 在已有角色中找相似项
    const match = existing.find(e => isSameCharacter(e.name, c.name));

    if (match) {
      // 拼接 quickImportContent（防御旧版空对象脏数据）
      const prevQC = typeof match.quickImportContent === 'string' ? match.quickImportContent : '';
      const newQC = [prevQC, String(c.content || '')]
        .filter(s => s.trim().length > 0)
        .join("\n\n---\n\n")
        .slice(0, 15000) || c.content.slice(0, 15000);

      // 安全合并 tags（避免原子操作兼容问题）
      const existingTags: string[] = Array.isArray(match.tags) ? match.tags : [];
      const mergedTags = [...new Set([...existingTags, "📥快速导入"])];

      await prisma.characterCard.update({
        where: { id: match.id },
        data: {
          quickImportContent: newQC,
          background: match.background || c.content.slice(0, 15000),
          tags: mergedTags,
        },
      });

      updated.push(match.name);
      mergeLog.push(`${match.name} ← 追加内容`);
    } else {
      // 收集新建角色，最后批量写入
      newCharData.push({
        projectId,
        name: c.name,
        background: c.content.slice(0, 15000),
        quickImportContent: c.content.slice(0, 15000),
        role: "supporting",
        age: "未知",
        gender: "未知",
        tags: ["📥快速导入"],
      });
      created.push(c.name);
    }
  }

  // 批量写入新角色（单次DB往返）
  if (newCharData.length > 0) {
    await prisma.characterCard.createMany({ data: newCharData });
  }

  return { created, updated, mergeLog };
}

// ═══════════════════════════════════════════════
// POST (SSE)
// ═══════════════════════════════════════════════

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const { projectId, rawText } = body;

  if (!projectId || !rawText) {
    return NextResponse.json({ error: "缺少 projectId 或 rawText" }, { status: 400 });
  }
  const text = rawText as string;
  if (text.length < 20) {
    return NextResponse.json({ error: "文本太短" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const t0 = Date.now();

        // ── 阶段1：正则解析 ──
        send({ type: "progress", stage: "parse", message: `🔍 解析中... ${text.length.toLocaleString()} 字符`, pct: 10 });
        await new Promise(r => setTimeout(r, 50));

        const parsed = parseCharacters(text);

        if (parsed.length === 0) {
          // 诊断：显示文本前200字帮助定位格式问题
          const preview = text.slice(0, 200).replace(/\n/g, "↵");
          send({ type: "error", message: `未识别到任何角色（${text.length.toLocaleString()}字）。支持格式：### 1.人名 / 1.人名 / 一、人名。文本预览：${preview}...` });
          controller.close();
          return;
        }

        // ── 阶段2：内部去重合并 ──
        send({ type: "progress", stage: "merge", message: `🔗 内部去重... ${parsed.length} 个候选`, pct: 30 });

        const { merged, mergeLog: internalMerges } = mergeSimilar(parsed);

        if (internalMerges.length > 0) {
          send({
            type: "progress", stage: "merged",
            message: `🔗 内部合并: ${internalMerges.join("、")}`,
            pct: 40,
            characters: merged.map(c => ({ name: c.name, preview: c.contentPreview })),
          });
        } else {
          send({
            type: "progress", stage: "merged",
            message: `✅ ${merged.length} 个角色（无内部重复）`,
            pct: 40,
            characters: merged.map(c => ({ name: c.name, preview: c.contentPreview })),
          });
        }

        await new Promise(r => setTimeout(r, 100));

        // ── 阶段3：数据库去重 + 写入 ──
        send({ type: "progress", stage: "write", message: `💾 对比已有角色...`, pct: 60 });

        const { created, updated, mergeLog } = await dbMerge(projectId as string, merged);

        const sec = ((Date.now() - t0) / 1000).toFixed(1);

        // 构建消息
        const parts: string[] = [];
        if (created.length > 0) parts.push(`+${created.length} 新建`);
        if (updated.length > 0) parts.push(`📎${updated.length} 追加`);

        const message = `✅ ${parts.join(" · ")} · ${sec}s——点击左侧角色→编辑→背景状态查看导入内容`;

        send({
          type: "done",
          ok: true,
          created: created.length,
          updated: updated.length,
          totalChars: created.length + updated.length,
          timeSec: parseFloat(sec),
          message,
          characterNames: [...created, ...updated.map(n => `${n}(追加)`)],
        });

        controller.close();
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
        controller.close();
      }
    },
  });

  return new Response(sse, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
