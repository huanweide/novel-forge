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

import { useState, useEffect, useCallback, useRef, useId } from "react";
import { useParams, useRouter } from "next/navigation";
import GameCanvas from "@/components/game/GameCanvas";
import GameParticles, { type GameParticlesHandle } from "@/components/game/GameParticles";
import GameOutlineEditor from "@/components/game/GameOutlineEditor";
import { PointerGlow } from "@/components/game/PointerGlow";
import { Icon, type IconName } from "@/components/ui/icons";
import { EmptyState, LoadingDots } from "@/components/ui/States";
import { Modal } from "@/components/ui/Modal";
import { toastInfo } from "@/components/ui/toast";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import type { GameOption, GameEntity, GameItem } from "@/core/game/types";
import { reconcileFromSummary, applyFrontendItemChanges } from "@/core/game/reconcile";

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
  exportStatus: string | null;   // 导出轻确认结果（v0.46.94+）：confirmed / drafting
  exportQuality: number | null;  // 导出时质量分（确认看板可见）
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
    exportStatus: null,
    exportQuality: null,
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
  // 无障碍：窄屏模态抽屉的焦点陷阱（仅抽屉打开时激活，桌面常驻侧栏不受影响）
  const leftDrawerRef = useRef<HTMLElement>(null);
  const rightDrawerRef = useRef<HTMLElement>(null);
  const leftDrawerTitleId = useId();
  const rightDrawerTitleId = useId();
  useFocusTrap(leftDrawerRef, leftDrawerOpen, () => setLeftDrawerOpen(false));
  useFocusTrap(rightDrawerRef, rightDrawerOpen, () => setRightDrawerOpen(false));
  const streamRef = useRef<AbortController | null>(null);

  // ── v0.46.78 新增：自动推进 / 检测粒子 / 构思开头 ──
  const [autoAdvance, setAutoAdvance] = useState(false);
  const autoAdvanceRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef(state.status);
  const particlesRef = useRef<GameParticlesHandle>(null);
  const discoveryIdRef = useRef(0);
  const [discoveries, setDiscoveries] = useState<Array<{ id: number; label: string; color: string }>>([]);
  const [concept, setConcept] = useState<string | null>(null);
  const [conceptLoading, setConceptLoading] = useState(false);
  const [conceptError, setConceptError] = useState<string | null>(null);

  // ── 游戏模式多风格视觉（A 任务）：三模式 + 降噪/停动，localStorage 记忆 ──
  type GameTheme = "night" | "twilight" | "day";
  const [gameTheme, setGameTheme] = useState<GameTheme>(() => {
    try {
      const v = localStorage.getItem("nf-game-theme");
      return v === "night" || v === "twilight" || v === "day" ? v : "night";
    } catch { return "night"; }
  });
  const [denoise, setDenoise] = useState(() => {
    try { return localStorage.getItem("nf-game-denoise") === "1"; } catch { return false; }
  });
  const [paused, setPaused] = useState(() => {
    try { return localStorage.getItem("nf-game-paused") === "1"; } catch { return false; }
  });

  // ── 物品检测（C 任务）：新物品高亮集合 + 交易检测 + 音频 ──
  const [newItemKeys, setNewItemKeys] = useState<Set<string>>(new Set());
  const newItemKeysRef = useRef<Set<string>>(new Set());
  const [trades, setTrades] = useState<Array<{ id: number; label: string }>>([]);
  const tradeIdRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // 背包分类：全部物品 / 角色物品（按 owner 区分）
  const [backpackFilter, setBackpackFilter] = useState<"all" | "char">("all");

  // 物品获得提示音（WebAudio，首次用户手势后可用）
  const playItemChime = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AC();
      }
      const ac = audioCtxRef.current;
      if (ac.state === "suspended") void ac.resume();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(740, ac.currentTime);
      o.frequency.exponentialRampToValueAtTime(1180, ac.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.16, ac.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.34);
      o.connect(g);
      g.connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 0.36);
    } catch {
      /* 静默：部分浏览器禁用音频时不影响游戏 */
    }
  }, []);

  // 检测本轮新获得的物品（按 name|owner 二元组），触发辉光/声音/平移/提示
  const flagNewItems = useCallback(
    (prevItems: GameItem[], nextItems: GameItem[]) => {
      const prevKeys = new Set(prevItems.map((i) => `${i.name}|${i.owner || "主角"}`));
      const added = nextItems.filter((i) => !prevKeys.has(`${i.name}|${i.owner || "主角"}`));
      if (added.length === 0) return;
      playItemChime();
      const GLOW: Record<string, string> = {
        night: "167,139,250",
        twilight: "45,212,191",
        day: "99,102,241",
      };
      for (const it of added) {
        const key = `${it.name}|${it.owner || "主角"}`;
        const color = `rgb(${GLOW[gameTheme] ?? "167,139,250"})`;
        particlesRef.current?.emitBurst({ color, count: 14 });
        const id = ++discoveryIdRef.current;
        setDiscoveries((prev) => [...prev, { id, label: `获得物品·${it.name}`, color }]);
        setTimeout(() => setDiscoveries((prev) => prev.filter((d) => d.id !== id)), 3000);
        // 高亮 + 「新」徽章（背包内），2.6s 后淡出
        newItemKeysRef.current = new Set(newItemKeysRef.current).add(key);
        setNewItemKeys(new Set(newItemKeysRef.current));
        setTimeout(() => {
          newItemKeysRef.current = new Set([...newItemKeysRef.current].filter((k) => k !== key));
          setNewItemKeys(new Set(newItemKeysRef.current));
        }, 2600);
      }
      // 平移至右侧物品栏：自动切到背包页展示滑入动效
      setRightTab("backpack");
    },
    [playItemChime, gameTheme],
  );

  // 检测文本中的交易/买卖元素，分类提示
  const flagTrades = useCallback((text: string) => {
    if (!text) return;
    const kws = ["交易", "买卖", "购买", "出售", "贩卖", "收购", "卖出", "买入", "摆摊", "集市", "商铺", "钱庄", "典当", "金币", "银两", "铜钱", "议价", "成交"];
    const hit = kws.find((k) => text.includes(k));
    if (!hit) return;
    const id = ++tradeIdRef.current;
    setTrades((prev) => [...prev, { id, label: `交易·${hit}` }]);
    setTimeout(() => setTrades((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  // 同步最新 status 给 setTimeout 回调读取（避免自动推进闭包读到旧值）
  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);

  // 卸载时清理自动推进定时器
  useEffect(() => {
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, []);

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
  // 检测新实体时：触发粒子爆发 + 顶部「发现」提示
  const fireDiscoveries = (list: Array<{ name: string; type?: string; color?: string }> | undefined) => {
    if (!list || list.length === 0) return;
    for (const ne of list) {
      const color = ne.color || "#a78bfa";
      particlesRef.current?.emitBurst({ color });
      const id = ++discoveryIdRef.current;
      const typeLabel = ne.type === "角色" ? "角色" : ne.type === "势力" ? "势力" : ne.type === "物品" ? "物品" : ne.type === "地点" ? "地点" : "实体";
      const label = `${typeLabel}·${ne.name}`;
      setDiscoveries((prev) => [...prev, { id, label, color }]);
      setTimeout(() => {
        setDiscoveries((prev) => prev.filter((d) => d.id !== id));
      }, 3000);
    }
  };

  // 构思开头：调用后端生成开场构思
  const handleConcept = async () => {
    setConceptLoading(true);
    setConceptError(null);
    try {
      const res = await fetch("/api/game/concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, nodeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "构思失败");
      setConcept(data.concept);
    } catch (err: any) {
      setConceptError(err.message || "构思失败");
    } finally {
      setConceptLoading(false);
    }
  };

  const handleStart = async (conceptText?: string) => {
    setState((s) => ({ ...s, status: "generating", error: null }));
    try {
      const res = await fetch("/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, nodeId, concept: conceptText || null }),
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
        items: data.items ?? [],
      }));

      setTurns([
        { round: 1, playerAction: "开始游戏", narrative: data.narrative },
      ]);

      // 开场即检测到的实体也来一波粒子
      fireDiscoveries(data.newEntities);
      // 开场即获得的物品：高亮 + 声音 + 平移背包；正文里的交易元素分类提示
      flagNewItems([], data.items ?? []);
      flagTrades(data.narrative);
      setConcept(null);
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

      // 更新背包：纯函数不可变更新（阿游 P1-1，避免原地改写 state.items 内部对象破坏 React 不可变更新）
      const updatedItems = applyFrontendItemChanges(
        state.items,
        doneData.itemChanges || [],
        newRound
      );

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

      // 检测本回合新实体：粒子爆发 + 发现提示
      fireDiscoveries(doneData.newEntities);
      // 本回合新物品：高亮 + 声音 + 平移背包；交易元素分类提示
      flagNewItems(state.items, updatedItems);
      flagTrades(doneData.narrative);

      // 自动推进：开启时，本轮结束后延迟触发下一轮「自动推进剧情」
      if (autoAdvanceRef.current) {
        if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
        autoTimerRef.current = setTimeout(() => {
          if (autoAdvanceRef.current && statusRef.current === "playing" && state.sessionId) {
            handleAction("custom", "自动推进剧情");
          }
        }, 1400);
      }

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
  // abort 后等待后端权威态对账回拉（GET /api/game/state）覆盖前端，确保读到 abort 后的正确快照，
  // 再解锁为 playing，避免用户在对账在途时抢发行动放大竞态（阿游 P0-1 前端侧）。
  const handleStop = async () => {
    streamRef.current?.abort();
    // 停止生成即暂停自动推进循环
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoAdvanceRef.current = false;
    setAutoAdvance(false);
    await reconcileWithBackend();
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
        exportStatus: data.status ?? null,
        exportQuality: data.qualityScore ?? null,
      }));
      // IMP-003：游戏导出触发自动回填设定库时，给出明确提示，避免静默改动世界观设定
      if (data.autoFilled) {
        toastInfo("游戏导出已自动回填设定库（可在创意工坊查看/修订）");
      }
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
    <div
      data-game-theme={gameTheme}
      className="game-root flex h-screen flex-col overflow-hidden font-sans text-[var(--nv-text-secondary)]"
    >
      <GameParticles ref={particlesRef} theme={gameTheme} denoise={denoise} paused={paused} />

      {/* 顶部进度条：开场 / 每轮生成 / 导出时显示（v0.46.78） */}
      {(state.status === "generating" || state.status === "ending") && (
        <div className="fixed left-0 right-0 top-0 z-[60] h-1 bg-[var(--nv-surface-2)]">
          <div className="nf-progress-indeterminate h-full w-1/3 rounded-r bg-gradient-to-r from-[var(--nv-creative)] to-[var(--nv-accent)]" />
        </div>
      )}

      {/* 导出覆盖层：收束并写入正文时（v0.46.78） */}
      {state.status === "ending" && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--nv-void)]/70 backdrop-blur-sm">
          <div className="surface-floating flex flex-col items-center gap-4 rounded-2xl px-12 py-14">
            <Icon name="loader" size={36} className="animate-spin text-[var(--nv-creative)]" />
            <p className="text-base text-[var(--nv-text-secondary)]">正在收束并导出本章正文…</p>
            <div className="h-1 w-48 overflow-hidden rounded bg-[var(--nv-surface-2)]">
              <div className="nf-progress-indeterminate h-full w-1/3 rounded bg-[var(--nv-creative)]" />
            </div>
          </div>
        </div>
      )}

      {/* 检测发现提示层（v0.46.78） */}
      {discoveries.length > 0 && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
          {discoveries.map((d) => (
            <div
              key={d.id}
              className="nf-discovery-pill flex items-center gap-1.5 rounded-full border bg-[var(--nv-surface-1)]/90 px-3 py-1 text-xs font-medium shadow-lg backdrop-blur-sm"
              style={{ borderColor: d.color, color: d.color }}
            >
              <Icon name="sparkles" size={12} />
              发现：{d.label}
            </div>
          ))}
        </div>
      )}
      {/* 交易/买卖检测提示（C 任务） */}
      {trades.length > 0 && (
        <div className="pointer-events-none fixed left-1/2 top-32 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
          {trades.map((t) => (
            <div
              key={t.id}
              className="trade-pill flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shadow-lg"
            >
              <Icon name="coins" size={12} />
              {t.label}
            </div>
          ))}
        </div>
      )}

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
          labelledBy="game-tutorial-title"
        >
          <div className="p-6">
            <div className="mb-3 flex items-center gap-2">
              <Icon name="gamepad" size={22} className="text-[var(--nv-creative)]" />
              <h2 id="game-tutorial-title" className="text-lg font-bold text-[var(--nv-text-primary)]">游戏模式 · 跑团式互动创作</h2>
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
      <header className="relative z-10 flex items-center justify-between border-b border-[var(--nv-border-2)] bg-[var(--nv-abyss)]/80 px-6 py-3 backdrop-blur-sm" inert={leftDrawerOpen || rightDrawerOpen}>
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
              <Icon name="gamepad" size={18} className="nv-text-glow text-[var(--nv-creative)]" />
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
              className="nv-glow-strong btn-creative rounded-lg px-4 py-1.5 text-sm font-medium text-[var(--nv-text-primary)]"
            >
              结束并导出
            </button>
          )}
          {/* 游戏模式视觉：三模式切换 + 降噪/停动（A 任务） */}
          <div className="hidden items-center gap-1.5 md:flex">
            <div className="flex items-center gap-0.5 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] p-0.5">
              {([
                { k: "twilight", icon: "cloud", label: "苍青" },
                { k: "day", icon: "sun", label: "白昼" },
                { k: "night", icon: "moon", label: "黑夜" },
              ] as const).map(({ k, icon, label }) => (
                <button
                  key={k}
                  onClick={() => { setGameTheme(k); try { localStorage.setItem("nf-game-theme", k); } catch { /* ignore */ } }}
                  title={`${label}模式`}
                  aria-label={`${label}模式`}
                  className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
                    gameTheme === k
                      ? "bg-[var(--nv-creative)] text-[var(--nv-text-primary)]"
                      : "text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]"
                  }`}
                >
                  <Icon name={icon} size={14} />
                </button>
              ))}
            </div>
            <button
              onClick={() => { const n = !denoise; setDenoise(n); try { localStorage.setItem("nf-game-denoise", n ? "1" : "0"); } catch { /* ignore */ } }}
              title={denoise ? "降噪：已开启（粒子已压缩）" : "降噪：关闭"}
              aria-label="降噪开关"
              className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${
                denoise ? "border-[var(--nv-creative)] text-[var(--nv-creative)]" : "border-[var(--nv-border-2)] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]"
              }`}
            >
              <Icon name="sliders" size={14} />
            </button>
            <button
              onClick={() => { const n = !paused; setPaused(n); try { localStorage.setItem("nf-game-paused", n ? "1" : "0"); } catch { /* ignore */ } }}
              title={paused ? "粒子已停动（点击恢复）" : "停动粒子（点击冻结）"}
              aria-label="停动开关"
              className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${
                paused ? "border-[var(--nv-creative)] text-[var(--nv-creative)]" : "border-[var(--nv-border-2)] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]"
              }`}
            >
              <Icon name={paused ? "play" : "pause"} size={14} />
            </button>
          </div>
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
        <aside
          ref={leftDrawerRef}
          tabIndex={-1}
          role={leftDrawerOpen ? "dialog" : undefined}
          aria-modal={leftDrawerOpen ? "true" : undefined}
          aria-labelledby={leftDrawerOpen ? leftDrawerTitleId : undefined}
          className={`flex w-52 shrink-0 flex-col border-r border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] fixed inset-y-0 left-0 z-40 max-w-[85vw] h-full transition-transform duration-200 ${leftDrawerOpen ? "translate-x-0" : "-translate-x-full"} lg:static lg:z-auto lg:h-auto lg:shrink-0 lg:w-52 lg:translate-x-0 lg:transition-none`}
        >
          <h2 id={leftDrawerTitleId} className="sr-only">游戏侧栏</h2>
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
              onClick={() => {
                const next = !autoAdvance;
                setAutoAdvance(next);
                autoAdvanceRef.current = next;
                if (!next && autoTimerRef.current) clearTimeout(autoTimerRef.current);
              }}
              disabled={state.status !== "playing"}
              className={`w-full rounded-lg border py-1.5 text-xs font-medium transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 ${
                autoAdvance
                  ? "border-[var(--nv-creative)] bg-[var(--nv-creative-soft)] text-[var(--nv-creative)]"
                  : "border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] text-[var(--nv-text-secondary)] hover:border-[var(--nv-border-3)] hover:text-[var(--nv-text-primary)]"
              }`}
              title="开启后每轮结束自动推进剧情；点停止生成即暂停"
            >
              {autoAdvance ? "● 自动推进中" : "自动推进"}
            </button>
          </div>
        </aside>

        {/* 主画布 */}
        <main className="flex flex-1 flex-col overflow-hidden" inert={leftDrawerOpen || rightDrawerOpen}>
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
                <div className="flex flex-col items-center gap-3">
                  <button
                    onClick={() => handleStart()}
                    className="nv-glow-strong btn-creative rounded-xl px-10 py-3 text-lg font-medium text-[var(--nv-text-primary)] shadow-[var(--shadow-glow-creative)] transition-all active:scale-95"
                  >
                    开始游戏
                  </button>
                  {state.status === "ready" && (
                    <button
                      onClick={handleConcept}
                      disabled={conceptLoading}
                      className="flex items-center gap-1.5 rounded-xl border border-[var(--nv-border-2)] px-6 py-2 text-sm font-medium text-[var(--nv-text-secondary)] transition-all hover:border-[var(--nv-creative)] hover:text-[var(--nv-creative)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon name="lightbulb" size={14} />
                      {conceptLoading ? "构思中…" : "构思开头"}
                    </button>
                  )}
                </div>

                {/* 构思结果卡片 */}
                {concept && (
                  <div className="mt-6 w-full max-w-md rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4 text-left">
                    <p className="mb-1.5 text-xs font-medium text-[var(--nv-text-primary)]">AI 构思的开场</p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--nv-text-secondary)]">{concept}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => handleStart(concept)}
                        className="rounded-lg bg-[var(--nv-creative)] px-4 py-1.5 text-xs font-medium text-[var(--nv-text-primary)] transition-all hover:brightness-110 active:scale-95"
                      >
                        采用此构思开场
                      </button>
                      <button
                        onClick={handleConcept}
                        disabled={conceptLoading}
                        className="rounded-lg border border-[var(--nv-border-2)] px-4 py-1.5 text-xs font-medium text-[var(--nv-text-secondary)] transition-all hover:border-[var(--nv-border-3)] hover:text-[var(--nv-text-primary)] active:scale-95 disabled:opacity-50"
                      >
                        重新构思
                      </button>
                      <button
                        onClick={() => { setConcept(null); handleStart(); }}
                        className="rounded-lg border border-[var(--nv-border-2)] px-4 py-1.5 text-xs font-medium text-[var(--nv-text-secondary)] transition-all hover:border-[var(--nv-border-3)] hover:text-[var(--nv-text-primary)] active:scale-95"
                      >
                        不用，直接开始
                      </button>
                    </div>
                  </div>
                )}
                {conceptError && (
                  <p className="mt-3 text-sm text-[var(--nv-danger)]">{conceptError}</p>
                )}
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
                    <PointerGlow key={opt.index} className="rounded-xl">
                      <button
                        key={opt.index}
                        onClick={() =>
                          handleAction("option", `选择：${opt.text}`, opt.index)
                        }
                        className="group flex w-full items-start gap-2 rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-4 py-3 text-left text-sm text-[var(--nv-text-secondary)] transition-all hover:border-[var(--nv-creative-soft)] hover:bg-[var(--nv-creative-soft)] hover:text-[var(--nv-text-primary)] active:scale-[0.98]"
                      >
                        <span className="font-mono text-[var(--nv-creative)]">
                          {opt.index}.
                        </span>
                        <span>{opt.text}</span>
                      </button>
                    </PointerGlow>
                  ))}
                </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* 右侧信息面板 */}
        <aside
          ref={rightDrawerRef}
          tabIndex={-1}
          role={rightDrawerOpen ? "dialog" : undefined}
          aria-modal={rightDrawerOpen ? "true" : undefined}
          aria-labelledby={rightDrawerOpen ? rightDrawerTitleId : undefined}
          className={`flex w-64 shrink-0 flex-col border-l border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] fixed inset-y-0 right-0 z-40 max-w-[85vw] h-full transition-transform duration-200 ${rightDrawerOpen ? "translate-x-0" : "translate-x-full"} lg:static lg:z-auto lg:h-auto lg:shrink-0 lg:w-64 lg:translate-x-0 lg:transition-none`}
        >
          <h2 id={rightDrawerTitleId} className="sr-only">游戏信息面板</h2>
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
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 font-medium text-[var(--nv-text-primary)]">
                    <Icon name="backpack" size={14} className="text-[var(--nv-creative)]" /> 当前背包
                  </p>
                  {/* 全部物品 / 角色物品 两类切换（C 任务） */}
                  <div className="flex items-center gap-0.5 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] p-0.5">
                    {([
                      { k: "all", label: "全部" },
                      { k: "char", label: "角色物品" },
                    ] as const).map(({ k, label }) => (
                      <button
                        key={k}
                        onClick={() => setBackpackFilter(k)}
                        className={`rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                          backpackFilter === k
                            ? "bg-[var(--nv-creative)] text-[var(--nv-text-primary)]"
                            : "text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {(() => {
                  const visibleItems =
                    backpackFilter === "char"
                      ? state.items.filter((i) => i.owner && i.owner !== "主角")
                      : state.items;
                  // 新获得物品高亮 + 「新」徽章（滑入背包时显现）
                  const itemCls = (i: GameItem) =>
                    newItemKeys.has(`${i.name}|${i.owner || "主角"}`) ? "item-detected relative" : "";
                  return visibleItems.length === 0 ? (
                    <p className="italic text-[var(--nv-text-muted)]">
                      {backpackFilter === "char" ? "暂无归属角色的物品" : "背包空空如也，在冒险中获取物品吧"}
                    </p>
                  ) : (
                  <div className="space-y-2">
                    {(() => {
                      const consumables = visibleItems.filter(
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
                                  className={`rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-1 ${itemCls(i)}`}
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
                                  className={`rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-1 ${itemCls(i)}`}
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
                                  className={`rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-1 ${itemCls(i)}`}
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
                                  className={`rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-1 ${itemCls(i)}`}
                                >
                                  <span className="text-accent-label">{i.name}</span>
                                  <span className="ml-2 text-accent-label">
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
                ); })()}
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
                className="nv-glow-strong btn-creative w-full rounded-lg py-2.5 text-sm font-medium text-[var(--nv-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                结束并导出
              </button>
            )}
          </div>
        </aside>
        {/* 窄屏抽屉遮罩 */}
        {(leftDrawerOpen || rightDrawerOpen) && (
          <div aria-hidden="true" className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => { setLeftDrawerOpen(false); setRightDrawerOpen(false); }} />
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
              <PointerGlow key={action.type} className="flex-1 rounded-xl">
                <button
                  key={action.type}
                  onClick={() => handleAction(action.type, action.label)}
                  disabled={state.status !== "playing"}
                  title={action.desc}
                  className="group flex w-full flex-col items-center gap-1 rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-1 py-2.5 text-[var(--nv-text-secondary)] transition-all hover:border-[var(--nv-creative-soft)] hover:bg-[var(--nv-creative-soft)] hover:text-[var(--nv-text-primary)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon name={action.icon as IconName} size={16} className="transition-colors group-hover:text-[var(--nv-creative)]" />
                  <span className="text-[11px]">{action.label}</span>
                </button>
              </PointerGlow>
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
              className="nv-glow-strong btn-creative rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--nv-text-primary)] transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
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
          {state.exportStatus === "confirmed" ? (
            <p className="mb-3 flex items-center justify-center gap-2 text-[var(--nv-success)]">
              <Icon name="check" size={16} />
              章节已导出并自动定稿{state.exportQuality != null ? `（质量分 ${state.exportQuality}）` : ""}，返回工作区查看
            </p>
          ) : state.exportStatus === "drafting" ? (
            <p className="mb-3 flex items-center justify-center gap-2 text-accent-label">
              <Icon name="alert" size={16} />
              章节已导出，待你手动确认（智能审阅关闭或质量未达标），返回工作区处理
            </p>
          ) : (
            <p className="mb-3 flex items-center justify-center gap-2 text-[var(--nv-success)]">
              <Icon name="check" size={16} /> 章节已导出并保存为正文，返回工作区查看
            </p>
          )}
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
