"use client";

import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/icons";
import { ChapterConfirmBar } from "@/components/workspace/ChapterConfirmBar";

interface Props {
  projectId: string;
  project: { name?: string; autoConfirmEnabled?: boolean; autoDeliverEnabled?: boolean } | null;
  selectedNode?: { id: string; status: string } | null;
  allConfirmed: boolean;
  projectConfirmedAt: string | null;
  onClose: () => void;
  onOpenBuildConfig: () => void;
  onOpenProjectConfig: () => void;
  onOpenMemoryDecay: () => void;
  onAction: () => void;
  onDiagnose: () => void;
}

export function ProjectSettingsDialog({
  projectId,
  project,
  selectedNode,
  allConfirmed,
  projectConfirmedAt,
  onClose,
  onOpenBuildConfig,
  onOpenProjectConfig,
  onOpenMemoryDecay,
  onAction,
  onDiagnose,
}: Props) {
  return (
    <Modal
      open
      onClose={onClose}
      bare
      panelClassName="max-w-2xl max-h-[90vh] overflow-y-auto"
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
          把分散的项目设置归整到一处：小说骨架、项目配置、记忆衰减，以及确认与交付。
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
          <p className="text-xs text-[var(--nv-text-muted)] mb-2">
            章节定稿、AI 审校、智能交付全书都收在这里——正文区不再被确认栏遮挡。
          </p>
          {selectedNode ? (
            <ChapterConfirmBar
              projectId={projectId}
              nodeId={selectedNode.id}
              nodeStatus={selectedNode.status}
              allConfirmed={allConfirmed}
              projectConfirmedAt={projectConfirmedAt}
              autoConfirmEnabled={project?.autoConfirmEnabled ?? true}
              autoDeliverEnabled={project?.autoDeliverEnabled ?? true}
              onAction={onAction}
              onDiagnose={onDiagnose}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--nv-border-2)] px-4 py-3 text-xs text-[var(--nv-text-muted)]">
              先在大纲里选中一个章节，即可在这里对它确认定稿、AI 审校，或对全书一键智能交付。
            </div>
          )}
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
