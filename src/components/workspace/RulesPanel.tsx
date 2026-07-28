"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { confirmDialog, toastError, toastSuccess, toastInfo, toastAdded } from "@/components/ui/toast";
import { useConfirmDelete } from "@/components/workspace/useConfirmDelete";
import { Loading } from "@/components/ui/States";

interface RuleData {
  id: string; projectId: string; name: string; content: string;
  category: string; enabled: boolean; priority: number; scope: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  writing: "写作", world: "世界观", character: "角色", style: "风格", custom: "自定义",
};
const SCOPE_LABELS: Record<string, string> = {
  all: "全局", write_only: "生成/续写/微调", outline_only: "大纲/章纲", review_only: "审校",
};

export function RulesPanel({ projectId, onRefresh }: { projectId: string; onRefresh?: () => void }) {
  const [rules, setRules] = useState<RuleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RuleData | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", content: "", category: "writing", priority: 0, scope: "all",
  });

  const loadRules = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/rules?projectId=${projectId}`, { signal });
      if (res.ok) setRules(await res.json());
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("加载规则失败:", err);
    }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => {
    const ctrl = new AbortController();
    loadRules(ctrl.signal);
    return () => ctrl.abort();
  }, [loadRules]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      const method = editing ? "PUT" : "POST";
      const url = editing ? `/api/rules/${editing.id}` : "/api/rules";
      const body = editing ? { ...form } : { ...form, projectId };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        setShowForm(false); setEditing(null);
        if (!editing) toastAdded(form.name, "规则");
        setForm({ name: "", content: "", category: "writing", priority: 0, scope: "all" });
        loadRules(); onRefresh?.();
      } else { const d = await res.json().catch(() => ({ error: "未知错误" })); toastError("规则保存失败：" + (d.error || `HTTP ${res.status}`)); }
    } catch (err) { toastError("规则保存失败（网络错误）：" + (err instanceof Error ? err.message : "请重试")); }
    finally { setSaving(false); }
  };

  const { deletingId, remove: deleteRule } = useConfirmDelete({
    title: "删除规则",
    description: "确定删除这条规则？此操作不可恢复。",
    deleteFn: async (id) => {
      const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({ error: "未知错误" })); throw new Error(d.error || `HTTP ${res.status}`); }
    },
    onSuccess: () => { loadRules(); onRefresh?.(); },
    errorPrefix: "规则删除失败",
  });

  const handleToggle = async (rule: RuleData) => {
    try {
      const res = await fetch(`/api/rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({ error: "未知错误" })); toastError("规则开关失败：" + (d.error || `HTTP ${res.status}`)); return; }
      loadRules();
    } catch (err) { toastError("规则开关失败（网络错误）：" + (err instanceof Error ? err.message : "请重试")); }
  };

  const openEdit = (rule: RuleData) => {
    setEditing(rule);
    setForm({ name: rule.name, content: rule.content, category: rule.category, priority: rule.priority, scope: rule.scope });
    setShowForm(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", content: "", category: "writing", priority: 0, scope: "all" });
    setShowForm(true);
  };

  const enabledRules = rules.filter(r => r.enabled);
  const disabledRules = rules.filter(r => !r.enabled);

  if (loading) return <div className="p-4"><Loading label="加载规则…" /></div>;

  return (
    <div className="flex h-full flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-[var(--nv-border-2)] px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs text-[var(--nv-text-tertiary)]">
          <Icon name="clipboard" size={13} className="text-[var(--nv-text-secondary)]" />
          {rules.length} 条规则 · {enabledRules.length} 启用
        </span>
        <Button size="sm" onClick={openCreate} className="btn-primary h-6 text-xs">
          + 新建
        </Button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {rules.length === 0 && (
          <EmptyState
            icon="clipboard"
            title="暂无规则"
            hint='点击「+ 新建」创建第一条'
          />
        )}

        {enabledRules.map(r => (
          <RuleRow key={r.id} rule={r} onToggle={handleToggle} onEdit={openEdit} onDelete={deleteRule} deletingId={deletingId} />
        ))}
        {disabledRules.length > 0 && (
          <>
            <div className="text-[10px] text-[var(--nv-text-muted)] pt-2 pb-1 px-1">已禁用</div>
            {disabledRules.map(r => (
              <RuleRow key={r.id} rule={r} onToggle={handleToggle} onEdit={openEdit} onDelete={deleteRule} deletingId={deletingId} />
            ))}
          </>
        )}
      </div>

      {/* 创建/编辑弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="surface-floating max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="mb-4 text-base font-semibold text-[var(--nv-text-primary)]">{editing ? "编辑规则" : "新建规则"}</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[var(--nv-text-tertiary)]">规则名称</label>
                <input className="input-glass w-full rounded-lg px-3 py-2 text-sm"
                  placeholder="如：主角不能杀无辜之人" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--nv-text-tertiary)]">规则内容（会直接注入 AI prompt）</label>
                <textarea className="input-glass w-full resize-none rounded-lg px-3 py-2 text-sm"
                  placeholder="用自然语言描述规则，越具体越好。如：主角在任何情况下都不能杀害无辜百姓。如果被迫做出选择，必须表现出强烈的内心挣扎。"
                  rows={3} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-[var(--nv-text-tertiary)]">分类</label>
                  <select className="input-glass w-full rounded px-2 py-1.5 text-xs"
                    value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--nv-text-tertiary)]">生效范围</label>
                  <select className="input-glass w-full rounded px-2 py-1.5 text-xs"
                    value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}>
                    {Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--nv-text-tertiary)]">优先级</label>
                  <input type="number" className="input-glass w-full rounded px-2 py-1.5 text-xs"
                    value={form.priority} onChange={e => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null); }} className="btn-ghost h-7 text-xs">取消</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.content.trim()}
                className="btn-primary h-7 text-xs disabled:opacity-50">
                {saving ? "保存中..." : editing ? "保存修改" : "创建规则"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleRow({ rule, onToggle, onEdit, onDelete, deletingId }: {
  rule: RuleData;
  onToggle: (r: RuleData) => void;
  onEdit: (r: RuleData) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}) {
  return (
    <div className={`group flex items-start gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
      rule.enabled ? "border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] hover:border-[var(--nv-border-3)]" : "border-[var(--nv-border-1)] bg-[var(--nv-surface-1)] opacity-60"
    }`}>
      <button onClick={() => onToggle(rule)} className="mt-0.5 shrink-0 text-sm"
        title={rule.enabled ? "点击禁用" : "点击启用"}>
        {rule.enabled ? <Icon name="check" size={15} className="text-[var(--nv-success)]" /> : <Icon name="circle" size={15} className="text-[var(--nv-text-muted)]" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-[var(--nv-text-primary)]">{rule.name}</span>
          <span className="shrink-0 rounded bg-[var(--nv-surface-2)] px-1 text-[9px] text-[var(--nv-text-tertiary)]">{CATEGORY_LABELS[rule.category] || rule.category}</span>
          <span className="shrink-0 text-[9px] text-[var(--nv-text-muted)]">{SCOPE_LABELS[rule.scope] || rule.scope}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[10px] text-[var(--nv-text-tertiary)]">{rule.content}</p>
      </div>
      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={() => onEdit(rule)} className="text-xs text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]" aria-label="编辑规则"><Icon name="pencil" size={13} /></button>
        <button onClick={() => onDelete(rule.id)} disabled={deletingId === rule.id} className="text-xs text-[var(--nv-text-tertiary)] hover:text-[var(--nv-danger)] disabled:opacity-40" aria-label="删除规则"><Icon name="trash" size={13} /></button>
      </div>
    </div>
  );
}
