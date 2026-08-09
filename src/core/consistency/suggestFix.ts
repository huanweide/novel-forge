/**
 * 一致性冲突修正建议（v1.6.51.5 Next-1）
 *
 * 把 B 任务的「只标红」补成闭环：作者点一下就拿到 AI 给的该段改写建议，复制即用。
 * 创作主权仍在作者手里——只建议、不自动改正文（与马斯克拍板的「标红不改写」一致）。
 *
 * 设计要点（与 detectConflicts.ts 同构）：
 *  - parseSuggestionFromLLM 是纯函数，独立单测（LLM 返回常有 code fence / 前后废话，必须容错）。
 *  - suggestConflictFix 复用既有 completeText + prisma + getConsistencyFacts，零新依赖、零 schema 变更。
 */

import { prisma } from "@/lib/prisma";
import { completeText } from "@/core/llm/client";
import { getConsistencyFacts } from "@/core/consistency/extractFacts";

/**
 * 从 LLM 返回文本中解析改写建议正文。容错策略：
 *  1. 剥掉 ```...``` 代码围栏（json/text/markdown 均可）
 *  2. 剥开场白 / 解释性前缀（如「以下是改写建议：」），仅去前缀、不吞正文
 *  3. 逐行收集首个有实质内容的行块；遇到空行（段落边界）或结尾客套话即停止
 *  4. 空响应返回空串（不抛，避免一次坏响应炸掉整轮）
 */
const OPENING_HAT =
  /^(?:以下是|这是(?:给(?:你|您)的)?|给(?:你|您)的|改写建议|修改建议|建议如下|如下)[:：]/;

const TRAILING_PLEASANTRY =
  /^(?:希望这能?帮到(?:你|您)|如有(?:需要|疑问)|如果(?:还有|需要)|以上(?:建议|仅供参考)|祝写作顺利|期待你的反馈|希望对你有帮助|温馨提示|注[:：])/;

export function parseSuggestionFromLLM(text: string): string {
  if (!text || typeof text !== "string") return "";
  let s = text.trim();

  const fence = s.match(/```(?:json|text|markdown)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // 仅剥开场白帽子前缀（保留冒号后的正文，避免整段被吞）
  // 帽子形态：「以下是/这是给你的/给你的」+ 可选「改写建议/修改建议」+ 冒号；或「建议如下/如下」+ 冒号
  s = s.replace(
    /^(?:以下是|这是(?:给(?:你|您)的)?|给(?:你|您)的|建议如下|如下)?(?:改写建议|修改建议)?[:：]\s*/,
    "",
  );

  const collected: string[] = [];
  for (const raw of s.split(/\n/)) {
    const line = raw.trim();
    if (!line) {
      if (collected.length) break; // 空行=段落边界，停止
      continue;
    }
    if (TRAILING_PLEASANTRY.test(line)) {
      if (collected.length) break; // 已采到建议，遇结尾客套话停
      continue;
    }
    if (OPENING_HAT.test(line)) continue; // 防御：残余帽子行
    collected.push(line);
  }
  return collected.join("\n").trim();
}

const SUGGEST_SYSTEM = `你是一致性冲突修正建议器。根据冲突说明与正确的已确立设定，产出一段可直接替换正文摘录的改写文本。
只输出改写文本本身——最小改动、保留作者文风，不要任何解释、不要 markdown、不要引号包裹。`;

/**
 * 为某条冲突生成改写建议（按需，不落库）。
 * @returns { suggestion } 可直接复制替换原文的改写文本
 * @throws 冲突不存在或不属于该项目（交由路由映射为 404）
 */
export async function suggestConflictFix(
  projectId: string,
  conflictId: string,
): Promise<{ suggestion: string }> {
  const conflict = await prisma.consistencyConflict.findUnique({ where: { id: conflictId } });
  if (!conflict || conflict.projectId !== projectId) {
    throw new Error("冲突不存在或无权访问");
  }

  // 关联基线事实（给出「正确设定」上下文）
  let baselineLine = "（无关联基线事实）";
  if (conflict.factId) {
    const facts = await getConsistencyFacts(projectId);
    const rel = facts.find((f) => f.id === conflict.factId);
    if (rel) baselineLine = `${rel.subject} 的${rel.attribute} = ${rel.value}`;
  }

  const prompt =
    `【冲突说明】${conflict.description}\n` +
    `【引发冲突的正文摘录】${conflict.excerpt || "（未提供）"}\n` +
    `【正确的已确立基线设定】${baselineLine}\n\n` +
    `请只输出一句可直接替换上述正文摘录的改写建议，最小改动、保留作者文风，不要任何解释。`;

  const text = await completeText(SUGGEST_SYSTEM, prompt, {
    temperature: 0.3,
    maxTokens: 600,
  });

  return { suggestion: parseSuggestionFromLLM(text) };
}
