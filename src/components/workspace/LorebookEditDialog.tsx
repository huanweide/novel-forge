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

  const handleSave = async () => {
    await fetch(`/api/lorebook/${entry.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, keys: form.keys.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) }),
    });
    onSave();
    onClose();
  };

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold mb-4">编辑词条：{entry.title}</h3>
      <div className="space-y-3">
        <DialogField label="词条标题">
          <DialogInput value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
        </DialogField>
        <DialogField label="分类">
          <select className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
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
          <textarea className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none" rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </DialogField>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="rounded" />
          启用此词条
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="outline" onClick={onClose} className="border-zinc-700">取消</Button>
        <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-500">保存</Button>
      </div>
    </DialogOverlay>
  );
}
