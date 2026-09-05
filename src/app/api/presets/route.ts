import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { validatePresetContent } from "@/core/presets/validate";

// GET /api/presets?type=&tag=&q= —— 创意工坊浏览（公开预设）
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const tag = searchParams.get("tag");
  const q = searchParams.get("q");

  const where: any = { isPublic: true };
  if (type) where.type = type;
  if (tag) where.tags = { contains: tag };
  if (q) where.OR = [{ title: { contains: q } }, { description: { contains: q } }];

  const presets = await prisma.preset.findMany({
    where,
    orderBy: [{ downloads: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(presets);
}

// POST /api/presets —— 用户上传共享预设（创意工坊共创）
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as any;
    const { type, title, description, content, author, tags } = body;
    if (!type || !title) {
      return NextResponse.json({ error: "缺少 type 或 title" }, { status: 400 });
    }
    // 上传即校验 content 结构：字段拼错在保存时就拦下，而不是等套用后才发现没效果
    if (content !== undefined && content !== null) {
      const v = validatePresetContent(type, content);
      if (!v.ok) {
        return NextResponse.json(
          {
            error: `预设内容不合法：${v.errors.join("；")}`,
            errors: v.errors,
            warnings: v.warnings,
          },
          { status: 400 },
        );
      }
    }
    const preset = await prisma.preset.create({
      data: {
        type,
        title,
        description: description || "",
        content: content || {},
        author: author || "匿名",
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
