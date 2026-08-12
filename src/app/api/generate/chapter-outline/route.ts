/**
 * POST /api/generate/chapter-outline
 *
 * v2: 上下文增强 + AI 自主选角
 *
 * 流程：
 * 1. 读取前 5 章大纲 + 上一章结尾正文 → 上下文
 * 2. 读取全部角色卡摘要 + 作者指令（最高优先级）
 * 3. AI 根据章纲目标 + 前文 + 作者指令 → 自主决定本章出场角色
 * 4. 用选定角色 + 完整上下文 → 生成详细章纲
 * 5. 返回章纲 + AI 选角列表
 *
 * 核心理念：不让用户手动勾选角色，AI 根据剧情逻辑决定谁应该出现。
 * 作者指令 > 章纲目标 > 前文惯性 > 角色关系。
 *
 * v2.0.8：业务逻辑已抽离至 @/core/pipeline/generate-chapter-outline，
 * 本路由仅负责限流、参数解析、错误映射与 JSON 返回。
 */

export const maxDuration = 120;
import { jsonError } from "@/lib/api-error";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { generateChapterOutline, OutlineError } from "@/core/pipeline/generate-chapter-outline";

export async function POST(request: Request) {
  // L2-001：章纲生成限流（1 分钟 10 次），业务 LLM 调用前拦截
  if (!rateLimit("generate/chapter-outline", clientIp(request), 10, 60000).ok) {
    return rateLimitResponse();
  }
  try {
    const { projectId, nodeId, prompt: customPrompt, authorNote: explicitAuthorNote, prevOutlines } = await request.json();

    if (!projectId || !nodeId) {
      return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
    }

    try {
      const result = await generateChapterOutline({
        projectId,
        nodeId,
        customPrompt,
        authorNote: explicitAuthorNote,
        prevOutlines,
      });
      return NextResponse.json(result);
    } catch (e) {
      // v2.0.8：业务边界错误映射到 HTTP 状态，llm 类错误不向客户端回显原始文案（L2-003）
      if (e instanceof OutlineError) {
        const status = e.code === "notFound" ? 404 : e.code === "recycled" ? 410 : 502;
        const message = e.code === "llm" ? "服务器内部错误，请查看日志" : e.message;
        return NextResponse.json({ error: message }, { status });
      }
      throw e;
    }
  } catch (err) {
    return jsonError(err);
  }
}
