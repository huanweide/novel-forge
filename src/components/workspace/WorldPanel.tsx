"use client";
import { describeHttpError } from "@/lib/stream-error";

import { useMemo, useState } from "react";
import type { LorebookData } from "./types";
import { type LastAppearance } from "@/lib/workspace-appearance";
import { confirmDialog, toastError, toastSuccess, toastInfo, toastAdded } from "@/components/ui/toast";
import { Icon } from "@/components/ui/icons";
import { useConfirmDelete } from "@/components/workspace/useConfirmDelete";
import { WorldModuleSidebar } from "./WorldModuleSidebar";
import { WorldEditor } from "./WorldEditor";
import { WorldEntryList } from "./WorldEntryList";
import {
  WORLD_MODULES, DEPTH_LABEL, CATEGORY_TO_MODULE, MODULE_FIELDS,
  countByModule,
  type ModuleKey,
} from "./worldPanelData";

// ─── 组件 ──────────────────────────────────────────────────

export function WorldPanel({
  projectId, entries = [], onRefresh, onEditEntry, onLocate,
  lastAppearanceMap, onJumpToChapter,
}: {
  projectId: string; entries?: LorebookData[]; onRefresh: () => void;
  onEditEntry?: (entry: LorebookData) => void;
  onLocate?: (id: string) => void;
  lastAppearanceMap?: Record<string, LastAppearance | null>;
  onJumpToChapter?: (nodeId: string) => void;
}) {
  const [activeModule, setActiveModule] = useState<ModuleKey>("geography");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // 按当前板块过滤
  const moduleEntries = entries.filter((e) => {
    const mapped = CATEGORY_TO_MODULE[e.category] || "custom";
    return mapped === activeModule || (activeModule === "custom" && !CATEGORY_TO_MODULE[e.category]);
  });

  // v3.1.73：世界书板块内搜索（叠加在板块粗筛上 · WORLD-SEARCH）
  // 模糊匹配 title + keys（数组 join）+ content 前 200 字符；与 CharacterList 搜索风格对齐。
  const [searchTerm, setSearchTerm] = useState("");
  const { displayEntries, totalInModule, matched } = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return { displayEntries: moduleEntries, totalInModule: moduleEntries.length, matched: moduleEntries.length };
    const matchedArr = moduleEntries.filter((e) => {
      const title = (e.title ?? "").toLowerCase();
      const keysJoined = (Array.isArray(e.keys) ? e.keys.join(" ") : "").toLowerCase();
      const snippet = (e.content ?? "").slice(0, 200).toLowerCase();
      return title.includes(q) || keysJoined.includes(q) || snippet.includes(q);
    });
    return { displayEntries: matchedArr, totalInModule: moduleEntries.length, matched: matchedArr.length };
  }, [moduleEntries, searchTerm]);

  // 板块计数（复用 worldPanelData 纯函数，custom 按 e.category === "custom" 统计）
  const getCount = (key: ModuleKey) => countByModule(entries, key);

  // 字段变更
  const handleFieldChange = (key: string, value: string) =>
    setCreateForm((prev) => ({ ...prev, [key]: value }));

  // 新建
  const handleCreate = async () => {
    const fields = MODULE_FIELDS[activeModule];
    const contentParts: string[] = [];
    for (const f of fields) {
      const val = createForm[f.key]?.trim();
      if (val) contentParts.push(`【${f.label}】${val}`);
    }
    const content = contentParts.join("\n") || "（待补充）";

    // 关系条目：自动生成标题和 keys
    let title: string;
    let keys: string[];
    if (activeModule === "character_relationship") {
      const charA = createForm["charA"]?.trim() || "?";
      const charB = createForm["charB"]?.trim() || "?";
      const relation = createForm["relation"]?.trim() || "关系";
      title = `${charA} ↔ ${charB}：${relation}`;
      keys = [charA, charB, relation].filter(Boolean);
    } else {
      title = createForm["title"]?.trim() || "未命名";
      keys = [title];
    }

    setSaving(true);
    try {
      const res = await fetch("/api/lorebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId, title,
          category: activeModule === "custom" ? "custom" : activeModule,
          keys,
          content,
          insertionOrder: 50,
          depth: Number(createForm["depth"] ?? 3) || 3,
        }),
      });
      if (res.ok) { setShowCreate(false); setCreateForm({}); toastAdded(title, "世界书"); onRefresh(); }
      else { const d = await res.json().catch(() => ({ error: "未知错误" })); const _f = describeHttpError(res.status, d); toastError(`条目创建失败：${_f.description}`); }
    } catch (err) { toastError("条目创建失败（网络错误）：" + (err instanceof Error ? err.message : "请重试")); }
    finally { setSaving(false); }
  };

  // 删除
  const { deletingId, remove: deleteEntry } = useConfirmDelete({
    title: "删除条目",
    description: "确定删除此世界书条目？此操作不可恢复。",
    deleteFn: async (id) => {
      const res = await fetch(`/api/lorebook/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({ error: "未知错误" })); const _f = describeHttpError(res.status, d); throw new Error(_f.description); }
    },
    onSuccess: onRefresh,
    errorPrefix: "条目删除失败",
  });

  // 待审确认：自动填表条目确认并入世界书
  const confirmEntry = async (id: string) => {
    try {
      const res = await fetch(`/api/lorebook/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus: "approved" }),
      });
      if (!res.ok) { const _f = describeHttpError(res.status, await res.json().catch(() => ({}))); throw new Error(_f.description); }
      onRefresh();
      toastSuccess("已确认并入");
    } catch (err) {
      toastError(`确认失败：${String(err)}`);
    }
  };

  const moduleInfo = WORLD_MODULES.find((m) => m.key === activeModule);
  const currentFields = MODULE_FIELDS[activeModule];

  return (
    <div className="flex flex-col h-full">
      <WorldModuleSidebar
        modules={WORLD_MODULES}
        activeModule={activeModule}
        getCount={getCount}
        onSelect={setActiveModule}
        onSetShowCreate={setShowCreate}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <WorldEditor
          activeModule={activeModule}
          moduleInfo={moduleInfo}
          currentFields={currentFields}
          showCreate={showCreate}
          createForm={createForm}
          saving={saving}
          onSetShowCreate={setShowCreate}
          onChangeField={handleFieldChange}
          onCreate={handleCreate}
        />

        {/* v3.1.73：世界书板块内搜索框（与 CharacterList 搜索风格统一） */}
        <div className="px-1.5 py-1.5 border-b border-[var(--nv-border-1)]">
          <div className="relative">
            <Icon name="search" size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--nv-text-tertiary)] pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`搜索${moduleInfo?.label ?? "本板块"}词条…`}
              aria-label="搜索世界书词条"
              className="w-full pl-7 pr-7 h-7 text-xs rounded-md border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] text-[var(--nv-text-primary)] placeholder:text-[var(--nv-text-tertiary)] focus:outline-none focus:border-[var(--nv-primary)]/60 focus:ring-1 focus:ring-[var(--nv-primary)]/30"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                aria-label="清空搜索"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 inline-flex items-center justify-center text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)] rounded">
                <Icon name="x" size={10} />
              </button>
            )}
          </div>
          {searchTerm && (
            <div className="mt-1 px-0.5 text-[10px] text-[var(--nv-text-tertiary)]">
              匹配 {matched} / {totalInModule} 个词条
              {matched === 0 && (
                <button onClick={() => setSearchTerm("")} className="ml-2 text-[var(--nv-primary)] hover:underline">清空</button>
              )}
            </div>
          )}
        </div>

        {searchTerm.trim() && matched === 0 ? (
          // 无匹配独立分支：与「本板块一个词条都没有」的空态区分开，避免误以为设定丢了。
          <div className="px-3 py-10 text-center">
            <div className="mb-2 text-xs text-[var(--nv-text-secondary)]">
              没有匹配「{searchTerm.trim()}」的{moduleInfo?.label ?? "本板块"}词条
            </div>
            <button onClick={() => setSearchTerm("")} className="text-xs text-[var(--nv-primary)] hover:underline">清空搜索</button>
          </div>
        ) : (
          <WorldEntryList
            entries={displayEntries}
            moduleLabel={moduleInfo?.label}
            depthLabels={DEPTH_LABEL}
            onDelete={deleteEntry}
            deletingId={deletingId}
            onEdit={onEditEntry}
            onConfirm={confirmEntry}
            onLocate={onLocate}
            lastAppearanceMap={lastAppearanceMap}
            onJumpToChapter={onJumpToChapter}
          />
        )}
      </div>
    </div>
  );
}
