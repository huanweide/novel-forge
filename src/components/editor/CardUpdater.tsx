"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

// ─── 类型 ────────────────────────────────────────────────────

interface CharChange {
  characterId?: string;
  name: string;
  significance?: string;
  changes: Record<string, unknown>;
  _edited?: boolean;
}

interface NewChar {
  name: string;
  role?: string;
  significance?: string;
  personality?: Record<string, unknown>;
  abilities?: string[];
  evidence?: string;
  _edited?: boolean;
}

interface NewLore {
  title: string;
  category?: string;
  keys?: string[];
  content?: string;
  significance?: string;
  evidence?: string;
  _edited?: boolean;
}

interface UpdateResult {
  characterUpdates: CharChange[];
  newCharacters: NewChar[];
  newLoreEntries: NewLore[];
  styleShift?: { detected: boolean; description?: string };
  newForeshadowings?: { description: string; relatedCharacters?: string[]; suggestedPayoff?: string }[];
  summary?: string;
  meta?: { existingCharCount: number; existingLoreCount: number; modelUsed?: string };
}

// ─── 组件 ────────────────────────────────────────────────────

export function CardUpdater({
  projectId,
  chapterContent,
  chapterTitle,
  chapterNumber,
  onApplied,
  onClose,
  preAnalysisResult,
  existingCharacters = [],
}: {
  projectId: string;
  chapterContent: string;
  chapterTitle?: string;
  chapterNumber?: string;
  onApplied: () => void;
  onClose: () => void;
  preAnalysisResult?: UpdateResult | null;
  existingCharacters?: Array<{ id: string; name: string; role: string }>;
}) {
  const [step, setStep] = useState<"analyzing" | "preview" | "editing" | "applying" | "done">("analyzing");
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editTarget, setEditTarget] = useState<{ type: "char" | "newchar" | "lore"; index: number } | null>(null);
  const [editField, setEditField] = useState("");

  // ─── 搜索 / 自建角色 ──────────────────────────────────────
  const [charSearch, setCharSearch] = useState("");
  const [showCharSearch, setShowCharSearch] = useState(false);
  const [newCharName, setNewCharName] = useState("");
  const [showNewCharInput, setShowNewCharInput] = useState(false);
  // 搜索已有角色
  const [existingCharOptions, setExistingCharOptions] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [searchingChars, setSearchingChars] = useState(false);

  const searchCharacters = (q: string) => {
    if (!q || q.length < 1) { setExistingCharOptions([]); return; }
    const qLower = q.toLowerCase();
    const filtered = (existingCharacters || []).filter(c =>
      c.name.toLowerCase().includes(qLower)
    ).slice(0, 20);
    setExistingCharOptions(filtered);
  };

  const addExistingCharAsNew = (char: { id: string; name: string; role: string }) => {
    if (!result) return;
    const already = result.newCharacters.some(c => c.name.toLowerCase() === char.name.toLowerCase());
    if (already) { setCharSearch(""); setShowCharSearch(false); return; }
    const updated = { ...result, newCharacters: [...result.newCharacters, {
      name: char.name, role: char.role || "supporting",
      significance: "medium",
      personality: { dominant: "从已有角色库添加" },
      abilities: [],
      evidence: "用户手动添加",
      _edited: true,
    }]};
    setResult(updated);
    const idx = updated.newCharacters.length - 1;
    setSelectedNewChars(prev => { const next = new Set(prev); next.add(`newchar-${idx}`); return next; });
    setCharSearch(""); setShowCharSearch(false);
  };

  const addNewCharacter = () => {
    if (!result || !newCharName.trim()) return;
    const name = newCharName.trim();
    const already = result.newCharacters.some(c => c.name.toLowerCase() === name.toLowerCase());
    if (already) { setNewCharName(""); setShowNewCharInput(false); return; }
    const updated = { ...result, newCharacters: [...result.newCharacters, {
      name, role: "supporting",
      significance: "medium",
      personality: { dominant: "用户自建" },
      abilities: [],
      evidence: "用户自建角色",
      _edited: true,
    }]};
    setResult(updated);
    const idx = updated.newCharacters.length - 1;
    setSelectedNewChars(prev => { const next = new Set(prev); next.add(`newchar-${idx}`); return next; });
    setNewCharName(""); setShowNewCharInput(false);
  };
  const [editValue, setEditValue] = useState("");

  // 勾选状态
  const [selectedChars, setSelectedChars] = useState<Set<string>>(new Set());
  const [selectedNewChars, setSelectedNewChars] = useState<Set<string>>(new Set());
  const [selectedLore, setSelectedLore] = useState<Set<string>>(new Set());

  // ─── 分析 ──────────────────────────────────────────────

  useEffect(() => {
    if (preAnalysisResult) {
      // 使用外部传入的预分析结果，跳过 API 调用
      setResult(preAnalysisResult);
      const charKeys = (preAnalysisResult.characterUpdates || []).map((c: CharChange, i: number) =>
        c.significance !== "low" ? `char-${i}` : null
      ).filter(Boolean) as string[];
      const newCharKeys = (preAnalysisResult.newCharacters || []).map((c: NewChar, i: number) =>
        c.significance !== "low" ? `newchar-${i}` : null
      ).filter(Boolean) as string[];
      const loreKeys = (preAnalysisResult.newLoreEntries || []).map((l: NewLore, i: number) =>
        l.significance !== "low" ? `lore-${i}` : null
      ).filter(Boolean) as string[];
      setSelectedChars(new Set(charKeys));
      setSelectedNewChars(new Set(newCharKeys));
      setSelectedLore(new Set(loreKeys));
      setStep("preview");
    } else {
      analyzeChapter();
    }
  }, []);

  const analyzeChapter = async () => {
    if (!chapterContent || chapterContent.trim().length < 50) {
      setError("当前章节内容不足（少于50字），无法分析。请先生成本章正文。");
      return;
    }
    setStep("analyzing");
    setError("");

    try {
      const res = await fetch("/api/generate/update-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          chapterContent: chapterContent.slice(0, 10000),
          chapterTitle: chapterTitle || "",
          chapterNumber: chapterNumber || "",
        }),
      });

      // 先读文本，再尝试 JSON 解析——防止 API 返回非 JSON 炸掉
      const resText = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try {
        data = JSON.parse(resText);
      } catch {
        throw new Error(`API返回格式异常 (${res.status})：${resText.slice(0, 200)}`);
      }

      if (!res.ok) {
        const errMsg = data.error || `服务器错误 (${res.status})`;
        if (data.details) throw new Error(`${errMsg}: ${data.details}`);
        throw new Error(errMsg);
      }

      // 检查是否解析失败
      if (data.parseError) {
        setResult({
          characterUpdates: [],
          newCharacters: [],
          newLoreEntries: [],
          summary: "AI 返回内容无法解析，请重试。",
          meta: data.meta,
        });
        setStep("preview");
        return;
      }

      setResult(data);

      // 默认只选中 significance 为 high/medium 的项（low 默认不勾）
      const charKeys = (data.characterUpdates || []).map((c: CharChange, i: number) =>
        c.significance !== "low" ? `char-${i}` : null
      ).filter(Boolean) as string[];
      const newCharKeys = (data.newCharacters || []).map((c: NewChar, i: number) =>
        c.significance !== "low" ? `newchar-${i}` : null
      ).filter(Boolean) as string[];
      const loreKeys = (data.newLoreEntries || []).map((l: NewLore, i: number) =>
        l.significance !== "low" ? `lore-${i}` : null
      ).filter(Boolean) as string[];

      setSelectedChars(new Set(charKeys));
      setSelectedNewChars(new Set(newCharKeys));
      setSelectedLore(new Set(loreKeys));

      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误");
      setStep("preview"); // 错误状态下也能关闭
    }
  };

  // ─── 内联编辑 ──────────────────────────────────────────

  const startEdit = (type: "char" | "newchar" | "lore", index: number, field: string, currentValue: unknown) => {
    setEditTarget({ type, index });
    setEditField(field);
    // 格式化当前值
    if (typeof currentValue === "string") {
      setEditValue(currentValue);
    } else if (Array.isArray(currentValue)) {
      setEditValue(currentValue.join("\n"));
    } else if (typeof currentValue === "object" && currentValue !== null) {
      setEditValue(JSON.stringify(currentValue, null, 2));
    } else {
      setEditValue(String(currentValue || ""));
    }
    setStep("editing");
  };

  const saveEdit = () => {
    if (!result || !editTarget) return;

    const updated = { ...result };
    const { type, index } = editTarget;

    if (type === "char" && updated.characterUpdates[index]) {
      const chars = [...updated.characterUpdates];
      // 尝试解析 JSON
      let parsedValue: unknown = editValue;
      try { parsedValue = JSON.parse(editValue); } catch { /* 保持字符串 */ }
      chars[index] = { ...chars[index], changes: { ...chars[index].changes, [editField]: parsedValue }, _edited: true };
      updated.characterUpdates = chars;
    } else if (type === "newchar" && updated.newCharacters[index]) {
      const newChars = [...updated.newCharacters];
      let parsedValue: unknown = editValue;
      try { parsedValue = JSON.parse(editValue); } catch { /* 保持字符串 */ }
      (newChars[index] as unknown as Record<string, unknown>)[editField] = parsedValue;
      newChars[index] = { ...newChars[index], _edited: true };
      updated.newCharacters = newChars;
    } else if (type === "lore" && updated.newLoreEntries[index]) {
      const lores = [...updated.newLoreEntries];
      (lores[index] as unknown as Record<string, unknown>)[editField] = editValue;
      lores[index] = { ...lores[index], _edited: true };
      updated.newLoreEntries = lores;
    }

    setResult(updated);
    setEditTarget(null);
    setStep("preview");
  };

  // ─── 应用更新 ──────────────────────────────────────────

  const handleApply = async () => {
    setStep("applying");
    setError("");

    // 收集用户批准且编辑过的数据
    const approvedChars = (result?.characterUpdates || [])
      .filter((c, i) => selectedChars.has(`char-${i}`))
      .map((c) => ({
        characterId: c.characterId,
        name: c.name,
        changes: c.changes,
        isNew: false,
      }));

    const approvedNewChars = (result?.newCharacters || [])
      .filter((_, i) => selectedNewChars.has(`newchar-${i}`))
      .map((c) => ({
        name: c.name,
        role: c.role,
        personality: c.personality,
        abilities: c.abilities,
        evidence: c.evidence,
      }));

    const approvedLore = (result?.newLoreEntries || [])
      .filter((_, i) => selectedLore.has(`lore-${i}`))
      .map((l) => ({
        title: l.title,
        category: l.category,
        keys: l.keys,
        content: l.content,
        evidence: l.evidence,
      }));

    try {
      const res = await fetch("/api/generate/apply-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          chapterNumber: chapterNumber || "",
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
  const selectedTotal = selectedChars.size + selectedNewChars.size + selectedLore.size;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={step === "done" ? onClose : undefined}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
          <h2 className="text-lg font-semibold">
            {step === "analyzing" && "🔍 AI 正在分析本章变化..."}
            {step === "preview" && `📋 本章变化检测（${totalCount}条）`}
            {step === "editing" && "✏️ 编辑内容"}
            {step === "applying" && "⏳ 正在更新三卡..."}
            {step === "done" && "✅ 更新完成"}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* 错误状态 */}
          {error && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/50 mb-4">
              <p className="text-sm text-red-400 font-medium mb-2">❌ {error}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={analyzeChapter}
                  className="border-red-800 text-red-400 hover:text-red-300 text-xs"
                >
                  🔄 重试分析
                </Button>
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="border-zinc-700 text-zinc-400 text-xs"
                >
                  关闭
                </Button>
              </div>
            </div>
          )}

          {/* 分析中 */}
          {step === "analyzing" && !error && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-zinc-400 text-sm">AI 正在比对现有卡面与新章节...</p>
              <p className="text-zinc-600 text-xs">
                角色状态变化 · 新能力 · 新关系 · 新设定 · 人物弧光推进
              </p>
              <p className="text-zinc-700 text-[10px]">
                使用模型：{result?.meta?.modelUsed || "v4-flash"}
              </p>
            </div>
          )}

          {/* 编辑模式 */}
          {step === "editing" && editTarget && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <span>✏️ 编辑</span>
                <span className="text-zinc-200 font-medium">
                  {editTarget.type === "char" && charUpdates[editTarget.index]?.name}
                  {editTarget.type === "newchar" && newChars[editTarget.index]?.name}
                  {editTarget.type === "lore" && newLores[editTarget.index]?.title}
                </span>
                <span className="text-zinc-600">· {editField}</span>
              </div>
              <textarea
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-sm text-zinc-200 font-mono min-h-[200px] resize-y focus:border-indigo-500 focus:outline-none"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="编辑内容..."
              />
              <p className="text-[10px] text-zinc-600">
                对象和数组字段请用 JSON 格式；纯文本字段直接输入。编辑后的内容将替代 AI 建议写入三卡。
              </p>
              <div className="flex gap-2">
                <Button onClick={saveEdit} className="bg-indigo-600 hover:bg-indigo-500 text-sm">
                  💾 保存编辑
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setEditTarget(null); setStep("preview"); }}
                  className="border-zinc-700 text-sm"
                >
                  取消
                </Button>
              </div>
            </div>
          )}

          {/* 预览 */}
          {step === "preview" && result && !editTarget && (
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
                  <p className="text-xs mt-1 text-zinc-600">所有角色和设定保持一致，无需更新</p>
                  <div className="flex justify-center gap-2 mt-4">
                    <Button variant="outline" onClick={analyzeChapter} className="border-zinc-700 text-xs">🔄 重新分析</Button>
                    <Button variant="outline" onClick={onClose} className="border-zinc-700 text-xs">关闭</Button>
                  </div>
                </div>
              )}

              {/* 角色状态更新 */}
              {charUpdates.length > 0 && (
                <Section
                  title={`🔄 角色状态更新（${charUpdates.length}）`}
                  count={selectedChars.size}
                  total={charUpdates.length}
                >
                  {charUpdates.map((c, i) => {
                    const key = `char-${i}`;
                    const checked = selectedChars.has(key);
                    return (
                      <UpdateItem
                        key={key}
                        checked={checked}
                        onToggle={() => {
                          const next = new Set(selectedChars);
                          next.has(key) ? next.delete(key) : next.add(key);
                          setSelectedChars(next);
                        }}
                        color="indigo"
                        onEditField={(field, value) => startEdit("char", i, field, value)}
                        edited={c._edited}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-200 font-medium">{c.name}</span>
                          {c.characterId && (
                            <span className="text-zinc-500 text-[10px]">更新已有</span>
                          )}
                          {c.significance === "high" && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-red-900/40 text-red-400">重要</span>
                          )}
                        </div>
                        <ChangeDetail
                          changes={c.changes}
                          onEditField={(field, value) => startEdit("char", i, field, value)}
                        />
                      </UpdateItem>
                    );
                  })}
                </Section>
              )}

              {/* 新角色 */}
              {newChars.length > 0 && (
                <Section
                  title={`🆕 新出场角色（${newChars.length}）`}
                  count={selectedNewChars.size}
                  total={newChars.length}
                >
                  {newChars.map((c, i) => {
                    const key = `newchar-${i}`;
                    const checked = selectedNewChars.has(key);
                    return (
                      <UpdateItem
                        key={key}
                        checked={checked}
                        onToggle={() => {
                          const next = new Set(selectedNewChars);
                          next.has(key) ? next.delete(key) : next.add(key);
                          setSelectedNewChars(next);
                        }}
                        color="pink"
                        onEditField={(field, value) => startEdit("newchar", i, field, value)}
                        edited={c._edited}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-200 font-medium">{c.name}</span>
                          <span className="text-zinc-500 text-[10px]">
                            {c.role === "protagonist" ? "主角" : c.role === "antagonist" ? "反派" : c.role || "配角"}
                          </span>
                          {c.significance === "high" && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-red-900/40 text-red-400">重要</span>
                          )}
                        </div>
                        {c.abilities && c.abilities.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {c.abilities.map((a, j) => (
                              <span key={j} className="text-[10px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                ⚡{a}
                              </span>
                            ))}
                          </div>
                        )}
                        {c.evidence && (
                          <p className="text-zinc-600 text-[10px] mt-0.5 truncate">
                            📎 依据：「{c.evidence.slice(0, 80)}...」
                          </p>
                        )}
                        {c.personality && typeof c.personality === "object" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); startEdit("newchar", i, "personality", c.personality); }}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 mt-1"
                          >
                            ✏️ 编辑性格设定
                          </button>
                        )}
                      </UpdateItem>
                    );
                  })}
                </Section>
              )}

              {/* 新世界观词条 */}
              {newLores.length > 0 && (
                <Section
                  title={`🌍 新世界观设定（${newLores.length}）`}
                  count={selectedLore.size}
                  total={newLores.length}
                >
                  {newLores.map((l, i) => {
                    const key = `lore-${i}`;
                    const checked = selectedLore.has(key);
                    return (
                      <UpdateItem
                        key={key}
                        checked={checked}
                        onToggle={() => {
                          const next = new Set(selectedLore);
                          next.has(key) ? next.delete(key) : next.add(key);
                          setSelectedLore(next);
                        }}
                        color="emerald"
                        onEditField={(field, value) => startEdit("lore", i, field, value)}
                        edited={l._edited}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-200 font-medium">{l.title}</span>
                          <span className="text-zinc-500 text-[10px]">{l.category || "未分类"}</span>
                          {l.significance === "high" && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-red-900/40 text-red-400">核心设定</span>
                          )}
                        </div>
                        {l.content && (
                          <div className="mt-1">
                            <p className="text-zinc-500 text-[10px] line-clamp-2">{l.content}</p>
                            <button
                              onClick={(e) => { e.stopPropagation(); startEdit("lore", i, "content", l.content); }}
                              className="text-[10px] text-indigo-400 hover:text-indigo-300 mt-0.5"
                            >
                              ✏️ 编辑内容
                            </button>
                          </div>
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

              {/* 新伏笔 */}
              {(result.newForeshadowings || []).length > 0 && (
                <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-900/30">
                  <span className="text-xs text-cyan-400 font-medium">🔮 新发现伏笔（{result.newForeshadowings!.length}）</span>
                  <div className="mt-1 space-y-1">
                    {result.newForeshadowings!.map((f, i) => (
                      <div key={i} className="text-xs text-zinc-400">
                        <span className="text-zinc-300">• {f.description}</span>
                        {f.suggestedPayoff && (
                          <span className="text-zinc-600 ml-1">→ 建议回收：{f.suggestedPayoff}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 手动添加角色卡 ── */}
              <div className="border-t border-zinc-800 pt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">🃏 添加角色卡</span>
                  <button
                    onClick={() => { setShowCharSearch(!showCharSearch); setShowNewCharInput(false); }}
                    className="text-[10px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
                  >
                    {showCharSearch ? "收起" : "🔍 搜索已有角色"}
                  </button>
                  <button
                    onClick={() => { setShowNewCharInput(!showNewCharInput); setShowCharSearch(false); }}
                    className="text-[10px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
                  >
                    {showNewCharInput ? "收起" : "✨ 自建新角色"}
                  </button>
                </div>

                {/* 搜索已有角色 */}
                {showCharSearch && (
                  <div className="space-y-1">
                    <input
                      value={charSearch}
                      onChange={(e) => { setCharSearch(e.target.value); searchCharacters(e.target.value); }}
                      placeholder="输入角色名搜索..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-indigo-600"
                    />
                    {searchingChars && <p className="text-[10px] text-zinc-500">搜索中...</p>}
                    {existingCharOptions.length > 0 && (
                      <div className="max-h-32 overflow-y-auto border border-zinc-800 rounded">
                        {existingCharOptions.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => addExistingCharAsNew(c)}
                            className="w-full text-left px-2 py-1 text-xs hover:bg-zinc-800 transition-colors flex items-center gap-2"
                          >
                            <span className="text-zinc-300">{c.name}</span>
                            <span className="text-zinc-600 text-[10px]">{c.role}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {charSearch && !searchingChars && existingCharOptions.length === 0 && (
                      <p className="text-[10px] text-zinc-600">未找到匹配角色，试试"自建新角色"</p>
                    )}
                  </div>
                )}

                {/* 自建新角色 */}
                {showNewCharInput && (
                  <div className="flex gap-2">
                    <input
                      value={newCharName}
                      onChange={(e) => setNewCharName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addNewCharacter()}
                      placeholder="输入新角色名，回车添加"
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-pink-600"
                    />
                    <button
                      onClick={addNewCharacter}
                      disabled={!newCharName.trim()}
                      className="text-[10px] px-2 py-1 rounded bg-pink-900/40 border border-pink-800 text-pink-400 hover:bg-pink-900/60 disabled:opacity-30 transition-colors"
                    >
                      添加
                    </button>
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-between pt-3 border-t border-zinc-800">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={analyzeChapter} className="border-zinc-700 text-xs">
                    🔄 重新分析
                  </Button>
                  <Button variant="outline" onClick={() => {
                    // 全选
                    setSelectedChars(new Set(charUpdates.map((_, i) => `char-${i}`)));
                    setSelectedNewChars(new Set(newChars.map((_, i) => `newchar-${i}`)));
                    setSelectedLore(new Set(newLores.map((_, i) => `lore-${i}`)));
                  }} className="border-zinc-700 text-xs">
                    ☑ 全选
                  </Button>
                </div>
                <Button
                  onClick={handleApply}
                  disabled={selectedTotal === 0}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-sm"
                >
                  ✅ 应用选中更新（{selectedTotal}条）
                </Button>
              </div>
            </div>
          )}

          {step === "applying" && !error && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="w-10 h-10 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-zinc-400 text-sm">正在写入三卡...</p>
              <p className="text-zinc-600 text-xs">角色卡 · 世界书 · 风格卡</p>
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="text-5xl">✅</div>
              <p className="text-lg text-zinc-200 font-medium">{message}</p>
              <p className="text-xs text-zinc-600">
                已添加的内容将在后续章节生成时被读取。系统会自动在章纲/提示词中引用相关角色状态和设定。
              </p>
              <div className="flex gap-3 mt-3">
                <Button variant="outline" onClick={onClose} className="border-zinc-700">关闭</Button>
                <Button onClick={() => { onApplied(); onClose(); }} className="bg-indigo-600 hover:bg-indigo-500">
                  刷新工作区
                </Button>
              </div>
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
      <div className="space-y-1 max-h-72 overflow-y-auto">{children}</div>
    </div>
  );
}

function UpdateItem({
  checked, onToggle, color, children, onEditField, edited,
}: {
  checked: boolean;
  onToggle: () => void;
  color: string;
  children: React.ReactNode;
  onEditField?: (field: string, value: unknown) => void;
  edited?: boolean;
}) {
  const colors: Record<string, string> = {
    indigo: "border-indigo-700 bg-indigo-950/20",
    pink: "border-pink-700 bg-pink-950/20",
    emerald: "border-emerald-700 bg-emerald-950/20",
  };

  return (
    <label
      className={`flex items-start gap-2 p-2.5 rounded-lg cursor-pointer text-xs border transition-colors relative ${
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
      {edited && (
        <span className="absolute top-1 right-1 text-[9px] px-1 py-0.5 rounded bg-amber-900/50 text-amber-400">已编辑</span>
      )}
    </label>
  );
}

function ChangeDetail({
  changes,
  onEditField,
}: {
  changes: Record<string, unknown>;
  onEditField?: (field: string, value: unknown) => void;
}) {
  // 字段顺序：关系→能力→弧光→位置→状态→其他
  const priority = ["新关系", "新能力", "人物弧光推进", "背景更新", "位置", "情绪", "状态变化"];
  const entries = Object.entries(changes)
    .filter(([, v]) => {
      if (v == null) return false;
      if (Array.isArray(v) && v.length === 0) return false;
      if (typeof v === "string" && v.trim() === "") return false;
      return true;
    })
    .sort(([a], [b]) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  if (entries.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-0.5">
      {entries.map(([key, value]) => (
        <div key={key} className="text-zinc-500 text-[10px] leading-relaxed group">
          <span className="text-zinc-400 font-medium">{key}：</span>
          {Array.isArray(value)
            ? (key === "新关系" ? (
                value.map((v, i) => {
                  if (typeof v === "object" && v !== null) {
                    const o = v as Record<string, string>;
                    return (
                      <span key={i} className="bg-zinc-800 px-1 py-0.5 rounded mr-1 inline-flex items-center gap-1">
                        <span className="text-zinc-300">{o.targetName}</span>
                        <span className="text-zinc-500">→</span>
                        <span className="text-emerald-400">{o.relation}</span>
                      </span>
                    );
                  }
                  return <span key={i} className="bg-zinc-800 px-1 py-0.5 rounded mr-1">{String(v)}</span>;
                })
              ) : (
                value.map((v, i) => <span key={i} className="bg-zinc-800 px-1 py-0.5 rounded mr-1">{String(v)}</span>)
              ))
            : <span>{String(value)}</span>
          }
          {onEditField && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEditField(key, value);
              }}
              className="ml-1 text-[9px] text-zinc-600 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ✏️
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
