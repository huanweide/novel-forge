/**
 * POST /api/explore/create
 *
 * 从探讨模式的构建配置+已采纳内容创建完整的Novel Forge项目。
 *
 * Body: {
 *   config: BuildConfig,
 *   adopted: AdoptedItem[],
 *   mode: "direct" | "ai_refine"  // 直接创建 / AI完善后创建
 * }
 * Response: { projectId: string, message: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import type { BuildConfig, AdoptedItem } from "@/core/explore/types";
import { STEP_LABELS } from "@/core/explore/types";
import { stepToCategory, extractKeysFromText } from "@/core/explore/utils";
import { buildGlobalPromptFromExplore } from "@/core/explore/build-prompt";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import { upsertParsedSettingsToProject } from "@/core/settings";
import { jsonError } from "@/lib/api-error";
import { safeJson } from "@/lib/api-body";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const r = await safeJson(req);
    if (!r.ok) return r.response;
    const { config, adopted = [], mode = "direct", outline } = r.body as {
      config?: BuildConfig;
      adopted?: AdoptedItem[];
      mode?: "direct" | "ai_refine";
      outline?: {
        characters?: any[];
        loreEntries?: any[];
        plotOutline?: string;
        toneKeywords?: string[];
        styleProfile?: any;
      };
    };

    if (!config) {
      return NextResponse.json({ error: "缺少构建配置" }, { status: 400 });
    }

    const projectName = config.novelName || "未命名小说项目";
    const genre = config.genre || "玄幻";

    // 构建全局提示词
    let globalPrompt = buildGlobalPromptFromExplore(config, adopted);
    let authorNote = "";

    // AI完善模式
    if (mode === "ai_refine" && adopted.length > 0) {
      try {
        const refined = await aiRefineGlobalPrompt(config, adopted);
        if (refined) {
          globalPrompt = `${globalPrompt}\n\n---\n## 🤖 AI 完善\n${refined}`;
          authorNote = `AI完善模式创建\n完善摘要: ${refined.slice(0, 300)}`;
        }
      } catch {
        // AI完善失败不影响创建
      }
    }

    // 创建项目
    const project = await prisma.project.create({
      data: {
        name: projectName,
        description: config.direction?.slice(0, 500) || `${projectName}的设定`,
        synopsis: outline?.plotOutline || extractSynopsis(adopted),
        genre,
        globalPrompt,
        buildConfig: config as any,
        authorNote: authorNote || `探讨模式创建\n${config.direction?.slice(0, 300) || ""}`,
        toneKeywords: config.stylePreference ? [config.stylePreference] : [],
      },
    });

    // ── 导入已采纳内容为世界书词条 ──
    for (let i = 0; i < adopted.length; i++) {
      const item = adopted[i];
      const category = stepToCategory(item.step);
      const keys = extractKeysFromText(item.title + " " + item.content);

      await prisma.lorebookEntry.create({
        data: {
          projectId: project.id,
          title: item.title.slice(0, 60),
          category,
          keys,
          content: item.content.slice(0, 2500),
          insertionOrder: 50 + i,
          enabled: true,
        },
      });
    }

    // ── 如果有主角名、且还没通过 adopt 写入同名角色 → 创建主角角色卡 ──
    if (config.protagonistName && config.protagonistName.trim()) {
      const existingProtagonist = await prisma.characterCard.findFirst({
        where: { projectId: project.id, name: config.protagonistName.trim() },
      });
      if (!existingProtagonist) {
        await prisma.characterCard.create({
          data: {
            projectId: project.id,
            name: config.protagonistName.trim(),
            role: "protagonist",
            background: adopted
              .filter((a) => a.step === "protagonist")
              .map((a) => a.content)
              .join("\n")
              .slice(0, 500),
            tags: ["📥探讨模式"],
            currentStatus: "alive",
          },
        });
      }
    }

    // ── 自动生成风格卡 ──
    const styleCard = await generateStyleCardFromConfig(project.id, config);

    // ── 自动生成默认写作规则 ──
    await generateDefaultRules(project.id, config);

    // ── 若粘贴大纲直接带入结构化三卡，批量写入（与工作台 parse-settings 同一实现）──
    if (outline && ((outline.characters?.length ?? 0) > 0 || (outline.loreEntries?.length ?? 0) > 0)) {
      try {
        await upsertParsedSettingsToProject(project.id, {
          characters: outline.characters || [],
          loreEntries: outline.loreEntries || [],
          synopsis: outline.plotOutline || "",
          toneKeywords: outline.toneKeywords || [],
          styleProfile: outline.styleProfile || null,
        });
      } catch (e) {
        console.error("[explore/create] 大纲三卡写入失败:", e);
      }
    }

    // ── 刷新全局提示词缓存（播种的世界书/角色卡/风格卡需进入生成上下文）──
    syncGlobalPrompt(project.id).catch(() => {});

    return NextResponse.json({
      success: true,
      projectId: project.id,
      message: `项目「${projectName}」已创建，包含 ${adopted.length} 条世界设定`,
    });
  } catch (err) {
    console.error("[explore/create] 创建失败:", err);
    return jsonError(err);
  }
}

// ─── 辅助函数 ────────────────────────────────────────────

function extractSynopsis(adopted: AdoptedItem[]): string {
  const opening = adopted.find((a) => a.step === "opening");
  const conflict = adopted.find((a) => a.step === "core_conflict");
  return [opening?.content, conflict?.content]
    .filter(Boolean)
    .join("\n")
    .slice(0, 500);
}

/** 从探讨配置自动生成风格卡 */
async function generateStyleCardFromConfig(projectId: string, config: BuildConfig): Promise<void> {
  try {
    const genreStyleMap: Record<string, string> = {
      "玄幻": "东方玄幻风格，注重意境描写与力量体系的层次感。战斗场景强调能量碰撞与法则感悟，对话简练有力。",
      "仙侠": "古典仙侠风格，文白相间。注重意境营造与天道哲思。飞升、劫难、因果等概念贯穿全文。",
      "都市": "现代都市风格，语言贴近生活。对话口语化，场景描写简洁。注重人物心理与现实逻辑。",
      "科幻": "硬科幻风格，注重科技设定的严谨性。术语使用规范，逻辑链条清晰。未来感与人文关怀并重。",
      "历史": "历史演义风格，兼顾史实与虚构。语言考究，对话符合时代背景。权谋争斗层次分明。",
      "言情": "细腻言情风格，注重情感层次与心理描写。对话含蓄有力，场景氛围感强。",
      "悬疑": "悬疑推理风格，信息密度高。细节埋伏笔，节奏紧凑。环境描写烘托紧张氛围。",
      "武侠": "传统武侠风格，招式描写具象化。江湖恩怨、侠义精神贯穿全文。打斗见招拆招。",
      "奇幻": "西式奇幻风格，世界观宏大。种族、魔法、地理等设定层次分明。史诗感强。",
      "末世": "末世生存风格，资源匮乏的紧张感贯穿全文。环境描写荒凉压抑。人性挣扎是核心。",
      "游戏": "游戏竞技风格，数据面板与战斗描述并重。术语准确，节奏明快。",
      "军事": "军事战争风格，战术描写专业。指挥体系清晰。场面宏大，逻辑严密。",
    };

    const toneMap: Record<string, Record<string, number>> = {
      "轻松搞笑": { humor: 0.7, warmth: 0.3 },
      "热血燃向": { epicness: 0.8, tension: 0.5, warmth: 0.3 },
      "严肃深沉": { coldness: 0.6, tragedy: 0.4, philosophy: 0.3 },
      "细腻温情": { warmth: 0.8, nostalgia: 0.4 },
      "黑暗压抑": { coldness: 0.7, tragedy: 0.6, tension: 0.5 },
      "诙谐讽刺": { humor: 0.5, satire: 0.6 },
      "史诗磅礴": { epicness: 0.9, philosophy: 0.3 },
      "清新治愈": { warmth: 0.7, nostalgia: 0.4, optimism: 0.5 },
    };

    const audienceDistanceMap: Record<string, string> = {
      "男频·青年向": "medium",
      "男频·成人向": "close",
      "女频·青年向": "close",
      "女频·成人向": "close",
      "少年向": "medium",
      "全年龄向": "medium",
    };

    const styleDesc = genreStyleMap[config.genre] || "通用小说风格，注重叙事节奏与人物塑造。";
    const tonalMarkers = toneMap[config.stylePreference] || {};
    const narrativeDistance = audienceDistanceMap[config.audience] || "medium";

    await prisma.styleCard.create({
      data: {
        projectId,
        styleDescription: `${styleDesc}${config.stylePreference ? ` 基调：${config.stylePreference}。` : ""}${config.styleTags?.length ? ` 流派：${config.styleTags.join("、")}。` : ""}`,
        tonalMarkers,
        narrativeDistance,
        dialogueRatio: 0.35,
        descriptionRatio: 0.25,
        actionRatio: 0.25,
        innerThoughtRatio: 0.15,
        avgSentenceLength: 25,
        shortSentenceRatio: 0.3,
        longSentenceRatio: 0.15,
        povType: "third_person_limited",
      },
    });
  } catch (e) {
    console.error("[explore/create] 风格卡生成失败:", e);
  }
}

