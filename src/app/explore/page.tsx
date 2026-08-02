"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { BuildConfigPanel } from "@/components/explore/BuildConfigPanel";
import { AdoptedContentPanel } from "@/components/explore/AdoptedContentPanel";
import { ChatPanel } from "@/components/explore/ChatPanel";
import { OutlinePanel } from "@/components/explore/OutlinePanel";
import { CardBrowser } from "@/components/explore/CardBrowser";
import { StepProgress } from "@/components/explore/StepProgress";
import { Icon } from "@/components/ui/icons";
import type {
  BuildConfig,
  ExploreStep,
  ExploreMessage,
  AdoptedItem,
  AdoptCard,
} from "@/core/explore/types";
import { DEFAULT_BUILD_CONFIG, EXPLORE_STEPS, STEP_LABELS } from "@/core/explore/types";
import { toastError, toastCreated, toastWarning } from "@/components/ui/toast";

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
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
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
          // 成功后才置 adopted + 写入已采纳列表 + 卡片标记已采纳
          setAdopted((prev) => [...prev, item]);
          setMessages((prev) =>
            prev.map((m) => ({
              ...m,
              cards: m.cards?.map((c) =>
                c.id === card.id ? { ...c, adopted: true } : c,
              ),
            })),
          );
          setAdoptStatus((prev) => ({
            ...prev,
            [card.id]: data.entityType === "character" ? "已采纳·角色" : "已采纳·词条",
          }));
          if (data.projectId && !createdProjectId) {
            setCreatedProjectId(data.projectId);
          }
          const currentIdx = EXPLORE_STEPS.indexOf(currentStep);
          if (currentIdx >= 0 && currentIdx < EXPLORE_STEPS.length - 1) {
            setCurrentStep(EXPLORE_STEPS[currentIdx + 1]);
          }
        } else {
          // 失败：保留卡片可重试，状态串与 ChatPanel 检查一致（"❌失败"），绝不提前置 adopted
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
      toastError(err?.message || "网络错误");
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

      toastCreated(config.novelName || "小说项目", "项目");
      if (charFail + loreFail > 0) {
        toastWarning(
          `${charFail + loreFail} 条内容写入失败${errors.length ? `：${errors.slice(0, 3).join("；")}` : ""}`,
        );
      }
    } catch (err: any) {
      toastError(err?.message || "创建失败");
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
        toastError(data.error || "生成失败");
      }
    } catch (err: any) {
      toastError(err?.message || "网络错误");
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
          toastCreated(config.novelName || "小说项目", "项目");
        } else {
          toastError(data.error || "创建失败");
        }
      } catch (err: any) {
        toastError(err?.message || "网络错误");
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
    <div className="min-h-screen bg-[var(--nv-void)] text-[var(--nv-text-secondary)]">
      {/* ── 顶栏 ── */}
      <header className="sticky top-0 z-10 border-b border-[var(--nv-border-2)] bg-[var(--nv-abyss)]/80 px-5 py-3 backdrop-blur-md">
        <div className="max-w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--nv-text-tertiary)] transition-colors hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
              aria-label="返回"
            >
              <Icon name="arrowLeft" size={18} />
            </Link>
            <div className="flex items-center gap-2.5">
              <Icon name="target" size={20} className="text-[var(--nv-primary)]" />
              <h1 className="text-base font-bold text-[var(--nv-text-primary)]">探讨模式</h1>
            </div>
            <span className="hidden text-[10px] text-[var(--nv-text-tertiary)] sm:inline">
              对话式构建小说世界
            </span>
          </div>
          {/* 全局模式切换 */}
          <div className="mr-2 flex items-center gap-0.5 rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-0.5">
            {(["chat", "cards", "outline"] as const).map((m) => {
              const active = mode === m;
              const labels: Record<string, React.ReactNode> = { chat: <span className="flex items-center gap-1"><Icon name="message" size={12} /> 对话</span>, cards: <span className="flex items-center gap-1"><Icon name="grid" size={12} /> 抽卡</span>, outline: <span className="flex items-center gap-1"><Icon name="clipboard" size={12} /> 大纲</span> };
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-medium transition-all duration-200 active:scale-95 ${
                    active
                      ? "bg-[var(--nv-primary-soft)] text-[var(--nv-primary)] shadow-sm"
                      : "text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]"
                  }`}
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
              className={`rounded-xl border px-3.5 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95 ${
                generatingAll
                  ? "cursor-not-allowed border-[var(--nv-border-1)] bg-[var(--nv-surface-1)] text-[var(--nv-text-muted)]"
                  : "border-[var(--nv-creative)]/30 bg-[var(--nv-creative-soft)] text-[var(--nv-creative)] hover:border-[var(--nv-creative)]/50 hover:bg-[var(--nv-creative-soft)]"
              }`}
            >
              {generatingAll ? <span className="flex items-center gap-1"><Icon name="loader" size={12} className="animate-spin" /> 生成中...</span> : <span className="flex items-center gap-1"><Icon name="bot" size={13} /> 一键AI构建所有设定</span>}
            </button>
            {/* 窄屏：抽屉切换 */}
            <button
              onClick={() => setLeftDrawerOpen(o => !o)}
              className="lg:hidden rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] px-3 py-1.5 text-xs text-[var(--nv-text-tertiary)] transition-all duration-200 hover:border-[var(--nv-border-3)] hover:text-[var(--nv-text-primary)] active:scale-95"
              title="切换构建配置（窄屏）"
            >
              <Icon name="sliders" size={13} />
            </button>
            <button
              onClick={() => setRightDrawerOpen(o => !o)}
              className="lg:hidden rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] px-3 py-1.5 text-xs text-[var(--nv-text-tertiary)] transition-all duration-200 hover:border-[var(--nv-border-3)] hover:text-[var(--nv-text-primary)] active:scale-95"
              title="切换已采纳（窄屏）"
            >
              <Icon name="check" size={13} />
            </button>
            {/* 桌面：内联配置开关 */}
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`hidden lg:inline-flex rounded-xl border px-3.5 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95 ${
                showConfig
                  ? "border-[var(--nv-primary)]/20 bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]"
                  : "border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] text-[var(--nv-text-tertiary)] hover:border-[var(--nv-border-3)] hover:text-[var(--nv-text-primary)]"
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
              className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] px-3 py-1.5 text-xs text-[var(--nv-text-tertiary)] transition-all duration-200 hover:border-[var(--nv-border-3)] hover:text-[var(--nv-text-primary)] active:scale-95"
            >
              重开
            </button>
          </div>
        </div>
      </header>

      {/* ── 11 步探讨进度条 ── */}
      <StepProgress currentStep={currentStep} onStepChange={handleStepChange} />

      {/* ── 三栏布局 ── */}
      <div className="flex" style={{ height: "calc(100vh - 57px)" }}>
        {/* 左栏：构建配置 */}
        {(showConfig || leftDrawerOpen) && (
          <aside className={`w-80 shrink-0 overflow-y-auto border-r border-[var(--nv-border-2)] bg-[var(--nv-abyss)]/60 backdrop-blur-sm fixed inset-y-0 left-0 z-40 max-w-[85vw] h-full transition-transform duration-200 ${leftDrawerOpen ? "translate-x-0" : "-translate-x-full"} lg:static lg:z-auto lg:h-auto lg:shrink-0 lg:w-80 lg:translate-x-0 lg:transition-none`}>
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
        <aside className={`w-72 shrink-0 overflow-y-auto border-l border-[var(--nv-border-2)] bg-[var(--nv-abyss)]/60 backdrop-blur-sm fixed inset-y-0 right-0 z-40 max-w-[85vw] h-full transition-transform duration-200 ${rightDrawerOpen ? "translate-x-0" : "translate-x-full"} lg:static lg:z-auto lg:h-auto lg:shrink-0 lg:w-72 lg:translate-x-0 lg:transition-none`}>
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
        {/* 窄屏抽屉遮罩 */}
        {(leftDrawerOpen || rightDrawerOpen) && (
          <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => { setLeftDrawerOpen(false); setRightDrawerOpen(false); }} />
        )}
      </div>
    </div>
  );
}
