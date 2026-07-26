"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogOverlay, DialogField, DialogInput } from "./DialogUI";
import { toastError } from "@/components/ui/toast";

export function LorebookCreateDialog({
  projectId,
  onClose,
  onSave,
}: {
  projectId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    title: "", category: "custom", keys: "", content: "",
  });

  const handleSave = async () => {
    if (!form.title.trim()) return;
    try {
      const res = await fetch("/api/lorebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, title: form.title, category: form.category, keys: form.keys.split(/[,，、]/).map((s) => s.trim()).filter(Boolean), content: form.content }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        toastError(d.error || "词条创建失败，请重试");
        return;
      }
      onSave();
      onClose();
    } catch (err) {
      toastError("词条创建失败：" + (err instanceof Error ? err.message : "网络错误"));
    }
  };

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold mb-4">创建世界观词条</h3>
      <div className="space-y-3">
        <DialogField label="词条标题" required>
          <DialogInput value={form.title} onChange={(v) => setForm({ ...form, title: v })} autoFocus />
        </DialogField>
        <DialogField label="触发关键词（逗号分隔）">
          <DialogInput value={form.keys} onChange={(v) => setForm({ ...form, keys: v })} placeholder="魔法, 魔力, 法师" />
        </DialogField>
        <DialogField label="设定内容">
          <textarea className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2 text-sm resize-none" rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="详细描述这个设定的内容..." />
        </DialogField>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="outline" onClick={onClose} className="border-white/[0.08]">取消</Button>
        <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-500" disabled={!form.title.trim()}>创建</Button>
      </div>
    </DialogOverlay>
  );
}