/** 根据流派创建默认写作规则（含终极写作铁律——所有小说通用，最高优先级） */
async function generateDefaultRules(projectId: string, config: BuildConfig): Promise<void> {
  // ══════════════════════════════════════════
  // 终极写作铁律 —— 所有小说通用，priority 90-100
  // ══════════════════════════════════════════
  const supremeRules: Array<{ name: string; content: string; category: string; priority: number }> = [
    {
      name: "句式铁律——长短交错，禁止短句堆砌",
      priority: 100,
      category: "writing",
      content: [
        "绝对禁止连续3个以上短句（≤15字）。短句仅用于动作高潮/情绪爆发点，且必须紧跟长句产生节奏对比。",
        "强制模式：长句(30-60字)→中等句(15-30字)→短句(≤15字)循环。三种长度交替，连续3句不得同长度。",
        "反面教材（违规）：'他站起来。走到窗前。看着外面。天很黑。他叹了口气。'——五连短句，节奏破碎。",
        "正确示范：'林辰从蒲团上站起来，膝盖发出轻微的咔咔声，在寂静的修炼室中格外清晰。他走到窗前，推开那扇蒙着厚厚尘灰的木窗。夜色浓稠如墨，远处星脉山脉的轮廓在月华下若隐若现。他吸了口气。'——长(35字)→中(22字)→长(35字)→短(5字)，节奏有起伏。",
      ].join("\n"),
    },
    {
      name: "人物指代——名字优先，禁止他/她连用",
      priority: 99,
      category: "writing",
      content: [
        "绝对禁止连续两个句子出现同一个'他'或'她'。每段超过3个'他/她'即违规。",
        "同一角色5句内交替指代方式：名字→身份→外貌特征→动作角色→代词(仅一次)。示例：'林辰站起身。少年走到窗前。星辰印觉醒者看着外面的黑暗。他叹了口气。林辰转身离开。'",
        "技巧：用角色当前动作来指代——'说话的人'、'握刀的手'、'站在门口的那位'。给画面，不给代词。",
      ].join("\n"),
    },
    {
      name: "禁用符号与禁用句式",
      priority: 98,
      category: "writing",
      content: [
        "禁用符号：①破折号 '——' '—' 在任何情况下不得出现。②括号'()' '（）'不得出现。③对白中不得出现任何具体数字。",
        "禁用句式：①'不是……而是……' ②'没有……只是……' ③'当……时'套娃句(拆成独立句)。④夹叙夹议——禁止一面叙事一面跳出评价角色行为。",
        "禁止比喻描写对白效果。错误：'她的话像一把钥匙，打开了众人心中的锁。'正确：直接写众人听完之后的行动和反应。",
      ].join("\n"),
    },
    {
      name: "禁止描写声音/语气/眼神/视线",
      priority: 97,
      category: "writing",
      content: [
        "禁止以下描写（直接或间接均属违规）：",
        "①声音/语气：'声音很平静'、'语气冷得像冰'、'低沉的声音'、'提高了音量'、'语调毫无起伏'——不写声音特征，写角色说了什么。",
        "②眼神/目光：'目光像刀子'、'眼神一凛'、'视线交汇'、'盯着'、'瞥了一眼'、'目不转睛'、'偷偷看向'——不写看的方式，写看见了什么。",
        "③视线方向：'看向XX'、'望向远处'、'视线落在XX上'——去掉'看向'中介，直接呈现眼中所见之物。",
        "④禁止无中生有：'拂去不存在的灰尘'、'拍了拍并不存在的褶皱'——完全禁止。",
        "替代方案：不写声音→写对白内容；不写眼神→写所见具体事物；不写表情→写身体动作。用行为替代状态描述。",
      ].join("\n"),
    },
    {
      name: "白描铁律——可观察、可直感、零解读",
      priority: 96,
      category: "writing",
      content: [
        "核心原则：只呈现角色的行动和对白，禁止作者视角的解读或阐释。把解读空间完全交给读者。",
        "禁止：①直给结论的形容词/副词——'愤怒地'、'悲伤地'、'优雅地'。用具体动作替代。 ②概括性一笔带过——'两人打了起来'→写具体一拳一腿。 ③解读角色动机——'他之所以这样做，是因为……'→让读者自己判断。",
        "正确示范：'林辰握紧拳头，指节咔咔作响，转身一拳砸在石柱上。石屑簌簌落下。'代替代'林辰很愤怒'。'苏婉清放下碗筷，起身离开，门在身后轻轻合上。'代替'苏婉清不高兴地离开了'。",
        "对白铁律：用引号''包裹，纯对白——不得用比喻修辞展现话语效果。''你走吧。'她转过身去。'——对白就是角色说的话本身，效果由读者从上下文中感受。",
      ].join("\n"),
    },
    {
      name: "节奏控制——详略与描写密度",
      priority: 95,
      category: "writing",
      content: [
        "描写占比：细节描写占单章20-30%，仅服务于①冲突强化 ②情绪烘托 ③人设塑造。非这三用途的描写一律砍掉。",
        "快节奏场景（战斗/追逐/争吵/对峙）：禁止静态描写，白描动作推进，每句聚焦一个动作。",
        "慢节奏场景（过渡/独处/等待）：可插入环境或心理细节，单处不超过50字，点到即止。",
        "环境描写仅限：①新场景首次出现(≤30字) ②气氛需要(≤40字)。其余时间不描写环境。",
        "官能描写（触觉/味觉/嗅觉/听觉/视觉）作为重点时，细腻深入详尽展开。触感优先于视觉。",
        "同一场景层次切换：宏观环境(1句)→中景动作(2-3句)→微观特写(1句)→对白切入。四层递进。",
      ].join("\n"),
    },
    {
      name: "情节与情绪——拉扯、抑扬、反转",
      priority: 94,
      category: "writing",
      content: [
        "情节拉扯：每章至少一次转折/反转。冲突层层升级，不许一笔化解。",
        "情绪抑扬：抑时蓄力——用环境/动作/沉默来压抑，不许直写'他很绝望'。扬时爽快——一句话爆点释放。抑需3句以上积累，扬只需1-2句干脆利落。",
        "人设一致性：角色行为必须符合已设定性格/背景/能力。不得为剧情方便临时改变立场或能力。重大选择必须有前文铺垫。",
        "紧凑节奏：节奏随情绪变化——紧张→短促有力；悲伤→句式拖长不过分；愤怒→对白动作密集。不允许匀速叙述。",
        "禁止擅自埋伏笔。语言平实直白，少修饰但不过分简洁。人物塑造靠对话和动作，少量心理描写。",
      ].join("\n"),
    },
  ];

  for (const r of supremeRules) {
    try {
      await prisma.rule.create({
        data: {
          projectId,
          name: r.name,
          content: r.content,
          category: r.category,
          enabled: true,
          priority: r.priority,
          scope: "write_only",
        },
      });
    } catch (e) {
      console.error(`[explore/create] 铁律创建失败 (${r.name}):`, e);
    }
  }

  // ── 流派特定规则（次要优先级，0-5）──
  const genreRuleMap: Record<string, Array<{ name: string; content: string; category: string }>> = {
    "玄幻": [
      { name: "力量体系一致性", content: "所有角色的力量等级、技能、突破条件必须严格遵循已设定的力量体系规则。不得临时添加新能力或改变已建立的等级关系。", category: "world" },
      { name: "境界突破铺垫", content: "每次境界突破必须有足够的铺垫：前期积累、契机触发、过程描写、突破后变化。不得毫无预兆地突破。", category: "world" },
    ],
    "仙侠": [
      { name: "因果逻辑", content: "所有重大事件必须有因果链条。天道、劫数、缘法等概念的使用前后一致。不得为推进剧情而忽略因果。", category: "world" },
      { name: "法宝与功法命名", content: "法宝、功法、丹药的命名需遵循已建立的命名体系。同类型物品命名风格统一。", category: "world" },
    ],
    "都市": [
      { name: "现实逻辑自洽", content: "即使是都市异能类，也要保持现实世界的底层逻辑。社会规则、人际关系、经济常识不能完全脱离现实。", category: "world" },
    ],
    "科幻": [
      { name: "科技设定严谨性", content: "所有科技设定必须有基本原理支撑。同一条科技规则必须在全文中保持一致。不得为情节需要突然改变科技规则。", category: "world" },
    ],
  };

  const rules = genreRuleMap[config.genre] || [
    { name: "设定一致性", content: "所有角色设定、世界观设定在全文范围内保持一致。不得出现前后矛盾的设定。", category: "world" },
  ];

  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    try {
      await prisma.rule.create({
        data: {
          projectId,
          name: r.name,
          content: r.content,
          category: r.category,
          enabled: true,
          priority: i,
          scope: "all",
        },
      });
    } catch (e) {
      console.error(`[explore/create] 流派规则创建失败 (${r.name}):`, e);
    }
  }
}

/** AI完善：用LLM填充缺失的设定 */
async function aiRefineGlobalPrompt(
  config: BuildConfig,
  adopted: AdoptedItem[],
): Promise<string | null> {
  const llmConfig = await getEffectiveConfig();
  const client = createLLMClient(llmConfig);
  const model = llmConfig.writerModel;

  const existingSummary = adopted
    .map((a) => `[${STEP_LABELS[a.step]}] ${a.title}: ${a.content.slice(0, 100)}`)
    .join("\n");

  const prompt = `请基于以下已有的小说设定，完善和补充缺失的设定。

【已有设定】
${existingSummary}

【构建配置】
类型：${config.genre}
受众：${config.audience}
字数：${config.wordCount}

【要求】
1. 找出设定中缺失或薄弱的部分
2. 为缺失部分提供2-3句话的具体补充
3. 确保所有设定之间没有矛盾
4. 格式：用Markdown，按主题分段

直接输出完善后的补充设定，300字以内。`;

  const response = await client.chat({
    model,
    messages: [
      { role: "system", content: "你是专业小说作家。补充缺失设定，确保一致性。任何题材都可以——直接给方案，不犹豫。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.6,
    maxTokens: 1200,
  });

  return response.content || null;
}
