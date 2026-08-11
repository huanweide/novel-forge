import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  appendExchange,
  getRecentContext,
  clearSession,
} from "./chat-sessions";
import { prisma } from "@/lib/prisma";

// 每轮测试用唯一前缀，避免与真实会话或其它测试串号；收尾统一清理。
const NS = `cs_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const projKey = `${NS}__proj`;
const charKey = `${NS}__proj__char__hero`;

async function cleanup() {
  await prisma.chatSession.deleteMany({
    where: { sessionKey: { in: [projKey, charKey] } },
  });
}

beforeAll(cleanup);
afterAll(cleanup);

describe("chat-sessions 持久化 (P0-3)", () => {
  it("appendExchange 后 getRecentContext 能回读，且格式化带【对话历史】", async () => {
    await appendExchange(projKey, "你好", "你好，我是写作助手", ["chat"]);
    const ctx = await getRecentContext(projKey, 10);
    expect(ctx).toContain("【对话历史】");
    expect(ctx).toContain("用户：你好");
    expect(ctx).toContain("你好，我是写作助手");
    expect(ctx).toContain("助手（调用了 chat）");
    expect(ctx).toContain("调用了 chat");
  });

  it("角色对话与通用对话按 key 隔离，互不串号", async () => {
    await appendExchange(charKey, "你是谁", "我是主角李墨", ["character_chat:dialogue"]);
    const projCtx = await getRecentContext(projKey, 10);
    const charCtx = await getRecentContext(charKey, 10);
    expect(projCtx).not.toContain("我是主角李墨");
    expect(charCtx).toContain("我是主角李墨");
    expect(charCtx).toContain("调用了 character_chat:dialogue");
  });

  it("超过 20 条消息自动淘汰最早内容，保留最近 20 条", async () => {
    for (let i = 0; i < 15; i++) {
      // 每轮 2 条消息 → 共 30 条，应裁剪到 20
      await appendExchange(projKey, `q${i}`, `a${i}`, []);
    }
    const ctx = await getRecentContext(projKey, 20);
    // 最早的一批（q0/a0）应已被淘汰
    expect(ctx).not.toContain("q0");
    expect(ctx).toContain("q14");
  });

  it("clearSession 后上下文清空", async () => {
    await clearSession(charKey);
    const ctx = await getRecentContext(charKey, 10);
    expect(ctx).toBe("");
  });
});
