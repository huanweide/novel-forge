"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogField, DialogInput } from "./DialogUI";
import { Modal } from "@/components/ui/Modal";
import { toastError, toastCreated } from "@/components/ui/toast";

export function CharacterCreateDialog({
  projectId,
  onClose,
  onSave,
}: {
  projectId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    name: "", role: "supporting", age: "未知", gender: "未知",
    personality: "", currentStatus: "alive",
  });

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const lines = form.personality.split("\n");
    let dominant = "", drive = "", contradiction = "", habits: string[] = [], socialMask = "";
    for (const line of lines) {
      if (line.startsWith("主导：") || line.startsWith("主导:")) dominant = line.replace(/^主导[：:]\s*/, "").trim();
      else if (line.startsWith("驱动：") || line.startsWith("驱动:")) drive = line.replace(/^驱动[：:]\s*/, "").trim();
      else if (line.startsWith("矛盾：") || line.startsWith("矛盾:")) contradiction = line.replace(/^矛盾[：:]\s*/, "").trim();
      else if (line.startsWith("习惯：") || line.startsWith("习惯:")) habits = line.replace(/^习惯[：:]\s*/, "").split(/[,，、]/).map(s => s.trim()).filter(Boolean);
      else if (line.startsWith("面具：") || line.startsWith("面具:")) socialMask = line.replace(/^面具[：:]\s*/, "").trim();
      else if (line.trim()) { if (!dominant) dominant = line.trim(); else habits.push(line.trim()); }
    }
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, name: form.name, role: form.role, age: form.age, gender: form.gender, personality: { dominant, drive, contradiction, habits, socialMask }, currentStatus: form.currentStatus }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        toastError(d.error || "角色创建失败，请重试");
        return;
      }
      onSave();
      toastCreated(form.name, "角色");
      onClose();
    } catch (err) {
      toastError("角色创建失败：" + (err instanceof Error ? err.message : "网络错误"));
    }
  };

  return (
    <Modal open onClose={onClose} panelClassName="max-w-md" showClose>
      <h3 className="text-lg font-semibold mb-4">创建新角色</h3>
      <div className="space-y-3">
        <DialogField label="姓名" required>
          <DialogInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoFocus />
        </DialogField>
        <DialogField label="角色定位">
          <select className="w-full bg-[var(--nv-surface-1)] border border-[var(--nv-border-2)] rounded px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="protagonist">主角</option>
            <option value="antagonist">反派</option>
            <option value="supporting">配角</option>
            <option value="mentor">导师</option>
            <option value="love_interest">恋爱对象</option>
            <option value="catalyst">剧情催化剂</option>
            <option value="background">背景角色</option>
          </select>
        </DialogField>
        <DialogField label="性格特征（逗号分隔）">
          <textarea className="w-full bg-[var(--nv-surface-1)] border border-[var(--nv-border-2)] rounded px-3 py-2 text-sm min-h-[80px] resize-y" value={form.personality} onChange={(e) => setForm({ ...form, personality: e.target.value })} placeholder={`主导：外冷内热\n驱动：复仇执念\n矛盾：渴望认可但自尊极强\n习惯：咬指甲、自言自语\n面具：对外冷漠`} />
        </DialogField>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="outline" onClick={onClose} className="border-[var(--nv-border-2)]">取消</Button>
        <Button onClick={handleSave} className="bg-[var(--nv-primary)] hover:bg-[var(--nv-primary)]/80" disabled={!form.name.trim()}>创建</Button>
      </div>
    </Modal>
  );
}
