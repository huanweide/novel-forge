/**
 * 角色扮演聊天 —— 纯函数层
 *
 * 把 CharacterCard 的字段映射成「角色口吻」system prompt，供
 * /api/agent/character-chat 调 LLM 时复用。与写作 Agent 不同：这里不调用工具，
 * 只让 LLM 完全代入角色。纯函数便于单测（不依赖 prisma / LLM）。
 *
 * mode:
 *  - "dialogue" 对话：LLM 以角色第一人称口吻回复用户（角色扮演闲聊 / 问角色问题）
 *  - "possess"  附身：LLM 以「被角色附身」的作者身份，按用户给出的场景指令写一段
 *                 该角色视角的正文（用于帮写某角色的戏份）
 */

export type CharacterChatMode = "dialogue" | "possess";

export interface CharacterChatCard {
  name: string;
  aliases?: string[] | null;
  role?: string | null;
  currentStatus?: string | null;
  age?: string | number | null;
  gender?: string | null;
  appearance?: Record<string, unknown> | null;
  personality?: Record<string, unknown> | string[] | null;
  background?: string | null;
  abilities?: string[] | null;
  hiddenMotives?: string[] | null;
  relationships?: Array<{ targetName?: string; relation?: string; dynamic?: string }> | null;
  timeline?: Array<{ age?: string | number; event?: string; reference?: string }> | null;
  dialogueStyle?: {
    description?: string;
    examples?: string[];
    vocabulary?: string[];
    speechPatterns?: string[];
  } | null;
  tags?: string[] | null;
  storyLine?: string | null;
}

export interface CharacterChatContext {
  projectName?: string | null;
  projectSynopsis?: string | null;
  projectGenre?: string[] | null;
}

export interface BuildCharacterPromptInput extends CharacterChatCard, CharacterChatContext {
  mode: CharacterChatMode;
}

const ROLE_LABEL: Record<string, string> = {
  protagonist: "主角",
  antagonist: "反派",
  mentor: "导师",
  love_interest: "恋爱对象",
  supporting: "配角",
  background: "背景人物",
  comic_relief: "喜剧角色",
  catalyst: "催化剂角色",
};

function personalityText(p: CharacterChatCard["personality"]): string {
  if (!p) return "";
  if (Array.isArray(p)) return p.join("、");
  const parts: string[] = [];
  if (p.dominant) parts.push(`主导性格：${p.dominant}`);
  if (p.drive) parts.push(`内在驱动：${p.drive}`);
  if (p.contradiction) parts.push(`矛盾点：${p.contradiction}`);
  if (p.socialMask) parts.push(`社交面具：${p.socialMask}`);
  if (Array.isArray(p.habits) && p.habits.length) parts.push(`习惯：${(p.habits as string[]).join("、")}`);
  return parts.join("；");
}

function appearanceText(a: CharacterChatCard["appearance"]): string {
  if (!a) return "";
  const parts: string[] = [];
  const order: Array<[keyof typeof a, string]> = [
    ["hair", "发色发型"],
    ["eyes", "眼睛"],
    ["height", "身高"],
    ["build", "体型"],
    ["distinguishing", "特征"],
    ["attire", "着装"],
  ];
  for (const [k, label] of order) {
    const v = a[k];
    if (typeof v === "string" && v.trim()) parts.push(`${label}：${v}`);
  }
  return parts.join("；");
}

