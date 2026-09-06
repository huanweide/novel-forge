"use client";

import { useState, useEffect } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import { ContextPreview } from "@/components/editor/ContextPreview";
import { ChapterWordCountChart } from "./ChapterWordCountChart";
import { ChapterEntitiesPanel } from "./ChapterEntitiesPanel";
import { ForeshadowingPanel } from "./ForeshadowingPanel";
import { ConsistencyPanel } from "./ConsistencyPanel";
import { PublishCheckPanel } from "./PublishCheckPanel";
import { FullTextSearchPanel } from "./FullTextSearchPanel";
import { AIChatBar } from "./AIChatBar";
import { MonitorPanel } from "./MonitorPanel";
import { NarrativeEnergyPanel } from "./NarrativeEnergyPanel";
import { GenerationLatencyPanel } from "./GenerationLatencyPanel";
import { StatRow } from "./SharedUI";
import type { StoryNodeData } from "./types";
import { useProjectStore } from "@/store";
import type { ToolboxItem } from "./ToolboxDialog";

type TopTab = "ai" | "entities" | "toolbox" | "stats" | "publish";
type EntitySubTab = "entities" | "foreshadowing" | "relationships" | "consistency" | "search";

interface RightPanelProps {
  selectedNode: StoryNodeData | null;
  /** v2.0.14：最小化与展开由父组件控制，配合左栏互斥，确保只一侧可见；父组件传 onMinimize/onExpand 即可 */
  minimized: boolean;
  onMinimize: () => void;
  onExpand: () => void;
  contextRefreshKey: number;
  authorNote: string;
  onEditCharacter?: (id: string) => void;
  onEditLore?: (id: string) => void;
  selectedText?: string;
  toolboxItems: ToolboxItem[];
  /** v3.1.75：全文检索结果点击，由父组件跳转到该节点 */
  onJumpToNode?: (nodeId: string) => void;
  /** P1-3：宝宝流记忆召回，透传给 ContextPreview 合并展示 */
  recallMemories?: any[];
  /** M1：Codex 活注入清单，透传给 ContextPreview 展示「本章注入了哪些设定」 */
  codexItems?: any[];
  /** M1：注入统计 { candidates, selected, dropped, byKind } */
  codexStats?: any;
  /** P1-3：生成进行中，自动展开统计区上下文监控 */
  isGenerating?: boolean;
}

const TOP_TABS: Array<{ key: TopTab; icon: IconName; label: string }> = [
  { key: "ai", icon: "bot", label: "AI助手" },
  { key: "entities", icon: "search", label: "实体" },
  { key: "toolbox", icon: "wrench", label: "工具箱" },
  { key: "stats", icon: "chart", label: "统计" },
  { key: "publish", icon: "rocket", label: "发布" },
];

// 复制自 ToolboxDialog 的 CATEGORY_META（保持卡片视觉一致，避免改动 ToolboxDialog）
const CATEGORY_META: Record<ToolboxItem["category"], { label: string; desc: string; accent: string }> = {
  write: { label: "写作辅助", desc: "推进正文与结构", accent: "var(--nv-primary)" },
  generate: { label: "内容生成", desc: "创造设定与方向", accent: "var(--nv-creative)" },
  analyze: { label: "智能分析", desc: "检查质量与逻辑", accent: "var(--nv-accent)" },
};

const TOOLBOX_CATEGORIES: ToolboxItem["category"][] = ["write", "generate", "analyze"];

const MONITOR_SECTIONS = [
  { key: "energy", label: "叙事能量曲线", icon: "chart" as IconName },
  { key: "latency", label: "生成延迟", icon: "zap" as IconName },
  { key: "monitor", label: "节点监测", icon: "radio" as IconName },
] as const;

