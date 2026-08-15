import { create } from "zustand";
import type {
  ProjectData,
  CharacterData,
  LorebookData,
  StoryNodeData,
} from "@/components/workspace/types";

// ─── 项目状态（FE-8：接管 workspace 实体数据，成为唯一数据源，消除本地 project 与 store 并存） ──

interface ProjectState {
  /** 当前项目全量数据（章节 / 角色 / 世界书 / 故事线 / 文风卡），loadProject 写入 */
  project: ProjectData | null;
  /** 规则（ProjectData 类型未含 rules 字段，API 实际返回，单独存） */
  rules: any[];

  // Actions
  /** loadProject 成功后全量写入（含 rules 提取） */
  setProjectData: (data: ProjectData) => void;
  /** 局部打补丁（如 buildConfig / styleCard / postProcessingRules / llmConfig 保存后；ProjectData 未穷举所有持久化字段，故用宽松类型） */
  patchProject: (patch: Record<string, unknown>) => void;
  updateNode: (id: string, updates: Partial<StoryNodeData>) => void;
  addNode: (node: StoryNodeData) => void;
  removeNode: (id: string) => void;
  upsertCharacter: (c: CharacterData) => void;
  upsertLore: (l: LorebookData) => void;
  upsertRule: (r: any) => void;
  setStyleCard: (sc: any) => void;
  reset: () => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: null,
  rules: [],

  setProjectData: (data) =>
    set({ project: data, rules: (data as any).rules ?? [] }),
  patchProject: (patch) =>
    set((s) => ({
      project: s.project ? ({ ...s.project, ...patch } as ProjectData) : s.project,
    })),
  updateNode: (id, updates) =>
    set((s) => ({
      project: s.project
        ? {
            ...s.project,
            storyNodes: s.project.storyNodes.map((n) =>
              n.id === id ? { ...n, ...updates } : n
            ),
          }
        : null,
    })),
  addNode: (node) =>
    set((s) => ({
      project: s.project
        ? { ...s.project, storyNodes: [...s.project.storyNodes, node] }
        : null,
    })),
  removeNode: (id) =>
    set((s) => ({
      project: s.project
        ? {
            ...s.project,
            storyNodes: s.project.storyNodes.filter((n) => n.id !== id),
          }
        : null,
    })),
  upsertCharacter: (c) =>
    set((s) => ({
      project: s.project
        ? {
            ...s.project,
            characters: s.project.characters.some((x) => x.id === c.id)
              ? s.project.characters.map((x) => (x.id === c.id ? c : x))
              : [...s.project.characters, c],
          }
        : null,
    })),
  upsertLore: (l) =>
    set((s) => ({
      project: s.project
        ? {
            ...s.project,
            lorebookEntries: s.project.lorebookEntries.some((x) => x.id === l.id)
              ? s.project.lorebookEntries.map((x) => (x.id === l.id ? l : x))
              : [...s.project.lorebookEntries, l],
          }
        : null,
    })),
  upsertRule: (r) =>
    set((s) => ({
      rules: s.rules.some((x) => x.id === r.id)
        ? s.rules.map((x) => (x.id === r.id ? r : x))
        : [...s.rules, r],
    })),
  setStyleCard: (sc) =>
    set((s) => ({
      project: s.project ? { ...s.project, styleCard: sc } : null,
    })),
  reset: () => set({ project: null, rules: [] }),
}));

// ─── 写作状态 ───────────────────────────────────────────────

interface WriterState {
  currentNode: StoryNodeData | null;
  isGenerating: boolean;
  generatedContent: string;
  generatedTokens: number;
  authorNote: string;
  streamBuffer: string;

  // Actions
  setCurrentNode: (node: StoryNodeData | null) => void;
  setGenerating: (v: boolean) => void;
  appendContent: (token: string) => void;
  setGeneratedContent: (content: string) => void;
  setGeneratedTokens: (n: number) => void;
  setAuthorNote: (note: string) => void;
  resetStream: () => void;
}

export const useWriterStore = create<WriterState>((set) => ({
  currentNode: null,
  isGenerating: false,
  generatedContent: "",
  generatedTokens: 0,
  authorNote: "",
  streamBuffer: "",

  setCurrentNode: (currentNode) => set({ currentNode }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  appendContent: (token) =>
    set((state) => ({
      generatedContent: state.generatedContent + token,
      streamBuffer: state.streamBuffer + token,
    })),
  setGeneratedContent: (generatedContent) => set({ generatedContent }),
  setGeneratedTokens: (generatedTokens) => set({ generatedTokens }),
  setAuthorNote: (authorNote) => set({ authorNote }),
  resetStream: () => set({ generatedContent: "", streamBuffer: "", generatedTokens: 0 }),
}));

// ─── 看板状态 ───────────────────────────────────────────────

interface StoryboardState {
  editingNodeId: string | null;
  draggingNodeId: string | null;
  expandedNodeIds: Set<string>;

  // Actions
  setEditingNode: (id: string | null) => void;
  setDraggingNode: (id: string | null) => void;
  toggleExpand: (id: string) => void;
}

export const useStoryboardStore = create<StoryboardState>((set) => ({
  editingNodeId: null,
  draggingNodeId: null,
  expandedNodeIds: new Set(),

  setEditingNode: (editingNodeId) => set({ editingNodeId }),
  setDraggingNode: (draggingNodeId) => set({ draggingNodeId }),
  toggleExpand: (id) =>
    set((state) => {
      const next = new Set(state.expandedNodeIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedNodeIds: next };
    }),
}));
