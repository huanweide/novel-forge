"use client";

import { useState } from "react";
import type { LorebookData } from "./types";
import { confirmDialog, toastError, toastSuccess, toastInfo, toastAdded } from "@/components/ui/toast";
import { useConfirmDelete } from "@/components/workspace/useConfirmDelete";
import { WorldModuleSidebar } from "./WorldModuleSidebar";
import { WorldEditor } from "./WorldEditor";
import { WorldEntryList } from "./WorldEntryList";
import {
  WORLD_MODULES, DEPTH_LABEL, CATEGORY_TO_MODULE, MODULE_FIELDS,
  type ModuleKey,
} from "./worldPanelData";

// ─── 组件 ──────────────────────────────────────────────────

export function WorldPanel({
  projectId, entries = [], onRefresh, onEditEntry,
}: {
  projectId: string; entries?: LorebookData[]; onRefresh: () => void;
  onEditEntry?: (entry: LorebookData) => void;
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

  // 板块计数
  const getCount = (key: ModuleKey) => {
    if (key === "custom") {
      return entries.filter((e) => !CATEGORY_TO_MODULE[e.category]).length;
    }
    return entries.filter((e) => CATEGORY_TO_MODULE[e.category] === key).length;
  };

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
      else { const d = await res.json().catch(() => ({ error: "未知错误" })); toastError("条目创建失败：" + (d.error || `HTTP ${res.status}`)); }
    } catch (err) { toastError("条目创建失败（网络错误）：" + (err instanceof Error ? err.message : "请重试")); }
    finally { setSaving(false); }
  };

  // 删除
  const { deletingId, remove: deleteEntry } = useConfirmDelete({
    title: "删除条目",
    description: "确定删除此世界书条目？此操作不可恢复。",
    deleteFn: async (id) => {
      const res = await fetch(`/api/lorebook/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({ error: "未知错误" })); throw new Error(d.error || `HTTP ${res.status}`); }
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

        <WorldEntryList
          entries={moduleEntries}
          moduleLabel={moduleInfo?.label}
          depthLabels={DEPTH_LABEL}
          onDelete={deleteEntry}
          deletingId={deletingId}
          onEdit={onEditEntry}
          onConfirm={confirmEntry}
        />
      </div>
    </div>
  );
}