export function RightPanel(props: RightPanelProps) {
  const { selectedNode, minimized, onMinimize, onExpand, contextRefreshKey, authorNote, onEditCharacter, onEditLore, selectedText, toolboxItems, onJumpToNode, recallMemories = [], codexItems = [], codexStats = null, isGenerating = false } = props;
  // FE-8：project 数据从 store 读取，不再由父组件逐层透传 project 大对象
  const project = useProjectStore((s) => s.project);
  if (!project) return null;

  const [topTab, setTopTab] = useState<TopTab>("ai");
  const [entitySubTab, setEntitySubTab] = useState<EntitySubTab>("entities");
  const [showContext, setShowContext] = useState(false);
  // 默认展开首项（叙事能量曲线），避免首屏空白；不三项全开以免三路同时 fetch
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ energy: true });

  // P1-3：生成进行时自动展开统计区的「上下文监控」（含合并的召回），满足「生成时展开、平时收起」
  useEffect(() => {
    if (isGenerating) {
      setTopTab("stats");
      setShowContext(true);
    }
  }, [isGenerating]);

  // 监测三块 section（折叠区块，展开才挂载子组件以省 fetch）
  const monitorSections = MONITOR_SECTIONS.map((s) => {
    const node =
      s.key === "energy" ? (
        <NarrativeEnergyPanel projectId={project.id} />
      ) : s.key === "latency" ? (
        <GenerationLatencyPanel />
      ) : (
        <MonitorPanel projectId={project.id} nodeId={selectedNode?.id} />
      );
    return (
      <div key={s.key} className="border-b border-[var(--nv-border-2)]">
        <button
          onClick={() => setOpenSections((o) => ({ ...o, [s.key]: !o[s.key] }))}
          className="flex w-full items-center justify-between px-3 py-2 text-xs text-[var(--nv-text-secondary)] transition-colors hover:bg-[var(--nv-surface-2)]"
        >
          <span className="flex items-center gap-1.5"><Icon name={s.icon} size={13} /> {s.label}</span>
          <span className="text-[10px] opacity-60">{openSections[s.key] ? "▾" : "▸"}</span>
        </button>
        {openSections[s.key] && <div className="px-1 pb-2">{node}</div>}
      </div>
    );
  });

  // ── 最小化状态 ──
  if (minimized) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center gap-3 border-l border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] py-3 backdrop-blur-sm">
        <button onClick={onExpand} className="text-[var(--nv-text-tertiary)] transition-colors hover:text-[var(--nv-text-primary)]" title="展开面板" aria-label="展开面板"><Icon name="arrowLeft" size={16} /></button>
        <div className="flex flex-1 flex-col items-center gap-3 text-[10px] text-[var(--nv-text-tertiary)]">
          {TOP_TABS.map((t) => (
            <button key={t.key} onClick={() => { onExpand(); setTopTab(t.key); }}
              className={`writing-mode-vertical hover:text-[var(--nv-text-primary)] ${topTab === t.key ? "text-[var(--nv-primary)]" : ""}`}
              style={{ writingMode: "vertical-rl" }} title={t.label}
            >{t.label}</button>
          ))}
        </div>
              </aside>
    );
  }

  // ── 展开状态 ──
  return (
    <aside className="flex w-80 max-h-full shrink-0 flex-col overflow-hidden border-l border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] backdrop-blur-sm">
      {/* 顶部三tab */}
      <div className="flex shrink-0 border-b border-[var(--nv-border-2)]">
        {TOP_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTopTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
              topTab === t.key
                ? "border-b-2 border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] text-[var(--nv-primary)] shadow-[0_0_12px_color-mix(in_oklch,var(--nv-primary)_28%,transparent)]"
                : "border-b-2 border-transparent text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)] hover:bg-[var(--nv-surface-2)]"
            }`}
          >
            <Icon name={t.icon} size={13} /> {t.label}
          </button>
        ))}
        <button onClick={onMinimize} className="shrink-0 px-2 text-[var(--nv-text-tertiary)] transition-colors hover:text-[var(--nv-danger)]" title="最小化（可从右侧竖条随时展开）" aria-label="最小化面板"><Icon name="x" size={14} /></button>
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* ── AI助手 tab ── */}
        {topTab === "ai" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <AIChatBar
              projectId={project.id}
              chapterContent={selectedNode?.content ?? undefined}
              selectedText={selectedText}
              className="border-t-0"
            />
          </div>
        )}

        {/* ── 实体 tab（查询实体：实体追踪 / 伏笔 / 关系图） ── */}
        {topTab === "entities" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* P1-2：同源标注——三子 Tab 均为「结构化表格（权威库）」的快捷切片，关系图数据源独立 */}
            <div className="px-3 pt-2 pb-1 text-[10px] text-[var(--nv-text-tertiary)] leading-relaxed">
              以下三个视图均源自<span className="text-[var(--nv-text-secondary)]">结构化表格</span>（角色卡 + 世界书的权威库）的同源快捷切片；关系图（角色详情内）数据源独立，不与本表强同步。
            </div>
            {/* 子tab */}
            <div className="flex border-b border-[var(--nv-border-2)] shrink-0">
              <button
                onClick={() => setEntitySubTab("entities")}
                className={`flex-1 py-1.5 text-[10px] transition-colors ${
                  entitySubTab === "entities" ? "text-[var(--nv-text-secondary)] bg-[var(--nv-surface-3)]/30" : "text-[var(--nv-text-muted)] hover:text-[var(--nv-text-tertiary)]"
                }`}
              ><Icon name="chart" size={15} className="inline-block align-text-bottom shrink-0" /> 实体追踪</button>
              <button
                onClick={() => setEntitySubTab("foreshadowing")}
                className={`flex-1 py-1.5 text-[10px] transition-colors ${
                  entitySubTab === "foreshadowing" ? "text-[var(--nv-text-secondary)] bg-[var(--nv-surface-3)]/30" : "text-[var(--nv-text-muted)] hover:text-[var(--nv-text-tertiary)]"
                }`}
              ><Icon name="gem" size={15} className="inline-block align-text-bottom shrink-0" /> 未收尾线索</button>
              <button
                onClick={() => setEntitySubTab("consistency")}
                className={`flex-1 py-1.5 text-[10px] transition-colors ${
                  entitySubTab === "consistency" ? "text-[var(--nv-text-secondary)] bg-[var(--nv-surface-3)]/30" : "text-[var(--nv-text-muted)] hover:text-[var(--nv-text-tertiary)]"
                }`}
              ><Icon name="bookmarked" size={15} className="inline-block align-text-bottom shrink-0" /> 一致性基线</button>
              <button
                onClick={() => setEntitySubTab("search")}
                className={`flex-1 py-1.5 text-[10px] transition-colors ${
                  entitySubTab === "search" ? "text-[var(--nv-text-secondary)] bg-[var(--nv-surface-3)]/30" : "text-[var(--nv-text-muted)] hover:text-[var(--nv-text-tertiary)]"
                }`}
              ><Icon name="search" size={15} className="inline-block align-text-bottom shrink-0" /> 全文检索</button>
            </div>

            {/* 子内容 */}
            <div className="flex-1 overflow-y-auto">
              {entitySubTab === "entities" ? (
                <ChapterEntitiesPanel
                  projectId={project.id}
                  chapterContent={selectedNode?.content ?? undefined}
                  onEditCharacter={onEditCharacter}
                  onEditLore={onEditLore}
                  allCharacters={project.characters.map((c) => ({ id: c.id, name: c.name }))}
                  allLoreEntries={project.lorebookEntries.map((l) => ({ id: l.id, title: l.title }))}
                />
              ) : entitySubTab === "foreshadowing" ? (
                <ForeshadowingPanel projectId={project.id} />
              ) : entitySubTab === "search" ? (
                <FullTextSearchPanel projectId={project.id} onJump={(id) => onJumpToNode?.(id)} />
              ) : (
                <ConsistencyPanel projectId={project.id} />
              )}
            </div>
          </div>
        )}

        {/* ── 工具箱 tab（内联网格，按用途分组，替代原顶栏 Modal） ── */}
        {topTab === "toolbox" && (
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {TOOLBOX_CATEGORIES.map((cat) => {
              const catItems = toolboxItems.filter((i) => i.category === cat);
              if (catItems.length === 0) return null;
              const meta = CATEGORY_META[cat];
              return (
                <div key={cat}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-4 w-1 rounded-full" style={{ background: meta.accent }} />
                    <h4 className="text-sm font-medium text-[var(--nv-text-secondary)]">{meta.label}</h4>
                    <span className="text-[10px] text-[var(--nv-text-muted)]">· {meta.desc}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {catItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => item.action()}
                        className="group flex flex-col gap-1.5 rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-2)] hover:shadow-[var(--shadow-glass-rest)]"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-lg transition-shadow group-hover:shadow-[0_0_12px_color-mix(in_oklch,var(--nv-primary)_45%,transparent)]"
                            style={{ background: `${meta.accent}1a`, color: meta.accent }}
                          >
                            <Icon name={item.icon} size={15} />
                          </span>
                          <span className="text-xs font-medium text-[var(--nv-text-primary)]">{item.label}</span>
                          {item.badge && (
                            <span className="ml-auto rounded bg-[var(--nv-surface-2)] px-1 text-[9px] text-[var(--nv-text-tertiary)]">{item.badge}</span>
                          )}
                        </div>
                        <p className="line-clamp-2 text-[10px] leading-relaxed text-[var(--nv-text-tertiary)]">{item.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── 统计 tab（去重：统计条 + 监测三块 section + 上下文监控） ── */}
        {topTab === "stats" && (
          <div className="flex-1 overflow-y-auto">
            {/* 统计条（原底部 StatRow 移入此处，避免与 AI助手 tab 重复） */}
            <div className="px-4 py-2 space-y-1">
              <StatRow label="总字数" value={String(project.storyNodes.reduce((sum, n) => sum + (n.wordCount || 0), 0))} />
              <StatRow label="角色" value={String(project.characters.length)} />
              <StatRow label="词条" value={String(project.lorebookEntries.length)} />
              <StatRow label="节点" value={String(project.storyNodes.length)} />
            </div>

            {/* 章节字数分布（纯前端零 token，与统计条同源 wordCount） */}
            <div className="px-4 py-2">
              <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-[var(--nv-text-muted)]">
                <Icon name="chart" size={13} className="inline-block align-text-bottom shrink-0" />
                章节字数分布
              </div>
              <ChapterWordCountChart
                nodes={project.storyNodes.filter((n) => (n.type || "") !== "volume")}
              />
            </div>

            {/* 监测三块 section（可折叠，复用监测 tab 渲染模式） */}
            {monitorSections}

            {/* 上下文监控（原底部折叠区块移入此处） */}
            <button
              onClick={() => setShowContext(!showContext)}
              className="w-full flex items-center justify-between px-4 py-1.5 text-[10px] text-[var(--nv-text-muted)] hover:text-[var(--nv-text-tertiary)] hover:bg-[var(--nv-surface-3)]/30 transition-colors"
            >
              <span><Icon name="search" size={15} className="inline-block align-text-bottom shrink-0" /> 上下文监控</span>
              <span>{showContext ? "▲" : "▼"}</span>
            </button>
            {showContext && selectedNode && (
              <div className="px-3 pb-3">
                <ContextPreview
                  projectId={project.id}
                  nodeId={selectedNode.id}
                  authorNote={authorNote}
                  refreshKey={contextRefreshKey}
                  recallMemories={recallMemories}
                  codexItems={codexItems}
                  codexStats={codexStats}
                  isGenerating={isGenerating}
                />
              </div>
            )}
          </div>
        )}

        {/* ── 发布 tab（M2+M3+M4 统一检查面板） ── */}
        {topTab === "publish" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <PublishCheckPanel projectId={project.id} />
          </div>
        )}
      </div>
    </aside>
  );
}