/** 把角色卡拼成可读的「角色档案」文本块（两种模式共用） */
function characterProfile(input: BuildCharacterPromptInput): string {
  const lines: string[] = [];
  lines.push(`角色名：${input.name}${input.aliases?.length ? `（别名：${input.aliases.join("、")}）` : ""}`);
  const role = input.role ? ROLE_LABEL[input.role] || input.role : "";
  const ident = [role, input.currentStatus, input.age ? `${input.age}岁` : "", input.gender]
    .filter(Boolean)
    .join(" · ");
  if (ident) lines.push(`身份：${ident}`);
  const ap = appearanceText(input.appearance);
  if (ap) lines.push(`外貌：${ap}`);
  const ps = personalityText(input.personality);
  if (ps) lines.push(`性格：${ps}`);
  if (input.background && input.background.length > 10) lines.push(`背景：${input.background}`);
  if (Array.isArray(input.abilities) && input.abilities.length) lines.push(`能力：${input.abilities.join("；")}`);
  if (Array.isArray(input.hiddenMotives) && input.hiddenMotives.length) lines.push(`隐藏动机：${input.hiddenMotives.join("；")}`);
  if (Array.isArray(input.relationships) && input.relationships.length) {
    const rel = input.relationships
      .map((r) => `${r.targetName || "?"}(${r.relation || "?"}${r.dynamic ? `·${r.dynamic}` : ""})`)
      .join("、");
    if (rel) lines.push(`人际关系：${rel}`);
  }
  if (Array.isArray(input.timeline) && input.timeline.length) {
    const tl = input.timeline
      .map((t) => `${t.age ?? "?"}岁：${t.event}${t.reference ? `（${t.reference}）` : ""}`)
      .join("；");
    if (tl) lines.push(`时间线：${tl}`);
  }
  const ds = input.dialogueStyle;
  if (ds?.description || Array.isArray(ds?.examples)) {
    const parts: string[] = [];
    if (ds?.description) parts.push(ds.description);
    if (Array.isArray(ds?.examples) && ds.examples.length) parts.push(`典型台词：${ds.examples.join(" / ")}`);
    if (Array.isArray(ds?.vocabulary) && ds.vocabulary.length) parts.push(`用词：${ds.vocabulary.join("、")}`);
    if (Array.isArray(ds?.speechPatterns) && ds.speechPatterns.length) parts.push(`句式：${ds.speechPatterns.join("；")}`);
    if (parts.length) lines.push(`说话风格：${parts.join("。")}`);
  }
  if (input.storyLine && input.storyLine.length > 10) lines.push(`故事线：${input.storyLine}`);
  if (Array.isArray(input.tags) && input.tags.length) lines.push(`标签：${input.tags.join("、")}`);
  return lines.join("\n");
}

/**
 * 生成角色扮演 system prompt。
 * 返回完整 system prompt 文本；两种模式差异仅在"末尾指令"与"是否允许旁白"。
 */
export function buildCharacterSystemPrompt(input: BuildCharacterPromptInput): string {
  const profile = characterProfile(input);
  const projectCtx = input.projectName
    ? `\n【作品背景】《${input.projectName}》${Array.isArray(input.projectGenre) && input.projectGenre.length ? `｜类型：${input.projectGenre.join("、")}` : ""}${input.projectSynopsis ? `\n总纲：${input.projectSynopsis}` : ""}`
    : "";

  const base = `你是小说《${input.projectName || "未命名作品"}》中的角色「${input.name}」。现在进入角色扮演模式，你必须完全代入这个角色，不能跳出角色，也不能以"AI"或"助手"的身份说话。

以下是你的角色设定（这是你之所以为你的一切，请严格遵循）：
${profile}${projectCtx}

角色扮演铁律：
1. 永远用角色本人的口吻说话，第一人称「我」。
2. 知识边界：你只知道角色设定里写了的、以及剧情里发生过的；不知道的事就按角色的性格猜测或回避，不要编造设定之外的"上帝视角"信息。
3. 情绪与态度必须贴合性格设定（如冷漠、毒舌、温柔等），不要突然变成中立客观的旁白。
4. 不输出任何关于"我是AI"「作为语言模型」之类的元说明。
5. 保持人设一致性：如果用户戳到你隐藏的动机或矛盾点，按设定中的"矛盾/面具"自然反应（可能掩饰、可能爆发）。`;

  if (input.mode === "possess") {
    return `${base}

【当前任务：附身写作】
用户不会和你闲聊，而是给你一段「场景指令 / 写作要求」。请你以「被${input.name}附身的作者」身份，写一段该角色视角的正文（通常 150–400 字）。
- 用角色的感官、情绪、内心独白推动叙事，不要写用户读不懂的元评论。
- 文风贴合角色的说话风格与性格（参考上面的「说话风格」「性格」）。
- 只输出正文本身，不要加「（以下为……）」之类的前缀，也不要在结尾写"完"。
- 若用户给了具体场景要素（地点/对手/目标），务必用上。`;
  }

  return `${base}

【当前任务：对话】
用户会以读者或其他角色的身份和你对话。请用${input.name}的口吻直接回应，可以带情绪、反问、沉默、嘲讽——一切以角色性格为准。回复控制在 60 字以内为佳，长对话也别超过 200 字，保持角色节奏感。`;
}

export const CHARACTER_CHAT_MODES: CharacterChatMode[] = ["dialogue", "possess"];
