"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogOverlay, DialogField, DialogInput } from "./DialogUI";
import type { LorebookData } from "./types";

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
        });
      }
      setAutofillMsg(`✅ ${data.message || "补全完成"}`);
    } catch (err: any) {
      setAutofillMsg(`❌ ${err.message}`);
    } finally {
      setAutofilling(false);
    }
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`/api/lorebook/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, keys: form.keys.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        alert(d.error || "词条保存失败，请重试");
        return;
      }
      onSave();
      onClose();
    } catch (err) {
      alert("词条保存失败：" + (err instanceof Error ? err.message : "网络错误"));
    }
  };

  return (
    <DialogOverlay onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">编辑词条：{entry.title}</h3>
        <div className="flex items-center gap-2">
          {autofillMsg && (
            <span className={`text-xs ${autofillMsg.startsWith("✅") ? "text-green-400" : autofillMsg.startsWith("❌") ? "text-red-400" : "text-amber-400"}`}>
              {autofillMsg}
            </span>
          )}
          <button
            onClick={handleAutofill}
            disabled={autofilling}
            className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
              autofilling
                ? "bg-white/[0.04] text-zinc-500 cursor-not-allowed"
                : "bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border border-purple-600/30"
            }`}
          >
            {autofilling ? "⏳ AI补全中..." : "🤖 AI填满"}
          </button>
        </div>
      </div>
      <div className="space-y-3">
        <DialogField label="词条标题">
          <DialogInput value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
        </DialogField>
        <DialogField label="分类">
          <select className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="geography">地理</option>
            <option value="faction">势力/组织</option>
            <option value="magic_system">魔法体系</option>
            <option value="history">历史事件</option>
            <option value="culture">文化/风俗</option>
            <option value="creature">生物/种族</option>
            <option value="item">关键物品</option>
            <option value="custom">自定义</option>
          </select>
        </DialogField>
        <DialogField label="触发关键词（逗号分隔）">
          <DialogInput value={form.keys} onChange={(v) => setForm({ ...form, keys: v })} placeholder="魔法, 魔力, 法师" />
        </DialogField>
        <DialogField label="设定内容（≤200 Token）">
          <textarea className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2 text-sm resize-none" rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </DialogField>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="rounded" />
          启用此词条
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="outline" onClick={onClose} className="border-white/[0.08]">取消</Button>
        <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-500">保存</Button>
      </div>
    </DialogOverlay>
  );
}
