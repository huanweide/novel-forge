"use client";

import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/icons";

interface ServerNode {
  editVersion: number;
  title?: string | null;
  outline?: string | null;
  content?: string | null;
}

/**
 * FE-N8 保存冲突解决面板。
 * 当 PUT /api/story/nodes/[id] 返回 409（conflict: true）时弹出，
 * 并排展示「我的版本（将保存）」与「库里版本（已被其他操作更新）」，
 * 让用户在三种合并策略中显式选择，避免无声覆盖。
 */
export function SaveConflictModal({
  open,
  nodeTitle,
  mine,
  server,
  onClose,
  onResolve,
}: {
  open: boolean;
  nodeTitle: string;
  mine: { outline?: string; content?: string };
  server: ServerNode;
  onClose: () => void;
  onResolve: (action: "mine" | "theirs" | "both") => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="保存冲突"
      description={`章节《${nodeTitle}》在您编辑期间已被其他操作（如 AI 改写）更新。请选择如何处理，避免无声覆盖。`}
      icon="alert"
      size="xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--nv-text-secondary)] mb-2">
            <Icon name="pencil" size={13} /> 我的版本（将保存）
          </div>
          <Field label="大纲" value={mine.outline} />
          <Field label="正文" value={mine.content} />
        </div>
        <div className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--nv-text-secondary)] mb-2">
            <Icon name="cloud" size={13} /> 库里版本（已更新，v{server.editVersion}）
          </div>
          <Field label="大纲" value={server.outline ?? ""} />
          <Field label="正文" value={server.content ?? ""} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          onClick={() => onResolve("mine")}
          className="btn-primary h-9 px-4 text-sm inline-flex items-center gap-1.5"
        >
          <Icon name="save" size={14} /> 用我的（覆盖）
        </button>
        <button
          onClick={() => onResolve("theirs")}
          className="h-9 px-4 text-sm rounded-xl border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:border-[var(--nv-primary)] inline-flex items-center gap-1.5"
        >
          <Icon name="download" size={14} /> 用库里的
        </button>
        <button
          onClick={() => onResolve("both")}
          className="h-9 px-4 text-sm rounded-xl border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:border-[var(--nv-primary)] inline-flex items-center gap-1.5"
        >
          <Icon name="plus" size={14} /> 保留双方
        </button>
      </div>
      <p className="text-[11px] text-[var(--nv-text-tertiary)] mt-3">
        说明：「保留双方」会把库里版本作为节点备注（notes）留存，同时用您的版本覆盖正文 / 大纲，双方都不丢失。
      </p>
    </Modal>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="mb-2">
      <div className="text-[11px] text-[var(--nv-text-tertiary)] mb-1">{label}</div>
      <div className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] p-2 text-xs text-[var(--nv-text-primary)]">
        {value && value.trim() ? (
          value
        ) : (
          <span className="text-[var(--nv-text-tertiary)]">（空）</span>
        )}
      </div>
    </div>
  );
}
