import { create } from "zustand";
import type { Project, CharacterCard, LorebookEntry, StoryNode } from "@/core/types";

// ─── 项目状态 ───────────────────────────────────────────────

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  characters: CharacterCard[];
  loreEntries: LorebookEntry[];
  storyNodes: StoryNode[];

  // Actions
  setProjects: (projects: Project[]) => void;
  setCurrentProject: (project: Project | null) => void;
  setCharacters: (characters: CharacterCard[]) => void;
  setLoreEntries: (entries: LorebookEntry[]) => void;
  setStoryNodes: (nodes: StoryNode[]) => void;
  addStoryNode: (node: StoryNode) => void;
  updateStoryNode: (id: string, updates: Partial<StoryNode>) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  currentProject: null,
  characters: [],
  loreEntries: [],
  storyNodes: [],

  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setCharacters: (characters) => set({ characters }),
  setLoreEntries: (loreEntries) => set({ loreEntries }),
  setStoryNodes: (storyNodes) => set({ storyNodes }),
  addStoryNode: (node) =>
    set((state) => ({ storyNodes: [...state.storyNodes, node] })),
  updateStoryNode: (id, updates) =>
    set((state) => ({
      storyNodes: state.storyNodes.map((n) =>
        n.id === id ? { ...n, ...updates } : n
      ),
    })),
}));

// ─── 写作状态 ───────────────────────────────────────────────

interface WriterState {
  currentNode: StoryNode | null;
  isGenerating: boolean;
  generatedContent: string;
  generatedTokens: number;
  reviewPanelOpen: boolean;
  authorNote: string;
  streamBuffer: string;

  // Actions
  setCurrentNode: (node: StoryNode | null) => void;
  setGenerating: (v: boolean) => void;
  appendContent: (token: string) => void;
  setGeneratedContent: (content: string) => void;
  setGeneratedTokens: (n: number) => void;
  setReviewPanelOpen: (v: boolean) => void;
  setAuthorNote: (note: string) => void;
  resetStream: () => void;
}

export const useWriterStore = create<WriterState>((set) => ({
  currentNode: null,
  isGenerating: false,
  generatedContent: "",
  generatedTokens: 0,
  reviewPanelOpen: false,
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
  setReviewPanelOpen: (reviewPanelOpen) => set({ reviewPanelOpen }),
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
