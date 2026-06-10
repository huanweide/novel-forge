"use client";

import { useState, useEffect, useRef } from "react";
import type { CharacterData } from "./types";

export function CharacterList({
  characters,
  projectId,
  onEdit,
  onDelete,
  onNew,
  onExpanded,
}: {
  characters: CharacterData[];
  projectId: string;
  onEdit: (c: CharacterData) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onExpanded: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expanding, setExpanding] = useState(false);
  const [expandProgress, setExpandProgress] = useState<Array<{ name: string; status: string; error?: string }>>([]);
  const [expandDone, setExpandDone] = useState(0);
  const [expandTotal, setExpandTotal] = useState(0);
  // 扩展结果弹窗
  const [expandResult, setExpandResult] = useState<{
    okList: string[]; failList: Array<{ name: string; reason: string }>; total: number;
  } | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [classifyMsg, setClassifyMsg] = useState("");
  const [classifyDone, setClassifyDone] = useState(0);
  const [classifyTotal, setClassifyTotal] = useState(0);
  const [classifyResult, setClassifyResult] = useState<{ ok: boolean; message: string } | null>(null);
  // 分类面板：AI 返回的分类体系
  const [classifyGroups, setClassifyGroups] = useState<Array<{
    category: string; label: string; description: string; members: string[]; memberIds: string[];
  }> | null>(null);
  // 勾选状态：label → Set<characterId>
  const [groupSelections, setGroupSelections] = useState<Map<string, Set<string>>>(new Map());
  const [applying, setApplying] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  // 从所有角色标签中提取唯一值（过滤掉系统标签如 📥📝）
  const allTags = [...new Set(characters.flatMap(c => (c.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝"))))].sort();

  const filtered = characters.filter(c => {
    if (roleFilter !== "all" && c.role !== roleFilter) return false;
    // tagFilter: 特殊值 + 具体标签值
    if (tagFilter === "no-tags" && (c.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝")).length > 0) return false;
    if (tagFilter === "has-tags" && (c.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝")).length === 0) return false;
    if (tagFilter !== "all" && tagFilter !== "no-tags" && tagFilter !== "has-tags" && !(c.tags || []).includes(tagFilter)) return false;
    if (statusFilter === "alive" && c.currentStatus !== "alive") return false;
    if (statusFilter === "dead" && !["dead","missing","presumed_dead"].includes(c.currentStatus)) return false;
    if (search && !c.name.includes(search) && !(c.aliases || []).some((a: string) => a.includes(search))) return false;
    return true;
  });

  const statRole = (r: string) => characters.filter(c => c.role === r).length;
  const statHasTags = characters.filter(c => (c.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝")).length > 0).length;
  const statNoTags = characters.filter(c => (c.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝")).length === 0).length;
  const statDead = characters.filter(c => ["dead","missing","presumed_dead"].includes(c.currentStatus)).length;

  const roleOrder = ["protagonist", "antagonist", "mentor", "love_interest", "supporting", "background"];
  const roleLabel: Record<string, string> = { protagonist: "★ 主角", antagonist: "◆ 反派", mentor: "◈ 导师", love_interest: "♡ 恋爱", supporting: "● 配角", background: "○ 背景" };
  const grouped: Record<string, CharacterData[]> = {};
  for (const c of filtered) {
    const r = c.role || "supporting";
    if (!grouped[r]) grouped[r] = [];
    grouped[r].push(c);
  }

  // 兜底：expanding结束但没有弹窗 → 从progress自动构建结果（仅触发一次）
  const fallbackTriggered = useRef(false);
  useEffect(() => {
    if (!expanding && expandDone > 0 && expandProgress.length > 0 && !fallbackTriggered.current) {
      const okList = expandProgress
        .filter(p => p.status === "ok" || p.status === "char-done")
        .map(p => p.name);
      const failList = expandProgress
        .filter(p => p.status === "failed" || p.status === "char-failed")
        .map(p => ({ name: p.name, reason: p.error || "未知错误" }));
      if (okList.length + failList.length > 0 && !expandResult) {
        fallbackTriggered.current = true;
        setExpandResult({ okList, failList, total: expandTotal });
      }
    }
    // expanding重新开始时重置标记
    if (expanding) fallbackTriggered.current = false;
  }, [expanding, expandDone, expandProgress, expandTotal, expandResult]);

  const handleExpand = async () => {
    if (selectedIds.size === 0) return;
    setExpandResult(null); // 清旧结果
    setExpanding(true);
    setExpandProgress([]);
    setExpandDone(0);
    setExpandTotal(selectedIds.size);

    try {
      const res = await fetch("/api/characters/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, characterIds: [...selectedIds] }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        alert(`扩展请求失败: ${errBody.error || res.status}`);
        setExpanding(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无响应流");
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          buf += decoder.decode(value, { stream: true });
        }
        const chunks = buf.split("\n\n");
        buf = chunks.pop() || "";
        for (const chunk of chunks) {
          const t = chunk.trim();
          if (!t) continue;
          const dataLine = chunk.split("\n").find(l => l.trim().startsWith("data: "));
          if (!dataLine) continue;
          try {
            const ev = JSON.parse(dataLine.trim().slice(6));
            if (ev.type === "progress") {
              if (ev.done !== undefined) setExpandDone(ev.done as number);
              if (ev.total) setExpandTotal(ev.total as number);
              if (ev.stage === "char-done" || ev.stage === "char-failed") {
                setExpandProgress((p) => [...p, { name: ev.name as string, status: ev.status as string || ev.stage as string, error: ev.error as string | undefined }]);
              }
              if (ev.stage === "start" || ev.stage === "dedup") {
                setExpandProgress((p) => [...p, { name: ev.message as string, status: ev.stage as string }]);
              }
            } else if (ev.type === "done") {
              setSelectedIds(new Set());
              onExpanded();
              setExpandResult({
                okList: (ev.okList || []) as string[],
                failList: (ev.failList || []) as Array<{ name: string; reason: string }>,
                total: ev.total as number,
              });
            } else if (ev.type === "error") {
              setExpandResult({
                okList: [],
                failList: [{ name: "全局错误", reason: ev.message as string }],
                total: 0,
              });
            }
          } catch { /* skip */ }
        }
        if (done) break;
      }

      // 流结束后处理buf残留——done事件可能卡在最后一段不完整的chunk里
      if (buf.trim()) {
        const dataLine = buf.split("\n").find(l => l.trim().startsWith("data: "));
        if (dataLine) {
          try {
            const ev = JSON.parse(dataLine.trim().slice(6));
            if (ev.type === "done") {
              setSelectedIds(new Set());
              onExpanded();
              setExpandResult({
                okList: (ev.okList || []) as string[],
                failList: (ev.failList || []) as Array<{ name: string; reason: string }>,
                total: ev.total as number,
              });
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setExpandResult({
        okList: [],
        failList: [{ name: "连接中断", reason: (e instanceof Error ? e.message : "网络错误").slice(0, 200) }],
        total: 0,
      });
    } finally {
      setExpanding(false);
    }
  };

  const handleClassify = async () => {
    setClassifying(true);
    setClassifyMsg("连接中…");
    setClassifyDone(0);
    setClassifyTotal(0);
    setClassifyResult(null);
    setClassifyGroups(null);
    setGroupSelections(new Map());
    try {
      const res = await fetch("/api/characters/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setClassifyResult({ ok: false, message: `❌ ${errBody.error || "请求失败"}` });
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("无响应流");
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() || "";
        for (const chunk of chunks) {
          const dataLine = chunk.split("\n").find(l => l.trim().startsWith("data: "));
          if (!dataLine) continue;
          try {
            const ev = JSON.parse(dataLine.trim().slice(6));
            console.log("[classify SSE]", ev.type, ev);

            if (ev.type === "progress") {
              setClassifyMsg(ev.message as string);
              if (ev.pct !== undefined) {
                setClassifyDone(Math.round(ev.pct as number));
                setClassifyTotal(100);
              }
            } else if (ev.type === "done") {
              // 从 done 事件拿 groups 数据
              const groups = (ev.groups || []) as Array<{
                category: string; label: string; description: string;
                members: string[]; memberIds: string[];
              }>;
              console.log("[classify] groups received:", groups.length, groups);
              if (groups.length > 0) {
                setClassifyGroups(groups);
                const sel = new Map<string, Set<string>>();
                for (const g of groups) {
                  sel.set(g.label, new Set(g.memberIds));
                }
                setGroupSelections(sel);
              }
              setClassifyResult({ ok: ev.ok !== false, message: ev.message as string });
            } else if (ev.type === "error") {
              setClassifyResult({ ok: false, message: `❌ ${ev.message}` });
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setClassifyResult({ ok: false, message: `❌ ${e instanceof Error ? e.message : "网络错误"}` });
    } finally {
      setClassifying(false);
    }
  };

  // 应用用户勾选的标签
  const handleApplyTags = async () => {
    if (!classifyGroups) return;
    setApplying(true);
    try {
      // 构建 assignments: [{characterId, labels[]}]
      const assignMap = new Map<string, string[]>(); // charId → labels[]
      for (const [label, memberSet] of groupSelections) {
        for (const cid of memberSet) {
          if (!assignMap.has(cid)) assignMap.set(cid, []);
          assignMap.get(cid)!.push(label);
        }
      }
      const assignments = Array.from(assignMap.entries()).map(([characterId, labels]) => ({
        characterId,
        labels: [...new Set(labels)], // 去重
      }));

      const res = await fetch("/api/characters/apply-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, assignments }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "失败" }));
        alert(`❌ 应用失败: ${err.error}`);
        return;
      }
      const data = await res.json();
      setClassifyResult({ ok: true, message: `✅ 已为 ${data.updated} 个角色应用标签` });
      setClassifyGroups(null); // 关闭分类面板
      onExpanded(); // 刷新角色列表
    } catch (e) {
      alert("❌ " + (e instanceof Error ? e.message : "网络错误"));
    } finally {
      setApplying(false);
    }
  };

  const toggleGroup = (label: string) => {
    const sel = new Map(groupSelections);
    const group = classifyGroups?.find(g => g.label === label);
    if (!group) return;
    const current = sel.get(label);
    if (current && current.size === group.memberIds.length) {
      // 全选 → 取消全选
      sel.set(label, new Set());
    } else {
      // 不全选 → 全选
      sel.set(label, new Set(group.memberIds));
    }
    setGroupSelections(sel);
  };

  const toggleMember = (label: string, memberId: string) => {
    const sel = new Map(groupSelections);
    const current = sel.get(label) || new Set();
    const next = new Set(current);
    next.has(memberId) ? next.delete(memberId) : next.add(memberId);
    sel.set(label, next);
    setGroupSelections(sel);
  };

  // 统计已选标签数
  const selectedTagCount = Array.from(groupSelections.values()).reduce((sum, s) => sum + s.size, 0);
  // 统计已选角色数
  const selectedCharIds = new Set<string>();
  for (const s of groupSelections.values()) { for (const id of s) selectedCharIds.add(id); }

  const filteredIds = new Set(filtered.map(c => c.id));
  const selectedInView = [...selectedIds].filter(id => filteredIds.has(id)).length;
  const allInViewSelected = filtered.length > 0 && selectedInView === filtered.length;

  return (
    <div className="space-y-1">
      {/* 搜索 */}
      <div className="mb-1.5">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索角色…"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />
      </div>

      {/* 筛选栏：角色定位 + 状态 */}
      <div className="flex gap-0.5 mb-1 flex-wrap items-center">
        {[
          { key: "all", label: "全部", count: characters.length },
          { key: "protagonist", label: "★主角", count: statRole("protagonist") },
          { key: "antagonist", label: "◆反派", count: statRole("antagonist") },
          { key: "mentor", label: "◈导师", count: statRole("mentor") },
          { key: "love_interest", label: "♡恋爱", count: statRole("love_interest") },
          { key: "supporting", label: "●配角", count: statRole("supporting") },
          { key: "background", label: "○背景", count: statRole("background") },
        ].filter(o => o.count > 0 || o.key === "all").map(o => (
          <button
            key={o.key}
            onClick={() => { setRoleFilter(roleFilter === o.key ? "all" : o.key); setTagFilter("all"); }}
            className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
              roleFilter === o.key ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}
          >
            {o.label}<span className="ml-0.5 opacity-60">{o.count}</span>
          </button>
        ))}
        <span className="text-zinc-700 mx-0.5">|</span>
        {[
          { key: "alive", label: "🟢存活", count: characters.length - statDead },
          { key: "dead", label: "💀离场", count: statDead },
        ].filter(o => o.count > 0).map(o => (
          <button
            key={o.key}
            onClick={() => { setStatusFilter(statusFilter === o.key ? "all" : o.key); }}
            className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
              statusFilter === o.key ? "bg-zinc-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}
          >
            {o.label}<span className="ml-0.5 opacity-60">{o.count}</span>
          </button>
        ))}
        {(roleFilter !== "all" || tagFilter !== "all" || statusFilter !== "all") && (
          <button
            onClick={() => { setRoleFilter("all"); setTagFilter("all"); setStatusFilter("all"); }}
            className="text-[10px] px-1.5 py-0.5 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          >
            ✕
          </button>
        )}
      </div>

      {/* 标签筛选：已分类/未分类 + 具体标签 */}
      <div className="flex gap-0.5 mb-1.5 flex-wrap items-center">
        {[
          { key: "has-tags", label: "🏷已分类", count: statHasTags },
          { key: "no-tags", label: "未分类", count: statNoTags },
        ].filter(o => o.count > 0).map(o => (
          <button
            key={o.key}
            onClick={() => setTagFilter(tagFilter === o.key ? "all" : o.key)}
            className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
              tagFilter === o.key
                ? "bg-amber-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}
          >
            {o.label}<span className="ml-0.5 opacity-60">{o.count}</span>
          </button>
        ))}
        {allTags.length > 0 && <span className="text-zinc-700 mx-0.5">·</span>}
        {allTags.slice(0, 12).map(t => (
          <button
            key={t}
            onClick={() => setTagFilter(tagFilter === t ? "all" : t)}
            className={`text-[9px] px-1 py-0 rounded transition-colors ${
              tagFilter === t
                ? "bg-purple-600 text-white"
                : "bg-zinc-800/50 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
            }`}
          >
            {t}
          </button>
        ))}
        {allTags.length > 12 && (
          <span className="text-[9px] text-zinc-600">+{allTags.length - 12}</span>
        )}
      </div>

      {/* 工具栏 */}
      <div className="flex items-center gap-1 mb-2 px-1 flex-wrap">
        <button
          onClick={() => {
            if (allInViewSelected) {
              const next = new Set(selectedIds);
              filtered.forEach(c => next.delete(c.id));
              setSelectedIds(next);
            } else {
              const next = new Set(selectedIds);
              filtered.forEach(c => next.add(c.id));
              setSelectedIds(next);
            }
          }}
          className="text-xs px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700"
        >
          {allInViewSelected ? "取消全选" : `全选(${filtered.length})`}
        </button>
        <button
          onClick={handleExpand}
          disabled={selectedIds.size === 0 || expanding}
          className={`text-xs px-2 py-0.5 rounded transition-colors ${
            selectedIds.size > 0 && !expanding
              ? "bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 border border-amber-700/40"
              : "text-zinc-600 border border-zinc-800 cursor-not-allowed"
          }`}
        >
          {expanding ? `⏳ ${expandDone}/${expandTotal}` : `✨ AI扩展 (${selectedIds.size})`}
        </button>
        <button
          onClick={handleClassify}
          disabled={classifying}
          className={`text-xs px-2 py-0.5 rounded transition-colors ${
            classifying
              ? "bg-purple-600/20 text-purple-400 border border-purple-700/40"
              : "bg-purple-900/20 text-purple-400 hover:bg-purple-900/40 border border-purple-800/30 hover:border-purple-700/40"
          }`}
        >
          {classifying ? `🏷 ${classifyDone}/${classifyTotal || "?"}` : "🏷 自动分类"}
        </button>
        {selectedIds.size > 0 && !expanding && (
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            清空
          </button>
        )}
      </div>

      {/* 分类进度 */}
      {classifying && (
        <div className="mb-2 p-2 rounded bg-purple-950/20 border border-purple-900/30">
          <p className="text-xs text-purple-400">{classifyMsg}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full transition-all" style={{
                width: `${classifyTotal > 0 ? Math.round((classifyDone / classifyTotal) * 100) : 5}%`
              }} />
            </div>
            <span className="text-xs text-zinc-500 shrink-0">{classifyDone}%</span>
          </div>
        </div>
      )}
      {/* 分类面板：用户审查 & 勾选 */}
      {!classifying && classifyGroups && classifyGroups.length > 0 && (
        <div className="mb-2 rounded bg-zinc-900/50 border border-purple-900/30 overflow-hidden">
          {/* 面板标题 */}
          <div className="flex items-center justify-between px-2 py-1.5 bg-purple-950/30 border-b border-purple-900/20">
            <span className="text-[10px] text-purple-400 font-medium">
              🏷 分类建议 · {classifyGroups.length} 组 · {selectedCharIds.size} 人
            </span>
            <button
              onClick={() => { setClassifyGroups(null); setGroupSelections(new Map()); }}
              className="text-[10px] text-zinc-500 hover:text-zinc-300"
            >✕ 关闭</button>
          </div>
          {/* 分类列表——按 category 分组 */}
          <div className="max-h-80 overflow-y-auto p-1.5 space-y-2">
            {(() => {
              const catOrder = ["title", "school", "experience", "club"];
              const catLabel: Record<string, string> = {
                title: "🏷 称号/头衔",
                school: "🏫 学校/学园",
                experience: "📋 经历/履历",
                club: "⚽ 俱乐部/队伍",
              };
              const grouped = new Map<string, typeof classifyGroups>();
              for (const g of classifyGroups) {
                const cat = g.category || "club";
                if (!grouped.has(cat)) grouped.set(cat, []);
                grouped.get(cat)!.push(g);
              }
              return catOrder.filter(c => grouped.has(c)).map(cat => (
                <div key={cat}>
                  <div className="text-[10px] text-zinc-500 px-1 mb-0.5 font-medium">
                    {catLabel[cat] || cat}
                  </div>
                  {grouped.get(cat)!.map(g => {
                    const sel = groupSelections.get(g.label) || new Set<string>();
                    const allSelected = g.memberIds.length > 0 && sel.size === g.memberIds.length;
                    return (
                      <div key={g.label} className="mb-1 rounded bg-zinc-800/50 border border-zinc-800">
                        {/* 分类头：全选/取消 */}
                        <button
                          onClick={() => toggleGroup(g.label)}
                          className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-zinc-800/80 transition-colors rounded-t"
                        >
                          <span className={`text-xs ${allSelected ? "text-purple-400" : "text-zinc-600"}`}>
                            {allSelected ? "☑" : "☐"}
                          </span>
                          <span className="text-[11px] text-zinc-300 font-medium">{g.label}</span>
                          {g.description && (
                            <span className="text-[9px] text-zinc-500">— {g.description}</span>
                          )}
                          <span className="text-[9px] text-zinc-600 ml-auto">
                            {sel.size}/{g.memberIds.length}
                          </span>
                        </button>
                        {/* 成员列表 */}
                        <div className="flex flex-wrap gap-0.5 px-2 pb-1.5">
                          {g.members.map((name, i) => {
                            const mid = g.memberIds[i];
                            const checked = mid ? sel.has(mid) : false;
                            // 名字 → 角色 brief
                            const char = characters.find(c => c.id === mid);
                            return (
                              <button
                                key={mid || name}
                                onClick={() => mid && toggleMember(g.label, mid)}
                                className={`text-[9px] px-1.5 py-0.5 rounded-full transition-colors ${
                                  checked
                                    ? "bg-purple-600/30 text-purple-300 border border-purple-500/30"
                                    : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700 border border-transparent"
                                }`}
                              >
                                {name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
          {/* 底部操作栏 */}
          <div className="flex items-center justify-between px-2 py-1.5 bg-zinc-900 border-t border-zinc-800">
            <span className="text-[9px] text-zinc-600">
              {selectedTagCount} 个标签分配给 {selectedCharIds.size} 人
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => { setClassifyGroups(null); setGroupSelections(new Map()); }}
                className="text-[10px] px-2 py-0.5 rounded text-zinc-500 hover:text-zinc-300"
              >
                取消
              </button>
              <button
                onClick={handleApplyTags}
                disabled={selectedTagCount === 0 || applying}
                className={`text-[10px] px-3 py-0.5 rounded font-medium transition-colors ${
                  selectedTagCount > 0 && !applying
                    ? "bg-purple-600 text-white hover:bg-purple-500"
                    : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                }`}
              >
                {applying ? "⏳ 应用中…" : `✅ 应用标签 (${selectedTagCount})`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 分类错误/简单结果 */}
      {!classifying && !classifyGroups && classifyResult && (
        <div className={`mb-2 px-2 py-1 rounded text-[10px] ${
          classifyResult.ok
            ? "bg-purple-950/20 text-purple-400 border border-purple-900/30"
            : "bg-red-950/30 text-red-400 border border-red-900/20"
        }`}>
          {classifyResult.message}
          <button onClick={() => setClassifyResult(null)} className="ml-2 text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
      )}

      {/* 扩展进度 */}
      {expanding && (
        <div className="mb-2 p-2 rounded bg-amber-950/20 border border-amber-900/30 max-h-40 overflow-y-auto">
          {expandProgress.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              加载全局上下文...
            </div>
          )}
          {expandProgress.map((p, i) => {
            const isInfo = p.status === "start" || p.status === "dedup";
            const isOk = p.status === "ok" || p.status === "char-done";
            const isFailed = p.status === "failed" || p.status === "char-failed";
            if (isInfo) return (
              <div key={i} className="text-xs text-zinc-500 py-0.5">{p.name}</div>
            );
            return (
              <div key={i} className={`text-xs ${isOk ? "text-emerald-400" : isFailed ? "text-red-400" : "text-zinc-500"}`}>
                <span className="inline-flex items-center gap-1">
                  <span>{isOk ? "✅" : isFailed ? "⚠️" : "⏳"}</span>
                  <span>{p.name}</span>
                  {p.error && <span className="text-red-400/60 text-[10px] ml-1">— {p.error}</span>}
                </span>
              </div>
            );
          })}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full transition-all" style={{
                width: `${expandTotal > 0 ? Math.round((expandDone / expandTotal) * 100) : 0}%`
              }} />
            </div>
            <span className="text-xs text-zinc-500 shrink-0">{expandDone}/{expandTotal} · {expandTotal > 0 ? Math.round((expandDone / expandTotal) * 100) : 0}%</span>
          </div>
        </div>
      )}

      {/* 扩展结果弹窗 */}
      {expandResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setExpandResult(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-[480px] max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* 头部 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="text-base font-bold text-zinc-200">
                {expandResult.failList.length === 0 ? "🎉 全部扩展成功" : "📋 扩展结果"}
              </h3>
              <button onClick={() => setExpandResult(null)} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">✕</button>
            </div>

            {/* 统计 */}
            <div className="px-5 py-3 flex gap-4 text-sm border-b border-zinc-800/50">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold text-lg">{expandResult.okList.length}</span>
                <span className="text-zinc-500">成功</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={expandResult.failList.length > 0 ? "text-red-400 font-bold text-lg" : "text-zinc-500 font-bold text-lg"}>{expandResult.failList.length}</span>
                <span className="text-zinc-500">失败</span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-zinc-500 text-xs">共 {expandResult.total} 个角色</span>
              </div>
            </div>

            {/* 内容区 */}
            <div className="overflow-y-auto px-5 py-3 flex-1 max-h-[50vh]">
              {/* 成功列表 */}
              {expandResult.okList.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-emerald-500 font-medium mb-1.5">✅ 成功 ({expandResult.okList.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {expandResult.okList.map((name, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-emerald-950/30 text-emerald-300 border border-emerald-900/30">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 失败列表 + 原因 */}
              {expandResult.failList.length > 0 && (
                <div>
                  <div className="text-xs text-red-400 font-medium mb-1.5">⚠️ 失败 ({expandResult.failList.length})</div>
                  <div className="space-y-1.5">
                    {expandResult.failList.map((f, i) => (
                      <div key={i} className="p-2 rounded bg-red-950/20 border border-red-900/20">
                        <div className="text-xs text-red-300 font-medium">{f.name}</div>
                        <div className="text-[11px] text-red-400/70 mt-0.5">{f.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {expandResult.okList.length === 0 && expandResult.failList.length === 0 && (
                <div className="text-sm text-zinc-500 text-center py-8">无结果数据</div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="px-5 py-3 border-t border-zinc-800 flex gap-2 justify-end">
              <button
                onClick={() => setExpandResult(null)}
                className="px-4 py-1.5 text-sm rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 角色列表——按 role 分组 */}
      {roleOrder.map(role => {
        const items = grouped[role];
        if (!items || items.length === 0) return null;
        return (
          <div key={role} className="mb-2">
            <div className="text-[10px] text-zinc-600 px-2 mb-0.5 font-medium uppercase tracking-wider">
              {roleLabel[role] || role} ({items.length})
            </div>
            {items.map(c => (
              <div key={c.id} className="flex items-center gap-2 py-1 px-2 rounded text-xs text-zinc-400 hover:bg-zinc-800/50 group">
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.id)}
                  onChange={() => toggleSelect(c.id)}
                  onClick={e => e.stopPropagation()}
                  className="rounded accent-amber-600 shrink-0"
                />
                <div onClick={() => onEdit(c)} className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                  <span className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] shrink-0">
                    {c.name[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="truncate block hover:text-zinc-300">{c.name}</span>
                    {(c.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝")).length > 0 && (
                      <div className="flex gap-0.5 mt-0.5 flex-wrap">
                        {(c.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝")).slice(0, 5).map((t: string) => (
                          <button
                            key={t}
                            onClick={e => { e.stopPropagation(); setTagFilter(t); }}
                            className={`text-[9px] px-1 py-0 rounded transition-colors ${
                              tagFilter === t ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
                            }`}
                          >{t}</button>
                        ))}
                        {(c.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝")).length > 5 && (
                          <span className="text-[9px] text-zinc-600">+{(c.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝")).length - 5}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); if (confirm(`删除角色「${c.name}」？`)) onDelete(c.id); }}
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 shrink-0"
                >✕</button>
              </div>
            ))}
          </div>
        );
      })}

      {filtered.length === 0 && (
        <p className="text-xs text-zinc-600 px-2 py-2">无匹配角色</p>
      )}

      <button onClick={onNew} className="w-full text-left text-xs text-indigo-400 hover:text-indigo-300 py-1 px-2">
        + 添加角色
      </button>
    </div>
  );
}
