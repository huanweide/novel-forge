import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST /api/presets/[id]/fork  { author }
// 复刻（Fork）他人预设到自己的名下，可二创。免费、非商业。
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { author } = (await request.json()) as any;
    const src = await prisma.preset.findUnique({ where: { id } });
    if (!src) return NextResponse.json({ error: "预设不存在" }, { status: 404 });

    const clone = await prisma.preset.create({
      data: {
        type: src.type,
        title: `${src.title}（复刻）`,
        description: src.description,
        content: src.content,
        author: author || "匿名",
        tags: src.tags,
        isPublic: true,
        isBuiltin: false,
        forkedFromId: src.id,
      } as any,
    });
    return NextResponse.json(clone);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "复刻失败" }, { status: 500 });
  }
}
