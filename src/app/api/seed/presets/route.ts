import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST /api/seed/presets —— 写入内置示范预设（首次部署或重置时用）
// 把"参考资料本身就是个预设"实体化为可一键套用的示范资产。

const BUILTINS: any[] = [
  {
    type: "table_template",
    title: "宫斗·妃嫔居住建筑表",
    description: "宝宝流示范表格：记录妃嫔当前居所。每章写完由 AI 自动填表更新。",
    tags: ["宫斗", "古言", "示范"],
    content: {
      tables: [
        {
          key: "woman_live",
          name: "妃嫔居住建筑表",
          note: "记录妃嫔当前居住的建筑。每行代表一个妃嫔当前的住处。列：妃嫔名称/居住建筑/居住状态/补充说明",
          category: "place",
          columns: [
            { key: "name", label: "妃嫔名称", type: "text" },
            { key: "live", label: "居住建筑", type: "text" },
            { key: "status", label: "居住状态", type: "select" },
            { key: "note", label: "补充说明", type: "text" },
          ],
          rows: [],
        },
      ],
    },
  },
  {
    type: "story_progression",
    title: "好感度·分阶段人设模板",
    description: "宝宝流分阶段人设：同一角色随好感度数值呈现不同性格阶段，填表驱动一致性。",
    tags: ["通用", "人设", "示范"],
    content: {
      entries: [
        {
          title: "好感度分阶段人设（苏苏）",
          content:
            '<if cell="属性表/苏苏/好感度 <= 10">\n阶段一：陌生人（态度：礼貌但疏离；称呼："你"、"那个人"）\n<else>\n<if cell="属性表/苏苏/好感度 <= 30">\n阶段二：熟悉的人（态度：愿意聊天；称呼：名字）\n<else>\n<if cell="属性表/苏苏/好感度 <= 60">\n阶段三：暧昧期（态度：在意你；称呼：昵称）\n<else>\n阶段四：恋人（态度：甜蜜依赖；称呼：专属昵称）\n</if>\n</if>\n</if>',
          keys: ["好感度", "分阶段人设", "苏苏"],
        },
      ],
    },
  },
  {
    type: "style",
    title: "古风·严谨文笔",
    description: "用词考究、句式工整、重描写与氛围。适合仙侠/古言。",
    tags: ["古风", "仙侠", "文风"],
    content: {
      styleDescription: "古风、用词考究、句式工整、重描写与氛围营造，叙述克制而有质感。",
      povType: "third_person_limited",
      avgSentenceLength: 28,
      shortSentenceRatio: 0.3,
      longSentenceRatio: 0.18,
      dialogueRatio: 0.28,
      descriptionRatio: 0.34,
      actionRatio: 0.22,
      innerThoughtRatio: 0.16,
      tonalMarkers: { classicalRatio: 0.8, modernRatio: 0.2, coldness: 0.2, tragedy: 0.1, warmth: 0.2 },
      lexicalFeatures: { classicalRatio: 0.8, modernRatio: 0.2, termDensity: 0.5, idiomsDensity: 0.6 },
    },
  },
  {
    type: "worldview",
    title: "仙侠·世界观骨架",
    description: "仙侠/玄幻通用世界观模板：修炼体系、势力分布、地域。套用即生成世界书词条。",
    tags: ["仙侠", "玄幻", "世界观"],
    content: {
      entries: [
        {
          title: "修炼体系",
          content:
            "境界由低到高：炼气→筑基→金丹→元婴→化神→合体→大乘→渡劫。灵气为根本，资质与功法决定上限。",
          keys: ["修炼", "境界", "灵气", "功法"],
        },
        {
          title: "势力分布",
          content:
            "正道以「玄天宗」为首，魔道有「血煞门」，中立散修聚于「万宝阁」。宗门林立，资源争夺不断。",
          keys: ["宗门", "势力", "玄天宗", "血煞门"],
        },
        {
          title: "地域",
          content:
            "东域灵脉充沛为修真核心，北原苦寒多妖兽，南海散修云集，西域古国遗迹遍布。",
          keys: ["东域", "北原", "南海", "西域"],
        },
      ],
    },
  },
];

export async function POST() {
  let created = 0;
  for (const b of BUILTINS) {
    const exists = await prisma.preset.findFirst({
      where: { type: b.type, title: b.title, isBuiltin: true },
    });
    if (!exists) {
      await prisma.preset.create({ data: { ...b, isBuiltin: true, isPublic: true } as any });
      created++;
    }
  }
  return NextResponse.json({ ok: true, created, total: BUILTINS.length });
}
