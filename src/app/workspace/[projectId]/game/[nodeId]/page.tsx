"use client";

/**
 * 游戏模式页面 —— 沉浸式互动文本冒险
 *
 * 路由：/workspace/[projectId]/game/[nodeId]
 * 独立的暗黑沉浸式 UI，与 workspace 主页面分离
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import GameCanvas from "@/components/game/GameCanvas";
import GameParticles from "@/components/game/GameParticles";
import GameOutlineEditor from "@/components/game/GameOutlineEditor";
import type { GameOption, GameEntity, GameItem } from "@/core/game/types";

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

// ─── 快捷动作 ─────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { type: "observe", label: "观察", icon: "🔍", desc: "观察环境/人物" },
  { type: "dialogue", label: "对话", icon: "💬", desc: "与角色交谈" },
  { type: "combat", label: "战斗", icon: "⚔️", desc: "进入战斗" },
  { type: "explore", label: "探索", icon: "🗺️", desc: "探索新区域" },
  { type: "use_item", label: "使用物品", icon: "🎒", desc: "使用背包物品" },
  { type: "rest", label: "休息", icon: "💤", desc: "休息恢复" },
];

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

      // 更新背包
      let updatedItems = [...state.items];
      for (const change of doneData.itemChanges || []) {
        if (change.operation === "gain") {
          const existing = updatedItems.find((i) => i.name === change.name);
          if (existing) {
            existing.quantity += change.quantity || 1;
          } else {
            updatedItems.push({
              name: change.name,
              quantity: change.quantity || 1,
              category: "other",
              source: `第${newRound}轮获得`,
              acquiredRound: newRound,
            });
          }
        } else if (change.operation === "consume") {
          const existing = updatedItems.find((i) => i.name === change.name);
          if (existing) {
            existing.quantity -= change.quantity || 1;
            if (existing.quantity <= 0) {
              updatedItems = updatedItems.filter((i) => i.name !== change.name);
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
      if (err.name !== "AbortError") {
        setState((s) => ({
          ...s,
          status: "playing",
          error: err.message || "行动失败",
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
      <div className="h-screen bg-[#0a0a1a] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🎮</div>
          <p className="text-violet-300 text-lg">正在初始化游戏模式...</p>
        </div>
      </div>
    );
  }

  // ── 就绪/结束状态 ───────────────────────────────────────
  const showStartScreen =
    state.status === "ready" || (state.status === "ended" && !state.narrative);

  return (
    <div className="h-screen bg-[#0a0a1a] text-gray-200 flex flex-col overflow-hidden font-sans">
      <GameParticles />

      {/* ═══ 顶栏 ═══ */}
      <header className="relative z-10 flex items-center justify-between px-6 py-3 border-b border-violet-900/40 bg-[#0d0d24]/90 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="text-gray-400 hover:text-white transition-colors text-lg"
            title="返回工作区"
          >
            ←
          </button>
          <div>
            <h1 className="text-base font-semibold text-violet-200">
              🎮 游戏模式 — {state.bookName}
            </h1>
            <p className="text-xs text-gray-500">
              第{state.currentRound || "?"}轮 · {state.chapterTitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <button
            onClick={() => setShowOutlineEditor(!showOutlineEditor)}
            className={`px-3 py-1 rounded-md text-xs border transition-all ${
              showOutlineEditor
                ? "bg-cyan-900/30 border-cyan-600/50 text-cyan-300"
                : "border-violet-800/30 text-gray-500 hover:text-gray-300 hover:border-violet-600/40"
            }`}
          >
            📋 章纲
          </button>
          <span>轮次 {state.currentRound}</span>
          <span>字数 {state.totalWords}</span>
          {state.status === "playing" && (
            <button
              onClick={handleEnd}
              className="px-4 py-1.5 bg-violet-600/80 hover:bg-violet-500 text-white rounded-md text-sm transition-all"
            >
              结束并导出
            </button>
          )}
        </div>
      </header>

      {/* ═══ 主体三栏 ═══ */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* 左侧栏 */}
        <aside className="w-52 border-r border-violet-900/30 bg-[#0d0d24]/60 flex flex-col shrink-0">
          <div className="flex border-b border-violet-900/20">
            {(["plot", "characters", "factions"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setLeftTab(tab)}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                  leftTab === tab
                    ? "text-violet-300 border-b-2 border-violet-500 bg-violet-900/20"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {{ plot: "📖 情节", characters: "👤 角色", factions: "🏛️ 势力" }[tab]}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3 text-xs text-gray-400">
            {leftTab === "plot" && (
              <div>
                <p className="text-violet-300 font-medium mb-2">情节进度</p>
                <div className="w-full h-2 bg-gray-800 rounded-full mb-2">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-700"
                    style={{ width: `${state.plotProgress}%` }}
                  />
                </div>
                <p className="text-right text-violet-400">{state.plotProgress}%</p>
                {turns.length === 0 && (
                  <p className="mt-4 text-gray-600 italic">暂无情节点数据</p>
                )}
                {turns.map((t) => (
                  <div key={t.round} className="mt-2 py-1.5 px-2 bg-violet-900/10 rounded border border-violet-900/20">
                    <p className="text-violet-400">第{t.round}轮</p>
                    <p className="text-gray-500 mt-0.5 line-clamp-2">{t.playerAction}</p>
                  </div>
                ))}
              </div>
            )}
            {leftTab === "characters" && (
              <div>
                <p className="text-violet-300 font-medium mb-2">本章角色</p>
                {state.entities.filter((e) => e.type === "角色").length === 0 && (
                  <p className="text-gray-600 italic">暂无角色数据</p>
                )}
                {state.entities
                  .filter((e) => e.type === "角色")
                  .map((e) => (
                    <div
                      key={e.name}
                      className="mt-2 py-1.5 px-2 bg-violet-900/10 rounded border border-violet-900/20"
                    >
                      <p className="text-violet-300">{e.name}</p>
                      <p className="text-gray-600 text-xs mt-0.5">{e.description}</p>
                    </div>
                  ))}
              </div>
            )}
            {leftTab === "factions" && (
              <div>
                <p className="text-violet-300 font-medium mb-2">涉及势力</p>
                {state.entities.filter((e) => e.type === "势力").length === 0 && (
                  <p className="text-gray-600 italic">暂无势力数据</p>
                )}
                {state.entities
                  .filter((e) => e.type === "势力")
                  .map((e) => (
                    <div
                      key={e.name}
                      className="mt-2 py-1.5 px-2 bg-violet-900/10 rounded border border-violet-900/20"
                    >
                      <p className="text-violet-300">{e.name}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>
          {/* 左侧底部控制 */}
          <div className="p-3 border-t border-violet-900/20 space-y-2">
            <button
              onClick={() => {
                // 回退：移除最后一轮
                if (turns.length > 1) {
                  const newTurns = turns.slice(0, -1);
                  setTurns(newTurns);
                  const newNarrative = newTurns.map((t) => t.narrative).join("\n\n");
                  setState((s) => ({
                    ...s,
                    narrative: newNarrative,
                    currentRound: newTurns.length,
                    options: [],
                  }));
                }
              }}
              disabled={turns.length <= 1}
              className="w-full py-1.5 text-xs bg-gray-800/50 hover:bg-gray-700/50 text-gray-400 rounded disabled:opacity-30 transition-colors"
            >
              回退
            </button>
            <button
              onClick={() => handleAction("custom", "自动推进剧情")}
              disabled={state.status !== "playing"}
              className="w-full py-1.5 text-xs bg-gray-800/50 hover:bg-gray-700/50 text-gray-400 rounded disabled:opacity-30 transition-colors"
            >
              自动推进
            </button>
          </div>
        </aside>

        {/* 主画布 */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {showStartScreen ? (
            /* 开始界面 */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-6">🎮</div>
                <h2 className="text-2xl font-bold text-violet-300 mb-2">
                  游戏模式已就绪
                </h2>
                <p className="text-gray-500 mb-2">
                  章节：{state.chapterTitle}
                </p>
                <p className="text-gray-600 text-sm mb-8">
                  AI 将以互动方式与你共同创作本章正文
                </p>
                <button
                  onClick={handleStart}
                  className="px-10 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-lg font-medium transition-all hover:shadow-lg hover:shadow-violet-900/40 active:scale-95"
                >
                  开始游戏
                </button>
                {state.status === "ended" && (
                  <div className="mt-4">
                    <button
                      onClick={handleBack}
                      className="px-6 py-2 border border-violet-500/50 text-violet-300 rounded-lg hover:bg-violet-900/20 transition-all"
                    >
                      返回工作区查看正文
                    </button>
                  </div>
                )}
                {state.error && (
                  <p className="mt-4 text-red-400 text-sm">{state.error}</p>
                )}
              </div>
            </div>
          ) : (
            /* 游戏进行中 */
            <>
              <div className="flex-1 overflow-y-auto p-6">
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
                  <div className="grid grid-cols-2 gap-3 max-w-3xl mx-auto">
                    {state.options.map((opt) => (
                      <button
                        key={opt.index}
                        onClick={() =>
                          handleAction("option", `选择：${opt.text}`, opt.index)
                        }
                        className="text-left px-4 py-3 bg-violet-900/20 hover:bg-violet-900/40 border border-violet-700/30 hover:border-violet-500/50 rounded-lg text-sm text-gray-300 hover:text-white transition-all group"
                      >
                        <span className="text-violet-400 mr-2 font-mono">
                          {opt.index}.
                        </span>
                        {opt.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* 右侧信息面板 */}
        <aside className="w-64 border-l border-violet-900/30 bg-[#0d0d24]/60 flex flex-col shrink-0">
          <div className="flex border-b border-violet-900/20">
            {(["text", "backpack", "world"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                  rightTab === tab
                    ? "text-violet-300 border-b-2 border-violet-500 bg-violet-900/20"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {{ text: "正文", backpack: "🎒 背包", world: "🌍 世界" }[tab]}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3 text-xs text-gray-400">
            {rightTab === "text" && (
              <div>
                <p className="text-violet-300 font-medium mb-2">正文进度</p>
                <div className="w-full h-2 bg-gray-800 rounded-full mb-2">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, (state.totalWords / 3000) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-right text-gray-500">
                  总字数：{state.totalWords}
                </p>
                <div className="mt-4 max-h-[calc(100vh-280px)] overflow-y-auto">
                  <div className="text-gray-400 whitespace-pre-wrap leading-relaxed opacity-80 text-xs">
                    {state.narrative || "正文将在游戏互动过程中实时生成..."}
                  </div>
                </div>
              </div>
            )}
            {rightTab === "backpack" && (
              <div>
                <p className="text-violet-300 font-medium mb-3">当前背包</p>
                {state.items.length === 0 ? (
                  <p className="text-gray-600 italic">
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
                              <p className="text-gray-500 text-[10px] uppercase tracking-wider">
                                【消耗品】
                              </p>
                              {consumables.map((i, idx) => (
                                <div
                                  key={idx}
                                  className="py-1 px-2 bg-violet-900/10 rounded border border-violet-900/20"
                                >
                                  <span className="text-gray-300">{i.name}</span>
                                  <span className="text-violet-400 ml-2">
                                    ×{i.quantity}
                                  </span>
                                  <p className="text-gray-600 text-[10px] mt-0.5">
                                    {i.source}
                                  </p>
                                </div>
                              ))}
                            </>
                          )}
                          {equipment.length > 0 && (
                            <>
                              <p className="text-gray-500 text-[10px] uppercase tracking-wider mt-3">
                                【装备】
                              </p>
                              {equipment.map((i, idx) => (
                                <div
                                  key={idx}
                                  className="py-1 px-2 bg-violet-900/10 rounded border border-violet-900/20"
                                >
                                  <span className="text-gray-300">{i.name}</span>
                                  <span className="text-green-400 ml-2">
                                    ×{i.quantity}
                                  </span>
                                </div>
                              ))}
                            </>
                          )}
                          {questItems.length > 0 && (
                            <>
                              <p className="text-gray-500 text-[10px] uppercase tracking-wider mt-3">
                                【任务道具】
                              </p>
                              {questItems.map((i, idx) => (
                                <div
                                  key={idx}
                                  className="py-1 px-2 bg-violet-900/10 rounded border border-violet-900/20"
                                >
                                  <span className="text-amber-300">{i.name}</span>
                                </div>
                              ))}
                            </>
                          )}
                          {currency.length > 0 && (
                            <>
                              <p className="text-gray-500 text-[10px] uppercase tracking-wider mt-3">
                                【货币】
                              </p>
                              {currency.map((i, idx) => (
                                <div
                                  key={idx}
                                  className="py-1 px-2 bg-violet-900/10 rounded border border-violet-900/20"
                                >
                                  <span className="text-yellow-400">{i.name}</span>
                                  <span className="text-yellow-500 ml-2">
                                    ×{i.quantity}
                                  </span>
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
                <p className="text-violet-300 font-medium mb-2">世界观</p>
                <p className="text-gray-600 italic">当前场景信息</p>
                {/* 这里可以扩展显示世界设定 */}
              </div>
            )}
          </div>
          {/* 右侧底部按钮 */}
          <div className="p-3 border-t border-violet-900/20">
            {state.narrative && (
              <button
                onClick={handleEnd}
                disabled={state.status !== "playing"}
                className="w-full py-2.5 bg-violet-600/80 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                结束并导出
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* ═══ 章纲编辑器浮层 ═══ */}
      {showOutlineEditor && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[900px] h-[85vh] max-h-[800px]">
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
        <footer className="relative z-10 border-t border-violet-900/40 bg-[#0d0d24]/90 backdrop-blur-sm px-4 py-3">
          {/* 快捷动作按钮 */}
          <div className="flex gap-2 mb-3 max-w-3xl mx-auto">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.type}
                onClick={() =>
                  handleAction(action.type, action.label)
                }
                disabled={state.status !== "playing"}
                className="flex-1 py-2 px-1 bg-violet-900/20 hover:bg-violet-900/40 border border-violet-800/30 hover:border-violet-600/50 rounded-lg text-xs text-gray-300 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                title={action.desc}
              >
                <div className="text-base mb-0.5">{action.icon}</div>
                <div>{action.label}</div>
              </button>
            ))}
          </div>

          {/* 文本输入框 */}
          <div className="flex gap-3 max-w-3xl mx-auto">
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
              className="flex-1 bg-gray-900/60 border border-violet-800/40 focus:border-violet-500/60 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors disabled:opacity-40"
            />
            <button
              onClick={() => {
                if (customInput.trim()) handleAction("custom", customInput.trim());
              }}
              disabled={state.status !== "playing" || !customInput.trim()}
              className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              ✏️ 发送
            </button>
            {(state.status as string) === "generating" && (
              <button
                onClick={handleStop}
                className="px-4 py-2.5 bg-red-800/60 hover:bg-red-700/60 text-red-200 rounded-lg text-sm transition-all"
              >
                ⏹ 停止
              </button>
            )}
          </div>
        </footer>
      )}

      {/* 已结束状态底部 */}
      {state.status === "ended" && (
        <footer className="relative z-10 border-t border-violet-900/40 bg-[#0d0d24]/90 backdrop-blur-sm px-6 py-4 text-center">
          <p className="text-green-400 mb-3">
            ✅ 章节已导出并保存为正文，返回工作区查看
          </p>
          <button
            onClick={handleBack}
            className="px-8 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-all"
          >
            ← 返回工作区
          </button>
        </footer>
      )}
    </div>
  );
}
