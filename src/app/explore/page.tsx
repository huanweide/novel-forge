"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { BuildConfigPanel } from "@/components/explore/BuildConfigPanel";
import { AdoptedContentPanel } from "@/components/explore/AdoptedContentPanel";
import { ChatPanel } from "@/components/explore/ChatPanel";
import { OutlinePanel } from "@/components/explore/OutlinePanel";
import { CardBrowser } from "@/components/explore/CardBrowser";
import type {
  BuildConfig,
  ExploreStep,
  ExploreMessage,
  AdoptedItem,
  AdoptCard,
} from "@/core/explore/types";
import { DEFAULT_BUILD_CONFIG, EXPLORE_STEPS, STEP_LABELS } from "@/core/explore/types";

export default function ExplorePage() {
  const [config, setConfig] = useState<BuildConfig>(DEFAULT_BUILD_CONFIG);
  const [currentStep, setCurrentStep] = useState<ExploreStep>("opening");
  const [messages, setMessages] = useState<ExploreMessage[]>([
    {
      role: "agent",
      content: `欢迎来到探讨模式！我是你的AI创作顾问。\n\n我们从「${STEP_LABELS.opening}」开始——它决定整本书的方向。\n\n说说你想写什么类型的小说？有什么初步想法？或者试试"抽卡模式"让AI给你灵感。`,
    },
  ]);
  const [adopted, setAdopted] = useState<AdoptedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"chat" | "cards" | "outline">("chat");
  const [creating, setCreating] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(true);
  const [adoptStatus, setAdoptStatus] = useState<Record<string, string>>({});
  const [allCards, setAllCards] = useState<Record<string, AdoptCard[]>>({});
  const [generatingAll, setGeneratingAll] = useState(false);
  const [outlineText, setOutlineText] = useState("");
  const [enrichPrompt, setEnrichPrompt] = useState("");
  const [outlineResult, setOutlineResult] = useState<{
    characters: any[];
    loreEntries: any[];
    plotOutline: string;
  } | null>(null);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineProgress, setOutlineProgress] = useState<{
    phase: string;
    current?: number;
    total?: number;
  } | null>(null);

  // ── localStorage 持久化 ──
  const lastSavedRef = useRef<string>("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("explore_state");
      if (saved) {
        const state = JSON.parse(saved);
        if (state.messages?.length) setMessages(state.messages);
        if (state.adopted?.length) setAdopted(state.adopted);
        if (state.config) setConfig(state.config);
        if (state.createdProjectId)
          setCreatedProjectId(state.createdProjectId);
        if (state.mode) setMode(state.mode);
        if (state.currentStep) setCurrentStep(state.currentStep);
      }
    } catch {
      /* localStorage 损坏，忽略 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const payload = JSON.stringify({
          messages: messages.slice(-50),
          adopted,
          config,
          createdProjectId,
          mode,
          currentStep,
        });
        if (payload !== lastSavedRef.current) {
          lastSavedRef.current = payload;
          localStorage.setItem("explore_state", payload);
        }
      } catch {
        /* quota exceeded, ignore */
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [messages, adopted, config, createdProjectId, mode, currentStep]);

  // ── ref 防抖 guard ──
  const loadingRef = useRef(false);
  const creatingRef = useRef(false);
  const outlineLoadingRef = useRef(false);

  // ─── 发送消息 ──────────────────────────────────────

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || loadingRef.current) return;

      const userMsg: ExploreMessage = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);
      loadingRef.current = true;
      setLoading(true);

      try {
        const res = await fetch("/api/explore/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history: messagesRef.current.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            config,
            adopted,
            currentStep,
            mode,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `响应失败 (${res.status})`);
        }

        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "agent", content: data.reply || "收到。继续？", cards: data.cards },
        ]);
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          { role: "agent", content: `出错了：${err.message}。重试一下？` },
        ]);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    // handleSend 依赖 config/adopted/currentStep/mode，但不依赖 messages（用 ref 替代）
    [config, adopted, currentStep, mode],
  );

  // ─── 采纳卡片 ──────────────────────────────────────

  const handleAdoptCard = useCallback(
    async (card: AdoptCard) => {
      if (adopted.some((a) => a.title === card.title && a.content === card.content))
        return;

      const itemId = `adopt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setAdoptStatus((prev) => ({ ...prev, [card.id]: "writing" }));

      const item: AdoptedItem = {
        id: itemId,
        step: card.step,
        title: card.title,
        content: card.content,
        timestamp: Date.now(),
      };
      setAdopted((prev) => [...prev, item]);

      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          cards: m.cards?.map((c) =>
            c.id === card.id ? { ...c, adopted: true } : c,
          ),
        })),
      );

      try {
        const res = await fetch("/api/explore/adopt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: createdProjectId,
            config,
            card: { title: card.title, content: card.content, step: card.step },
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setAdoptStatus((prev) => ({
            ...prev,
            [card.id]: data.entityType === "character" ? "✅角色" : "✅词条",
          }));
          if (data.projectId && !createdProjectId) {
            setCreatedProjectId(data.projectId);
          }
          const currentIdx = EXPLORE_STEPS.indexOf(currentStep);
          if (currentIdx >= 0 && currentIdx < EXPLORE_STEPS.length - 1) {
            setCurrentStep(EXPLORE_STEPS[currentIdx + 1]);
          }
        } else {
          setAdoptStatus((prev) => ({ ...prev, [card.id]: "❌失败" }));
        }
      } catch {
        setAdoptStatus((prev) => ({ ...prev, [card.id]: "❌失败" }));
      }
    },
    [adopted, config, createdProjectId, currentStep],
  );

  // ─── 大纲模式 ──────────────────────────────────────

  const handleOutlineSubmit = useCallback(async () => {
    if (!outlineText.trim() || outlineLoadingRef.current) return;
    outlineLoadingRef.current = true;
    setOutlineLoading(true);
    setOutlineResult(null);
    setOutlineProgress({ phase: "starting" });

    try {
      const res = await fetch("/api/explore/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "outline",
          message: outlineText,
          enrichPrompt,
          config,
          stream: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || "请求失败");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === "progress") setOutlineProgress(data);
              else if (eventType === "done") {
                setOutlineResult(data);
                setOutlineProgress(null);
                setMessages((prev) => [
                  ...prev,
                  {
                    role: "agent",
                    content:
                      data.reply || "大纲已整理完成。请确认后写入项目。",
                  },
                ]);
              } else if (eventType === "error") {
                throw new Error(data.error || "处理失败");
              }
            } catch (parseErr: any) {
              if (parseErr.message && !parseErr.message.includes("JSON"))
                throw parseErr;
            }
          }
        }
      }
    } catch (err: any) {
      alert(err?.message || "网络错误");
      setOutlineProgress(null);
    } finally {
      outlineLoadingRef.current = false;
      setOutlineLoading(false);
    }
  }, [outlineText, enrichPrompt, config]);

  // ─── 确认写入项目 ──────────────────────────────────

  const handleOutlineConfirm = useCallback(async () => {
    if (!outlineResult || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);

    const errors: string[] = [];

    try {
      const res = await fetch("/api/explore/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, adopted: [], mode: "direct" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const pid = data.projectId;
      setCreatedProjectId(pid);

      const chars = outlineResult.characters || [];
      const lores = outlineResult.loreEntries || [];

      const charResults = await Promise.allSettled(
        chars.map((c: any) => {
          const step = c.role === "protagonist" ? "protagonist" : "free_talk";
          return fetch("/api/explore/adopt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: pid,
              config,
              card: {
                title: c.name,
                content: JSON.stringify(c),
                step,
              },
            }),
          }).then((r) => r.json());
        }),
      );

      const loreResults = await Promise.allSettled(
        lores.map((l: any) =>
          fetch("/api/explore/adopt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: pid,
              config,
              card: {
                title: l.title,
                content: JSON.stringify(l),
                step: "worldview" as ExploreStep,
              },
            }),
          }).then((r) => r.json()),
        ),
      );

      const charOk = charResults.filter(
        (r) => r.status === "fulfilled" && !r.value?.error,
      ).length;
      const loreOk = loreResults.filter(
        (r) => r.status === "fulfilled" && !r.value?.error,
      ).length;
      const charFail =
        charResults.length - charOk +
        charResults.filter((r) => r.status === "rejected").length;
      const loreFail =
        loreResults.length - loreOk +
        loreResults.filter((r) => r.status === "rejected").length;

      const newItems: AdoptedItem[] = [];
      const ts = Date.now();
      chars.forEach((c: any, i: number) => {
        if (
          charResults[i]?.status === "fulfilled" &&
          !(charResults[i] as any)?.value?.error
        ) {
          newItems.push({
            id: `ol_char_${ts}_${i}`,
            step: c.role === "protagonist"
              ? ("protagonist" as ExploreStep)
              : ("free_talk" as ExploreStep),
            title: c.name,
            content: c.background || "",
            timestamp: ts,
          });
        }
      });
      lores.forEach((l: any, i: number) => {
        if (
          loreResults[i]?.status === "fulfilled" &&
          !(loreResults[i] as any)?.value?.error
        ) {
          newItems.push({
            id: `ol_lore_${ts}_${i}`,
            step: "worldview" as ExploreStep,
            title: l.title,
            content: l.content || "",
            timestamp: ts,
          });
        }
      });
      setAdopted((prev) => [...prev, ...newItems]);

      charResults.forEach((r, i) => {
        if (r.status === "rejected")
          errors.push(`角色[${chars[i].name}]: ${r.reason}`);
        else if ((r as any)?.value?.error)
          errors.push(`角色[${chars[i].name}]: ${(r as any).value.error}`);
      });
      loreResults.forEach((r, i) => {
        if (r.status === "rejected")
          errors.push(`词条[${lores[i].title}]: ${r.reason}`);
        else if ((r as any)?.value?.error)
          errors.push(`词条[${lores[i].title}]: ${(r as any).value.error}`);
      });

      const msgParts: string[] = ["✅ 项目已创建！"];
      if (charOk > 0) msgParts.push(`${charOk}个角色`);
      if (loreOk > 0) msgParts.push(`${loreOk}条世界设定`);
      msgParts.push("已写入");
      if (charFail + loreFail > 0) {
        msgParts.push(`\n⚠️ ${charFail + loreFail}条写入失败`);
        if (errors.length > 0) msgParts.push(`\n${errors.slice(0, 3).join("\n")}`);
      }
      alert(msgParts.join(""));
    } catch (err: any) {
      alert(err?.message || "创建失败");
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }, [outlineResult, config]);

  // ─── 一键AI构建 ────────────────────────────────────

  const handleGenerateAll = useCallback(async () => {
    if (generatingAll) return;
    setGeneratingAll(true);
    setAllCards({});
    try {
      const res = await fetch("/api/explore/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "generate_all", config, adopted }),
      });
      const data = await res.json();
      if (res.ok && data.allCards) {
        setAllCards(data.allCards);
        setMessages((prev) => [
          ...prev,
          {
            role: "agent",
            content:
              data.reply ||
              `已为 ${Object.keys(data.allCards).length} 个步骤生成设定卡片。`,
          },
        ]);
      } else {
        alert(data.error || "生成失败");
      }
    } catch (err: any) {
      alert(err?.message || "网络错误");
    } finally {
      setGeneratingAll(false);
    }
  }, [config, adopted, generatingAll]);

  // ─── 创建项目 ──────────────────────────────────────

  const handleCreateProject = useCallback(
    async (createMode: "direct" | "ai_refine") => {
      if (creatingRef.current) return;
      creatingRef.current = true;
      setCreating(true);
      try {
        const res = await fetch("/api/explore/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config, adopted, mode: createMode }),
        });
        const data = await res.json();
        if (res.ok) {
          setCreatedProjectId(data.projectId);
        } else {
          alert(data.error || "创建失败");
        }
      } catch (err: any) {
        alert(err?.message || "网络错误");
      } finally {
        creatingRef.current = false;
        setCreating(false);
      }
    },
    [config, adopted],
  );

  // ─── 切换步骤 ──────────────────────────────────────

  const handleStepChange = useCallback((step: ExploreStep) => {
    setCurrentStep(step);
    const stepLabel = STEP_LABELS[step];
    setMessages((prev) => [
      ...prev,
      {
        role: "agent",
        content: `切换至「${stepLabel}」。\n\n说说你关于${stepLabel}的想法？`,
      },
    ]);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      {/* ── 顶栏 ── */}
      <header className="border-b border-white/[0.06] bg-zinc-950/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-full mx-auto flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
            >
              ← 返回
            </Link>
            <div className="flex items-center gap-2.5">
              <span className="text-lg">🎯</span>
              <h1 className="text-base font-bold text-zinc-100">探讨模式</h1>
            </div>
            <span className="text-[10px] text-zinc-600 hidden sm:inline">
              对话式构建小说世界
            </span>
          </div>
          {/* 全局模式切换 */}
          <div className="flex items-center gap-0.5 bg-white/[0.03] rounded-xl p-0.5 border border-white/[0.06] mr-2">
            {(["chat", "cards", "outline"] as const).map((m) => {
              const active = mode === m;
              const labels: Record<string, string> = { chat: "💬 对话", cards: "🃏 抽卡", outline: "📋 大纲" };
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`text-[10px] px-2.5 py-1 rounded-lg font-medium transition-all duration-200 ${
                    active
                      ? "bg-white/[0.08] text-zinc-200 shadow-sm"
                      : "text-zinc-600 hover:text-zinc-400"
                  } active:scale-95`}
                >
                  {labels[m]}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateAll}
              disabled={generatingAll}
              className={`text-xs px-3.5 py-1.5 rounded-xl font-medium transition-all duration-200 active:scale-95 border ${
                generatingAll
                  ? "bg-white/[0.02] text-zinc-600 border-white/[0.05] cursor-not-allowed"
                  : "bg-purple-500/15 text-purple-300 border-purple-400/20 hover:bg-purple-500/20 hover:border-purple-400/30 shadow-[0_0_12px_rgba(168,85,247,0.08)]"
              }`}
            >
              {generatingAll ? "⏳ 生成中..." : "🤖 一键AI构建所有设定"}
            </button>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`text-xs px-3.5 py-1.5 rounded-xl font-medium transition-all duration-200 active:scale-95 border ${
                showConfig
                  ? "bg-indigo-500/15 text-indigo-300 border-indigo-400/20"
                  : "bg-white/[0.02] text-zinc-500 border-white/[0.06] hover:border-white/[0.12] hover:text-zinc-300"
              }`}
            >
              {showConfig ? "隐藏配置" : "构建配置"}
            </button>
            <button
              onClick={() => {
                setConfig(DEFAULT_BUILD_CONFIG);
                setAdopted([]);
                setAllCards({});
                setMessages([messages[0]]);
                setCreatedProjectId(null);
                setCurrentStep("opening");
                setOutlineResult(null);
                setOutlineProgress(null);
                lastSavedRef.current = "";
                localStorage.removeItem("explore_state");
              }}
              className="text-xs px-3 py-1.5 rounded-xl bg-white/[0.02] text-zinc-500 border border-white/[0.06] hover:text-zinc-300 hover:border-white/[0.12] transition-all duration-200 active:scale-95"
            >
              重开
            </button>
          </div>
        </div>
      </header>

      {/* ── 三栏布局 ── */}
      <div className="flex" style={{ height: "calc(100vh - 57px)" }}>
        {/* 左栏：构建配置 */}
        {showConfig && (
          <aside className="w-80 border-r border-white/[0.06] overflow-y-auto shrink-0 bg-zinc-950/50 backdrop-blur-sm">
            <BuildConfigPanel config={config} onChange={setConfig} />
          </aside>
        )}

        {/* 中栏 */}
        <main className="flex-1 flex flex-col min-w-0">
          {mode === "outline" ? (
            <OutlinePanel
              outlineText={outlineText}
              enrichPrompt={enrichPrompt}
              outlineResult={outlineResult}
              outlineProgress={outlineProgress}
              outlineLoading={outlineLoading}
              creating={creating}
              onTextChange={setOutlineText}
              onEnrichPromptChange={setEnrichPrompt}
              onSubmit={handleOutlineSubmit}
              onConfirm={handleOutlineConfirm}
            />
          ) : (
            <>
              <ChatPanel
                messages={messages}
                loading={loading}
                mode={mode}
                currentStep={currentStep}
                adoptStatus={adoptStatus}
                onSend={handleSend}
                onStepChange={handleStepChange}
                onModeChange={setMode}
                onAdoptCard={handleAdoptCard}
              />
              <CardBrowser
                allCards={allCards}
                adoptStatus={adoptStatus}
                onAdoptCard={handleAdoptCard}
                onAdoptAll={async () => {
                  const cards = Object.values(allCards).flat();
                  await Promise.all(cards.map((card) => handleAdoptCard(card)));
                }}
              />
            </>
          )}
        </main>

        {/* 右栏：已采纳 */}
        <aside className="w-72 border-l border-white/[0.06] overflow-y-auto shrink-0 bg-zinc-950/50 backdrop-blur-sm">
          <AdoptedContentPanel
            adopted={adopted}
            onRemove={(id) =>
              setAdopted((prev) => prev.filter((a) => a.id !== id))
            }
            creating={creating}
            createdProjectId={createdProjectId}
            onCreateProject={handleCreateProject}
          />
        </aside>
      </div>
    </div>
  );
}
