/**
 * POST /api/tools/execute
 *
 * 执行 Agent 工具箱中的任意工具。AIChatBar 的 🔧 按钮通过此接口调用。
 * 支持 21 个工具——角色/世界书/大纲/伏笔/正文/实体检测/项目信息。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { toolRegistry } from "@/core/agents/tool-registry";
import type { ToolContext } from "@/core/agents/tool-registry";
import { jsonError } from "@/lib/api-error";

export async function POST(request: Request) {
  try {
    const { projectId, toolName, args } = await request.json();
    if (!projectId || !toolName) {
      return NextResponse.json({ error: "缺少 projectId 或 toolName" }, { status: 400 });
    }

    // 构建 ToolContext
    const ctx: ToolContext = {
      projectId,
      prisma,
      findCharacters: async (query: string) => {
        const chars = await prisma.characterCard.findMany({
          where: {
            projectId,
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { aliases: { has: query } },
            ],
          },
        }) as any;
        return chars;
      },
      findLore: async (keywords: string[]) => {
        const entries = await prisma.lorebookEntry.findMany({
          where: {
            projectId, enabled: true,
            OR: keywords.map((kw) => ({
              OR: [
                { title: { contains: kw, mode: "insensitive" } },
                { content: { contains: kw, mode: "insensitive" } },
                { keys: { has: kw } },
              ],
            })),
          },
          take: 10,
        }) as any;
        return entries;
      },
      findForeshadowing: async (description: string) => {
        const commitments = await prisma.pendingCommitment.findMany({
          where: {
            projectId,
            description: { contains: description, mode: "insensitive" },
          },
          take: 10,
        }) as any;
        return commitments;
      },
      detectEntities: async (text: string) => {
        const [chars, lore] = await Promise.all([
          prisma.characterCard.findMany({ where: { projectId } }),
          prisma.lorebookEntry.findMany({ where: { projectId, enabled: true } }),
        ]);
        const results: Array<{ name: string; type: string; confidence: number }> = [];
        const lower = text.toLowerCase();
        for (const c of chars) {
          if (lower.includes(c.name.toLowerCase())) {
            results.push({ name: c.name, type: "character", confidence: 1.0 });
          }
          for (const alias of (c.aliases || [])) {
            if (lower.includes(alias.toLowerCase())) {
              results.push({ name: alias, type: "character", confidence: 0.8 });
            }
          }
        }
        for (const l of lore) {
          if (lower.includes(l.title.toLowerCase())) {
            results.push({ name: l.title, type: l.category || "custom", confidence: 0.9 });
          }
          for (const key of (l.keys || [])) {
            if (lower.includes(key.toLowerCase())) {
              results.push({ name: key, type: l.category || "custom", confidence: 0.7 });
            }
          }
        }
        return results;
      },
    };

    // 执行工具
    const result = await toolRegistry.execute(toolName, args || {}, ctx);

    return NextResponse.json(result);
  } catch (err) {
    const info = err instanceof Error ? err.message : "工具执行失败";
    return NextResponse.json(
      { toolName: "unknown", success: false, data: null, error: info },
      { status: 500 },
    );
  }
}
