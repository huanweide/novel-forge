"use client";

import { useState, useEffect, useCallback, useRef, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LATEST_VERSION, CHANGELOG_BRIEF } from "@/lib/changelog-data";
import { useQuery } from "@/hooks/useApi";
import { GENRE_TEMPLATES } from "@/core/templates/genres";
import { Icon } from "@/components/ui/icons";
import { confirmDialog, toastError, toastSuccess, toastInfo } from "@/components/ui/toast";
import { useConfirmDelete } from "@/components/workspace/useConfirmDelete";
import { Modal } from "@/components/ui/Modal";
import PaperBoats from "@/components/home/PaperBoats";

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

// 进入视口逐张播放 nf-card-in 上浮入场（间隔 60ms；reduced-motion 直接显示）
function useStaggerOnView(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ready) return;
    const el = ref.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-stagger-item]"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      items.forEach((c) => c.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const t = entry.target as HTMLElement;
            const idx = Number(t.dataset.staggerIndex ?? 0);
            t.style.animationDelay = `${idx * 60}ms`;
            t.classList.add("is-visible");
            io.unobserve(t);
          }
        });
      },
      { threshold: 0.1 }
    );
    items.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [ready]);
  return ref;
}

export default function Dashboard() {
  const [showChangelog, setShowChangelog] = useState(false);

  // FE-9：项目列表走轻量服务端状态层（进程内缓存 + 失效），删除/重试即 refetch
  const { data: projectsData, loading, error, refetch: loadProjects } = useQuery<ProjectSummary[]>(
    "projects:list",
    async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
        throw new Error(d.error || d.hint || "加载项目失败");
      }
      return res.json();
    }
  );
  const projects = projectsData ?? [];
  const loadError = error ? (error instanceof Error ? error.message : "加载项目失败") : null;

  const router = useRouter();
  const staggerRef = useStaggerOnView(!loading && projects.length > 0);
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

  // 导入 .nfproject 备份包 → 落库为新项目
  const importBackupRef = useRef<HTMLInputElement>(null);
  const handleImportBackup = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.endsWith(".nfproject") && file.type !== "application/json") {
      toastError("请选择 .nfproject 备份文件");
      return;
    }
    try {
      const text = await file.text();
      const res = await fetch("/api/projects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const d = await res.json();
      if (res.ok && d.id) {
        toastSuccess("备份已导入为新项目");
        router.push(`/workspace/${d.id}`);
      } else {
        toastError(d.error || "导入失败");
      }
    } catch {
      toastError("文件解析失败，请确认是有效的 .nfproject 备份");
    }
  };

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
    <div className="nf-home min-h-screen bg-transparent text-foreground">
      {/* 顶栏：主操作 / 导航 / 系统 三组，统一 32px 高度 */}
      <header className="nf-header sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="nf-logo" aria-hidden="true">
              <Icon name="sparkles" size={16} />
            </span>
            <div className="leading-tight">
              <h1 className="text-lg font-bold tracking-tight text-foreground">Novel Forge</h1>
              <p className="text-[10px] text-[var(--nv-text-tertiary)] tracking-[0.22em]">小说工坊 · 创作引擎</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Link href="/explore" className="btn-primary nf-btn-flow text-xs h-8 px-3.5 rounded-xl inline-flex items-center gap-1.5 font-medium">
              <Icon name="sparkles" size={14} /> <span>开始创作</span>
            </Link>
            <span className="w-px h-5 bg-[var(--nv-border-2)] mx-0.5" aria-hidden="true" />
            <Link href="/dissect" className="btn-ghost text-xs h-8 px-3 rounded-xl inline-flex items-center gap-1.5">
              <Icon name="book" size={13} /> <span className="hidden sm:inline">拆书</span>
            </Link>
            <Link href="/workshop" className="btn-ghost text-xs h-8 px-3 rounded-xl inline-flex items-center gap-1.5">
              <Icon name="sparkles" size={13} /> <span className="hidden sm:inline">创意工坊</span>
            </Link>
            <Link href="/recycle" className="btn-ghost text-xs h-8 px-3 rounded-xl inline-flex items-center gap-1.5">
              <Icon name="trash" size={13} /> <span className="hidden sm:inline">回收站</span>
            </Link>
            <span className="w-px h-5 bg-[var(--nv-border-2)] mx-0.5" aria-hidden="true" />
            <a href="/changelog" className="btn-ghost text-xs h-8 w-8 rounded-xl inline-flex items-center justify-center tooltip-trigger" data-tooltip="更新面板" aria-label="更新面板">
              <Icon name="book" size={13} />
            </a>
            <Link href="/settings" className="btn-ghost text-xs h-8 w-8 rounded-xl inline-flex items-center justify-center tooltip-trigger" data-tooltip="设置" aria-label="设置">
              <Icon name="settings" size={13} />
            </Link>
            <button onClick={() => window.dispatchEvent(new Event("nf-open-command-palette"))} className="btn-ghost text-xs h-8 px-2.5 rounded-xl inline-flex items-center gap-1.5 tooltip-trigger" data-tooltip="全局命令面板（Cmd/Ctrl+K）">
              <Icon name="search" size={13} />
              <kbd className="text-[10px] px-1 rounded bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)]">⌘K</kbd>
            </button>
            <button onClick={loadSample} disabled={loadingSample} className="btn-ghost text-xs h-8 w-8 rounded-xl inline-flex items-center justify-center tooltip-trigger" data-tooltip={loadingSample ? "载入中…" : "一键载入示例项目"} aria-label="示例">
              <Icon name="sparkles" size={13} />
            </button>
            <button onClick={() => importBackupRef.current?.click()} className="btn-ghost text-xs h-8 w-8 rounded-xl inline-flex items-center justify-center tooltip-trigger" data-tooltip="从 .nfproject 备份包导入" aria-label="导入备份">
              <Icon name="package" size={13} />
            </button>
            <input ref={importBackupRef} type="file" accept=".nfproject,application/json" className="hidden" onChange={handleImportBackup} />
          </div>
        </div>
      </header>

      {/* Hero 欢迎区 */}
      <section className="relative z-10 overflow-hidden border-b border-[var(--nv-border-2)] bg-gradient-to-b from-[var(--nv-surface-1)] to-transparent">
        <div className="relative max-w-7xl mx-auto px-6 py-14 md:py-20">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 rounded-full border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] text-[11px] text-[var(--nv-text-tertiary)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--nv-accent)] glow-dot" /> AI 驱动的小说创作引擎
              </div>
              <h2 className="nf-hero-title text-4xl md:text-6xl font-bold tracking-tight text-foreground leading-[1.15]">
                构建你的<span className="text-gradient">小说宇宙</span>
              </h2>
              <p className="nf-hero-sub mt-5 text-base leading-relaxed max-w-xl">
                用 AI 探讨灵感、拆解好书、管理角色与世界观——从一句话构思到完整成稿，一站式完成。
              </p>
            </div>
            <div className="flex shrink-0 gap-3">
              <Link href="/explore" className="btn-primary nf-btn-flow text-sm px-7 py-3.5 rounded-xl inline-flex items-center gap-1.5 font-medium shadow-glow-indigo">
                <Icon name="sparkles" size={15} /> 开始创作
              </Link>
              <Link href="/dissect" className="btn-ghost text-sm px-5 py-3.5 rounded-xl inline-flex items-center gap-1.5">
                <Icon name="book" size={14} /> 拆书分析
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 纸舟星海：墨色海面漂着折纸船，每艘船载一盏灯（点击拉近望海 · 下方选择一本书） */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-14">
        <div className="mb-6 max-w-2xl">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] text-[11px] text-[var(--nv-text-tertiary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--nv-creative)] glow-dot" /> 纸舟星海 · Paper Boats
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground leading-tight">
            每艘纸船，<span className="text-gradient">都载着一个故事</span>
          </h2>
          <p className="mt-4 text-[var(--nv-text-tertiary)] text-base leading-relaxed">
            墨色海面上漂着折纸小船，每艘船头都点着一盏灯——书页折成的船，航行在故事的墨海上。点击一艘船，镜头会拉到船头，望向前方无边的墨海，那就是「下一章」。
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)]/30 p-4">
          <PaperBoats
            projects={projects.map((p) => ({
              id: p.id,
              name: p.name,
              genre: p.genre,
              targetWordCount: p.targetWordCount,
              updatedAt: p.updatedAt,
              storyNodes: p._count.storyNodes,
            }))}
          />
        </div>
      </section>

      {/* 纸舟星海 · 设计说明 */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-16">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-5 rounded-full bg-primary/60" />
          <h2 className="text-xl font-semibold text-foreground">纸舟星海 · 设计说明</h2>
        </div>
        <p className="text-[var(--nv-text-tertiary)] max-w-2xl mb-7 text-sm leading-relaxed">
          纸舟星海把「写小说」这件事，变成墨色海面上漂着的折纸小船——书页折成的船，航行在故事的墨海上。四条设计准则：
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <DesignNote title="船即作品" desc="每艘折纸船是一部小说，船身大小对应字数，折痕透出题材色的光。" />
          <DesignNote title="灯即活性" desc="船头一盏灯，灯光越亮说明最近越活跃；夜深了，只有这些灯还亮着。" />
          <DesignNote title="舟即起伏" desc="纸船随墨海轻轻起伏，不打扰、不炫技，安静地等你上船——点开进入工作台，续写下一章。" />
          <DesignNote title="海即下一章" desc="点击一艘船，镜头拉到船头望向前方无边的墨海——那个画面就是下一章。" />
        </div>
      </section>

      {/* 主区 */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-10">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FeatureCard featured icon="sparkles" title="探讨模式" desc="对话式构建世界观、角色与大纲，从一句话灵感聊到完整纲要" href="/explore" cta="开始探讨" />
              <FeatureCard icon="book" title="拆书分析" desc="上传文本，逆向学习结构与文风" href="/dissect" cta="去拆书" />
            </div>
            <div className="mt-4 text-center">
              <Link href="/settings" className="inline-flex items-center gap-1.5 text-xs text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-secondary)] transition-colors">
                <Icon name="settings" size={13} /> 还没配置 AI？先去设置里填好 LLM Key
              </Link>
            </div>
            <hr className="nf-glow-line" />
            <div className="mt-2 flex flex-col items-center gap-4">
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
                      className="nf-genre-card surface-elevated rounded-xl p-3.5 text-left transition-colors hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-2)] disabled:opacity-60">
                      <div className="gi mb-2.5">{g.icon}</div>
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
          <>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <span className="w-1 h-4 rounded-full bg-primary/70" />
                <h2 className="text-sm font-semibold tracking-[0.18em] text-[var(--nv-text-secondary)]">我的作品</h2>
              </div>
              <span className="text-[11px] text-[var(--nv-text-muted)]">{projects.length} 部</span>
            </div>
            <div ref={staggerRef} className="home-stagger grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map((p, i) => (
                <div key={p.id} data-stagger-item data-stagger-index={i} className="home-stagger-item">
                  <ProjectCard project={p} onDelete={() => deleteProject(p.id, p.name)} deletingId={deletingId} />
                </div>
              ))}
            </div>
          </>
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
  const spine = genreColor(project.genre);

  return (
    <div
      className="group surface-elevated card-lift nf-book rounded-2xl p-5 flex flex-col"
      style={{ "--spine": spine } as React.CSSProperties}
    >
      <span className="nf-bookmark" aria-hidden="true">{project.name.charAt(0)}</span>
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-base truncate flex-1 mr-2 text-foreground">
          {project.name}
        </h3>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
          disabled={deletingId === project.id}
          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 text-[var(--nv-text-muted)] hover:text-destructive transition-all shrink-0 disabled:opacity-40"
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

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="nf-stat"><Icon name="user" size={11} /> {project._count.characters} 角色</span>
        <span className="nf-stat"><Icon name="book" size={11} /> {project._count.lorebookEntries} 词条</span>
        <span className="nf-stat"><Icon name="file" size={11} /> {project._count.storyNodes} 节点</span>
        <span className="nf-stat"><Icon name="target" size={11} /> {formatWordCount(project.targetWordCount)}</span>
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

// ─── 子组件：设计说明卡 ─────────────────────────────────────
function DesignNote({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="surface-elevated rounded-2xl p-5 border border-[var(--nv-border-2)]">
      <div className="w-2 h-2 rounded-full bg-primary/70 mb-3" />
      <h3 className="font-semibold text-foreground text-sm mb-1.5">{title}</h3>
      <p className="text-[var(--nv-text-tertiary)] text-xs leading-relaxed">{desc}</p>
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
  featured = false,
  className,
}: {
  icon: "sparkles" | "book" | "settings";
  title: string;
  desc: string;
  href: string;
  cta: string;
  featured?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group surface-elevated rounded-2xl p-5 flex flex-col hover:border-primary/30 transition-all ${featured ? "sm:col-span-2 p-7" : ""} ${className ?? ""}`}
    >
      <div className={`w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 ${featured ? "w-12 h-12" : ""}`}>
        <Icon name={icon} size={featured ? 24 : 20} />
      </div>
      <h3 className={`font-semibold text-foreground mb-1 ${featured ? "text-xl" : ""}`}>{title}</h3>
      <p className="text-sm text-[var(--nv-text-tertiary)] leading-relaxed flex-1 mb-3">{desc}</p>
      <span className="text-xs text-primary group-hover:text-primary font-medium inline-flex items-center gap-1">
        {cta} <Icon name="arrowRight" size={12} />
      </span>
    </Link>
  );
}

// ─── 子组件：项目卡片骨架屏（加载态，与 ProjectCard 同形，禁通用 spinner） ──
function ProjectCardSkeleton() {
  return (
    <div className="surface-elevated rounded-2xl p-5 flex flex-col gap-3">
      <div className="relative h-5 w-2/3 rounded-lg bg-[var(--nv-surface-2)] overflow-hidden">
        <span className="absolute inset-0 shimmer-line" />
      </div>
      <div className="relative h-3 w-full rounded bg-[var(--nv-surface-2)] overflow-hidden">
        <span className="absolute inset-0 shimmer-line" />
      </div>
      <div className="relative h-3 w-4/5 rounded bg-[var(--nv-surface-2)] overflow-hidden">
        <span className="absolute inset-0 shimmer-line" />
      </div>
      <div className="flex gap-2 mt-2">
        <div className="relative h-4 w-14 rounded-lg bg-[var(--nv-surface-2)] overflow-hidden">
          <span className="absolute inset-0 shimmer-line" />
        </div>
        <div className="relative h-4 w-14 rounded-lg bg-[var(--nv-surface-2)] overflow-hidden">
          <span className="absolute inset-0 shimmer-line" />
        </div>
      </div>
      <div className="relative h-3 w-1/3 rounded bg-[var(--nv-surface-2)] overflow-hidden mt-2">
        <span className="absolute inset-0 shimmer-line" />
      </div>
    </div>
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

// 题材 → 书脊色：常见题材关键词取对应色相，未命中回退靛蓝
const GENRE_SPINE: Array<[string, string]> = [
  ["仙侠", "oklch(0.70 0.13 95)"],
  ["玄幻", "oklch(0.68 0.12 120)"],
  ["科幻", "oklch(0.62 0.19 270)"],
  ["都市", "oklch(0.62 0.15 230)"],
  ["悬疑", "oklch(0.55 0.20 22)"],
  ["历史", "oklch(0.70 0.13 70)"],
  ["言情", "oklch(0.60 0.20 295)"],
  ["奇幻", "oklch(0.66 0.16 320)"],
  ["军事", "oklch(0.60 0.14 160)"],
  ["游戏", "oklch(0.72 0.15 85)"],
  ["体育", "oklch(0.62 0.17 45)"],
  ["恐怖", "oklch(0.56 0.15 290)"],
];
function genreColor(genre: string[]): string {
  for (const g of genre) {
    for (const [keyword, color] of GENRE_SPINE) {
      if (g.includes(keyword)) return color;
    }
  }
  return "oklch(0.62 0.19 270)";
}
