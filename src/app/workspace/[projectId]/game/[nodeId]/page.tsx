"use client";

/**
 * 游戏模式页面 —— 沉浸式互动文本冒险
 *
 * 路由：/workspace/[projectId]/game/[nodeId]
 * 独立的暗黑沉浸式 UI，与 workspace 主页面分离。
 * 视觉遵循「虚空玻璃 (Void Glass)」设计体系：以 --nv-void 为底，
 * surface 层级承载容器，--nv-creative(紫罗兰) 作为游戏主调，
 * 禁止 emoji、统一用 <Icon> 组件。
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import GameCanvas from "@/components/game/GameCanvas";
import GameParticles from "@/components/game/GameParticles";
import GameOutlineEditor from "@/components/game/GameOutlineEditor";
import { Icon, type IconName } from "@/components/ui/icons";
import { EmptyState, LoadingDots } from "@/components/ui/States";
import { Modal } from "@/components/ui/Modal";
import type { GameOption, GameEntity, GameItem } from "@/core/game/types";
import { reconcileFromSummary } from "@/core/game/reconcile";

// ─── 类型 ─────────────────────────────────────────────────────

interface GameState {
  sessionId: string | null;
  status: "loading" | "ready" | "playing" | "generating" | "ending" | "ended";
  currentRound: number;
  totalWords: number;
  plotProgress: number;
  narrative: string;           // 全部累积正文
  lastNarrative: string;       // 最后一轮叙事（流式）
  options: GameOption[];
  entities: GameEntity[];
  items: GameItem[];
  bookName: string;
  chapterTitle: string;
  error: string | null;
}

interface TurnRecord {
  round: number;
  playerAction: string;
  narrative: string;
}

// ─── 快捷动作（图标名对应 icons.tsx） ────────────────────────

const QUICK_ACTIONS = [
  { type: "observe", label: "观察", icon: "search", desc: "观察环境/人物" },
  { type: "dialogue", label: "对话", icon: "message", desc: "与角色交谈" },
  { type: "combat", label: "战斗", icon: "sword", desc: "进入战斗" },
  { type: "explore", label: "探索", icon: "map", desc: "探索新区域" },
  { type: "use_item", label: "使用物品", icon: "backpack", desc: "使用背包物品" },
  { type: "rest", label: "休息", icon: "moon", desc: "休息恢复" },
];

// 左栏标签
const LEFT_TABS = [
  { key: "plot", label: "情节", icon: "book" },
  { key: "characters", label: "角色", icon: "user" },
  { key: "factions", label: "势力", icon: "building" },
] as const;

// 右栏标签
const RIGHT_TABS = [
  { key: "text", label: "正文", icon: "file" },
  { key: "backpack", label: "背包", icon: "backpack" },
  { key: "world", label: "世界", icon: "globe" },
] as const;

// ─── 主页面 ───────────────────────────────────────────────────

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const nodeId = params.nodeId as string;

  const [state, setState] = useState<GameState>({
    sessionId: null,
    status: "loading",
    currentRound: 0,
    totalWords: 0,
    plotProgress: 0,
    narrative: "",
    lastNarrative: "",
    options: [],
    entities: [],
    items: [],
    bookName: "加载中...",
    chapterTitle: "加载中...",
    error: null,
  });

  const [customInput, setCustomInput] = useState("");
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [rightTab, setRightTab] = useState<"text" | "backpack" | "world">("text");
  const [leftTab, setLeftTab] = useState<"plot" | "characters" | "factions">("plot");
  const [endingNarrative, setEndingNarrative] = useState("");
  const [showOutlineEditor, setShowOutlineEditor] = useState(false);
  const [nodeOutline, setNodeOutline] = useState<string | null>(null);
  // v0.46.58：首次进入教程（localStorage 记忆）
  const [showTutorial, setShowTutorial] = useState(() => {
    try { return localStorage.getItem("nf-game-tutorial-seen") !== "1"; } catch { return true; }
  });
  const [lorebook, setLorebook] = useState<any[]>([]);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const streamRef = useRef<AbortController | null>(null);

  // ── 初始化 ──────────────────────────────────────────────
  const initGame = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      // 加载项目数据
      const projRes = await fetch(`/api/projects/${projectId}`);
      if (!projRes.ok) throw new Error("项目加载失败");
      const projData = await projRes.json();

      const node = projData.storyNodes?.find((n: any) => n.id === nodeId);
      if (!node) throw new Error("章节节点不存在");

      setState((s) => ({
        ...s,
        bookName: projData.name,
        chapterTitle: node.title || "未命名章节",
        status: "ready",
      }));

      setNodeOutline(node.outline || null);
      setLorebook(projData.lorebookEntries || []);
      setTurns([]);
      setEndingNarrative("");
    } catch (err: any) {
      setState((s) => ({ ...s, status: "ready", error: err.message }));
    }
  }, [projectId, nodeId]);

  useEffect(() => { initGame(); }, [initGame]);

  // ── 开始游戏 ────────────────────────────────────────────
  const handleStart = async () => {
    setState((s) => ({ ...s, status: "generating", error: null }));
    try {
      const res = await fetch("/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, nodeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "启动失败");

      setState((s) => ({
        ...s,
        sessionId: data.sessionId,
        status: "playing",
        currentRound: data.currentRound,
        totalWords: data.totalWords,
        plotProgress: data.plotProgress,
        narrative: data.narrative,
        lastNarrative: data.narrative,
        options: data.options || [],
        entities: data.newEntities || [],
        items: [],
      }));

      setTurns([
        { round: 1, playerAction: "开始游戏", narrative: data.narrative },
      ]);
    } catch (err: any) {
      setState((s) => ({ ...s, status: "ready", error: err.message }));
    }
  };

  // ── 对账：abort/停止后用后端权威态整体覆盖（阿游 P0-2）────────
  const reconcileWithBackend = useCallback(async () => {
    const sid = state.sessionId;
    if (!sid) return;
    try {
      const res = await fetch(
        `/api/game/state?sessionId=${encodeURIComponent(sid)}`,
        { method: "GET" }
      );
      const data = await res.json().catch(() => null);
      if (data?.ok && data?.summary) {
        const rc = reconcileFromSummary(data.summary);
        const { turns: rcTurns, ...rcState } = rc;
        setTurns(rcTurns);
        setState((s) => ({
          ...s,
          ...rcState,
          status: "playing",
          error: null,
          lastNarrative: "",
        }));
      }
    } catch {
      // 对账失败不阻断交互，导出前建议刷新
    }
  }, [state.sessionId]);

  // ── 执行行动 ────────────────────────────────────────────
  const handleAction = async (
    actionType: string,
    actionText: string,
    selectedOption?: number
  ) => {
    if (!state.sessionId || state.status !== "playing") return;

    setState((s) => ({ ...s, status: "generating", lastNarrative: "" }));
    const controller = new AbortController();
    streamRef.current = controller;

    try {
      const res = await fetch("/api/game/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          actionType,
          actionText,
          selectedOption,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "未知错误" }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamedNarrative = "";
      let doneData: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "token") {
                streamedNarrative += event.content || "";
                setState((s) => ({
                  ...s,
                  lastNarrative: streamedNarrative,
                }));
              } else if (event.type === "game_done") {
                doneData = event;
              } else if (event.type === "error") {
                throw new Error(event.error || "未知错误");
              }
            } catch (e: any) {
              if (e.message && !e.message.includes("JSON")) throw e;
            }
          }
        }
      }

      if (!doneData) throw new Error("未收到游戏回合结果");

      const newRound = state.currentRound + 1;
      const newTotalWords = state.totalWords + (doneData.wordCount || 0);
      const fullNarrative = state.narrative + "\n\n" + doneData.narrative;

      // 合并实体（去重）
      const mergedEntities = [...state.entities];
      for (const ne of doneData.newEntities || []) {
        if (!mergedEntities.find((e) => e.name === ne.name)) {
          mergedEntities.push(ne);
        }
      }

      // 更新背包（按 name+owner 隔离，阿游 P1；防止同名物品跨角色互扣）
      let updatedItems = [...state.items];
      for (const change of doneData.itemChanges || []) {
        const owner = change.owner || "主角";
        const match = (i: GameItem) =>
          i.name === change.name && (i.owner || "主角") === owner;
        if (change.operation === "gain") {
          const existing = updatedItems.find(match);
          if (existing) {
            existing.quantity += change.quantity || 1;
            if (!existing.owner) existing.owner = owner;
          } else {
            updatedItems.push({
              name: change.name,
              quantity: change.quantity || 1,
              category: "other",
              source: `第${newRound}轮获得`,
              acquiredRound: newRound,
              owner,
            });
          }
        } else if (change.operation === "consume") {
          const existing = updatedItems.find(match);
          if (existing) {
            existing.quantity -= change.quantity || 1;
            if (existing.quantity <= 0) {
              updatedItems = updatedItems.filter((i) => !match(i));
            }
          }
        } else if (change.operation === "equip") {
          const existing = updatedItems.find(match);
          if (existing) existing.equipped = true;
        } else if (change.operation === "discard") {
          const existing = updatedItems.find(match);
          if (existing) {
            existing.quantity -= change.quantity || 1;
            if (existing.quantity <= 0) {
              updatedItems = updatedItems.filter((i) => !match(i));
            }
          }
        }
      }

      setState((s) => ({
        ...s,
        status: "playing",
        currentRound: newRound,
        totalWords: newTotalWords,
        plotProgress: doneData.plotProgress || s.plotProgress,
        narrative: fullNarrative,
        lastNarrative: doneData.narrative,
        options: doneData.options || [],
        entities: mergedEntities,
        items: updatedItems,
      }));

      setTurns((prev) => [
        ...prev,
        {
          round: newRound,
          playerAction: actionText,
          narrative: doneData.narrative,
        },
      ]);

      setCustomInput("");
    } catch (err: any) {
      // 用户停止/断网：后端可能已提交该轮，与后端权威态对账，避免前后端轮次/背包永久错位（阿游 P0-2）
      await reconcileWithBackend();
      // 非主动停止（如真正异常）保留错误提示
      if (err?.name !== "AbortError") {
        setState((s) => ({
          ...s,
          status: "playing",
          error: err?.message || "行动失败",
        }));
      }
    }
  };

  // ── 停止生成 ────────────────────────────────────────────
  const handleStop = () => {
    streamRef.current?.abort();
    setState((s) => ({ ...s, status: "playing" }));
  };

  // ── 结束并导出 ──────────────────────────────────────────
  const handleEnd = async () => {
    if (!state.sessionId) return;
    setState((s) => ({ ...s, status: "ending", error: null }));

    try {
      const res = await fetch("/api/game/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: state.sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "导出失败");

      setEndingNarrative(data.finalContent);
      setState((s) => ({
        ...s,
        status: "ended",
        narrative: data.finalContent,
        totalWords: data.totalWords,
      }));
    } catch (err: any) {
      setState((s) => ({ ...s, status: "playing", error: err.message }));
    }
  };

  // ── 返回工作区 ──────────────────────────────────────────
  const handleBack = () => {
    router.push(`/workspace/${projectId}`);
  };

  // ── 加载状态 ────────────────────────────────────────────
  if (state.status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--nv-void)]">
        <div className="surface-floating flex flex-col items-center gap-4 rounded-2xl px-12 py-14">
          <Icon name="gamepad" size={42} className="animate-pulse text-[var(--nv-creative)]" />
          <p className="text-lg text-[var(--nv-text-secondary)]">正在初始化游戏模式...</p>
          <LoadingDots label="接入故事引擎" />
        </div>
      </div>
    );
  }

  // ── 就绪/结束状态 ───────────────────────────────────────
  const showStartScreen =
    state.status === "ready" || (state.status === "ended" && !state.narrative);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--nv-void)] font-sans text-[var(--nv-text-secondary)]">
      <GameParticles />

      {/* ═══ 首次教程（v0.46.58） ═══ */}
      {showTutorial && (
        <Modal
          open
          onClose={() => {
            try { localStorage.setItem("nf-game-tutorial-seen", "1"); } catch { /* ignore */ }
            setShowTutorial(false);
          }}
          bare
          panelClassName="max-w-lg"
        >
          <div className="p-6">
            <div className="mb-3 flex items-center gap-2">
              <Icon name="gamepad" size={22} className="text-[var(--nv-creative)]" />
              <h2 className="text-lg font-bold text-[var(--nv-text-primary)]">游戏模式 · 跑团式互动创作</h2>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-[var(--nv-text-secondary)]">
              <p>
                游戏模式把「写这一章」变成一场<span className="text-[var(--nv-accent)] font-medium">互动跑团</span>：AI 扮演剧情引擎，每轮给你一段叙事和几个选项，你选择（或输入自由行动），剧情随之推进——边玩边把这一章写出来。
              </p>
              <div className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3 space-y-1.5">
                <p className="text-xs font-medium text-[var(--nv-text-primary)]">怎么玩：</p>
                <p className="text-xs">① 点击「开始游戏」→ 阅读开场叙事 → ② 点选编号选项，或直接输入你的行动 → ③ 每轮剧情推进、字数累加 → ④ 随时回到工作区精修正文</p>
              </div>
              <div className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3 space-y-1.5">
                <p className="text-xs font-medium text-[var(--nv-text-primary)]">与你的小说融合：</p>
                <p className="text-xs">本章已有正文会<span className="text-[var(--nv-success)]">带入游戏</span>（含原有字数）——游戏从现有内容之后续接，不推翻已写情节；世界观、角色卡、章纲全部生效，与工作区的设定实时联动。</p>
              </div>
              <p className="text-xs text-[var(--nv-text-tertiary)]">提示：右上角可随时查看背包/世界观/角色；「结束回合」后可将游戏叙事写入本章正文。</p>
            </div>
            <button
              onClick={() => {
                try { localStorage.setItem("nf-game-tutorial-seen", "1"); } catch { /* ignore */ }
                setShowTutorial(false);
              }}
              className="mt-5 w-full btn-primary rounded-xl py-2.5 text-sm font-medium"
            >
              开始冒险
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ 顶栏 ═══ */}
      <header className="relative z-10 flex items-center justify-between border-b border-[var(--nv-border-2)] bg-[var(--nv-abyss)]/80 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            title="返回工作区"
            aria-label="返回工作区"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--nv-text-tertiary)] transition-colors hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
          >
            <Icon name="arrowLeft" size={18} />
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold text-[var(--nv-text-primary)]">
              <Icon name="gamepad" size={18} className="text-[var(--nv-creative)]" />
              游戏模式 — {state.bookName}
            </h1>
            <p className="text-xs text-[var(--nv-text-tertiary)]">
              第{state.currentRound || "?"}轮 · {state.chapterTitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-[var(--nv-text-tertiary)]">
          <button
            onClick={() => setShowOutlineEditor(!showOutlineEditor)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              showOutlineEditor
                ? "border-[var(--nv-info)]/50 bg-[var(--nv-info-soft)] text-[var(--nv-info)]"
                : "border-[var(--nv-border-2)] text-[var(--nv-text-tertiary)] hover:border-[var(--nv-border-3)] hover:text-[var(--nv-text-primary)]"
            }`}
          >
            <Icon name="clipboard" size={14} /> 章纲
          </button>
          <span className="hidden sm:inline">轮次 {state.currentRound}</span>
          <span className="hidden sm:inline">字数 {state.totalWords}</span>
          {state.status === "playing" && (
            <button
              onClick={handleEnd}
              className="btn-creative rounded-lg px-4 py-1.5 text-sm font-medium text-[var(--nv-text-primary)]"
            >
              结束并导出
            </button>
          )}
          {/* 窄屏：抽屉切换 */}
          <button
            onClick={() => setLeftDrawerOpen(o => !o)}
            className="lg:hidden flex items-center gap-1.5 rounded-lg border border-[var(--nv-border-2)] px-3 py-1.5 text-xs text-[var(--nv-text-tertiary)] transition-all hover:border-[var(--nv-border-3)] hover:text-[var(--nv-text-primary)] active:scale-95"
            title="切换左栏（窄屏）"
            aria-label="切换左栏（窄屏）"
          >
            <Icon name="sliders" size={13} />
          </button>
          <button
            onClick={() => setRightDrawerOpen(o => !o)}
            className="lg:hidden flex items-center gap-1.5 rounded-lg border border-[var(--nv-border-2)] px-3 py-1.5 text-xs text-[var(--nv-text-tertiary)] transition-all hover:border-[var(--nv-border-3)] hover:text-[var(--nv-text-primary)] active:scale-95"
            title="切换右栏（窄屏）"
            aria-label="切换右栏（窄屏）"
          >
            <Icon name="grid" size={13} />
          </button>
        </div>
      </header>

      {/* ═══ 主体三栏 ═══ */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* 左侧栏 */}
        <aside className={`flex w-52 shrink-0 flex-col border-r border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] fixed inset-y-0 left-0 z-40 max-w-[85vw] h-full transition-transform duration-200 ${leftDrawerOpen ? "translate-x-0" : "-translate-x-full"} lg:static lg:z-auto lg:h-auto lg:shrink-0 lg:w-52 lg:translate-x-0 lg:transition-none`}>
          <div className="flex border-b border-[var(--nv-border-2)]">
            {LEFT_TABS.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setLeftTab(key)}
                className={`flex flex-1 items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                  leftTab === key
                    ? "border-b-2 border-[var(--nv-creative)] bg-[var(--nv-creative-soft)] text-[var(--nv-creative)]"
                    : "border-b-2 border-transparent text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]"
                }`}
              >
                <Icon name={icon} size={13} /> {label}
              </button>
            ))}
          </div>
          <div className="custom-scrollbar flex-1 overflow-y-auto p-3 text-xs">
            {leftTab === "plot" && (
              <div>
                <p className="mb-2 font-medium text-[var(--nv-text-primary)]">情节进度</p>
                <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-[var(--nv-surface-2)]">
                  <div
                    className="h-full rounded-full bg-[var(--nv-creative)] transition-all duration-700"
                    style={{ width: `${state.plotProgress}%` }}
                  />
                </div>
                <p className="text-right text-[var(--nv-creative)]">{state.plotProgress}%</p>
                {turns.length === 0 && (
                  <p className="mt-4 italic text-[var(--nv-text-muted)]">暂无情节点数据</p>
                )}
                {turns.map((t) => (
                  <div key={t.round} className="mt-2 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-1.5">
                    <p className="text-[var(--nv-creative)]">第{t.round}轮</p>
                    <p className="mt-0.5 line-clamp-2 text-[var(--nv-text-tertiary)]">{t.playerAction}</p>
                  </div>
                ))}
              </div>
            )}
            {leftTab === "characters" && (
              <div>
                <p className="mb-2 font-medium text-[var(--nv-text-primary)]">本章角色</p>
                {state.entities.filter((e) => e.type === "角色").length === 0 && (
                  <p className="italic text-[var(--nv-text-muted)]">暂无角色数据</p>
                )}
                {state.entities
                  .filter((e) => e.type === "角色")
                  .map((e) => (
                    <div
                      key={e.name}
                      className="mt-2 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-1.5"
                    >
                      <p className="flex items-center gap-1.5 text-[var(--nv-text-primary)]">
                        <Icon name="user" size={12} className="text-[var(--nv-text-tertiary)]" />
                        {e.name}
                      </p>
                      <p className="mt-0.5 text-[var(--nv-text-muted)]">{e.description}</p>
                    </div>
                  ))}
              </div>
            )}
            {leftTab === "factions" && (
              <div>
                <p className="mb-2 font-medium text-[var(--nv-text-primary)]">涉及势力</p>
                {state.entities.filter((e) => e.type === "势力").length === 0 && (
                  <p className="italic text-[var(--nv-text-muted)]">暂无势力数据</p>
                )}
                {state.entities
                  .filter((e) => e.type === "势力")
                  .map((e) => (
                    <div
                      key={e.name}
                      className="mt-2 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-1.5"
                    >
                      <p className="flex items-center gap-1.5 text-[var(--nv-text-primary)]">
                        <Icon name="building" size={12} className="text-[var(--nv-text-tertiary)]" />
                        {e.name}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </div>
          {/* 左侧底部控制 */}
          <div className="space-y-2 border-t border-[var(--nv-border-2)] p-3">
            <button
              onClick={async () => {
                // 回退：移除最后一轮，并同步后端删除该轮及之后所有 gameState、回滚 session（阿游 P0-1）
                if (turns.length > 1) {
                  const lastRound = turns[turns.length - 1].round;
                  const sid = state.sessionId;
                  const newTurns = turns.slice(0, -1);
                  setTurns(newTurns);
                  if (sid) {
                    try {
                      const res = await fetch(`/api/game/state?sessionId=${encodeURIComponent(sid)}&round=${lastRound}`, { method: "DELETE" });
                      const data = await res.json().catch(() => null);
                      // P1：优先用后端 rollback 后的权威摘要整体覆盖前端态，避免错位（字数虚高/背包残留）
                      if (data?.ok && data?.summary) {
                        const sm = data.summary;
                        setState((s) => ({
                          ...s,
                          currentRound: sm.currentRound,
                          totalWords: sm.totalWords,
                          plotProgress: sm.plotProgress,
                          items: sm.items || [],
                          entities: sm.entities || [],
                          narrative: sm.narrative || newTurns.map((t) => t.narrative).join("\n\n"),
                          options: sm.options || [],
                        }));
                      } else {
                        // 后端未返回摘要（老接口/异常）：按前端剩余轮次重建，保证不崩
                        const newNarrative = newTurns.map((t) => t.narrative).join("\n\n");
                        setState((s) => ({
                          ...s,
                          narrative: newNarrative,
                          currentRound: newTurns.length,
                          options: [],
                        }));
                      }
                    } catch {
                      // 后端回退失败不阻断前端回退，但导出前建议刷新对账
                      const newNarrative = newTurns.map((t) => t.narrative).join("\n\n");
                      setState((s) => ({
                        ...s,
                        narrative: newNarrative,
                        currentRound: newTurns.length,
                        options: [],
                      }));
                    }
                  } else {
                    const newNarrative = newTurns.map((t) => t.narrative).join("\n\n");
                    setState((s) => ({
                      ...s,
                      narrative: newNarrative,
                      currentRound: newTurns.length,
                      options: [],
                    }));
                  }
                }
              }}
              disabled={turns.length <= 1}
              className="w-full rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] py-1.5 text-xs font-medium text-[var(--nv-text-secondary)] transition-all hover:border-[var(--nv-border-3)] hover:text-[var(--nv-text-primary)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              回退
            </button>
            <button
              onClick={() => handleAction("custom", "自动推进剧情")}
              disabled={state.status !== "playing"}
              className="w-full rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] py-1.5 text-xs font-medium text-[var(--nv-text-secondary)] transition-all hover:border-[var(--nv-border-3)] hover:text-[var(--nv-text-primary)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              自动推进
            </button>
          </div>
        </aside>

        {/* 主画布 */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {showStartScreen ? (
            /* 开始界面 */
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="surface-floating flex max-w-md flex-col items-center rounded-3xl px-12 py-14 text-center">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--nv-creative-soft)] text-[var(--nv-creative)]">
                  <Icon name="gamepad" size={40} />
                </div>
                <h2 className="mb-2 text-2xl font-bold text-[var(--nv-text-primary)]">游戏模式已就绪</h2>
                <p className="mb-1 text-[var(--nv-text-secondary)]">
                  章节：{state.chapterTitle}
                </p>
                <p className="mb-8 text-sm text-[var(--nv-text-tertiary)]">
                  AI 将以互动方式与你共同创作本章正文
                </p>
                <button
                  onClick={handleStart}
                  className="btn-creative rounded-xl px-10 py-3 text-lg font-medium text-[var(--nv-text-primary)] shadow-[var(--shadow-glow-creative)] transition-all active:scale-95"
                >
                  开始游戏
                </button>
                {state.status === "ended" && (
                  <div className="mt-4">
                    <button
                      onClick={handleBack}
                      className="rounded-lg border border-[var(--nv-border-3)] px-6 py-2 font-medium text-[var(--nv-text-secondary)] transition-all hover:border-[var(--nv-creative)] hover:text-[var(--nv-creative)]"
                    >
                      返回工作区查看正文
                    </button>
                  </div>
                )}
                {state.error && (
                  <p className="mt-4 text-sm text-[var(--nv-danger)]">{state.error}</p>
                )}
              </div>
            </div>
          ) : (
            /* 游戏进行中 */
            <>
              <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
                <GameCanvas
                  turns={turns}
                  lastNarrative={state.lastNarrative}
                  isStreaming={state.status === "generating"}
                  entities={state.entities}
                  items={state.items}
                />
              </div>

              {/* 选项区 */}
              {state.options.length > 0 && state.status === "playing" && (
                <div className="px-6 pb-3">
                  <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3">
                    {state.options.map((opt) => (
                      <button
                        key={opt.index}
                        onClick={() =>
                          handleAction("option", `选择：${opt.text}`, opt.index)
                        }
                        className="group flex items-start gap-2 rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-4 py-3 text-left text-sm text-[var(--nv-text-secondary)] transition-all hover:border-[var(--nv-creative-soft)] hover:bg-[var(--nv-creative-soft)] hover:text-[var(--nv-text-primary)] active:scale-[0.98]"
                      >
                        <span className="font-mono text-[var(--nv-creative)]">
                          {opt.index}.
                        </span>
                        <span>{opt.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* 右侧信息面板 */}
        <aside className={`flex w-64 shrink-0 flex-col border-l border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] fixed inset-y-0 right-0 z-40 max-w-[85vw] h-full transition-transform duration-200 ${rightDrawerOpen ? "translate-x-0" : "translate-x-full"} lg:static lg:z-auto lg:h-auto lg:shrink-0 lg:w-64 lg:translate-x-0 lg:transition-none`}>
          <div className="flex border-b border-[var(--nv-border-2)]">
            {RIGHT_TABS.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setRightTab(key)}
                className={`flex flex-1 items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                  rightTab === key
                    ? "border-b-2 border-[var(--nv-creative)] bg-[var(--nv-creative-soft)] text-[var(--nv-creative)]"
                    : "border-b-2 border-transparent text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]"
                }`}
              >
                <Icon name={icon} size={13} /> {label}
              </button>
            ))}
          </div>
          <div className="custom-scrollbar flex-1 overflow-y-auto p-3 text-xs">
            {rightTab === "text" && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 font-medium text-[var(--nv-text-primary)]">
                  <Icon name="file" size={14} className="text-[var(--nv-creative)]" /> 正文进度
                </p>
                <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-[var(--nv-surface-2)]">
                  <div
                    className="h-full rounded-full bg-[var(--nv-creative)] transition-all duration-700"
                    style={{
                      width: `${Math.min(100, (state.totalWords / 3000) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-right text-[var(--nv-text-tertiary)]">
                  总字数：{state.totalWords}
                </p>
                <div className="custom-scrollbar mt-4 max-h-[calc(100vh-280px)] overflow-y-auto">
                  <div className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--nv-text-secondary)] opacity-80">
                    {state.narrative || "正文将在游戏互动过程中实时生成..."}
                  </div>
                </div>
              </div>
            )}
            {rightTab === "backpack" && (
              <div>
                <p className="mb-3 flex items-center gap-1.5 font-medium text-[var(--nv-text-primary)]">
                  <Icon name="backpack" size={14} className="text-[var(--nv-creative)]" /> 当前背包
                </p>
                {state.items.length === 0 ? (
                  <p className="italic text-[var(--nv-text-muted)]">
                    背包空空如也，在冒险中获取物品吧
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const consumables = state.items.filter(
                        (i) => i.category === "consumable" || i.category === "other"
                      );
                      const equipment = state.items.filter(
                        (i) => i.category === "equipment"
                      );
                      const questItems = state.items.filter(
                        (i) => i.category === "quest"
                      );
                      const currency = state.items.filter(
                        (i) => i.category === "currency"
                      );
                      return (
                        <>
                          {consumables.length > 0 && (
                            <>
                              <p className="mt-1 text-[10px] uppercase tracking-wider text-[var(--nv-text-tertiary)]">
                                【消耗品】
                              </p>
                              {consumables.map((i, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-1"
                                >
                                  <span className="text-[var(--nv-text-primary)]">{i.name}</span>
                                  <span className="ml-2 text-[var(--nv-creative)]">
                                    ×{i.quantity}
                                  </span>
                                  <p className="mt-0.5 text-[10px] text-[var(--nv-text-muted)]">
                                    {i.source}{i.owner ? ` · 归属：${i.owner}` : ""}
                                  </p>
                                </div>
                              ))}
                            </>
                          )}
                          {equipment.length > 0 && (
                            <>
                              <p className="mt-3 text-[10px] uppercase tracking-wider text-[var(--nv-text-tertiary)]">
                                【装备】
                              </p>
                              {equipment.map((i, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-1"
                                >
                                  <span className="text-[var(--nv-text-primary)]">{i.name}</span>
                                  <span className="ml-2 text-[var(--nv-success)]">
                                    ×{i.quantity}
                                  </span>
                                  {i.owner && (
                                    <p className="mt-0.5 text-[10px] text-[var(--nv-text-muted)]">归属：{i.owner}</p>
                                  )}
                                </div>
                              ))}
                            </>
                          )}
                          {questItems.length > 0 && (
                            <>
                              <p className="mt-3 text-[10px] uppercase tracking-wider text-[var(--nv-text-tertiary)]">
                                【任务道具】
                              </p>
                              {questItems.map((i, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-1"
                                >
                                  <span className="text-[var(--nv-warning)]">{i.name}</span>
                                  {i.owner && (
                                    <p className="mt-0.5 text-[10px] text-[var(--nv-text-muted)]">归属：{i.owner}</p>
                                  )}
                                </div>
                              ))}
                            </>
                          )}
                          {currency.length > 0 && (
                            <>
                              <p className="mt-3 text-[10px] uppercase tracking-wider text-[var(--nv-text-tertiary)]">
                                【货币】
                              </p>
                              {currency.map((i, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-1"
                                >
                                  <span className="text-[var(--nv-accent)]">{i.name}</span>
                                  <span className="ml-2 text-[var(--nv-accent)]">
                                    ×{i.quantity}
                                  </span>
                                  {i.owner && (
                                    <p className="mt-0.5 text-[10px] text-[var(--nv-text-muted)]">归属：{i.owner}</p>
                                  )}
                                </div>
                              ))}
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
            {rightTab === "world" && (
              <div>
                <p className="mb-3 flex items-center gap-1.5 font-medium text-[var(--nv-text-primary)]">
                  <Icon name="globe" size={14} className="text-[var(--nv-creative)]" /> 世界设定
                </p>
                {lorebook.length === 0 && !nodeOutline ? (
                  <EmptyState
                    icon="globe"
                    title="还没有世界设定"
                    description="在 workspace 的世界书与章节大纲中添加设定，将在此实时呈现"
                  />
                ) : (
                  <div className="space-y-3">
                    {nodeOutline && (
                      <div className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] p-3">
                        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--nv-text-tertiary)]">
                          <Icon name="book" size={12} /> 本章大纲
                        </p>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--nv-text-secondary)]">
                          {nodeOutline}
                        </p>
                      </div>
                    )}
                    {lorebook.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--nv-text-tertiary)]">
                          世界书 ({lorebook.length})
                        </p>
                        {lorebook.map((e) => (
                          <div
                            key={e.id}
                            className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] p-3 transition-colors hover:border-[var(--nv-creative-soft)]"
                          >
                            <p className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--nv-text-primary)]">
                              <span className="truncate">{e.title}</span>
                              {e.category && e.category !== "custom" && (
                                <span className="shrink-0 rounded-full bg-[var(--nv-creative-soft)] px-2 py-0.5 text-[10px] text-[var(--nv-creative)]">
                                  {e.category}
                                </span>
                              )}
                            </p>
                            <p className="mt-1.5 line-clamp-4 text-[11px] leading-relaxed text-[var(--nv-text-tertiary)]">
                              {e.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* 右侧底部按钮 */}
          <div className="border-t border-[var(--nv-border-2)] p-3">
            {state.narrative && (
              <button
                onClick={handleEnd}
                disabled={state.status !== "playing"}
                className="btn-creative w-full rounded-lg py-2.5 text-sm font-medium text-[var(--nv-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                结束并导出
              </button>
            )}
          </div>
        </aside>
        {/* 窄屏抽屉遮罩 */}
        {(leftDrawerOpen || rightDrawerOpen) && (
          <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => { setLeftDrawerOpen(false); setRightDrawerOpen(false); }} />
        )}
      </div>

      {/* ═══ 章纲编辑器浮层 ═══ */}
      {showOutlineEditor && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="h-[85vh] max-h-[800px] w-[900px]">
            <GameOutlineEditor
              projectId={projectId}
              nodeId={nodeId}
              chapterTitle={state.chapterTitle}
              currentOutline={nodeOutline}
              onOutlineSaved={(outline) => {
                setNodeOutline(outline);
              }}
              onClose={() => setShowOutlineEditor(false)}
            />
          </div>
        </div>
      )}

      {/* ═══ 底部动作栏 ═══ */}
      {state.status === "playing" && (
        <footer className="relative z-10 border-t border-[var(--nv-border-2)] bg-[var(--nv-abyss)]/80 px-4 py-3 backdrop-blur-sm">
          {/* 快捷动作按钮 */}
          <div className="mx-auto flex max-w-3xl gap-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.type}
                onClick={() => handleAction(action.type, action.label)}
                disabled={state.status !== "playing"}
                title={action.desc}
                className="group flex flex-1 flex-col items-center gap-1 rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-1 py-2.5 text-[var(--nv-text-secondary)] transition-all hover:border-[var(--nv-creative-soft)] hover:bg-[var(--nv-creative-soft)] hover:text-[var(--nv-text-primary)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name={action.icon as IconName} size={16} className="transition-colors group-hover:text-[var(--nv-creative)]" />
                <span className="text-[11px]">{action.label}</span>
              </button>
            ))}
          </div>

          {/* 文本输入框 */}
          <div className="mx-auto mt-3 flex max-w-3xl gap-3">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customInput.trim()) {
                  handleAction("custom", customInput.trim());
                }
              }}
              placeholder="描述你想要的剧情发展，或输入角色的行动..."
              disabled={state.status !== "playing"}
              className="flex-1 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-4 py-2.5 text-sm text-[var(--nv-text-primary)] outline-none transition-colors placeholder:text-[var(--nv-text-muted)] focus:border-[var(--nv-creative-soft)] disabled:cursor-not-allowed disabled:opacity-40"
            />
            <button
              onClick={() => {
                if (customInput.trim()) handleAction("custom", customInput.trim());
              }}
              disabled={state.status !== "playing" || !customInput.trim()}
              className="btn-creative rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--nv-text-primary)] transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              发送
            </button>
            {(state.status as string) === "generating" && (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--nv-danger-soft)] px-4 py-2.5 text-sm font-medium text-[var(--nv-danger)] transition-all hover:bg-[var(--nv-danger)] hover:text-[var(--nv-text-primary)] active:scale-95"
              >
                <Icon name="stop" size={14} /> 停止
              </button>
            )}
          </div>
        </footer>
      )}

      {/* 已结束状态底部 */}
      {state.status === "ended" && (
        <footer className="relative z-10 border-t border-[var(--nv-border-2)] bg-[var(--nv-abyss)]/80 px-6 py-4 text-center backdrop-blur-sm">
          <p className="mb-3 flex items-center justify-center gap-2 text-[var(--nv-success)]">
            <Icon name="check" size={16} /> 章节已导出并保存为正文，返回工作区查看
          </p>
          <button
            onClick={handleBack}
            className="btn-primary rounded-lg px-8 py-2.5 text-sm font-medium text-[var(--nv-text-primary)]"
          >
            返回工作区
          </button>
        </footer>
      )}
    </div>
  );
}
