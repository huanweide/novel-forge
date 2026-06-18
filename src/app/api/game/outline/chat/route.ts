/**
 * POST /api/game/outline/chat
 * 多轮对话确认章纲 —— SSE 流式
 *
 * 每一轮用户给反馈方向，AI 按 P0 标准格式修改章纲
 * 支持"探讨-反馈-定稿"循环，直到用户满意
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";

const CHAT_SYSTEM_PROMPT = `你是一位资深小说架构顾问，正在与作者进行"章纲多轮对话确认"。

## 当前模式
作者给你一个现有章纲（可能不完整），以及他的反馈/要求。你需要：
1. 理解作者的意图和担忧
2. 提出具体的修改建议（而不是重写整个章纲）
3. 如果作者给出方向性意见（如"方向A"、"更宏大"、"聚焦角色内心"），输出修改后的完整章纲
4. 如果作者提出具体问题（如"这里逻辑不通"、"伏笔回收太早"），针对性修改

## 章纲标准格式（修改时保持）
C| 章节号 | 章节标题 | 开头承接 | 主视角人物
L0| ✅/⚠️ 各项红线检查
L1| ✅/⚠️ 叙事规则检查
L2| ✅/⚠️ 写作约束检查
---
R| [角色名][标签] [动作] [对象/地点] [结果/状态]
⟨✍ 写作指令⟩
L| [地点名] [场景描述]
G| [金手指名] [触发]
P| [事件描述]
K| [台词] | [谁] | [情境]
【章首衔接】：...
【章尾悬念】：...
---
CF| [伏笔名] | [操作类型] | [操作细节]
M| [情绪] | [强度] | [手段]
K| [金句] | [谁] | [情境]
EL| [幕] | [定位] | [贡献]
T| [下一章] | [目标]

## 对话规则
1. 不推翻已有章纲的合理部分，只精准修改有问题的段落
2. 每次回复先简短说明修改了什么（1-2句），再输出修改后的章纲
3. 如果作者说"定稿"或"确认"，输出最终版章纲并标注 ===定稿===
4. 角色/地点/势力名严格使用作者提供的白名单数据`;

export async function POST(req: Request) {
  try {
    const {
      projectId,
      nodeId,
      currentOutline,  // 当前章纲（可能是上一轮AI输出的）
      userMessage,      // 作者反馈/要求
      history,          // 之前的对话轮次
      direction,        // 创作方向（首轮时用）
    } = await req.json();

    if (!currentOutline || !userMessage) {
      return NextResponse.json({ error: "缺少 currentOutline 或 userMessage" }, { status: 400 });
    }

    // 加载白名单上下文
    let characterContext = "";
    if (projectId && nodeId) {
      const [node, characters] = await Promise.all([
        prisma.storyNode.findUnique({ where: { id: nodeId } }),
        prisma.characterCard.findMany({ where: { projectId }, take: 20 }),
      ]);
      if (node && characters.length > 0) {
        characterContext = `\n## 角色白名单（只能使用以下角色）\n${characters.map(c => `- ${c.name}（${c.role}）`).join("\n")}`;
      }
    }

    // 组装消息
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: CHAT_SYSTEM_PROMPT + characterContext },
    ];

    // 历史对话
    if (history && Array.isArray(history)) {
      for (const turn of history.slice(-6)) {
        if (turn.role === "user") {
          messages.push({ role: "user", content: `## 当前章纲\n${turn.currentOutline || ""}\n\n## 作者反馈\n${turn.message || ""}` });
        } else if (turn.role === "assistant") {
          messages.push({ role: "assistant", content: turn.response || "" });
        }
      }
    }

    // 当前轮
    const contextParts = ["## 当前章纲", currentOutline];
    if (direction) {
      contextParts.push(`\n## 创作方向\n${direction}`);
    }
    contextParts.push(`\n## 作者反馈\n${userMessage}`);
    contextParts.push("\n请基于以上反馈修改章纲。如果有方向性意见，输出完整修改后的章纲。");

    messages.push({ role: "user", content: contextParts.join("\n") });

    // 调用LLM
    const llmConfig = await getEffectiveConfig();
    const client = createLLMClient(llmConfig);

    // SSE 流式输出
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const write = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          const llmStream = client.chatStream({
            model: llmConfig.writerModel,
            messages,
            temperature: 0.8,
            maxTokens: 2000,
          });

          let fullResponse = "";
          for await (const chunk of llmStream) {
            if (chunk.content) {
              fullResponse += chunk.content;
              write({ type: "token", content: chunk.content });
            }
          }

          const isFinal = userMessage.includes("定稿") || userMessage.includes("确认");
          write({
            type: "done",
            outline: fullResponse,
            isFinal,
          });
        } catch (err: any) {
          write({ type: "error", error: err.message || "LLM调用失败" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("[game/outline/chat] 错误:", err);
    return NextResponse.json({ error: err.message || "内部错误" }, { status: 500 });
  }
}
