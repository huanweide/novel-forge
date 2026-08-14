"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { CharacterData } from "./types";
import { Icon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/States";
import { confirmDialog, toastError, toastSuccess, toastInfo } from "@/components/ui/toast";
import { useConfirmDelete } from "@/components/workspace/useConfirmDelete";
import { CharacterFilters } from "./CharacterFilters";
import { CharacterToolbar } from "./CharacterToolbar";
import { ExpandResultModal } from "./ExpandResultModal";
import { CharacterGroupList } from "./CharacterGroupList";
import type { CharacterRole } from "@/core/types";
import { CHARACTER_ROLE_OPTIONS } from "@/lib/character-parse";
import { filterCharacters } from "@/lib/character-filter";
import { MergePendingPanel } from "./MergePendingPanel";

export function CharacterList({
  characters = [],
  projectId,
  onEdit,
  onDelete,
  onConfirm,
  onNew,
  onExpanded,
}: {
  characters?: CharacterData[];
  projectId: string;
  onEdit: (c: CharacterData) => void;
  onDelete: (id: string) => Promise<void>;
  onConfirm?: (id: string) => Promise<void>;
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
  // 自动去重合并（v1.4.0）
  const [deduping, setDeduping] = useState(false);
  const [dedupeResult, setDedupeResult] = useState<{
    mergedGroups: Array<{ mainId: string; mainName: string; merged: Array<{ id: string; name: string }> }>;
    pendingGroups: Array<{ mainId: string; mainName: string; merged: Array<{ id: string; name: string }> }>;
    markedRockets: string[];
    total: number;
  } | null>(null);
  // 项目加载时后台静默检测存量重复角色（detectOnly，只分组不写库），有则提示用户一键清理（不自动改数据）
  const [dedupeHint, setDedupeHint] = useState<{ merged: number; pending: number } | null>(null);
  const dedupeProbedProject = useRef<string | null>(null);
  // 自定义标签（v2.0.4）：玩家自建标签并往里加人
  const [newTag, setNewTag] = useState("");
  const [applying, setApplying] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // v2.0.16：函数式更新 + useCallback 稳定，配合 CharacterRow 的 React.memo 避免搜索输入等父级 state 变化时所有卡片无谓重渲染
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

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
  // 注意：全选不再自动联动「AI 扩展」——避免用户仅想批量删除/打标时，被意外发起全量 LLM 角色扩展（惊吓副作用 + 隐性算力消耗）。扩展必须是显式点按钮。
  const handleToggleAll = () => {
    if (allInViewSelected) {
      const next = new Set(selectedIds);
      filtered.forEach(c => next.delete(c.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filtered.forEach(c => next.add(c.id));
      setSelectedIds(next);
    }
  };

  // v2.18：过滤逻辑抽为纯函数 filterCharacters（便于单测），行为与原内联逻辑一致
  const filtered = filterCharacters(characters, { search, roleFilter, tagFilter, statusFilter });

  const roleOrder = CHARACTER_ROLE_OPTIONS.map((o) => o.value as CharacterRole);
  const roleLabel: Record<string, string> = Object.fromEntries(CHARACTER_ROLE_OPTIONS.map((o) => [o.value, o.label]));
  const grouped: Record<string, CharacterData[]> = {};
  for (const c of filtered) {
    const r = c.role || "supporting";
    if (!grouped[r]) grouped[r] = [];
    grouped[r].push(c);
  }

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

  // v1.4.0：自动去重合并——扫描全部角色卡，合并同一真实人物（昵称/尊称/别名/小名/隐藏身份揭露），结果弹窗预览后由 onExpanded 刷新
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
        pendingGroups: d.pendingGroups || [],
        markedRockets: d.markedRockets || [],
        total: d.total || 0,
      });
      const merged = (d.mergedGroups || []).length;
      const pending = (d.pendingGroups || []).length;
      if (merged + pending === 0) {
        toastSuccess("未发现需合并或待确认的角色，全部干净");
      } else {
        toastInfo(`扫描 ${d.total || 0} 个角色：${merged} 组合并、${pending} 组待确认`);
      }
    } catch (e) {
      toastError("去重合并失败：" + (e instanceof Error ? e.message : "网络错误"));
    } finally {
      setDeduping(false);
    }
  };

  // 项目加载/切换时后台静默检测存量重复角色（detectOnly：只分组、不写库、不合并），有则提示用户一键清理
  const handleDedupeFromHint = () => {
    setDedupeHint(null);
    void handleDedupe();
  };
  // v2.18：补 AbortController——组件卸载（切换项目/离开页面）时中止在途请求，
  // 避免 fetch 回调在卸载后 setState 触发 React 警告（diagnostic 反模式修复）。
  useEffect(() => {
    if (!projectId || dedupeProbedProject.current === projectId) return;
    dedupeProbedProject.current = projectId;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/characters/dedupe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, detectOnly: true }),
          signal: controller.signal,
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok) {
          const merged = (d.mergedGroups || []).length;
          const pending = (d.pendingGroups || []).length;
          // 高置信组已在后端静默自动合并：刷新列表以反映合并结果（不弹提示）
          if (merged > 0) onExpanded();
          // 仅低置信待确认组进提示 banner（用户手动点确认）
          if (pending > 0) setDedupeHint({ merged, pending });
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return; // 卸载中止，静默
        // 静默：检测失败不影响正常使用
      }
    })();
    return () => controller.abort();
  }, [projectId]);

  // v2.0.4：玩家自建标签并往里加人——把勾选角色通过 apply-tags 打上新标签（并集语义，不会抹掉旧标签）
  const handleApplyTags = async () => {
    const tag = newTag.trim();
    if (!tag) {
      toastInfo("请先输入标签名");
      return;
    }
    if (selectedIds.size === 0) {
      toastInfo("请先勾选要加入标签的角色");
      return;
    }
    setApplying(true);
    try {
      const assignments = [...selectedIds].map((characterId) => ({ characterId, labels: [tag] }));
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
      toastSuccess(`已为 ${data.updated} 个角色打上标签「${tag}」`);
      setNewTag("");
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

  // v1.6.24：角色卡待审审批闭环——默认确认处理器（父组件可传 onConfirm 覆盖，统一刷新逻辑）
  // v2.0.16：useCallback 稳定，供 resolvedOnConfirm 复用
  const handleConfirm = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/characters/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus: "approved" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "失败" }));
        toastError(`确认失败: ${err.error || res.status}`);
        return;
      }
      toastSuccess("角色卡已确认并入（将注入生成）");
      onExpanded();
    } catch (e) {
      toastError("确认失败：" + (e instanceof Error ? e.message : "网络错误"));
    }
  }, [onExpanded]);

  // v2.0.16：稳定化传给 CharacterRow 的回调，配合 React.memo 避免每次父级 state 变化（如搜索输入）时所有卡片无谓重渲染
  const resolvedOnConfirm = useCallback(
    (id: string) => { if (onConfirm) onConfirm(id); else handleConfirm(id); },
    [onConfirm, handleConfirm],
  );
  const handleDelete = useCallback((id: string, name: string) => deleteCharacter(id, name), [deleteCharacter]);
  const handleTagClick = useCallback((t: string) => setTagFilter(t), []);

  const filteredIds = new Set(filtered.map(c => c.id));
  const selectedInView = [...selectedIds].filter(id => filteredIds.has(id)).length;
  const allInViewSelected = filtered.length > 0 && selectedInView === filtered.length;

  return (
    <div className="space-y-1">
      {dedupeHint && dedupeHint.pending > 0 && (
        <button
          type="button"
          onClick={handleDedupeFromHint}
          className="mb-1 w-full text-left cursor-pointer rounded-md border border-[var(--nv-warning)] bg-[var(--nv-surface-2)] px-3 py-2 text-xs text-[var(--nv-text-primary)] hover:opacity-80"
          title="点击确认合并低置信重复角色"
        >
          检测到 {dedupeHint.pending} 个疑似同一人但把握不足的重复角色，点击确认合并{dedupeHint.merged > 0 ? `（另有 ${dedupeHint.merged} 组高置信重复已自动合并）` : ""} →
        </button>
      )}
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
        deduping={deduping}
        onToggleAll={handleToggleAll}
        onExpand={handleExpand}
        onDedupe={handleDedupe}
        onRange={handleRangeSelect}
        onClear={() => setSelectedIds(new Set())}
        newTag={newTag}
        onNewTagChange={setNewTag}
        onApplyTags={handleApplyTags}
        applying={applying}
        selectedCount={selectedIds.size}
      />

      {/* v2.0.4 → v2.0.14：自建标签移入 CharacterToolbar 复用 base 样式 */}
      {/* 去重合并结果弹窗 */}
      {dedupeResult && (
        <div className="mt-2 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="flex-1 min-w-0 truncate pr-2 text-xs font-medium text-[var(--nv-text-primary)]">去重合并结果（共扫描 {dedupeResult.total} 个角色）</span>
            <button onClick={() => { setDedupeResult(null); onExpanded(); }} aria-label="关闭去重结果" className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 text-[10px] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)]" title="关闭去重结果"><Icon name="x" size={11} />关闭</button>
          </div>
          {dedupeResult.mergedGroups.length === 0 && dedupeResult.pendingGroups.length === 0 ? (
            <p className="text-xs text-[var(--nv-text-muted)]">全部干净：没有需要合并或标记的角色。</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {dedupeResult.mergedGroups.map((g, i) => (
                <div key={`m${i}`} className="text-[11px] text-[var(--nv-text-secondary)]">
                  <span className="text-[var(--nv-primary)]">合：{g.mainName}</span> ← {g.merged.map((m) => m.name).join("、")}
                </div>
              ))}
              {dedupeResult.pendingGroups.map((g, i) => (
                <div key={`p${i}`} className="text-[11px] text-[var(--nv-warning)]">
                  待确认：{g.mainName} ← {g.merged.map((m) => m.name).join("、")}
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-[var(--nv-text-tertiary)] mt-2">被合并角色已软删标记（🗂 已合并），可在标签筛选中查看/隐藏。</p>
        </div>
      )}

      <MergePendingPanel projectId={projectId} onChanged={onExpanded} />

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
        onDelete={handleDelete}
        onConfirm={resolvedOnConfirm}
        onTagClick={handleTagClick}
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
