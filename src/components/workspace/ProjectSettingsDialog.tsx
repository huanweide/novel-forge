"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/icons";
import { Switch } from "@/components/ui/switch";
import { toastSuccess, toastError } from "@/components/ui/toast";
import { useProjectStore } from "@/store";

interface Props {
  projectId: string;
  project: { name?: string; autoConfirmEnabled?: boolean; autoDeliverEnabled?: boolean } | null;
  onClose: () => void;
  onOpenBuildConfig: () => void;
  onOpenProjectConfig: () => void;
  onOpenMemoryDecay: () => void;
}

export function ProjectSettingsDialog({
  projectId,
  project,
  onClose,
  onOpenBuildConfig,
  onOpenProjectConfig,
  onOpenMemoryDecay,
}: Props) {
  const [autoConfirm, setAutoConfirm] = useState<boolean>(project?.autoConfirmEnabled ?? true);
  const [autoDeliver, setAutoDeliver] = useState<boolean>(project?.autoDeliverEnabled ?? true);
  const [busy, setBusy] = useState(false);

  const saveDelivery = async (patch: { autoConfirmEnabled?: boolean; autoDeliverEnabled?: boolean }) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        useProjectStore.getState().patchProject(patch);
        toastSuccess("确认与交付设置已保存");
      } else {
        toastError(d.error || "保存失败");
      }
    } catch (e) {
      toastError("保存失败：" + (e instanceof Error ? e.message : "网络错误"));
    } finally {
      setBusy(false);
    }
  };

  const onToggleAutoConfirm = (v: boolean) => {
    setAutoConfirm(v);
    void saveDelivery({ autoConfirmEnabled: v });
  };
  const onToggleAutoDeliver = (v: boolean) => {
    setAutoDeliver(v);
    void saveDelivery({ autoDeliverEnabled: v });
  };

  return (
    <Modal
      open
      onClose={onClose}
      bare
      panelClassName="max-w-lg max-h-[90vh] overflow-y-auto"
      closeOnOverlay={false}
      labelledBy="project-settings-title"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 id="project-settings-title" className="text-lg font-semibold flex items-center gap-2">
            <Icon name="settings" size={18} className="text-[var(--nv-primary)]" /> 项目设定
          </h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5" aria-label="关闭">
            <Icon name="x" size={16} />
          </button>
        </div>

        <p className="text-xs text-[var(--nv-text-muted)] mb-5">
          把分散的项目设置归整到一处：小说骨架、项目配置、记忆衰减，以及确认流程的自动交付开关。
        </p>

        <SettingsEntry
          icon="book"
          title="小说骨架"
          desc="题材 / 受众 / 剧情结构 / 力量体系 / 金手指 / 风格标签，定义整本书的基调。"
          onOpen={onOpenBuildConfig}
        />
        <SettingsEntry
          icon="settings"
          title="项目配置"
          desc="书名 / 调用模型 / LLM 参数 / 作者注 / 文本后处理规则。"
          onOpen={onOpenProjectConfig}
        />
        <SettingsEntry
          icon="hourglass"
          title="记忆衰减"
          desc="控制早期设定在后续写作上下文中的淡出强度，避免旧设定干扰新章节。"
          onOpen={onOpenMemoryDecay}
        />

        <div className="mt-5 border-t border-[var(--nv-border-2)] pt-4">
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
            <Icon name="check" size={15} className="text-[var(--nv-primary)]" /> 确认与交付
          </h3>
          <p className="text-xs text-[var(--nv-text-muted)] mb-3">
            控制下方「确认流程」的自动化程度。关闭后改回逐章人工审批。
          </p>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm">智能定稿（自动确认）</div>
                <div className="text-xs text-[var(--nv-text-muted)] mt-0.5">
                  章节生成且通过质量门槛后，系统自动盖章定稿，无需你逐章点「确认通过」。
                </div>
              </div>
              <Switch checked={autoConfirm} onCheckedChange={onToggleAutoConfirm} disabled={busy} />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm">智能交付全书</div>
                <div className="text-xs text-[var(--nv-text-muted)] mt-0.5">
                  全书所有章节均定稿后，系统自动整本交付，生成最终成品。
                </div>
              </div>
              <Switch checked={autoDeliver} onCheckedChange={onToggleAutoDeliver} disabled={busy} />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function SettingsEntry({
  icon,
  title,
  desc,
  onOpen,
}: {
  icon: string;
  title: string;
  desc: string;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left flex items-center gap-3 rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] hover:bg-[var(--nv-surface-2)] px-4 py-3 mb-3 transition-colors"
    >
      <Icon name={icon as any} size={18} className="text-[var(--nv-primary)] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-[var(--nv-text-muted)] mt-0.5">{desc}</div>
      </div>
      <Icon name="chevronRight" size={16} className="text-[var(--nv-text-tertiary)] shrink-0" />
    </button>
  );
}
