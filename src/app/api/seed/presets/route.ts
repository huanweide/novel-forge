import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { BUILTINS } from "@/lib/builtin-presets";

// POST /api/seed/presets —— 写入内置示范预设（首次部署或重置时用）
// 把"参考资料本身就是个预设库"实体化为可一键套用的示范资产。
// 来源：用户提供的《奶龙都能看会的宝宝流数据库使用教程》v2.7，提取其中明确命名的预设概念：
//   · 表格模板预设（主角信息表 / 属性表 / 关系表 / 资产表 / 宫斗·妃嫔居住建筑表）
//   · 剧情推进预设（默认纯召回 / 缝合怪多线推进）
//   · 分阶段人设（<if cell> 语法，文档「IF语法」章节）
//   · 世界观骨架 / 文风 / 角色卡
// 去重规则：{ type, title, isBuiltin:true } 已存在则跳过，因此新增预设只会在首次播种或重置时注入，
// 不会影响用户已有的项目数据。

// BUILTINS 已抽到 src/lib/builtin-presets.ts（单一数据源，避免双份维护）

export async function POST() {
  try {
    let created = 0;
    for (const b of BUILTINS) {
      const exists = await prisma.preset.findFirst({
        where: { type: b.type, title: b.title, isBuiltin: true },
      });
      if (!exists) {
        const tags = Array.from(new Set([...(b.tags || []), "trirui推荐"]));
        await prisma.preset.create({
          data: { ...b, author: "trirui", tags, isBuiltin: true, isPublic: true } as any,
        });
        created++;
      }
    }
    return NextResponse.json({ ok: true, created, total: BUILTINS.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(`播种预设失败：${msg}`);
  }
}
