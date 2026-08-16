"use client";

import { NODE_TYPE } from "@/core/node-type";
import { useProjectStore } from "@/store";
import { Icon } from "@/components/ui/icons";
import { toastError, toastSuccess } from "@/components/ui/toast";
import type { ProjectData, StoryNodeData, ReviewIssue } from "@/components/workspace/types";
import { CharacterDialog } from "@/components/workspace/CharacterDialog";
import { LorebookEditDialog } from "@/components/workspace/LorebookEditDialog";
import { StyleEditor } from "@/components/editor/StyleEditor";
import { ImportWizard } from "@/components/editor/ImportWizard";
import { BatchWriteDialog } from "@/components/workspace/BatchWriteDialog";
import { OutlineDialog } from "@/components/workspace/OutlineDialog";
import { AutomationSettingsDialog } from "@/components/workspace/AutomationSettingsDialog";
import { ProjectSettingsDialog } from "@/components/workspace/ProjectSettingsDialog";
import { BuildConfigDialog } from "@/components/workspace/BuildConfigDialog";
import { MemoryDecayDialog } from "@/components/workspace/MemoryDecayDialog";
import { ProjectConfigPanel } from "@/components/workspace/ProjectConfigPanel";
import { ExportDialog } from "@/components/workspace/ExportDialog";
import { BackupDialog } from "@/components/workspace/BackupDialog";
import { ConflictPanel } from "@/components/workspace/ConflictPanel";
import { useWorkspaceDialogs } from "@/hooks/useWorkspaceDialogs";

export interface WorkspaceDialogsHandlers {
  handleGenerateOutlinePreview: () => void;
  handleConfirmOutline: () => void;
  updatePreviewChapter: (index: number, field: string, value: string) => void;
  startBatchOutline: () => void;
  confirmBatchWrite: () => void;
}

export interface WorkspaceDialogsProps {
  dialogs: ReturnType<typeof useWorkspaceDialogs>;
  project: ProjectData;
  selectedNode: StoryNodeData | null;
  allConfirmed: boolean;
  projectConfirmedAt: string | null;
  refreshAfterMutate: () => void;
  loadProject: () => void;
  setReviewResult: (r: { passed: boolean; issues: ReviewIssue[] } | null) => void;
  styleTemplateId?: string;
  onStyleSaved: (id: string) => void;
  handlers: WorkspaceDialogsHandlers;
}

/**
 * 工作台弹窗渲染中心（v2.50.1 上帝组件拆解第一刀）。
 * 从 WorkspacePage 的 return JSX 中搬出所有「独立对话框」渲染（角色/词条/文风/导入/批量写作/大纲/
 * 自动化/项目设置/构建/记忆衰减/项目配置/导出/备份/冲突推演），状态全部来自 useWorkspaceDialogs，
 * 通用回调通过 props 注入。保存冲突(SaveConflictModal)/精修diff(RefineDiffModal)/抽卡(DrawCards)/
 * 生成前确认(PreGenConfirm) 属主流程，仍留在 WorkspacePage。
 */
