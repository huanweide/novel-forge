"use client";

import { useState, useEffect, useRef } from "react";
import type { CharacterData } from "./types";
import { Icon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/States";
import { confirmDialog, toastError, toastSuccess, toastInfo } from "@/components/ui/toast";
import { useConfirmDelete } from "@/components/workspace/useConfirmDelete";
import { CharacterFilters } from "./CharacterFilters";
import { CharacterToolbar } from "./CharacterToolbar";
import { ClassifyPanel } from "./ClassifyPanel";
import { ExpandResultModal } from "./ExpandResultModal";
import { CharacterGroupList } from "./CharacterGroupList";

export function CharacterList({
  characters = [],
  projectId,
  onEdit,
  onDelete,
  onNew,
  onExpanded,
}: {
  characters?: CharacterData[];
  projectId: string;
  onEdit: (c: CharacterData) => void;
  onDelete: (id: string) => Promise<void>;
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
  // 自动去重合并（v1.4.0）
  const [deduping, setDeduping] = useState(false);
  const [dedupeResult, setDedupeResult] = useState<{
    mergedGroups: Array<{ mainId: string; mainName: string; merged: Array<{ id: string; name: string }> }>;
    markedRockets: string[];
    total: number;
  } | null>(null);
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

  // 范围选择——对筛选后的可见列表生效
  const handleRangeSelect = (indices: Set<number>) => {
    const visible = filtered; // filtered 是筛选+搜索后的结果
    if (indices.size === 0) {
      setSelectedIds(new Set());
      return;
    }
    const ids = new Set<string>();
    for (const i of indices) {
      if (i < visible.length) ids.add(visible[i].id);
    }
    setSelectedIds(ids);
  };

  // 全选/取消全选（仅对筛选后可见列表生效）
  // v1.2.0：全选后自动联动「AI 扩展」——一次点选即开跑，无需再手动点扩展按钮
  const handleToggleAll = () => {
    if (allInViewSelected) {
      const next = new Set(selectedIds);
      filtered.forEach(c => next.delete(c.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filtered.forEach(c => next.add(c.id));
      setSelectedIds(next);
      if (next.size > 0) void handleExpand(next);
    }
  };

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

  const roleOrder = ["protagonist", "antagonist", "mentor", "love_interest", "supporting", "background"];
  const roleLabel: Record<string, string> = { protagonist: "主角", antagonist: "反派", mentor: "导师", love_interest: "恋爱", supporting: "配角", background: "背景" };
  const grouped: Record<string, CharacterData[]> = {};
  for (const c of filtered) {
    const r = c.role || "supporting";
    if (!grouped[r]) grouped[r] = [];
    grouped[r].push(c);
  }

  // 兜底：classifying结束但没显示面板 → 确保结果消息可见（仅触发一次）
  const classifyFallbackTriggered = useRef(false);
  useEffect(() => {
    if (!classifying && classifyResult && !classifyGroups && !classifyFallbackTriggered.current) {
      classifyFallbackTriggered.current = true;
      // 强制刷新——让错误面板显示（如果 classifyResult.message 非空但面板没渲染）
      setClassifyResult(prev => prev ? { ...prev } : null);
    }
    if (classifying) classifyFallbackTriggered.current = false;
  }, [classifying, classifyResult, classifyGroups]);

  // 兜底：expanding结束但没有弹窗 → 从progress自动构建结果（仅触发一次）
  const expandFallbackTriggered = useRef(false);
  useEffect(() => {
    if (!expanding && expandDone > 0 && expandProgress.length > 0 && !expandFallbackTriggered.current) {
      const okList = expandProgress
        .filter(p => p.status === "ok" || p.status === "char-done")
        .map(p => p.name);
      const failList = expandProgress
        .filter(p => p.status === "failed" || p.status === "char-failed")
        .map(p => ({ name: p.name, reason: p.error || "未知错误" }));
      if (okList.length + failList.length > 0 && !expandResult) {
        expandFallbackTriggered.current = true;
        setExpandResult({ okList, failList, total: expandTotal });
      }
    }
    // expanding重新开始时重置标记
    if (expanding) expandFallbackTriggered.current = false;
  }, [expanding, expandDone, expandProgress, expandTotal, expandResult]);

  const handleExpand = async (ids?: Set<string>) => {
    const target = ids ?? selectedIds;
    if (target.size === 0) return;
    setExpandResult(null); // 清旧结果
    setExpanding(true);
    setExpandProgress([]);
    setExpandDone(0);
    setExpandTotal(target.size);

    try {
      const res = await fetch("/api/characters/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, characterIds: [...target] }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        toastError(`扩展请求失败: ${errBody.error || res.status}`);
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
        setClassifyResult({ ok: false, message: `${errBody.error || "请求失败"}` });
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("无响应流");
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // 流结束——处理 buf 中残余的 data: 行（done 事件可能卡在这里）
          if (buf.trim()) {
            const lines = buf.split("\n").filter(l => l.trim().startsWith("data: "));
            for (const dataLine of lines) {
              try {
                const ev = JSON.parse(dataLine.trim().slice(6));
                console.log("[classify SSE residual]", ev.type, ev);
                if (ev.type === "progress") {
                  setClassifyMsg(ev.message as string);
                  if (ev.pct !== undefined) { setClassifyDone(Math.round(ev.pct as number)); setClassifyTotal(100); }
                } else if (ev.type === "done") {
                  const groups = (ev.groups || []) as Array<{
                    category: string; label: string; description: string;
                    members: string[]; memberIds: string[];
                  }>;
                  if (groups.length > 0) {
                    setClassifyGroups(groups);
                    const sel = new Map<string, Set<string>>();
                    for (const g of groups) sel.set(g.label, new Set(g.memberIds));
                    setGroupSelections(sel);
                  }
                  setClassifyResult({ ok: ev.ok !== false, message: ev.message as string });
                  setClassifyDone(100); setClassifyTotal(100);
                } else if (ev.type === "error") {
                  setClassifyResult({ ok: false, message: `${ev.message}` });
                }
              } catch { /* skip */ }
            }
          }
          break;
        }
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
              setClassifyDone(100); setClassifyTotal(100);
            } else if (ev.type === "error") {
              setClassifyResult({ ok: false, message: `${ev.message}` });
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setClassifyResult({ ok: false, message: `${e instanceof Error ? e.message : "网络错误"}` });
    } finally {
      setClassifying(false);
    }
  };

  // v1.4.0：自动去重合并——扫描全部角色卡，合并相似名、标记龙套，结果弹窗预览后由 onExpanded 刷新
  const handleDedupe = async () => {
    setDeduping(true);
    setDedupeResult(null);
    try {
      const res = await fetch("/api/characters/dedupe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(d.error || "去重合并失败");
        return;
      }
      setDedupeResult({
        mergedGroups: d.mergedGroups || [],
        markedRockets: d.markedRockets || [],
        total: d.total || 0,
      });
      if ((d.mergedGroups || []).length + (d.markedRockets || []).length === 0) {
        toastSuccess("未发现需去重/标记的角色，全部干净");
      } else {
        toastInfo(`扫描 ${d.total || 0} 个角色：${(d.mergedGroups || []).length} 组合并、${(d.markedRockets || []).length} 个龙套`);
      }
    } catch (e) {
      toastError("去重合并失败：" + (e instanceof Error ? e.message : "网络错误"));
    } finally {
      setDeduping(false);
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
        toastError(`应用失败: ${err.error}`);
        return;
      }
      const data = await res.json();
      setClassifyResult({ ok: true, message: `已为 ${data.updated} 个角色应用标签` });
      setClassifyGroups(null); // 关闭分类面板
      onExpanded(); // 刷新角色列表
    } catch (e) {
      toastError("" + (e instanceof Error ? e.message : "网络错误"));
    } finally {
      setApplying(false);
    }
  };

  const { deletingId, remove: deleteCharacter } = useConfirmDelete({
    title: "删除角色",
    description: (id, name) => `确定删除角色「${name}」？此操作不可恢复。`,
    deleteFn: onDelete,
    errorPrefix: "角色删除失败",
  });

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
      <CharacterFilters
        characters={characters}
        search={search}
        onSearch={setSearch}
        roleFilter={roleFilter}
        statusFilter={statusFilter}
        tagFilter={tagFilter}
        onRole={setRoleFilter}
        onStatus={setStatusFilter}
        onTag={setTagFilter}
      />

      <CharacterToolbar
        filtered={filtered}
        selectedIds={selectedIds}
        allInViewSelected={allInViewSelected}
        expanding={expanding}
        expandDone={expandDone}
        expandTotal={expandTotal}
        classifying={classifying}
        classifyDone={classifyDone}
        classifyTotal={classifyTotal}
        deduping={deduping}
        onToggleAll={handleToggleAll}
        onExpand={handleExpand}
        onClassify={handleClassify}
        onDedupe={handleDedupe}
        onRange={handleRangeSelect}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* 去重合并结果弹窗 */}
      {dedupeResult && (
        <div className="mt-2 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--nv-text-primary)]">去重合并结果（共扫描 {dedupeResult.total} 个角色）</span>
            <button onClick={() => { setDedupeResult(null); onExpanded(); }} className="text-[10px] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)]"><Icon name="x" size={11} /> 关闭</button>
          </div>
          {dedupeResult.mergedGroups.length === 0 && dedupeResult.markedRockets.length === 0 ? (
            <p className="text-xs text-[var(--nv-text-muted)]">全部干净：没有需要合并或标记的角色。</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {dedupeResult.mergedGroups.map((g, i) => (
                <div key={i} className="text-[11px] text-[var(--nv-text-secondary)]">
                  <span className="text-[var(--nv-primary)]">合：{g.mainName}</span> ← {g.merged.map((m) => m.name).join("、")}
                </div>
              ))}
              {dedupeResult.markedRockets.length > 0 && (
                <div className="text-[11px] text-[var(--nv-text-secondary)]">
                  <span className="text-[var(--nv-accent)]">龙套标记：</span>{dedupeResult.markedRockets.join("、")}
                </div>
              )}
            </div>
          )}
          <p className="text-[10px] text-[var(--nv-text-tertiary)] mt-2">被合并角色已软删标记（🗂 已合并），龙套仅打标签（🎭 龙套）不删除，可在标签筛选中查看/隐藏。</p>
        </div>
      )}

      <ClassifyPanel
        classifying={classifying}
        groups={classifyGroups}
        selections={groupSelections}
        characters={characters}
        applying={applying}
        onToggleGroup={toggleGroup}
        onToggleMember={toggleMember}
        onApply={handleApplyTags}
        onClose={() => { setClassifyGroups(null); setGroupSelections(new Map()); }}
        msg={classifyMsg}
        done={classifyDone}
        total={classifyTotal}
        result={classifyResult}
        onResultClose={() => setClassifyResult(null)}
        selectedTagCount={selectedTagCount}
        selectedCharIds={selectedCharIds}
      />

      <ExpandResultModal
        result={expandResult}
        onClose={() => setExpandResult(null)}
        progress={expandProgress}
        done={expandDone}
        total={expandTotal}
        expanding={expanding}
      />

      <CharacterGroupList
        grouped={grouped}
        roleOrder={roleOrder}
        roleLabel={roleLabel}
        selectedIds={selectedIds}
        deletingId={deletingId}
        tagFilter={tagFilter}
        onToggleSelect={toggleSelect}
        onEdit={onEdit}
        onDelete={(id, name) => deleteCharacter(id, name)}
        onTagClick={(t) => setTagFilter(t)}
      />

      {filtered.length === 0 && (
        <EmptyState
          icon="user"
          title="无匹配角色"
          description='点击「+ 添加角色」新建，或调整筛选条件'
        />
      )}

      <button onClick={onNew} className="w-full text-left text-xs text-[var(--nv-primary)] hover:text-[var(--nv-primary)] py-1 px-2">
        + 添加角色
      </button>
    </div>
  );
}
