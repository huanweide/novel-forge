import { jsonError } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { dedupeCharacters } from "@/core/character-dedupe";

export const maxDuration = 300;

// POST /api/characters/dedupe  { projectId }
// 角色自动去重合并（v1.4.0）：扫描全部角色卡——
//  - 出现次数 < 3 且背景薄弱的标记「🎭 龙套」；
//  - 相似名称（小名/繁简/错别字变体）合并到主卡（别名/关系/内容），被并卡软删标记「🗂 已合并」。
export async function POST(request: Request) {
  try {
    const { projectId, detectOnly } = (await request.json()) as any;
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }
    const result = await dedupeCharacters(projectId, { detectOnly: Boolean(detectOnly) });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return jsonError(e);
  }
}
