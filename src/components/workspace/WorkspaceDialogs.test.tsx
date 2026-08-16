// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceDialogs } from "./WorkspaceDialogs";

/**
 * v2.50.1 上帝组件拆解第一刀的契约测试。
 * 把子对话框在无头环境替换为轻量标记，验证：
 *  1. 默认（全关闭）只渲染始终存在的 BatchWriteDialog，不渲染其它对话框；
 *  2. editingCharacter 注入后渲染 CharacterDialog，且 onClose/onSave 正确接线；
 *  3. showConflict 注入后渲染 ConflictPanel，onOpenCharacter 命中项目角色并回调 setEditingCharacter。
 */

vi.mock("@/components/workspace/BatchWriteDialog", () => ({
  BatchWriteDialog: () => <div data-testid="batch-write-dialog" />,
}));

vi.mock("@/components/workspace/CharacterDialog", () => ({
  CharacterDialog: ({ character, onClose, onSave }: any) => (
    <div data-testid="character-dialog">
      <span data-testid="cd-name">{character?.name ?? "new"}</span>
      <button data-testid="cd-close" onClick={onClose}>close</button>
      <button data-testid="cd-save" onClick={() => onSave?.()}>save</button>
    </div>
  ),
}));

vi.mock("@/components/workspace/ConflictPanel", () => ({
  ConflictPanel: ({ onOpenCharacter, onClose }: any) => (
    <div data-testid="conflict-panel">
      <button data-testid="cp-open-char" onClick={() => onOpenCharacter("char-1")}>open</button>
      <button data-testid="cp-close" onClick={onClose}>close</button>
    </div>
  ),
}));

function makeDialogs(overrides: Record<string, any> = {}) {
  const noop = vi.fn();
  return {
    editingCharacter: null, setEditingCharacter: vi.fn(),
    editingLore: null, setEditingLore: noop,
    showNewCharacter: false, setShowNewCharacter: noop,
    showStyleEditor: false, setShowStyleEditor: noop,
    showImportWizard: false, setShowImportWizard: noop,
    importWizardMode: "auto", setImportWizardMode: noop,
    showAutomationSettings: false, setShowAutomationSettings: noop,
    showBuildConfig: false, setShowBuildConfig: noop,
    showMemoryDecay: false, setShowMemoryDecay: noop,
    showProjectConfig: false, setShowProjectConfig: noop,
    showProjectSettings: false, setShowProjectSettings: noop,
    showOutlineDialog: false, setShowOutlineDialog: noop,
    outlineChapterCount: 8, setOutlineChapterCount: noop,
    outlineCustomChapterCount: "", setOutlineCustomChapterCount: noop,
    outlineCustomPrompt: "", setOutlineCustomPrompt: noop,
    outlineGenerating: false, setOutlineGenerating: noop,
    outlineGenRunning: false, setOutlineGenRunning: noop,
    outlineCapsuleHidden: false, setOutlineCapsuleHidden: noop,
    outlinePreviewChapters: [], setOutlinePreviewChapters: noop,
    outlineRaw: "", setOutlineRaw: noop,
    outlineError: "", setOutlineError: noop,
    outlineAppendMode: false, setOutlineAppendMode: noop,
    batchWrite: {
      open: false, phase: "input", count: 3, note: "",
      progress: { done: 0, total: 0, pct: 0 }, outlines: [], checked: new Set<string>(),
      taskId: null, writeTaskId: null, startedAt: null, elapsedSec: 0,
      confirming: false, capsuleHidden: false,
    },
    setBatchWrite: noop,
    showExportDialog: false, setShowExportDialog: noop,
    showBackupDialog: false, setShowBackupDialog: noop,
    showConflict: false, setShowConflict: noop,
    ...overrides,
  } as any;
}

const project = {
  id: "p1",
  name: "测试项目",
  storyNodes: [{ id: "n1", type: "chapter", title: "第一章", parentId: undefined }],
  characters: [{ id: "char-1", name: "角色A" }],
  buildConfig: {},
} as any;

const baseProps = (dialogs: any) => ({
  dialogs,
  project,
  selectedNode: null,
  allConfirmed: false,
  projectConfirmedAt: null,
  refreshAfterMutate: vi.fn(),
  loadProject: vi.fn(),
  setReviewResult: vi.fn(),
  styleTemplateId: undefined,
  onStyleSaved: vi.fn(),
  handlers: {
    handleGenerateOutlinePreview: vi.fn(),
    handleConfirmOutline: vi.fn(),
    updatePreviewChapter: vi.fn(),
    startBatchOutline: vi.fn(),
    confirmBatchWrite: vi.fn(),
  },
});

describe("WorkspaceDialogs（v2.50.1 弹窗渲染中心）", () => {
  it("默认全关闭：只渲染 BatchWriteDialog，不渲染其它对话框", () => {
    render(<WorkspaceDialogs {...baseProps(makeDialogs())} />);
    expect(screen.getByTestId("batch-write-dialog")).toBeTruthy();
    expect(screen.queryByTestId("character-dialog")).toBeNull();
    expect(screen.queryByTestId("conflict-panel")).toBeNull();
  });

  it("editingCharacter 注入 → 渲染 CharacterDialog，onClose 调 setEditingCharacter(null)、onSave 调 refreshAfterMutate", () => {
    const setEditingCharacter = vi.fn();
    const refreshAfterMutate = vi.fn();
    const dialogs = makeDialogs({
      editingCharacter: { id: "c1", name: "角色A" },
      setEditingCharacter,
    });
    render(<WorkspaceDialogs {...baseProps(dialogs)} refreshAfterMutate={refreshAfterMutate} />);

    const dialog = screen.getByTestId("character-dialog");
    expect(dialog).toBeTruthy();
    expect(screen.getByTestId("cd-name").textContent).toBe("角色A");

    fireEvent.click(screen.getByTestId("cd-close"));
    expect(setEditingCharacter).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByTestId("cd-save"));
    expect(refreshAfterMutate).toHaveBeenCalledTimes(1);
  });

  it("showConflict 注入 → 渲染 ConflictPanel，onOpenCharacter 命中项目角色并回调 setEditingCharacter", () => {
    const setEditingCharacter = vi.fn();
    const setShowConflict = vi.fn();
    const dialogs = makeDialogs({ showConflict: true, setEditingCharacter, setShowConflict });
    render(<WorkspaceDialogs {...baseProps(dialogs)} />);

    const panel = screen.getByTestId("conflict-panel");
    expect(panel).toBeTruthy();

    fireEvent.click(screen.getByTestId("cp-open-char"));
    expect(setEditingCharacter).toHaveBeenCalledTimes(1);
    const arg = setEditingCharacter.mock.calls[0][0];
    expect(arg?.id).toBe("char-1");

    fireEvent.click(screen.getByTestId("cp-close"));
    expect(setShowConflict).toHaveBeenCalledWith(false);
  });
});
