"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

// ─── 类型 ────────────────────────────────────────────────────

interface CharChange {
  characterId?: string;
  name: string;
  isNew?: boolean;
  changes: Record<string, unknown>;
}

interface NewChar {
  name: string;
  role?: string;
  personality?: Record<string, unknown>;
  abilities?: string[];
  evidence?: string;
}

interface NewLore {
  title: string;
  category?: string;
  keys?: string[];
  content?: string;
  evidence?: string;
}

interface UpdateResult {
  characterUpdates: CharChange[];
  newCharacters: NewChar[];
  newLoreEntries: NewLore[];
  styleShift?: { detected: boolean; description?: string };
  newForeshadowings?: { description: string; relatedCharacters?: string[]; suggestedPayoff?: string }[];
  summary?: string;
  meta?: { existingCharCount: number; existingLoreCount: number };
}

// ─── 组件 ────────────────────────────────────────────────────

export function CardUpdater({
  projectId,
  chapterContent,
  chapterTitle,
  onApplied,
  onClose,
}: {
  projectId: string;
  chapterContent: string;
  chapterTitle?: string;
  onApplied: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"analyzing" | "preview" | "applying" | "done">("analyzing");
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // 勾选状态
  const [selectedChars, setSelectedChars] = useState<Set<string>>(new Set());
  const [selectedNewChars, setSelectedNewChars] = useState<Set<string>>(new Set());
  const [selectedLore, setSelectedLore] = useState<Set<string>>(new Set());

  // ─── 自动分析 ──────────────────────────────────────────

  useEffect(() => {
    analyzeChapter();
  }, []);

  const analyzeChapter = async () => {
    setStep("analyzing");
    setError("");

    try {
      const res = await fetch("/api/generate/update-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, chapterContent, chapterTitle }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "分析失败");

      setResult(data);

      // 默认全选
      const charKeys = (data.characterUpdates || []).map((c: CharChange) => `char-${c.name}`);
      const newCharKeys = (data.newCharacters || []).map((c: NewChar, i: number) => `newchar-${i}`);
      const loreKeys = (data.newLoreEntries || []).map((l: NewLore, i: number) => `lore-${i}`);

      setSelectedChars(new Set(charKeys));
      setSelectedNewChars(new Set(newCharKeys));
      setSelectedLore(new Set(loreKeys));

      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误");
    }
  };

  // ─── 应用更新 ──────────────────────────────────────────

  const handleApply = async () => {
    setStep("applying");

    const approvedChars = (result?.characterUpdates || []).filter((c) => selectedChars.has(`char-${c.name}`));
    const approvedNewChars = (result?.newCharacters || []).filter((_, i) => selectedNewChars.has(`newchar-${i}`));
    const approvedLore = (result?.newLoreEntries || []).filter((_, i) => selectedLore.has(`lore-${i}`));

    try {
      const res = await fetch("/api/generate/apply-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          characterUpdates: approvedChars,
          newCharacters: approvedNewChars,
          newLoreEntries: approvedLore,
          styleShift: result?.styleShift,
          newForeshadowings: result?.newForeshadowings,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "应用失败");

      setMessage(data.message || "更新完成");
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "应用失败");
      setStep("preview");
    }
  };

  // ─── 渲染 ──────────────────────────────────────────────

  const charUpdates = result?.characterUpdates || [];
  const newChars = result?.newCharacters || [];
  const newLores = result?.newLoreEntries || [];
  const totalCount = charUpdates.length + newChars.length + newLores.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={step === "done" ? onClose : undefined}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
          <h2 className="text-lg font-semibold">
            {step === "analyzing" && "🔍 AI 正在分析本章变化..."}
            {step === "preview" && `📋 本章变化检测（${totalCount}条）`}
            {step === "applying" && "⏳ 正在更新卡面..."}
            {step === "done" && "✅ 更新完成"}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === "analyzing" && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-zinc-400 text-sm">AI 正在比对现有卡面与新章节...</p>
              <p className="text-zinc-600 text-xs">角色状态变化 · 新能力 · 新关系 · 新设定</p>
            </div>
          )}

          {step === "preview" && result && (
            <div className="space-y-5">
              {/* 概要 */}
              {result.summary && (
                <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-900/30 text-sm text-indigo-300">
                  💡 {result.summary}
                </div>
              )}

              {/* 零变化 */}
              {totalCount === 0 && (
                <div className="text-center py-10 text-zinc-500">
                  <div className="text-4xl mb-3">👍</div>
                  <p className="text-sm">AI 未检测到明显变化</p>
                  <p className="text-xs mt-1">所有角色和设定保持一致，无需更新</p>
                </div>
              )}

              {/* 角色状态更新 */}
              {charUpdates.length > 0 && (
                <Section title={`🔄 角色状态更新（${charUpdates.length}）`} count={selectedChars.size} total={charUpdates.length}>
                  {charUpdates.map((c) => {
                    const key = `char-${c.name}`;
                    return (
                      <UpdateItem
                        key={key}
                        checked={selectedChars.has(key)}
                        onToggle={() => {
                          const next = new Set(selectedChars);
                          next.has(key) ? next.delete(key) : next.add(key);
                          setSelectedChars(next);
                        }}
                        color="indigo"
                      >
                        <span className="text-zinc-200 font-medium">{c.name}</span>
                        {c.characterId ? (
                          <span className="text-zinc-500 ml-1 text-[10px]">（更新已有）</span>
                        ) : (
                          <span className="text-amber-400 ml-1 text-[10px]">（新角色建议）</span>
                        )}
                        <ChangeDetail changes={c.changes} />
                      </UpdateItem>
                    );
                  })}
                </Section>
              )}

              {/* 新角色 */}
              {newChars.length > 0 && (
                <Section title={`🆕 新出场角色（${newChars.length}）`} count={selectedNewChars.size} total={newChars.length}>
                  {newChars.map((c, i) => {
                    const key = `newchar-${i}`;
                    return (
                      <UpdateItem
                        key={key}
                        checked={selectedNewChars.has(key)}
                        onToggle={() => {
                          const next = new Set(selectedNewChars);
                          next.has(key) ? next.delete(key) : next.add(key);
                          setSelectedNewChars(next);
                        }}
                        color="pink"
                      >
                        <span className="text-zinc-200 font-medium">{c.name}</span>
                        <span className="text-zinc-500 ml-1 text-[10px]">
                          {c.role === "protagonist" ? "主角" : c.role === "antagonist" ? "反派" : c.role || "配角"}
                        </span>
                        {c.abilities && c.abilities.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {c.abilities.map((a, j) => (
                              <span key={j} className="text-[10px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-400">⚡{a}</span>
                            ))}
                          </div>
                        )}
                        {c.evidence && (
                          <p className="text-zinc-600 text-[10px] mt-0.5 truncate">「{c.evidence.slice(0, 80)}...」</p>
                        )}
                      </UpdateItem>
                    );
                  })}
                </Section>
              )}

              {/* 新世界观词条 */}
              {newLores.length > 0 && (
                <Section title={`🌍 新世界观设定（${newLores.length}）`} count={selectedLore.size} total={newLores.length}>
                  {newLores.map((l, i) => {
                    const key = `lore-${i}`;
                    return (
                      <UpdateItem
                        key={key}
                        checked={selectedLore.has(key)}
                        onToggle={() => {
                          const next = new Set(selectedLore);
                          next.has(key) ? next.delete(key) : next.add(key);
                          setSelectedLore(next);
                        }}
                        color="emerald"
                      >
                        <span className="text-zinc-200 font-medium">{l.title}</span>
                        <span className="text-zinc-500 ml-1 text-[10px]">{l.category}</span>
                        {l.content && (
                          <p className="text-zinc-500 text-[10px] mt-0.5 line-clamp-2">{l.content}</p>
                        )}
                        {l.evidence && (
                          <p className="text-zinc-700 text-[10px] mt-0.5">📎 {l.evidence.slice(0, 60)}</p>
                        )}
                      </UpdateItem>
                    );
                  })}
                </Section>
              )}

              {/* 风格变化 */}
              {result.styleShift?.detected && (
                <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-900/30">
                  <span className="text-xs text-amber-400 font-medium">🎨 文风微调</span>
                  <p className="text-xs text-zinc-400 mt-1">{result.styleShift.description}</p>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex justify-between pt-3 border-t border-zinc-800">
                <Button variant="outline" onClick={() => { analyzeChapter(); }} className="border-zinc-700">
                  🔄 重新分析
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={totalCount === 0 || (
                    selectedChars.size === 0 && selectedNewChars.size === 0 && selectedLore.size === 0
                  )}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500"
                >
                  ✅ 应用选中更新（{selectedChars.size + selectedNewChars.size + selectedLore.size}条）
                </Button>
              </div>
            </div>
          )}

          {step === "applying" && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="w-10 h-10 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-zinc-400 text-sm">正在写入更新...</p>
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="text-5xl">✅</div>
              <p className="text-lg text-zinc-200 font-medium">{message}</p>
              <div className="flex gap-3 mt-3">
                <Button variant="outline" onClick={onClose} className="border-zinc-700">关闭</Button>
                <Button onClick={() => { onApplied(); onClose(); }} className="bg-indigo-600 hover:bg-indigo-500">
                  刷新工作区
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 p-3 rounded-lg bg-red-950/30 border border-red-900/50 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 子组件 ──────────────────────────────────────────────────

function Section({
  title, children, count, total,
}: { title: string; children: React.ReactNode; count: number; total: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-zinc-300">{title}</h3>
        <span className="text-xs text-zinc-500">{count}/{total}</span>
      </div>
      <div className="space-y-1 max-h-64 overflow-y-auto">{children}</div>
    </div>
  );
}

function UpdateItem({
  checked, onToggle, color, children,
}: { checked: boolean; onToggle: () => void; color: string; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    indigo: "border-indigo-700 bg-indigo-950/20",
    pink: "border-pink-700 bg-pink-950/20",
    emerald: "border-emerald-700 bg-emerald-950/20",
  };

  return (
    <label
      className={`flex items-start gap-2 p-2.5 rounded-lg cursor-pointer text-xs border transition-colors ${
        checked ? colors[color] || colors.indigo : "border-zinc-800 bg-zinc-900/50 opacity-70"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 rounded shrink-0"
      />
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );
}

function ChangeDetail({ changes }: { changes: Record<string, unknown> }) {
  const entries = Object.entries(changes).filter(([, v]) => {
    if (v == null) return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (typeof v === "string" && v.trim() === "") return false;
    return true;
  });

  if (entries.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-0.5">
      {entries.map(([key, value]) => (
        <div key={key} className="text-zinc-500 text-[10px] leading-relaxed">
          <span className="text-zinc-400 font-medium">{key}：</span>
          {Array.isArray(value)
            ? value.map((v, i) => {
                if (typeof v === "object" && v !== null) {
                  const o = v as Record<string, string>;
                  return <span key={i} className="bg-zinc-800 px-1 py-0.5 rounded mr-1">{o.targetName}: {o.relation}</span>;
                }
                return <span key={i} className="bg-zinc-800 px-1 py-0.5 rounded mr-1">{String(v)}</span>;
              })
            : <span>{String(value)}</span>
          }
        </div>
      ))}
    </div>
  );
}
