/**
 * POST /api/characters/classify
 *
 * v6: 纯本地分类——不调 API，零失败可能。
 *     从世界书词条标题直接提取标签，匹配角色归属。
 *     AI 只做一件事（可选）：为缺少世界书的项目建议补充标签。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 30;

interface ClassifyGroup {
  category: string;
  label: string;
  description: string;
  members: string[];
  memberIds: string[];
}

// ─── 分类维度映射 ──────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  faction: "势力",
  geography: "势力",
  magic_system: "身份",
  creature: "身份",
  item: "身份",
  history: "势力",
  culture: "势力",
  law: "阵营",
  custom: "势力",
};

// ─── 本地分类引擎 ──────────────────────────

function classifyLocal(
  characters: Array<{ id: string; name: string; background: string | null }>,
  loreEntries: Array<{ title: string; category: string; content: string }>,
): ClassifyGroup[] {
  const groups: ClassifyGroup[] = [];
  const nameToId = new Map(characters.map(c => [c.name, c.id]));

  for (const entry of loreEntries) {
    const category = CATEGORY_MAP[entry.category] || "势力";
    const label = entry.title;
    if (!label || label.length < 2) continue;

    const members = new Set<string>();

    // 匹配逻辑：
    // 1. 角色背景提到了这个词条名
    // 2. 词条内容提到了这个角色名
    for (const c of characters) {
      const bg = (c.background || "").toLowerCase();
      const name = c.name;
      const content = entry.content.toLowerCase();
      const title = label.toLowerCase();

      if (bg.includes(title) || content.includes(name)) {
        members.add(c.name);
      }
    }

    // 过滤：只有一个角色的词条可能太宽泛（如"筑基期"），至少2人
    // 但不强制——单个成员的标签也展示出来让用户判断
    if (members.size >= 1) {
      const membersArr = Array.from(members);
      groups.push({
        category,
        label,
        description: entry.content.slice(0, 30),
        members: membersArr,
        memberIds: membersArr.map(n => nameToId.get(n)).filter(Boolean) as string[],
      });
    }
  }

  // 排序：成员多的靠前
  groups.sort((a, b) => b.members.length - a.members.length);

  return groups;
}

// ═══════════════════════════════════════════════

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const projectId = body.projectId as string;
  if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* */ }
      };

      try {
        const [loreEntries, characters] = await Promise.all([
          prisma.lorebookEntry.findMany({
            where: { projectId, enabled: true },
            select: { title: true, category: true, content: true },
          }),
          prisma.characterCard.findMany({
            where: { projectId },
            select: { id: true, name: true, background: true },
          }),
        ]);

        if (characters.length === 0) {
          send({ type: "error", message: "没有角色可分类" });
          controller.close();
          return;
        }

        send({
          type: "progress", stage: "start",
          message: `${characters.length} 角色 · ${loreEntries.length} 词条 · 本地分析中…`,
          pct: 20,
        });

        if (loreEntries.length === 0) {
          send({
            type: "progress", stage: "no-lore",
            message: "⚠️ 没有世界书词条。请先在「世界书」面板导入或创建词条，才能自动分类。",
            pct: 100,
          });
          send({
            type: "result",
            groups: [],
            totalGroups: 0,
            totalMembers: 0,
          });
          send({
            type: "done",
            ok: true,
            groups: 0,
            members: 0,
            message: "⚠️ 缺少世界书数据。请先导入世界设定。",
          });
          controller.close();
          return;
        }

        // 纯本地分类
        const groups = classifyLocal(characters, loreEntries);
        const totalMembers = new Set(groups.flatMap(g => g.members)).size;

        send({
          type: "done",
          ok: true,
          groups: groups.length > 0 ? groups : [],
          totalGroups: groups.length,
          totalMembers,
          message: groups.length > 0
            ? `✅ ${groups.length} 个分类 · ${totalMembers} 人`
            : `⚠️ 未找到分类匹配。${loreEntries.length} 个词条中没匹配到任何角色。请确认角色的背景信息中包含词条名称。`,
        });

        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: `分析失败: ${msg}` });
        try { controller.close(); } catch { /* */ }
      }
    },
  });

  return new Response(sse, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
