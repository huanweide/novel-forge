/**
 * chat-sessions — Agent 会话记忆
 *
 * 内存存储最近 N 轮对话。每个项目一个会话，
 * Agent 能看到之前的问答上下文，实现连续对话。
 *
 * 设计决策：
 * - 用内存 Map 而非数据库——会话是临时的，刷新页面就重置
 * - 最多保留 20 条消息（10 轮问答），超出自动淘汰旧消息
 * - 按 projectId 隔离，不同项目互不干扰
 */

interface SessionMessage {
  role: "user" | "agent";
  content: string;
  /** 这轮用了哪些工具 */
  toolsUsed?: string[];
  ts: number;
}

interface ChatSession {
  projectId: string;
  messages: SessionMessage[];
  createdAt: number;
  lastActiveAt: number;
}

const MAX_MESSAGES = 20; // 最多保留 20 条消息
const MAX_AGE_MS = 30 * 60 * 1000; // 30 分钟过期

const sessions = new Map<string, ChatSession>();

function getOrCreate(projectId: string): ChatSession {
  const existing = sessions.get(projectId);
  if (existing) {
    existing.lastActiveAt = Date.now();
    return existing;
  }
  const session: ChatSession = {
    projectId,
    messages: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };
  sessions.set(projectId, session);
  return session;
}

/** 添加一轮对话 */
export function appendExchange(
  projectId: string,
  userMessage: string,
  agentReply: string,
  toolsUsed: string[] = [],
) {
  const session = getOrCreate(projectId);
  session.messages.push(
    { role: "user", content: userMessage, ts: Date.now() },
    { role: "agent", content: agentReply, toolsUsed, ts: Date.now() },
  );
  // 超出上限就删最早的
  while (session.messages.length > MAX_MESSAGES) {
    session.messages.shift();
  }
}

/** 获取最近 N 条消息，格式化为上下文文本 */
export function getRecentContext(projectId: string, maxMessages = 10): string {
  const session = sessions.get(projectId);
  if (!session || session.messages.length === 0) return "";

  const recent = session.messages.slice(-maxMessages);
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

/** 清空会话 */
export function clearSession(projectId: string) {
  sessions.delete(projectId);
}

/** 定期清理过期会话 */
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, session] of sessions) {
      if (now - session.lastActiveAt > MAX_AGE_MS) {
        sessions.delete(key);
      }
    }
  }, 5 * 60 * 1000); // 每5分钟清理一次
}
