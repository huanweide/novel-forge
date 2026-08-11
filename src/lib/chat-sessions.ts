/**
 * chat-sessions — Agent / 角色对话会话记忆（2.0 P0-3 持久化版）
 *
 * 取代原进程级全局 Map：会话历史落库到 Postgres，重启不丢失、跨实例不串号。
 *
 * 设计决策：
 * - 用 Prisma 持久化而非内存 Map——会话是用户的连续写作资产，应跨重启保留
 * - 最多保留 20 条消息（10 轮问答），超出自动淘汰旧消息（写入时裁剪）
 * - key 维度复用既有约定：
 *     · 角色对话/附身：`${projectId}__char__${characterId}`
 *     · 通用 Agent 对话：`${projectId}`
 *   落在 ChatSession.sessionKey 唯一约束上；projectId/characterId 冗余存储便于按项目清理。
 * - 导出 API 与原版完全兼容（签名不变），仅改为 async：
 *     appendExchange / getRecentContext / clearSession 调用方须 await。
 */

import { prisma } from "@/lib/prisma";

interface SessionMessage {
  role: "user" | "agent";
  content: string;
  /** 这轮用了哪些工具 */
  toolsUsed?: string[];
  ts: number;
}

const MAX_MESSAGES = 20; // 最多保留 20 条消息
const SEP = "__char__";

function parseKey(key: string): { projectId: string; characterId: string | null } {
  const idx = key.indexOf(SEP);
  if (idx >= 0) {
    return { projectId: key.slice(0, idx), characterId: key.slice(idx + SEP.length) };
  }
  return { projectId: key, characterId: null };
}

function toMessages(raw: unknown): SessionMessage[] {
  return Array.isArray(raw) ? (raw as unknown as SessionMessage[]) : [];
}

/** 添加一轮对话（落库） */
export async function appendExchange(
  key: string,
  userMessage: string,
  agentReply: string,
  toolsUsed: string[] = [],
): Promise<void> {
  const { projectId, characterId } = parseKey(key);
  const existing = await prisma.chatSession.findUnique({ where: { sessionKey: key } });

  const messages: SessionMessage[] = existing ? toMessages(existing.messages) : [];
  messages.push(
    { role: "user", content: userMessage, ts: Date.now() },
    { role: "agent", content: agentReply, toolsUsed, ts: Date.now() },
  );
  // 超出上限就删最早的
  while (messages.length > MAX_MESSAGES) {
    messages.shift();
  }

  if (existing) {
    await prisma.chatSession.update({
      where: { sessionKey: key },
      data: { messages: messages as never, updatedAt: new Date() },
    });
  } else {
    await prisma.chatSession.create({
      data: { projectId, characterId, sessionKey: key, messages: messages as never },
    });
  }
}

/** 获取最近 N 条消息，格式化为上下文文本 */
export async function getRecentContext(key: string, maxMessages = 10): Promise<string> {
  const session = await prisma.chatSession.findUnique({ where: { sessionKey: key } });
  const messages = toMessages(session?.messages);
  if (messages.length === 0) return "";

  const recent = messages.slice(-maxMessages);
  const lines: string[] = ["【对话历史】"];
  for (const msg of recent) {
    const prefix = msg.role === "user" ? "用户" : "助手";
    const toolNote = msg.toolsUsed && msg.toolsUsed.length > 0
      ? `（调用了 ${msg.toolsUsed.join("、")}）`
      : "";
    lines.push(`${prefix}${toolNote}：${msg.content.slice(0, 300)}`);
  }
  return lines.join("\n");
}

/** 清空会话（落库） */
export async function clearSession(key: string): Promise<void> {
  await prisma.chatSession.deleteMany({ where: { sessionKey: key } });
}
