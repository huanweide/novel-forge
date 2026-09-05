import { promises as fs } from "fs";
import path from "path";
import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { parseTemplateToDraft } from "@/core/presets/from-template";
import { validatePresetContent } from "@/core/presets/validate";

export const maxDuration = 30;

// POST /api/presets/import-local-templates
// 把仓库根 templates/*.md 的本地模板「加入」创意工坊：解析成预设草稿并落库。
// 加入后它们与市集里其它预设完全同权——可预览、可注入、可撤销、可自配置。
// 幂等：已存在（同 type + title）的模板自动跳过，重复点击不会产生重复预设。
export async function POST() {
  try {
    const dir = path.join(process.cwd(), "templates");
    let files: string[] = [];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith(".md"));
    } catch {
      return NextResponse.json({ error: "templates 目录不存在或不可读" }, { status: 404 });
    }

    const imported: { id: string; title: string; type: string }[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      let md = "";
      try {
        md = await fs.readFile(path.join(dir, file), "utf8");
      } catch {
        errors.push(`${file}：读取失败`);
        continue;
      }

      const draft = parseTemplateToDraft(file, md);
      if (!draft) {
        skipped.push(`${file}（无法识别模板类型，文件名需含「风格卡 / 角色卡 / 大纲」）`);
        continue;
      }

      // 解析结果必须通过结构校验才能入库，避免把脏草稿带进市集
      const v = validatePresetContent(draft.type, draft.content);
      if (!v.ok) {
        errors.push(`${file}：${v.errors.join("；")}`);
        continue;
      }

      const exists = await prisma.preset.findFirst({
        where: { type: draft.type, title: draft.title },
      });
      if (exists) {
        skipped.push(`${file}（已存在同名预设，跳过）`);
        continue;
      }

      const preset = await prisma.preset.create({
        data: {
          type: draft.type,
          title: draft.title,
          description: draft.description,
          content: draft.content as any,
          author: "本地模板",
          tags: draft.tags,
          isPublic: true,
          isBuiltin: false, // 非内置：用户可编辑、可删除、可自配置
        },
      });
      imported.push({ id: preset.id, title: preset.title, type: preset.type });
    }

    return NextResponse.json({ ok: true, imported, skipped, errors });
  } catch (e) {
    return jsonError(e);
  }
}
