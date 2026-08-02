import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

// POST /api/presets/import —— 从 .preset.json 文件导入预设到本地库（酒馆式分享/分发）
// 与内置预设（isBuiltin）区分：导入的预设 isBuiltin=false、author="导入"，只存在本机，不共享。
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as any;
    const { type, title, description, content, tags, author } = body;
    if (!type || !title) {
      return NextResponse.json({ error: "缺少 type 或 title" }, { status: 400 });
    }
    // 避免重复导入同名同类型本地预设（内置预设不会被此覆盖）
    const exists = await prisma.preset.findFirst({ where: { type, title, isBuiltin: false } });
    if (exists) {
      return NextResponse.json(
        { error: "本地已有同名预设，请先删除或改名的再导入" },
        { status: 409 },
      );
    }
    const preset = await prisma.preset.create({
      data: {
        type,
        title,
        description: description || "",
        content: content || {},
        author: author || "导入",
        tags: tags || [],
        isPublic: true,
        isBuiltin: false,
      },
    });
    return NextResponse.json(preset);
  } catch (e) {
    return jsonError(e);
  }
}
