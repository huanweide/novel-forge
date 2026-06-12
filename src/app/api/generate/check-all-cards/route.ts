/**
 * POST /api/generate/check-all-cards
 *
 * 一键三卡完整性检查 —— SSE 流式返回。
 *
 * 同时跑：
 *   1. 实体检测（新角色 + 新世界书词条）
 *   2. 已有角色分类状态检查
 *   3. 大纲一致性检查
 *
 * 请求体：{ projectId: string; text: string; nodeId?: string }
 *
 * SSE 事件：
 *   progress  — 进度更新
 *   entities  — 实体检测完成
 *   classify  — 分类状态
 *   drifts    — 大纲偏离
 *   done      — 全部完成，汇总报告
 */
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getDefaultClient, getDefaultLLMConfig } from "@/core/llm/client";

export const maxDuration = 300;
const MODEL = "deepseek-v4-flash";
const CHUNK_SIZE = 12000;

function getDSKey(): string {
  return process.env.DEEPSEEK_API_KEY || "";
}

async function callFlash(system: string, prompt: string, maxTokens = 4096): Promise<string> {
  const key = getDSKey();
  const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], temperature: 0.3, max_tokens: maxTokens, stream: false }),
  });
  if (!r.ok) throw new Error(`DS ${r.status}`);
  const data = await r.json().catch(() => null);
  return data?.choices?.[0]?.message?.content || "";
}

function parseJSON(raw: string): Record<string, unknown> {
  let s = raw.trim();
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  s = s.replace(/,(\s*[}\]])/g, "$1");
  try { return JSON.parse(s) as Record<string, unknown>; } catch { /* */ }
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) try { return JSON.parse(md[1].trim()) as Record<string, unknown>; } catch { /* */ }
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) try { return JSON.parse(s.slice(a, b + 1)) as Record<string, unknown>; } catch { /* */ }
  throw new Error(`JSON parse fail: ${s.slice(0, 200)}`);
}

