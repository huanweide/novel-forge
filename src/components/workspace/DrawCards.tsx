"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { ErrorState } from "@/components/ui/States";

// ─── 章纲人话渲染（v0.46.57：去掉 C| R| L0| 等彩色代码标签，按自然语言小节分区展示） ───

const OUTLINE_SECTIONS = [
  { key: "【场景】", label: "场景" },
  { key: "【事件】", label: "事件" },
  { key: "【人物】", label: "人物" },
  { key: "【悬念/钩子】", label: "悬念/钩子" },
  { key: "【伏笔】", label: "未收尾线索" },
  { key: "【情绪】", label: "情绪" },
];

function OutlinePreview({ text }: { text: string }) {
  const lines = text.split("\n");
  const hasSections = text.includes("【场景】") || text.includes("【悬念") || text.includes("【事件】");

  // 新格式：按六小节分组渲染
  if (hasSections) {
    const groups: { label: string; lines: string[] }[] = [];
    let current: { label: string; lines: string[] } | null = null;
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      const meta = OUTLINE_SECTIONS.find((m) => t.startsWith(m.key));
      if (meta) {
        current = { label: meta.key, lines: [t.slice(meta.key.length).trim()] };
        groups.push(current);
      } else if (current) {
        current.lines.push(t);
      }
    }
    if (groups.length > 0) {
      return (
        <div className="space-y-2.5">
          {groups.map((g, i) => (
            <div key={i}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1 h-3 rounded-full bg-[var(--nv-primary)]/50" />
                <span className="text-[10px] font-semibold tracking-wide text-[var(--nv-text-tertiary)]">{g.label}</span>
              </div>
              {g.lines.filter(Boolean).map((l, j) => (
                <div key={j} className="text-xs text-[var(--nv-text-secondary)] leading-relaxed pl-3 border-l border-[var(--nv-border-2)] ml-[3px] py-px">
                  {l}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }
  }

  // 兼容旧格式/杂文：剥离 C| R| 等前缀，普通段落展示
  const clean = lines
    .map((l) => l.replace(/^(C\||L0\||L1\||L2\||R\||L\||G\||P\||K\||CF\||M\||EL\||T\|)\s*/, ""))
    .filter((l) => l.trim());
  return (
    <div className="space-y-1.5">
      {clean.map((l, i) => (
        <p key={i} className="text-xs text-[var(--nv-text-secondary)] leading-relaxed">{l}</p>
      ))}
    </div>
  );
}

interface DrawCard {
  outline: string; characters: string[]; coreConflict: string;
  mood: string; foreshadowing: string; cardLabel: string;
  temperature: number; error?: string;
}

interface CharacterDetail {
  id: string; name: string; role: string;
}

export function DrawCards({
  projectId, nodeId, authorNote, chapterOutlinePrompt, nodeTitle,
  storylineId, onSelect, onClose,
}: {
  projectId: string; nodeId: string; authorNote: string;
  chapterOutlinePrompt: string; nodeTitle: string;
  storylineId?: string;
  onSelect: (card: DrawCard, storylineId?: string, characterIds?: string[]) => void; onClose: () => void;
}) {
  const [cards, setCards] = useState<DrawCard[]>([]);
  const [charDetails, setCharDetails] = useState<CharacterDetail[]>([]);
  const [totalChars, setTotalChars] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [drawCount, setDrawCount] = useState(4);
  const abortRef = useRef<AbortController | null>(null);

  const doDraw = async (count: number) => {
    // 取消上一次进行中的请求（防竞态）
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true); setError(""); setCards([]); setSelectedIndex(null);
    try {
      const res = await fetch("/api/generate/chapter-outline/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId, nodeId,
          prompt: chapterOutlinePrompt || undefined,
          authorNote: authorNote || undefined,
          count,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      // 只有未被取消的请求才更新 UI（防 StrictMode 竞态）
      if (abortRef.current !== controller) return;
      if (!res.ok || data.error) { setError(data.error || `HTTP ${res.status}`); return; }
      setCards(data.cards || []);
      setCharDetails(data.characterDetails || []);
      setTotalChars(data.totalCharacters || 0);
    } catch (err) {
      if (abortRef.current !== controller) return; // 请求已过期——静默丢弃
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "网络错误");
    }
    finally {
      // 只关闭当前请求的 loading，不覆盖后续请求的状态
      if (abortRef.current === controller) setLoading(false);
    }
  };

  // 自动触发（useEffect 确保 StrictMode 下也只发起一次有效请求）
  useEffect(() => {
    doDraw(drawCount);
    return () => { abortRef.current?.abort(); }; // 组件卸载时取消请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = () => {
    if (selectedIndex === null || !cards[selectedIndex]) return;
    const card = cards[selectedIndex];
    const characterIds = card.characters
      .map((n) => charDetails.find((c) => c.name === n)?.id)
      .filter((id): id is string => Boolean(id));
    onSelect(card, storylineId, characterIds);
  };

  const roleLabel: Record<string, string> = {
    protagonist: "主角", antagonist: "反派", mentor: "导师",
    love_interest: "恋爱", supporting: "配角", background: "背景",
  };

  const moodColors: Record<string, string> = {
    "暗流涌动": "border-[var(--nv-creative)] bg-[var(--nv-creative)]/20",
    "热血沸腾": "border-[var(--nv-danger)] bg-[var(--nv-danger)]/20",
    "哀而不伤": "border-[var(--nv-info)] bg-[var(--nv-info)]/20",
    "轻松诙谐": "border-[var(--nv-success)] bg-[var(--nv-success)]/20",
    "紧张窒息": "border-[var(--nv-warning)] bg-[var(--nv-warning)]/20",
    "温馨治愈": "border-[var(--nv-accent)] bg-[var(--nv-accent)]/20",
  };

  return (
    <Modal open onClose={onClose} bare ariaLabel={`抽卡模式——「${nodeTitle}」`} panelClassName="w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--nv-border-2)] shrink-0">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--nv-text-primary)]">
              <Icon name="gamepad" size={18} className="text-[var(--nv-creative)]" /> 抽卡模式——「{nodeTitle}」
            </h2>
            <p className="text-xs text-[var(--nv-text-tertiary)] mt-0.5">
              {cards.length} 张路线 · 从 {totalChars} 个角色中选角 · 点击卡片选中，再点「采用」
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={drawCount} onChange={e => setDrawCount(parseInt(e.target.value))}
              className="input-glass rounded px-2 py-1 text-xs">
              <option value={3}>3张</option><option value={4}>4张</option><option value={5}>5张</option>
            </select>
            <button onClick={() => doDraw(drawCount)} disabled={loading}
              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
              {loading ? <><Icon name="loader" size={12} className="animate-spin" /> 重抽</> : <><Icon name="refresh" size={12} /> 重抽</>}
            </button>
            <button onClick={onClose} className="text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)] text-lg transition-colors"><Icon name="x" size={18} /></button>
          </div>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="w-10 h-10 border-2 border-[var(--nv-primary)] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-[var(--nv-text-secondary)]">AI 正在抽取 {drawCount} 条不同路线...</p>
              <p className="text-xs text-[var(--nv-text-tertiary)]">每条路线用不同 temperature 生成，方向各异</p>
            </div>
          )}

          {error && (
            <div className="p-6">
              <ErrorState
                title={error}
                action={
                  <button
                    onClick={() => doDraw(drawCount)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--nv-danger)] hover:text-[var(--nv-danger)]/70 underline"
                  >
                    <Icon name="refresh" size={12} /> 重试
                  </button>
                }
              />
            </div>
          )}

          {!loading && !error && cards.length === 0 && (
            <div className="text-center py-16 text-[var(--nv-text-tertiary)] text-sm">
              暂无卡片，点击「重抽」试试
            </div>
          )}

          {!loading && !error && cards.length > 0 && (
            <div className={`grid gap-4 ${cards.length <= 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"}`}>
              {cards.map((card, i) => {
                const isSelected = selectedIndex === i;
                const moodColor = Object.entries(moodColors).find(([k]) => card.mood?.includes(k))?.[1] || "";

                return (
                  <div key={i}
                    onClick={() => setSelectedIndex(i)}
                    className={`rounded-xl border-2 p-4 cursor-pointer transition-all hover:scale-[1.02] ${
                      isSelected
                        ? "border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] shadow-lg shadow-[var(--nv-primary)]/10"
                        : `border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] backdrop-blur-sm hover:border-[var(--nv-border-3)] ${moodColor}`
                    } ${card.error ? "opacity-50" : ""}`}>
                    {/* 卡片标签 */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isSelected ? "bg-[var(--nv-primary)] text-[var(--nv-text-primary)]" : "bg-[var(--nv-surface-3)] text-[var(--nv-text-secondary)]"
                      }`}>
                        {card.cardLabel || `路线${i + 1}`}
                      </span>
                      <span className="flex items-center gap-0.5 text-[10px] text-[var(--nv-text-tertiary)]"><Icon name="hourglass" size={10} /> {(card.temperature * 100).toFixed(0)}% 随机度</span>
                    </div>

                    {/* 核心冲突 */}
                    {card.coreConflict && (
                      <p className="flex items-start gap-1 text-xs text-[var(--nv-accent)] font-medium mb-2 leading-relaxed">
                        <Icon name="zap" size={12} className="mt-0.5 shrink-0" /> {card.coreConflict}
                      </p>
                    )}

                    {/* 章纲正文——人话分区展示 */}
                    {card.outline && (
                      <div className="text-xs leading-relaxed mb-3 max-h-72 overflow-y-auto scrollbar-thin custom-scrollbar">
                        <OutlinePreview text={card.outline} />
                      </div>
                    )}

                    {/* 情绪基调 */}
                    {card.mood && (
                      <div className="flex items-center gap-1 mb-2">
                        <span className="text-[10px] text-[var(--nv-text-tertiary)]"><Icon name="palette" size={11} /></span>
                        <span className="text-[10px] text-[var(--nv-text-secondary)]">{card.mood}</span>
                      </div>
                    )}

                    {/* 伏笔 */}
                    {card.foreshadowing && (
                      <div className="flex items-start gap-1 mb-2">
                        <span className="text-[10px] text-[var(--nv-text-tertiary)] shrink-0"><Icon name="zap" size={11} /></span>
                        <span className="text-[10px] text-[var(--nv-text-tertiary)]">{card.foreshadowing}</span>
                      </div>
                    )}

                    {/* 出场角色 */}
                    {card.characters.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-auto pt-2 border-t border-[var(--nv-border-2)]">
                        {card.characters.map(name => { const detail = charDetails.find(c => c.name === name);
                          return (
                            <span key={name} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--nv-surface-3)] text-[var(--nv-text-secondary)]">
                              {roleLabel[detail?.role || ""] ? `${roleLabel[detail?.role || ""]} ` : ""}{name}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {card.error && <p className="text-[10px] text-[var(--nv-danger)] mt-2">{card.error}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部 */}
        {!loading && !error && cards.length > 0 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--nv-border-2)] shrink-0 bg-[var(--nv-surface-2)]">
            <p className="text-xs text-[var(--nv-text-tertiary)]">
              {selectedIndex !== null
                ? `已选中「${cards[selectedIndex]?.cardLabel}」——点击采用写入章纲`
                : "点击一张卡片选中，然后点「采用」"}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="border-[var(--nv-border-2)]">取消</Button>
              <Button onClick={handleSelect} disabled={selectedIndex === null}
                className="btn-primary disabled:opacity-50">
                <Icon name="check" size={13} /> 采用此路线
              </Button>
            </div>
          </div>
        )}
    </Modal>
  );
}
