"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

// v1.5.0 批量写作弹窗：选数量(1-10) + 作者指令 → 后台逐章生成（可关窗口，进度稍后查看）
export function BatchWriteDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (count: number, authorNote: string) => void;
}) {
  const [count, setCount] = useState(3);
  const [note, setNote] = useState("");

  return (
    <Modal open onClose={onClose} bare panelClassName="max-w-md" closeOnOverlay={false} labelledBy="batch-write-title">
      <div className="p-5">
        <h2 id="batch-write-title" className="text-lg font-semibold flex items-center gap-2 mb-1">
          <Icon name="pencil" size={16} className="text-[var(--nv-primary)]" /> 批量写作
        </h2>
        <p className="text-xs text-[var(--nv-text-muted)] mb-4">
          后台连续生成 N 个新章节（每章自动写章名、走完整生成链路）。启动后转为后台运行：可关闭本窗口，进度在右下角查看。
        </p>
        <label className="block text-sm text-[var(--nv-text-secondary)] mb-1">章节数量（1-10）</label>
        <input
          type="number"
          min={1}
          max={10}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
          className="input-glass w-24 rounded-lg px-3 py-2 text-sm"
        />
        <label className="block text-sm text-[var(--nv-text-secondary)] mt-4 mb-1">作者指令（可选，贯穿所有章）</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="例如：本批写主角进入龙庭集团后的三章，节奏加快"
          className="input-glass w-full rounded-lg px-3 py-2 text-sm resize-y"
        />
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => onConfirm(count, note)} className="btn-primary">
            开始批量写作
          </Button>
        </div>
      </div>
    </Modal>
  );
}
