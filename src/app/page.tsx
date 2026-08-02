"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LATEST_VERSION, CHANGELOG_BRIEF } from "@/lib/changelog-data";
import { GENRE_TEMPLATES } from "@/core/templates/genres";
import { Icon } from "@/components/ui/icons";
import { confirmDialog, toastError, toastSuccess, toastInfo } from "@/components/ui/toast";
import { useConfirmDelete } from "@/components/workspace/useConfirmDelete";
import { Modal } from "@/components/ui/Modal";

// ─── 类型 ────────────────────────────────────────────────────

interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  genre: string[];
  targetWordCount: number;
  synopsis: string;
  toneKeywords: string[];
  updatedAt: string;
  _count: {
    characters: number;
    lorebookEntries: number;
    storyNodes: number;
  };
}

// ─── 页面组件 ────────────────────────────────────────────────

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);

  const loadProjects = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/projects", { signal });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
        setLoadError(null);
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
        setLoadError(d.error || d.hint || "加载项目失败");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("加载项目失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    loadProjects(ctrl.signal);
    return () => ctrl.abort();
  }, [loadProjects]);

  const router = useRouter();
  const [loadingSample, setLoadingSample] = useState(false);
  const loadSample = async () => {
    setLoadingSample(true);
    try {
      const res = await fetch("/api/seed/sample-project", { method: "POST" });
      const d = await res.json();
      if (res.ok && d.id) {
        toastSuccess("示例项目已载入");
        router.push(`/workspace/${d.id}`);
      } else {
        toastError(d.error || "载入示例失败");
      }
    } catch {
      toastError("载入示例失败");
    } finally {
      setLoadingSample(false);
    }
  };

  const [showGenres, setShowGenres] = useState(false);
  const [loadingGenre, setLoadingGenre] = useState<string | null>(null);
  const loadGenre = async (genreId: string) => {
    setLoadingGenre(genreId);
    try {
      const res = await fetch("/api/seed/genre-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genreId }),
      });
      const d = await res.json();
      if (res.ok && d.id) {
        toastSuccess("题材骨架已创建");
        router.push(`/workspace/${d.id}`);
      } else {
        toastError(d.error || "创建题材骨架失败");
      }
    } catch {
      toastError("创建题材骨架失败");
    } finally {
      setLoadingGenre(null);
    }
  };

  useEffect(() => {
    try {
      const seen = localStorage.getItem("novel-forge-last-version");
      if (seen !== LATEST_VERSION) setShowChangelog(true);
    } catch { /* */ }
  }, []);

  const { deletingId, remove: deleteProject } = useConfirmDelete({
    title: "移入回收站",
    description: (id, name) => `确定删除「${name}」？将移入回收站，可在回收站恢复（默认不彻底删除）。`,
    deleteFn: async (id) => {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "删除失败");
      }
    },
    onSuccess: () => loadProjects(),
    errorPrefix: "删除失败",
  });

  return (
    <div className="min-h-screen bg-transparent text-foreground">
      {/* 顶栏 */}
      <header className="border-b border-[var(--nv-border-2)] bg-[var(--nv-void)]/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Novel Forge</h1>
              <p className="text-xs text-[var(--nv-text-tertiary)]">
                AI 小说工坊 ·{" "}
                <a href="/changelog" className="text-primary hover:text-primary transition-colors">
                  更新面板
                </a>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/explore" className="btn-primary text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 font-medium">
              <Icon name="sparkles" size={14} /> <span className="hidden sm:inline">开始创作</span>
            </Link>
            <Link href="/dissect" className="btn-ghost text-xs px-3 py-1.5 rounded-xl active:scale-95 flex items-center gap-1">
              <Icon name="book" size={13} /> <span className="hidden sm:inline">拆书</span>
            </Link>
            <Link href="/workshop" className="btn-ghost text-xs px-3 py-1.5 rounded-xl active:scale-95 flex items-center gap-1">
              <Icon name="sparkles" size={13} /> <span className="hidden sm:inline">创意工坊</span>
            </Link>
            <Link href="/settings" className="btn-ghost text-xs px-3 py-1.5 rounded-xl active:scale-95 flex items-center gap-1">
              <Icon name="settings" size={13} /> <span className="hidden sm:inline">设置</span>
            </Link>
            <Link href="/recycle" className="btn-ghost text-xs px-3 py-1.5 rounded-xl active:scale-95 flex items-center gap-1">
              <Icon name="trash" size={13} /> <span className="hidden sm:inline">回收站</span>
            </Link>
            <button onClick={() => window.dispatchEvent(new Event("nf-open-command-palette"))} className="btn-ghost text-xs px-3 py-1.5 rounded-xl active:scale-95 flex items-center gap-1" title="全局命令面板（Cmd/Ctrl+K）">
              <Icon name="search" size={13} /> <span className="hidden sm:inline">搜索</span>
              <kbd className="ml-0.5 text-[10px] px-1 rounded bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)]">⌘K</kbd>
            </button>
            <button onClick={loadSample} disabled={loadingSample} className="btn-ghost text-xs px-3 py-1.5 rounded-xl active:scale-95 flex items-center gap-1">
              <Icon name="sparkles" size={13} /> <span className="hidden sm:inline">{loadingSample ? "载入中" : "示例"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero 欢迎区 */}
      <section className="relative overflow-hidden border-b border-[var(--nv-border-2)] bg-gradient-to-b from-[var(--nv-surface-1)] to-transparent">
        {/* 光晕装饰 */}
        <div className="hero-glow" style={{ width: '480px', height: '480px', background: 'var(--nv-primary)', top: '-180px', left: '50%', transform: 'translateX(-50%)' }} />
        <div className="hero-glow" style={{ width: '340px', height: '340px', background: 'var(--nv-creative)', top: '30px', right: '6%' }} />
        <div className="relative max-w-7xl mx-auto px-6 py-14 md:py-20">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] text-[11px] text-[var(--nv-text-tertiary)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--nv-accent)] glow-dot" /> AI 驱动的小说创作引擎
              </div>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight">
                构建你的<span className="text-gradient">小说宇宙</span>
              </h2>
              <p className="mt-4 text-[var(--nv-text-tertiary)] text-base leading-relaxed max-w-xl">
                用 AI 探讨灵感、拆解好书、管理角色与世界观——从一句话构思到完整成稿，一站式完成。
              </p>
            </div>
            <div className="flex shrink-0 gap-3">
              <Link href="/explore" className="btn-primary text-sm px-6 py-3 rounded-xl inline-flex items-center gap-1.5 font-medium shadow-glow-indigo">
                <Icon name="sparkles" size={15} /> 开始创作
              </Link>
              <Link href="/dissect" className="btn-ghost text-sm px-5 py-3 rounded-xl inline-flex items-center gap-1.5">
                <Icon name="book" size={14} /> 拆书分析
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 主区 */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="inline-flex items-center gap-2 text-[var(--nv-text-tertiary)]">
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse delay-150" />
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse delay-300" />
            </span>
          </div>
        ) : loadError && projects.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl surface-elevated flex items-center justify-center mx-auto mb-5">
              <Icon name="alert" size={28} className="text-[var(--nv-warning)]" />
            </div>
            <h2 className="text-xl font-semibold text-[var(--nv-text-secondary)] mb-2">加载失败</h2>
            <p className="text-[var(--nv-text-tertiary)] text-sm mb-2">{loadError}</p>
            <p className="text-[var(--nv-text-muted)] text-xs mb-6">多数情况是数据库未连接或 AI 未配置——看页面顶部黄色提示，按指引修复即可。</p>
            <button
              onClick={() => loadProjects()}
              className="btn-primary inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold"
            >
              重试
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="py-10">
            <p className="text-center text-[var(--nv-text-tertiary)] text-sm mb-8">还没有小说项目，从下面任选一种方式开始：</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FeatureCard icon="sparkles" title="探讨模式" desc="对话式构建世界观、角色与大纲" href="/explore" cta="开始探讨" />
              <FeatureCard icon="book" title="拆书分析" desc="上传文本，逆向学习结构与文风" href="/dissect" cta="去拆书" />
              <FeatureCard icon="settings" title="配置 AI" desc="先填好 LLM Key，功能才能跑通" href="/settings" cta="去设置" />
            </div>
            <div className="mt-6 flex flex-col items-center gap-4">
              <button onClick={loadSample} disabled={loadingSample}
                className="btn-primary text-sm px-6 py-3 rounded-xl inline-flex items-center gap-1.5 font-medium shadow-glow-indigo">
                <Icon name="sparkles" size={15} /> {loadingSample ? "正在载入示例…" : "一键载入示例项目（仙侠）"}
              </button>
              <button onClick={() => setShowGenres((v) => !v)} disabled={loadingSample}
                className="btn-ghost text-xs px-4 py-2 rounded-xl inline-flex items-center gap-1.5">
                <Icon name="book" size={13} /> {showGenres ? "收起题材库" : "按题材开局"}
              </button>
              {showGenres && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-3xl">
                  {GENRE_TEMPLATES.map((g) => (
                    <button key={g.id} onClick={() => loadGenre(g.id)} disabled={loadingGenre !== null}
                      className="surface-elevated rounded-xl p-3 text-left transition-colors hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-2)] disabled:opacity-60">
                      <div className="text-lg mb-1">{g.icon}</div>
                      <div className="text-sm font-medium text-[var(--nv-text-primary)]">{g.name}</div>
                      <div className="text-[11px] text-[var(--nv-text-tertiary)] mt-0.5 leading-snug">{g.desc}</div>
                      {loadingGenre === g.id && <div className="text-[10px] text-[var(--nv-accent)] mt-1">创建中…</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onDelete={() => deleteProject(p.id, p.name)} deletingId={deletingId} />
            ))}
          </div>
        )}
      </main>

      {/* 更新公告弹窗 */}
      {showChangelog && (
        <Modal open onClose={() => setShowChangelog(false)} bare closeOnOverlay={false} panelClassName="max-w-md">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1.5 h-5 rounded-full bg-primary/60" />
              <h2 className="text-lg font-semibold text-foreground">更新公告 · {LATEST_VERSION}</h2>
            </div>
            <ul className="space-y-2.5 mb-5">
              {CHANGELOG_BRIEF.map((item, i) => (
                <li key={i} className="text-sm text-[var(--nv-text-secondary)] flex items-start gap-2.5">
                  <span className="w-1 h-1 rounded-full bg-primary/60 mt-2 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <a
                href="/changelog"
                className="flex-1 text-center text-sm btn-ghost rounded-xl py-2.5 active:scale-[0.98] flex items-center justify-center gap-1"
              >
                查看完整公告 <Icon name="arrowRight" size={13} />
              </a>
              <button
                onClick={() => {
                  try { localStorage.setItem("novel-forge-last-version", LATEST_VERSION); } catch {}
                  setShowChangelog(false);
                }}
                className="flex-1 btn-primary rounded-xl py-2.5 text-sm font-medium"
              >
                知道了
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── 子组件：项目卡片 ───────────────────────────────────────

function ProjectCard({ project, onDelete, deletingId }: { project: ProjectSummary; onDelete: () => void; deletingId: string | null; }) {
  const timeAgo = getTimeAgo(new Date(project.updatedAt));

  return (
    <div className="group surface-elevated card-lift rounded-2xl p-5 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-base truncate flex-1 mr-2 text-foreground">
          {project.name}
        </h3>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
          disabled={deletingId === project.id}
          className="opacity-0 group-hover:opacity-100 text-[var(--nv-text-muted)] hover:text-destructive transition-all shrink-0 disabled:opacity-40"
          title="删除项目"
        >
          <Icon name="x" size={14} />
        </button>
      </div>

      <p className="text-sm text-[var(--nv-text-tertiary)] mb-3 line-clamp-2 flex-1 leading-relaxed">
        {project.description || "暂无描述"}
      </p>

      {project.genre.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {project.genre.map((g) => (
            <span key={g} className="text-[10px] px-2 py-0.5 rounded-lg bg-[var(--nv-surface-2)] text-[var(--nv-text-secondary)] border border-[var(--nv-border-2)]">
              {g}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 text-[10px] text-[var(--nv-text-muted)] mb-3">
        <span className="flex items-center gap-1"><Icon name="user" size={11} /> {project._count.characters} 角色</span>
        <span className="flex items-center gap-1"><Icon name="book" size={11} /> {project._count.lorebookEntries} 词条</span>
        <span className="flex items-center gap-1"><Icon name="file" size={11} /> {project._count.storyNodes} 节点</span>
        <span className="flex items-center gap-1"><Icon name="target" size={11} /> {formatWordCount(project.targetWordCount)}</span>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[var(--nv-border-2)]">
        <span className="text-[10px] text-[var(--nv-text-muted)]">{timeAgo}</span>
        <Link
          href={`/workspace/${project.id}`}
          className="text-xs text-primary hover:text-primary font-medium transition-colors"
        >
          进入工作台 →
        </Link>
      </div>
    </div>
  );
}

// ─── 子组件：起步引导卡 ─────────────────────────────────────

function FeatureCard({
  icon,
  title,
  desc,
  href,
  cta,
}: {
  icon: "sparkles" | "book" | "settings";
  title: string;
  desc: string;
  href: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group surface-elevated rounded-2xl p-5 flex flex-col hover:border-primary/30 transition-all"
    >
      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
        <Icon name={icon} size={20} />
      </div>
      <h3 className="font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-[var(--nv-text-tertiary)] leading-relaxed flex-1 mb-3">{desc}</p>
      <span className="text-xs text-primary group-hover:text-primary font-medium inline-flex items-center gap-1">
        {cta} <Icon name="arrowRight" size={12} />
      </span>
    </Link>
  );
}

// ─── 助手函数 ───────────────────────────────────────────────

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function formatWordCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万字`;
  if (n >= 1000) return `${n.toLocaleString()}字`;
  return `${n}字`;
}
