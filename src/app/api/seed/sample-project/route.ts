import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

/**
 * POST /api/seed/sample-project
 *
 * 一键载入内置「示例项目」——仙侠题材，含：
 *  - 世界观（定义·规则）：下达的硬规则（如「全文严禁现代科技」）会真正进入写作上下文
 *  - 剧情推进倾向
 *  - 主角角色卡（李尘，性格三层）
 *  - 一卷两章示范正文
 *
 * 幂等：若已存在同名示例项目，直接返回现有 id，不重复创建。
 * 用途：新人「开箱即懂」第一钩子，点开即见生成+填表+召回效果。
 */

const SAMPLE_NAME = "示例 · 山海拾遗（仙侠）";

function countWords(s: string): number {
  return s.replace(/\s/g, "").length;
}

export async function POST() {
  try {
    const existing = await prisma.project.findFirst({ where: { name: SAMPLE_NAME } });
    if (existing) {
      return NextResponse.json({ ok: true, id: existing.id, created: false, message: "示例项目已存在" });
    }

    const project = await prisma.project.create({
      data: {
        name: SAMPLE_NAME,
        description:
          "由 Novel Forge 内置的仙侠题材示例项目——直观展示「定义权·规则」「世界观」「剧情推进倾向」如何真正进入写作上下文（下达硬规则后 AI 生成会遵守），以及长文自动填表召回机制。可直接打开阅读、续写、导出。",
        genre: ["仙侠", "玄幻"],
        targetWordCount: 300000,
        synopsis:
          "山海宗外门杂役李尘，灵根被封、表面平庸。一次打扫藏经阁时拾得一枚无字古玉，自此踏入波澜壮阔的山海修行界——从底层逆袭，每一步奇遇皆有代价。",
        toneKeywords: ["古典东方", "热血逆袭", "师徒恩义"],
        authorNote: "示例项目：所有设定均为演示用途，可随意修改或删除。",
        globalPrompt: "（初始化中，稍后由同步生成）",
      },
    });
    const pid = project.id;

    // 世界观（定义·规则）——「定义权」示范：硬规则会真正约束生成
    await prisma.lorebookEntry.create({
      data: {
        projectId: pid,
        title: "山海修行界 · 世界观与铁律",
        category: "worldview",
        keys: ["山海界", "灵气", "修炼体系", "山海宗"],
        content:
          "【世界】山海界以灵气为修行根基，宗门林立，弱肉强食。\n" +
          "【修炼体系】炼气→筑基→金丹→元婴→化神→合体→大乘，严禁越级妄言。\n" +
          "【最高定义·规则（硬约束，生成必须服从）】\n" +
          "1) 全文严禁出现任何现代科技造物（手机、枪械、电灯、汽车、网络等）；\n" +
          "2) 主角李尘灵根被封，第一卷内不得展露真实修为；\n" +
          "3) 修炼需循序渐进，不得凭空顿悟飞升。",
        insertionOrder: 10,
        depth: 1,
        enabled: true,
      },
    });

    // 剧情推进倾向
    await prisma.lorebookEntry.create({
      data: {
        projectId: pid,
        title: "剧情推进倾向",
        category: "story_progression",
        keys: ["节奏", "推进", "钩子"],
        content:
          "【推进倾向】慢热铺垫→小高潮→反转收束。每卷结尾必留钩子。\n" +
          "【禁忌】禁止开局龙傲天；主角须从底层逆袭，每次奇遇都伴随代价（受伤/树敌/暴露风险）。\n" +
          "【情感】克制含蓄，重兄弟情与师徒恩，忌无脑后宫。",
        insertionOrder: 20,
        depth: 1,
        enabled: true,
      },
    });

    // 主角角色卡
    await prisma.characterCard.create({
      data: {
        projectId: pid,
        name: "李尘",
        role: "protagonist",
        age: "16",
        gender: "男",
        background:
          "山海宗外门杂役，灵根被一枚上古封印锁死，十六年毫无寸进，被同门讥为废柴。性格沉稳隐忍，重情义，暗中以打扫藏经阁之便偷学残卷。",
        personality: {
          dominant: "隐忍克制",
          drive: "守护与证明自己",
          contradiction: "渴望力量却怕暴露",
          habits: ["擦拭古玉", "深夜练体"],
          socialMask: "木讷寡言的杂役",
        } as any,
        currentStatus: "alive",
        tags: ["主角", "示例"],
      },
    });

    // 卷 + 章节
    const volume = await prisma.storyNode.create({
      data: {
        projectId: pid,
        parentId: null,
        type: "volume",
        title: "第一卷 · 藏经阁的玉",
        order: 0,
        status: "draft",
        outline: "废柴杂役李尘在藏经阁拾得无字古玉，灵气首次苏醒，命运的齿轮开始转动。",
      },
    });

    const ch1 =
      "山海宗，外门。\n\n晨光未透，李尘已扛着竹帚走上藏经阁的石阶。十六年来，他扫过的灰比读过的字多。同门的嘲笑他听惯了——「灵根被封的废柴，也配碰经书？」\n\n他只是低着头，把帚尖探进积尘的细节里。直到今日，帚柄撞上阁板底缝，磕出一物：一枚巴掌大、通体苍青的无字古玉。\n\n玉入手微凉，竟隐隐与心口某处共鸣。李尘四下无人，悄悄将玉塞入怀中。他不知道，这一捡，捡起了被封印的自己，也捡起了整座山海界的波澜。";
    await prisma.storyNode.create({
      data: {
        projectId: pid,
        parentId: volume.id,
        type: "chapter",
        title: "第一章 · 拾玉",
        order: 0,
        status: "draft",
        outline: "李尘扫阁拾得古玉，灵气初醒。",
        content: ch1,
        wordCount: countWords(ch1),
      },
    });

    const ch2 =
      "当夜。\n\n李尘盘膝于柴房，古玉悬于掌心。月光落上去，玉面竟浮起极淡的纹路，像山脉，又像经脉。一股温润的气流顺着掌心钻入体内，所过之处，淤塞十六年的经脉微微松动。\n\n他骇然收玉。这不是修炼的感觉——这是「解封」的前兆。\n\n窗外传来巡夜弟子的脚步。李尘将玉按回胸口，闭眼装睡。心跳如鼓，他却第一次觉得：那曾被讥笑的十六年，或许不是废柴的证明，而是某种等待。\n\n山雨欲来。";
    await prisma.storyNode.create({
      data: {
        projectId: pid,
        parentId: volume.id,
        type: "chapter",
        title: "第二章 · 玉中有脉",
        order: 1,
        status: "draft",
        outline: "古玉显纹，灵气解封前兆，李尘初窥修行门径。",
        content: ch2,
        wordCount: countWords(ch2),
      },
    });

    // 同步全局提示词：让世界观/规则/剧情倾向真正进入写作上下文
    await syncGlobalPrompt(pid);

    return NextResponse.json({ ok: true, id: pid, created: true, message: "示例项目已创建" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "创建示例项目失败" },
      { status: 500 }
    );
  }
}
