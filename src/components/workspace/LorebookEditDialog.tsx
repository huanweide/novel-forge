"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Switch } from "@/components/ui/switch";
import { DialogField, DialogInput } from "./DialogUI";
import { Modal } from "@/components/ui/Modal";
import type { LorebookData } from "./types";
import { toastError } from "@/components/ui/toast";
import { WORLD_MODULES } from "./worldPanelData";
import { safeJoin } from "@/lib/utils";

const DEPTH_OPTIONS = [
  { value: 0, label: "0 · 常驻·强效", desc: "正文前，优先级最高" },
  { value: 1, label: "1 · 常驻·指令上方", desc: "紧贴用户指令之上" },
  { value: 2, label: "2 · 常驻·系统上下文", desc: "始终在场，适合核心规则" },
  { value: 3, label: "3 · 触发·背景设定", desc: "关键词命中才出现，默认" },
  { value: 4, label: "4 · 触发·深层背景", desc: "冷门名词的深度补充" },
];

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
    keys: safeJoin(entry.keys, "、"),
    content: entry.content,
    enabled: entry.enabled,
    insertionOrder: 50,
    depth: entry.depth ?? 3,
  });

  const [autofilling, setAutofilling] = useState(false);
  const [autofillMsg, setAutofillMsg] = useState("");

  const handleAutofill = async () => {
    setAutofilling(true);
    setAutofillMsg("AI 正在阅读上下文…");
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
      setAutofillMsg(`补全完成 · ${data.message || ""}`);
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
        body: JSON.stringify({
          ...form,
          depth: Number(form.depth) || 3,
          keys: form.keys
            .split(/[,，、]/)
            .map((s) => s.trim())
            .filter(Boolean),
        }),
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

  const moduleLabel = WORLD_MODULES.find((m) => m.key === form.category)?.label || form.category;

  return (
    <Modal
      open
      onClose={onClose}
      bare
      ariaLabel={`编辑词条：${entry.title}`}
      panelClassName="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      showClose
    >
      {/* 标题栏 */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--nv-border-2)] px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]">
            <Icon name="book" size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-[var(--nv-text-primary)]">编辑词条：{entry.title}</h3>
            <p className="truncate text-xs text-[var(--nv-text-tertiary)]">{moduleLabel} · 当前{form.enabled ? "已启用" : "已停用"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {autofillMsg && (
            <span
              className={`hidden sm:inline-block max-w-[180px] truncate text-xs ${
                autofillMsg.startsWith("补全完成")
                  ? "text-[var(--nv-success)]"
                  : autofillMsg.startsWith("补全失败")
                    ? "text-[var(--nv-danger)]"
                    : "text-[var(--nv-accent)]"
              }`}
              title={autofillMsg}
            >
              {autofillMsg}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutofill}
            disabled={autofilling}
            className="gap-1.5 border-[var(--nv-creative)]/30 bg-[var(--nv-creative-soft)] text-[var(--nv-creative)] hover:bg-[var(--nv-creative)]/20 hover:text-[var(--nv-creative)]"
          >
            {autofilling ? (
              <>
                <Icon name="loader" size={14} className="animate-spin" /> AI 补全中…
              </>
            ) : (
              <>
                <Icon name="sparkles" size={14} /> AI 填满
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 主体 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {autofillMsg && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs sm:hidden ${
              autofillMsg.startsWith("补全完成")
                ? "border-[var(--nv-success)]/30 bg-[var(--nv-success)]/10 text-[var(--nv-success)]"
                : autofillMsg.startsWith("补全失败")
                  ? "border-[var(--nv-danger)]/30 bg-[var(--nv-danger)]/10 text-[var(--nv-danger)]"
                  : "border-[var(--nv-accent)]/30 bg-[var(--nv-accent)]/10 text-[var(--nv-accent)]"
            }`}
          >
            {autofillMsg}
          </div>
        )}

        {/* 基础信息 */}
        <section className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--nv-text-primary)]">
            <Icon name="tag" size={15} className="text-[var(--nv-primary)]" />
            基础信息
          </div>
          <div className="space-y-3">
            <DialogField label="词条标题">
              <DialogInput value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
            </DialogField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DialogField label="分类">
                <select
                  className="input-glass w-full rounded-lg px-3 py-2 text-sm"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {WORLD_MODULES.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </DialogField>
              <DialogField label="记忆注入深度">
                <select
                  className="input-glass w-full rounded-lg px-3 py-2 text-sm"
                  value={String(form.depth)}
                  onChange={(e) => setForm({ ...form, depth: Number(e.target.value) })}
                >
                  {DEPTH_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </DialogField>
            </div>
            <p className="text-xs leading-relaxed text-[var(--nv-text-tertiary)]">
              <span className="font-medium text-[var(--nv-text-secondary)]">常驻（0-2）</span>：永远出现在 AI 上下文，适合力量体系、世界法则等核心规则；
              <span className="font-medium text-[var(--nv-text-secondary)]">触发（3-4）</span>：只有写到关键词时才插入，适合冷门地名、小众物品，省下常驻额度。
            </p>
          </div>
        </section>

        {/* 触发关键词 */}
        <section className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--nv-text-primary)]">
            <Icon name="key" size={15} className="text-[var(--nv-primary)]" />
            触发关键词
          </div>
          <DialogField label="关键词（逗号/顿号分隔）">
            <DialogInput
              value={form.keys}
              onChange={(v) => setForm({ ...form, keys: v })}
              placeholder="魔法, 魔力, 法师"
            />
          </DialogField>
          <p className="mt-2 text-xs text-[var(--nv-text-tertiary)]">
            当正文中出现这些词时，深度 3-4 的词条会被临时注入 AI 上下文。
          </p>
        </section>

        {/* 词条内容 */}
        <section className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--nv-text-primary)]">
            <Icon name="scroll" size={15} className="text-[var(--nv-primary)]" />
            词条内容
            <span className="ml-auto text-xs font-normal text-[var(--nv-text-tertiary)]">≤ 200 Token</span>
          </div>
          <textarea
            className="input-glass w-full rounded-lg px-3 py-2 text-sm leading-relaxed resize-y min-h-[140px]"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder="用 1-3 句话写清这条设定的核心事实。避免冗长，让 AI 在需要时能快速理解。"
          />
        </section>

        {/* 启用状态 */}
        <section className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Icon name={form.enabled ? "check" : "ban"} size={16} className={form.enabled ? "text-[var(--nv-success)]" : "text-[var(--nv-text-tertiary)]"} />
              <div>
                <div className="text-sm font-medium text-[var(--nv-text-primary)]">启用此词条</div>
                <div className={`text-xs ${form.enabled ? "text-[var(--nv-success)]" : "text-[var(--nv-text-tertiary)]"}`}>
                  {form.enabled ? "已启用：生成时会按上述方式读取" : "已停用：生成时不会读取此词条"}
                </div>
              </div>
            </div>
            <Switch checked={form.enabled} onCheckedChange={(next) => setForm({ ...form, enabled: next })} size="sm" />
          </div>
        </section>
      </div>

      {/* 底部操作栏 */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--nv-border-2)] px-5 py-3">
        <Button variant="outline" onClick={onClose} className="border-[var(--nv-border-2)]">
          取消
        </Button>
        <Button onClick={handleSave} className="btn-primary gap-1.5">
          <Icon name="save" size={15} /> 保存
        </Button>
      </div>
    </Modal>
  );
}
