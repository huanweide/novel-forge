"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

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
        setForm({ name: "", content: "", category: "writing", priority: 0, scope: "all" });
        loadRules(); onRefresh?.();
      }
    } catch (err) { console.error("保存规则失败:", err); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这条规则？")) return;
    try {
      await fetch(`/api/rules/${id}`, { method: "DELETE" });
      loadRules(); onRefresh?.();
    } catch (err) { console.error("删除规则失败:", err); }
  };

  const handleToggle = async (rule: RuleData) => {
    try {
      await fetch(`/api/rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      loadRules();
    } catch (err) { console.error("切换规则失败:", err); }
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

  if (loading) return <div className="p-4 text-sm text-zinc-500">加载规则...</div>;

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
        <span className="text-xs text-zinc-400">
          📋 {rules.length} 条规则 · {enabledRules.length} 启用
        </span>
        <Button size="sm" onClick={openCreate} className="h-6 text-xs bg-indigo-600 hover:bg-indigo-500">
          + 新建
        </Button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {rules.length === 0 && (
          <p className="text-center text-xs text-zinc-600 py-8">
            暂无规则。点击「+ 新建」创建第一条。
          </p>
        )}

        {enabledRules.map(r => (
          <RuleRow key={r.id} rule={r} onToggle={handleToggle} onEdit={openEdit} onDelete={handleDelete} />
        ))}
        {disabledRules.length > 0 && (
          <>
            <div className="text-[10px] text-zinc-600 pt-2 pb-1 px-1">已禁用</div>
            {disabledRules.map(r => (
              <RuleRow key={r.id} rule={r} onToggle={handleToggle} onEdit={openEdit} onDelete={handleDelete} />
            ))}
          </>
        )}
      </div>

      {/* 创建/编辑弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="bg-zinc-900 border border-white/[0.08] rounded-2xl w-full max-w-lg p-5 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">{editing ? "编辑规则" : "新建规则"}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">规则名称</label>
                <input className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="如：主角不能杀无辜之人" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">规则内容（会直接注入 AI prompt）</label>
                <textarea className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none" rows={3}
                  placeholder="用自然语言描述规则，越具体越好。如：主角在任何情况下都不能杀害无辜百姓。如果被迫做出选择，必须表现出强烈的内心挣扎。"
                  value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">分类</label>
                  <select className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1.5 text-xs"
                    value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">生效范围</label>
                  <select className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1.5 text-xs"
                    value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}>
                    {Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">优先级</label>
                  <input type="number" className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1.5 text-xs"
                    value={form.priority} onChange={e => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null); }} className="border-white/[0.08] text-xs h-7">取消</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.content.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 text-xs h-7 disabled:opacity-50">
                {saving ? "保存中..." : editing ? "保存修改" : "创建规则"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleRow({ rule, onToggle, onEdit, onDelete }: {
  rule: RuleData;
  onToggle: (r: RuleData) => void;
  onEdit: (r: RuleData) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={`group flex items-start gap-2 px-2 py-1.5 rounded-lg border transition-colors ${
      rule.enabled ? "border-white/[0.06] bg-white/[0.02] backdrop-blur-sm hover:border-white/[0.08]" : "border-white/[0.06]/50 bg-white/[0.02] backdrop-blur-sm opacity-60"
    }`}>
      <button onClick={() => onToggle(rule)} className="shrink-0 mt-0.5 text-sm"
        title={rule.enabled ? "点击禁用" : "点击启用"}>
        {rule.enabled ? "✅" : "⛔"}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{rule.name}</span>
          <span className="text-[9px] px-1 rounded bg-white/[0.04] text-zinc-500 shrink-0">{CATEGORY_LABELS[rule.category] || rule.category}</span>
          <span className="text-[9px] text-zinc-600 shrink-0">{SCOPE_LABELS[rule.scope] || rule.scope}</span>
        </div>
        <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">{rule.content}</p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => onEdit(rule)} className="text-xs text-zinc-500 hover:text-zinc-300">✏️</button>
        <button onClick={() => onDelete(rule.id)} className="text-xs text-zinc-500 hover:text-red-400">🗑</button>
      </div>
    </div>
  );
}
