/**
 * POST /api/agent/character-chat
 *
 * 角色扮演聊天（对话 / 附身两模式）。
 * 复用 getEffectiveConfig + createLLMClient 的 LLM 调用范式（与 generate/chat 一致），
 * 但 prompt 是"完全代入角色"而非"写作 Agent"。
 *
 * 请求体：
 * { projectId, characterId, message, mode: "dialogue" | "possess" }
 */
import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import { getRecentContext, appendExchange } from "@/lib/chat-sessions";
import { buildCharacterSystemPrompt, CHARACTER_CHAT_MODES, type CharacterChatMode } from "@/core/pipeline/character-chat";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { projectId, characterId, message, mode } = await request.json();
    if (!projectId || !characterId || !message) {
      return NextResponse.json({ error: "缺少 projectId / characterId / message" }, { status: 400 });
    }
    const chatMode: CharacterChatMode = mode === "possess" ? "possess" : "dialogue";
    if (!CHARACTER_CHAT_MODES.includes(chatMode)) {
      return NextResponse.json({ error: "未知的 mode" }, { status: 400 });
    }

    const character = await prisma.characterCard.findFirst({
      where: { id: characterId, projectId },
    });
    if (!character) {
      return NextResponse.json({ error: "角色不存在" }, { status: 404 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, genre: true, synopsis: true },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const systemPrompt = buildCharacterSystemPrompt({
      name: character.name,
      aliases: character.aliases as any,
      role: character.role,
      currentStatus: character.currentStatus,
      age: character.age,
      gender: character.gender,
      appearance: (typeof character.appearance === "object" && character.appearance ? character.appearance : null) as any,
      personality: (typeof character.personality === "object" && character.personality ? character.personality : null) as any,
      background: character.background,
      abilities: character.abilities as any,
      hiddenMotives: character.hiddenMotives as any,
      relationships: character.relationships as any,
      timeline: character.timeline as any,
      dialogueStyle: (typeof character.dialogueStyle === "object" && character.dialogueStyle ? character.dialogueStyle : null) as any,
      tags: character.tags as any,
      storyLine: character.storyLine,
      projectName: project.name,
      projectGenre: project.genre,
      projectSynopsis: project.synopsis,
      mode: chatMode,
    });

    const config = await getEffectiveConfig();
    const client = createLLMClient(config);

    // 按「项目 + 角色」隔离的会话记忆（chat-sessions 用 projectId 作 key，这里用复合 key 区分角色）
    const memKey = `${projectId}__char__${characterId}`;
    const recent = await getRecentContext(memKey, 12);

    const userPrompt = recent
      ? `${recent}\n\n【当前用户】${message}`
      : message;

    const response = await client.chat({
      model: config.extractorModel || config.writerModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ] as any,
      temperature: chatMode === "possess" ? 0.85 : 0.95,
      maxTokens: chatMode === "possess" ? 700 : 400,
    });

    const reply = (response.content || "").trim() || "……";
    await appendExchange(memKey, message, reply, [`character_chat:${chatMode}`]);

    return NextResponse.json({
      reply,
      character: character.name,
      mode: chatMode,
    });
  } catch (err) {
    console.error("角色对话失败:", err);
    return jsonError(err);
  }
}
