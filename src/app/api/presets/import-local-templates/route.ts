import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { parseTemplateToDraft, type PresetDraft } from "@/core/presets/from-template";
import { validatePresetContent } from "@/core/presets/validate";

export const maxDuration = 30;

// 本地模板 ↔ 创意工坊 的桥接端点。
// GET  —— 扫描仓库根 templates/*.md，用 parseTemplateToDraft 列出可桥接的预设草稿（预览用）。
// POST —— 把本地模板桥接成预设加入市集（同名幂等，content 先过 validatePresetContent 校验）。
// 这样仓库里的 .md 填空模板，点一下就能变成可注入 / 可撤销 / 可自配置的创意工坊预设。

const TEMPLATES_DIR = path.join(process.cwd(), "templates");

interface LocalTemplate {
  file: string;
  draft: PresetDraft | null;
}

async function listLocalTemplates(): Promise<LocalTemplate[]> {
  let files: string[];
  try {
    files = await fs.readdir(TEMPLATES_DIR);
  } catch {
    return [];
  }
  const out: LocalTemplate[] = [];
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const md = await fs.readFile(path.join(TEMPLATES_DIR, f), "utf8");
    out.push({ file: f, draft: parseTemplateToDraft(f, md) });
  }
  return out;
}

// GET /api/presets/import-local-templates —— 列出可桥接的本地模板草稿
export async function GET() {
  try {
    const all = await listLocalTemplates();
    const drafts = all
      .filter((t) => t.draft)
      .map((t) => ({ file: t.file, ...(t.draft as PresetDraft) }));
    return NextResponse.json(drafts);
  } catch (e) {
    return jsonError(e);
  }
}

// POST /api/presets/import-local-templates  { filename? }
// 不传 filename → 桥接全部本地模板；传 filename → 只桥接指定的那个（同名已存在则跳过）。
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as any;
    const targetFile = body.filename ? String(body.filename) : null;

    const all = await listLocalTemplates();
    const candidates = all.filter(
      (t) => t.draft && (!targetFile || t.file === targetFile),
    );

    const created: any[] = [];
    const skipped: string[] = [];

    for (const { file, draft } of candidates) {
      if (!draft) continue;
      // 同名同类型本地预设已存在则跳过，保证重复点击安全（幂等）
      const exists = await prisma.preset.findFirst({
        where: { type: draft.type, title: draft.title, isBuiltin: false },
      });
      if (exists) {
        skipped.push(`${draft.title}（已存在）`);
        continue;
      }
      // 桥接出的 content 保证能通过校验；仍兜底校验一次，避免脏模板落库
      const v = validatePresetContent(draft.type, draft.content);
      if (!v.ok) {
        skipped.push(`${draft.title}（校验失败：${v.errors.join("；")}）`);
        continue;
      }
      const preset = await prisma.preset.create({
        data: {
          type: draft.type,
          title: draft.title,
          description: draft.description || "",
          content: draft.content as any,
          author: "本地模板",
          tags: draft.tags || [],
          isPublic: true,
          isBuiltin: false,
        },
      });
      created.push(preset);
    }

    return NextResponse.json({
      ok: true,
      created: created.length,
      skipped,
      presets: created,
    });
  } catch (e) {
    return jsonError(e);
  }
}
