"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Switch } from "@/components/ui/switch";
import { DialogField, DialogInput } from "./DialogUI";
import { Modal } from "@/components/ui/Modal";
import type { LorebookData } from "./types";
import { toastError } from "@/components/ui/toast";

export function LorebookEditDialog({
  entry,
  projectId,
  onClose,
  onSave,
}: {
  entry: LorebookData;
  projectId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    title: entry.title,
    category: entry.category,
    keys: (entry.keys || []).join("、"),
    content: entry.content,
    enabled: entry.enabled,
    insertionOrder: 50,
    depth: entry.depth ?? 3,
  });

  const [autofilling, setAutofilling] = useState(false);
  const [autofillMsg, setAutofillMsg] = useState("");

  const handleAutofill = async () => {
    setAutofilling(true);
    setAutofillMsg("AI正在补全...");
    try {
      const res = await fetch(`/api/lorebook/${entry.id}/autofill`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "补全失败");

      const updated = data.entry;
      if (updated) {
        setForm({
          title: updated.title || form.title,
          category: updated.category || form.category,
          keys: (updated.keys || form.keys.split(/[,，、]/).filter(Boolean)).join("、"),
          content: updated.content || form.content,
          enabled: updated.enabled ?? form.enabled,
          insertionOrder: form.insertionOrder,
          depth: form.depth,
        });
      }
      setAutofillMsg(`补全完成：${data.message || ""}`);
    } catch (err: any) {
      setAutofillMsg(`补全失败：${err.message}`);
    } finally {
      setAutofilling(false);
    }
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`/api/lorebook/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, depth: Number(form.depth) || 3, keys: form.keys.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        toastError(d.error || "词条保存失败，请重试");
        return;
      }
      onSave();
      onClose();
    } catch (err) {
      toastError("词条保存失败：" + (err instanceof Error ? err.message : "网络错误"));
    }
  };

  return (
    <Modal open onClose={onClose} ariaLabel={`编辑词条：${entry.title}`} panelClassName="max-w-md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">编辑词条：{entry.title}</h3>
        <div className="flex items-center gap-2">
          {autofillMsg && (
            <span className={`text-xs ${autofillMsg.startsWith("补全完成") ? "text-[var(--nv-success)]" : autofillMsg.startsWith("补全失败") ? "text-[var(--nv-danger)]" : "text-[var(--nv-accent)]"}`}>
              {autofillMsg}
            </span>
          )}
          <button
            onClick={handleAutofill}
            disabled={autofilling}
            className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
              autofilling
                ? "bg-[var(--nv-surface-3)] text-[var(--nv-text-tertiary)] cursor-not-allowed"
                : "bg-[var(--nv-creative-soft)] text-[var(--nv-creative)] hover:bg-[var(--nv-creative)]/20 border border-[var(--nv-creative)]/30"
            }`}
          >
            {autofilling ? <><Icon name="loader" size={12} className="animate-spin" /> AI补全中...</> : <><Icon name="bot" size={12} /> AI填满</>}
          </button>
        </div>
      </div>
      <div className="space-y-3">
        <DialogField label="词条标题">
          <DialogInput value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
        </DialogField>
        <DialogField label="分类">
          <select className="input-glass w-full rounded px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="geography">地理</option>
            <option value="faction">势力/组织</option>
            <option value="magic_system">力量体系</option>
            <option value="history">历史事件</option>
            <option value="culture">文化/风俗</option>
            <option value="creature">生物/种族</option>
            <option value="item">关键物品</option>
            <option value="technique">功法体系</option>
            <option value="law">法则/规则</option>
            <option value="currency">货币/经济</option>
            <option value="fate_system">命运体系</option>
            <option value="physics">物理列表</option>
            <option value="public_system">公开体系</option>
            <option value="character_relationship">角色关系</option>
            <option value="custom">自定义</option>
          </select>
        </DialogField>
        <DialogField label="记忆注入方式（决定这条设定何时被 AI 读取）">
          <select className="input-glass w-full rounded px-3 py-2 text-sm" value={String(form.depth)} onChange={(e) => setForm({ ...form, depth: Number(e.target.value) })}>
            <option value="0">0 · 常驻·强效（正文前，优先级最高）</option>
            <option value="1">1 · 常驻·指令上方</option>
            <option value="2">2 · 常驻·系统上下文（始终在场）</option>
            <option value="3">3 · 触发·背景设定（关键词命中才出现，默认）</option>
            <option value="4">4 · 触发·深层背景</option>
          </select>
          <p className="mt-1 text-[10px] leading-relaxed text-[var(--nv-text-tertiary)]">
            常驻（深度 0-2）：永远出现在 AI 的设定上下文里，适合「必须时刻遵守」的核心规则，如力量体系、世界法则、核心矛盾。<br />
            触发（深度 3-4）：只有正文写到相关关键词时才临时插入，适合冷门地名、小众物品，省下常驻额度、防止设定过载。
          </p>
        </DialogField>
        <DialogField label="触发关键词（逗号分隔）">
          <DialogInput value={form.keys} onChange={(v) => setForm({ ...form, keys: v })} placeholder="魔法, 魔力, 法师" />
        </DialogField>
        <DialogField label="设定内容（≤200 Token）">
          <textarea className="w-full bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded px-3 py-2 text-sm resize-none" rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </DialogField>
        <div className="flex items-center justify-between gap-3 py-1">
          <div className="flex flex-col">
            <span className="text-sm text-[var(--nv-text-primary)]">启用此词条</span>
            <span className={`text-[10px] ${form.enabled ? "text-[var(--nv-success)]" : "text-[var(--nv-text-tertiary)]"}`}>
              {form.enabled ? "已启用：生成时会按上述方式读取" : "已停用：生成时不会读取此词条"}
            </span>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(next) => setForm({ ...form, enabled: next })} size="sm" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="outline" onClick={onClose} className="border-[var(--nv-border-2)]">取消</Button>
        <Button onClick={handleSave} className="bg-[var(--nv-primary)] hover:brightness-110">保存</Button>
      </div>
    </Modal>
  );
}