export function WorkspaceDialogs({
  dialogs, project, selectedNode, allConfirmed, projectConfirmedAt,
  refreshAfterMutate, loadProject, setReviewResult, styleTemplateId, onStyleSaved, handlers,
}: WorkspaceDialogsProps) {
  const existingChapterCount = project?.storyNodes.filter((n) => n.type === NODE_TYPE.CHAPTER && !n.parentId).length || 0;

  return (
    <>
      {dialogs.editingCharacter && (
        <CharacterDialog character={dialogs.editingCharacter} projectId={project.id} allCharacters={project.characters as any} onClose={() => dialogs.setEditingCharacter(null)} onSave={refreshAfterMutate} />
      )}
      {dialogs.showNewCharacter && (
        <CharacterDialog projectId={project.id} allCharacters={project.characters as any} onClose={() => dialogs.setShowNewCharacter(false)} onSave={refreshAfterMutate} />
      )}
      {dialogs.editingLore && (
        <LorebookEditDialog entry={dialogs.editingLore} projectId={project.id} onClose={() => dialogs.setEditingLore(null)} onSave={refreshAfterMutate} />
      )}
      {dialogs.showStyleEditor && (
        <StyleEditor projectId={project.id} currentStyleId={styleTemplateId} onSaved={(id) => onStyleSaved(id)} onClose={() => dialogs.setShowStyleEditor(false)} chapterContent={selectedNode?.content} />
      )}
      {dialogs.showImportWizard && (
        <ImportWizard projectId={project.id} initialMode={dialogs.importWizardMode} onClose={() => dialogs.setShowImportWizard(false)} onImported={refreshAfterMutate} />
      )}

      {/* v2.0.4 批量写作弹窗（受控）+ 后台进度胶囊 */}
      <BatchWriteDialog
        open={dialogs.batchWrite.open}
        phase={dialogs.batchWrite.phase}
        count={dialogs.batchWrite.count}
        note={dialogs.batchWrite.note}
        progress={dialogs.batchWrite.progress}
        elapsedSec={dialogs.batchWrite.elapsedSec}
        outlines={dialogs.batchWrite.outlines}
        checked={dialogs.batchWrite.checked}
        confirming={dialogs.batchWrite.confirming}
        onCountChange={(n) => dialogs.setBatchWrite((s) => ({ ...s, count: n }))}
        onNoteChange={(t) => dialogs.setBatchWrite((s) => ({ ...s, note: t }))}
        onStart={handlers.startBatchOutline}
        onClose={() => dialogs.setBatchWrite((s) => ({ ...s, open: false }))}
        onToggle={(id) => dialogs.setBatchWrite((s) => {
          const next = new Set(s.checked);
          if (next.has(id)) next.delete(id); else next.add(id);
          return { ...s, checked: next };
        })}
        onEdit={(id, text) => dialogs.setBatchWrite((s) => ({ ...s, outlines: s.outlines.map((i) => (i.nodeId === id ? { ...i, outline: text } : i)) }))}
        onConfirm={handlers.confirmBatchWrite}
      />
      {(dialogs.batchWrite.writeTaskId || (dialogs.batchWrite.taskId && !dialogs.batchWrite.open)) && !dialogs.batchWrite.capsuleHidden && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)]/95 backdrop-blur px-3 py-1.5 shadow-lg text-xs text-[var(--nv-text-secondary)]">
          <Icon name="loader" size={12} className="animate-spin text-[var(--nv-primary)]" />
          批量写作中… {dialogs.batchWrite.progress.done}/{dialogs.batchWrite.progress.total} 章（{dialogs.batchWrite.progress.pct}%）
          <button onClick={() => dialogs.setBatchWrite((s) => ({ ...s, capsuleHidden: true }))} className="text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]" title="隐藏进度提示（任务仍在后台继续）"><Icon name="x" size={12} /></button>
        </div>
      )}

      {/* 大纲生成对话框 */}
      {dialogs.showOutlineDialog && (
        <OutlineDialog projectName={project.name} chapterCount={dialogs.outlineChapterCount}
          customChapterCount={dialogs.outlineCustomChapterCount} customPrompt={dialogs.outlineCustomPrompt}
          previewChapters={dialogs.outlinePreviewChapters} rawOutline={dialogs.outlineRaw}
          error={dialogs.outlineError} isGenerating={dialogs.outlineGenerating} onChapterCountChange={dialogs.setOutlineChapterCount}
          onCustomChapterCountChange={dialogs.setOutlineCustomChapterCount} onCustomPromptChange={dialogs.setOutlineCustomPrompt}
          onGenerate={handlers.handleGenerateOutlinePreview}
          onConfirm={handlers.handleConfirmOutline} onUpdateChapter={handlers.updatePreviewChapter}
          appendMode={dialogs.outlineAppendMode} onAppendModeChange={dialogs.setOutlineAppendMode}
          hasExistingChapters={existingChapterCount > 0}
          onClose={() => { dialogs.setShowOutlineDialog(false); }} />
      )}
      {/* v2.0.14：大纲后台生成进度胶囊——关掉弹窗任务仍在后台继续，完成自动重开预览 */}
      {dialogs.outlineGenRunning && !dialogs.outlineCapsuleHidden && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)]/95 backdrop-blur px-3 py-1.5 shadow-lg text-xs text-[var(--nv-text-secondary)]">
          <Icon name="loader" size={12} className="animate-spin text-[var(--nv-primary)]" />
          大纲生成中…（后台运行，可关闭弹窗，完成后自动返回）
          <button onClick={() => dialogs.setOutlineCapsuleHidden(true)} className="text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]" title="隐藏进度提示（任务仍在后台继续）"><Icon name="x" size={12} /></button>
        </div>
      )}
      {dialogs.showAutomationSettings && project && (
        <AutomationSettingsDialog projectId={project.id} projectName={project.name} onClose={() => dialogs.setShowAutomationSettings(false)} />
      )}

      {dialogs.showProjectSettings && project && (
        <ProjectSettingsDialog
          projectId={project.id}
          project={project}
          selectedNode={selectedNode}
          allConfirmed={allConfirmed}
          projectConfirmedAt={projectConfirmedAt}
          onClose={() => dialogs.setShowProjectSettings(false)}
          onOpenBuildConfig={() => { dialogs.setShowProjectSettings(false); dialogs.setShowBuildConfig(true); }}
          onOpenProjectConfig={() => { dialogs.setShowProjectSettings(false); dialogs.setShowProjectConfig(true); }}
          onOpenMemoryDecay={() => { dialogs.setShowProjectSettings(false); dialogs.setShowMemoryDecay(true); }}
          onAction={() => { void loadProject(); }}
          onDiagnose={async () => {
            if (!selectedNode) return;
            try {
              const res = await fetch(`/api/story/nodes/${selectedNode.id}/review`, { method: "POST" });
              const d = await res.json().catch(() => ({}));
              if (res.ok) {
                setReviewResult({ passed: d.passed, issues: d.issues || [] });
                toastSuccess(`AI 诊断完成：综合 ${d.overallScore} 分（${d.grade} 级）`);
              } else {
                toastError(d.error || "诊断失败");
              }
            } catch (e) {
              toastError("诊断失败：" + (e instanceof Error ? e.message : "网络错误"));
            }
          }}
        />
      )}

      {dialogs.showBuildConfig && project && (
        <BuildConfigDialog
          projectId={project.id}
          buildConfig={project.buildConfig as any}
          onSaved={(cfg) => useProjectStore.getState().patchProject({ buildConfig: cfg as any })}
          onClose={() => dialogs.setShowBuildConfig(false)}
        />
      )}

      {dialogs.showMemoryDecay && project && (
        <MemoryDecayDialog projectId={project.id} projectName={project.name} onClose={() => dialogs.setShowMemoryDecay(false)} />
      )}

      {dialogs.showProjectConfig && project && (
        <ProjectConfigPanel
          projectId={project.id}
          project={project}
          onSaved={(patch) => useProjectStore.getState().patchProject(patch)}
          onClose={() => dialogs.setShowProjectConfig(false)}
        />
      )}

      {/* 导出弹窗 */}
      {dialogs.showExportDialog && project && (
        <ExportDialog
          projectId={project.id}
          projectName={project.name}
          chapters={project.storyNodes.map((n) => ({
            id: n.id,
            title: `${n.type === NODE_TYPE.VOLUME ? "卷：" : n.type === NODE_TYPE.SECTION ? "节：" : n.type === NODE_TYPE.SCENE ? "幕：" : ""}${n.title}`,
          }))}
          onClose={() => dialogs.setShowExportDialog(false)}
        />
      )}
      {dialogs.showBackupDialog && project && (
        <BackupDialog
          projectId={project.id}
          projectName={project.name}
          onClose={() => dialogs.setShowBackupDialog(false)}
        />
      )}

      {/* D4 冲突推演 */}
      {dialogs.showConflict && project && (
        <ConflictPanel
          open={dialogs.showConflict}
          projectId={project.id}
          projectName={project.name}
          onClose={() => dialogs.setShowConflict(false)}
          onApplied={loadProject}
          onOpenCharacter={(id) => { const c = project.characters.find((x) => x.id === id); if (c) dialogs.setEditingCharacter(c); }}
        />
      )}
    </>
  );
}