export async function POST(request: Request) {
  try {
    const { projectId, text, nodeId } = await request.json();
    if (!projectId || !text) {
      return NextResponse.json({ error: "缺少 projectId 或 text" }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          const dsKey = getDSKey();
          if (dsKey.length < 10) {
            send({ type: "error", message: "DeepSeek API Key 未配置" });
            controller.close(); return;
          }

          send({ type: "progress", stage: "init", message: "🔍 开始三卡完整性检查...", pct: 0 });

          // ── 加载数据 ──
          const [existingChars, existingLore, currentNode] = await Promise.all([
            prisma.characterCard.findMany({ where: { projectId }, select: { id: true, name: true, aliases: true, role: true, tags: true, personality: true, background: true } }),
            prisma.lorebookEntry.findMany({ where: { projectId }, select: { title: true, keys: true, category: true, content: true } }),
            nodeId ? prisma.storyNode.findUnique({ where: { id: nodeId }, select: { outline: true, title: true } }) : null,
          ]);

          const knownNames = new Set<string>();
          for (const c of existingChars) {
            knownNames.add(c.name.toLowerCase());
            (c.aliases as string[])?.forEach((a: string) => knownNames.add(a.toLowerCase()));
          }
          const knownLore = new Set<string>();
          for (const l of existingLore) {
            knownLore.add(l.title.toLowerCase());
            (l.keys as string[])?.forEach((k: string) => knownLore.add(k.toLowerCase()));
          }

          send({ type: "progress", stage: "loaded", message: `已加载 ${existingChars.length} 角色 · ${existingLore.length} 世界词条`, pct: 5 });

          // ═════════════════════════════════════════════
          // Phase 1: 实体检测（分块扫描）
          // ═════════════════════════════════════════════
          send({ type: "progress", stage: "entities", message: "📝 Phase 1/3: 实体检测...", pct: 10 });

          const chunks: string[] = [];
          for (let i = 0; i < text.length; i += CHUNK_SIZE) {
            chunks.push(text.slice(i, i + CHUNK_SIZE));
          }

          const allNewChars = new Map<string, any>();
          const allNewLore = new Map<string, any>();
          const knownNamesList = Array.from(knownNames).join("、");
          const knownLoreList = Array.from(knownLore).join("、");

          for (let ci = 0; ci < chunks.length; ci++) {
            try {
              const raw = await callFlash(
                "小说实体检测。找出文本中不在已知列表中的新角色和新设定。只输出JSON。",
                `已知角色：${knownNamesList}\n已知词条：${knownLoreList}\n\n扫描文本(块${ci + 1}/${chunks.length})：\n${chunks[ci]}\n\n输出：{"newCharacters":[{"name":"","evidence":"","suggestedRole":"supporting","suggestedPersonality":[],"suggestedDialogue":"","worthCreating":true}],"newLore":[{"title":"","category":"custom","evidence":"","suggestedKeys":[],"suggestedContent":"","worthCreating":true}]}`,
                16384,
              );
              const parsed = parseJSON(raw);
              for (const c of (parsed.newCharacters as any[]) || []) {
                if (!c.worthCreating) continue;
                const key = c.name?.toLowerCase().trim();
                if (key && !knownNames.has(key) && !allNewChars.has(key)) {
                  allNewChars.set(key, c);
                  knownNames.add(key);
                }
              }
              for (const l of (parsed.newLore as any[]) || []) {
                if (!l.worthCreating) continue;
                const key = l.title?.toLowerCase().trim();
                if (key && !knownLore.has(key) && !allNewLore.has(key)) {
                  allNewLore.set(key, l);
                  knownLore.add(key);
                }
              }
              send({ type: "progress", stage: "entities", message: `📝 实体检测: 块${ci + 1}/${chunks.length} ✓`, pct: 10 + Math.round((ci + 1) / chunks.length * 20) });
            } catch { continue; }
          }

          const newChars = Array.from(allNewChars.values());
          const newLore = Array.from(allNewLore.values());
          send({ type: "entities", newCharacters: newChars, newLore: newLore, newCharCount: newChars.length, newLoreCount: newLore.length });
          send({ type: "progress", stage: "entities-done", message: `✅ 实体检测完成: ${newChars.length} 新角色 · ${newLore.length} 新词条`, pct: 30 });

          // ═════════════════════════════════════════════
          // Phase 2: 已有角色分类状态检查
          // ═════════════════════════════════════════════
          send({ type: "progress", stage: "classify", message: "🏷 Phase 2/3: 角色分类状态...", pct: 35 });

          const unclassifiedChars = existingChars.filter(c => {
            const tags = Array.isArray(c.tags) ? c.tags : [];
            const hasClassifyTags = tags.some((t: string) =>
              t.startsWith("🏷") || t.startsWith("🏫") || t.startsWith("📋") || t.startsWith("⚽") || t.startsWith("❓")
            );
            return !hasClassifyTags;
          });

          const incompleteChars = existingChars.filter(c => {
            const bg = (c.background as string) || "";
            const pers = c.personality as any;
            const hasStructuredPersonality = pers && typeof pers === "object" && !Array.isArray(pers) && (pers.dominant || pers.drive);
            const hasAbilities = Array.isArray((c as any).abilities) && (c as any).abilities.length > 0;
            return !bg || !hasStructuredPersonality || !hasAbilities;
          });

          send({ type: "classify", unclassifiedCount: unclassifiedChars.length, incompleteCount: incompleteChars.length, unclassified: unclassifiedChars.map(c => ({ id: c.id, name: c.name, role: c.role })), incomplete: incompleteChars.map(c => ({ id: c.id, name: c.name, role: c.role, missing: [!c.background ? "背景" : "", !c.personality ? "性格" : "", !(c as any).abilities?.length ? "能力" : ""].filter(Boolean) })) });
          send({ type: "progress", stage: "classify-done", message: `✅ 分类检查: ${unclassifiedChars.length} 未分类 · ${incompleteChars.length} 信息不完整`, pct: 50 });

          // ═════════════════════════════════════════════
          // Phase 3: 大纲一致性
          // ═════════════════════════════════════════════
          send({ type: "progress", stage: "drifts", message: "🔬 Phase 3/3: 大纲一致性...", pct: 55 });

          let drifts: any[] = [];
          if (currentNode?.outline && text.length > 100) {
            try {
              const raw = await callFlash(
                "小说一致性检查。对照大纲检查正文，找出OOC、情节偏离、节奏问题。只输出JSON。",
                `大纲：${currentNode.outline}\n\n正文（尾部）：${text.slice(-5000)}\n\n输出：{"hasIssues":true/false,"drifts":[{"type":"ooc|plot_drift|pacing|pov_break","severity":"critical|major|minor","character":"","description":"","evidence":"","suggestion":""}],"summary":""}`,
                4096,
              );
              const parsed = parseJSON(raw);
              drifts = (parsed.drifts as any[]) || [];
            } catch { drifts = []; }
          }
          send({ type: "drifts", drifts, hasIssues: drifts.length > 0 });
          send({ type: "progress", stage: "drifts-done", message: `✅ 大纲检查: ${drifts.length > 0 ? drifts.length + " 处偏离" : "无问题"}`, pct: 80 });

          // ═════════════════════════════════════════════
          // 汇总
          // ═════════════════════════════════════════════
          const missingWorldCards = existingLore.length === 0;
          const allPassed = newChars.length === 0 && newLore.length === 0 && drifts.length === 0 && unclassifiedChars.length === 0 && incompleteChars.length === 0 && !missingWorldCards;

          const warnings: string[] = [];
          if (newChars.length > 0) warnings.push(`${newChars.length} 个新角色待建卡`);
          if (newLore.length > 0) warnings.push(`${newLore.length} 个新词条待建卡`);
          if (drifts.length > 0) warnings.push(`${drifts.length} 处大纲偏离`);
          if (unclassifiedChars.length > 0) warnings.push(`${unclassifiedChars.length} 个角色未分类`);
          if (incompleteChars.length > 0) warnings.push(`${incompleteChars.length} 个角色信息不完整`);
          if (missingWorldCards) warnings.push("世界卡为空——建议创建至少1条世界设定");

          send({
            type: "done",
            allPassed,
            summary: allPassed ? "🎉 三卡完整，可以开始写作" : `⚠️ ${warnings.join(" · ")}`,
            warnings,
            stats: {
              totalCharacters: existingChars.length,
              totalLore: existingLore.length,
              newCharacters: newChars.length,
              newLore: newLore.length,
              drifts: drifts.length,
              unclassified: unclassifiedChars.length,
              incomplete: incompleteChars.length,
              textLength: text.length,
              chunksScanned: chunks.length,
            },
          });

          await new Promise(r => setTimeout(r, 200));
        } catch (err) {
          send({ type: "error", message: (err as Error).message?.slice(0, 200) || "检查失败" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message?.slice(0, 200) || "失败" }, { status: 500 });
  }
}
