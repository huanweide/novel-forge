"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LATEST_VERSION, CHANGELOG_BRIEF } from "@/lib/changelog-data";

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
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    genre: "",
    synopsis: "",
    toneKeywords: "",
    targetWordCount: 100000,
  });

  const [showChangelog, setShowChangelog] = useState(false);

  const loadProjects = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/projects", { signal });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
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

  useEffect(() => {
    try {
      const seen = localStorage.getItem("novel-forge-last-version");
      if (seen !== LATEST_VERSION) setShowChangelog(true);
    } catch { /* */ }
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          genre: form.genre.split(/[,，、]/).map((g) => g.trim()).filter(Boolean),
          synopsis: form.synopsis,
          toneKeywords: form.toneKeywords.split(/[,，、]/).map((k) => k.trim()).filter(Boolean),
          targetWordCount: form.targetWordCount,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setForm({ name: "", description: "", genre: "", synopsis: "", toneKeywords: "", targetWordCount: 100000 });
        loadProjects();
      }
    } catch (err) {
      console.error("创建项目失败:", err);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除「${name}」？此操作不可逆。`)) return;
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      loadProjects();
    } catch (err) {
      console.error("删除失败:", err);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* 顶栏 */}
      <header className="border-b border-white/[0.06] bg-zinc-950/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Novel Forge</h1>
              <p className="text-xs text-zinc-500">
                AI 小说工坊 ·{" "}
                <a href="/changelog" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                  更新公告
                </a>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/explore" className="text-xs px-3 py-1.5 rounded-xl bg-white/[0.02] text-zinc-500 border border-white/[0.06] hover:text-zinc-300 hover:border-white/[0.12] transition-all duration-200 active:scale-95">
              🎯 探讨
            </Link>
            <Link href="/dissect" className="text-xs px-3 py-1.5 rounded-xl bg-white/[0.02] text-zinc-500 border border-white/[0.06] hover:text-zinc-300 hover:border-white/[0.12] transition-all duration-200 active:scale-95">
              📚 拆书
            </Link>
            <Link href="/settings" className="text-xs px-3 py-1.5 rounded-xl bg-white/[0.02] text-zinc-500 border border-white/[0.06] hover:text-zinc-300 hover:border-white/[0.12] transition-all duration-200 active:scale-95">
              ⚙️ 设置
            </Link>
            <Button
              onClick={() => setShowCreate(true)}
              className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 active:scale-95"
            >
              + 新建项目
            </Button>
          </div>
        </div>
      </header>

      {/* 主区 */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="inline-flex items-center gap-2 text-zinc-500">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse delay-150" />
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse delay-300" />
            </span>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-5">
              <span className="text-3xl">📖</span>
            </div>
            <h2 className="text-xl font-semibold text-zinc-300 mb-2">还没有小说项目</h2>
            <p className="text-zinc-500 text-sm mb-6">创建你的第一个项目，开始 AI 辅助写作</p>
            <Button
              onClick={() => setShowCreate(true)}
              className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 active:scale-95"
            >
              开始创作
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onDelete={() => handleDelete(p.id, p.name)} />
            ))}
          </div>
        )}
      </main>

      {/* 创建对话框 */}
      {showCreate && (
        <CreateProjectDialog
          form={form}
          onChange={setForm}
          onConfirm={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* 更新公告弹窗 */}
      {showChangelog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-950/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl w-full max-w-md p-6 shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1.5 h-5 rounded-full bg-indigo-400/60" />
              <h2 className="text-lg font-semibold text-zinc-100">更新公告 · {LATEST_VERSION}</h2>
            </div>
            <ul className="space-y-2.5 mb-5">
              {CHANGELOG_BRIEF.map((item, i) => (
                <li key={i} className="text-sm text-zinc-400 flex items-start gap-2.5">
                  <span className="w-1 h-1 rounded-full bg-indigo-400/60 mt-2 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <a
                href="/changelog"
                className="flex-1 text-center text-sm border border-white/[0.08] rounded-xl py-2.5 text-zinc-300 hover:bg-white/[0.04] transition-all duration-200 active:scale-[0.98]"
              >
                查看完整公告 →
              </a>
              <button
                onClick={() => {
                  try { localStorage.setItem("novel-forge-last-version", LATEST_VERSION); } catch {}
                  setShowChangelog(false);
                }}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl py-2.5 text-sm font-medium shadow-lg shadow-indigo-500/20 transition-all duration-200 active:scale-[0.98]"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 子组件：项目卡片 ───────────────────────────────────────

function ProjectCard({ project, onDelete }: { project: ProjectSummary; onDelete: () => void }) {
  const timeAgo = getTimeAgo(new Date(project.updatedAt));

  return (
    <div className="group border border-white/[0.06] rounded-2xl bg-white/[0.02] backdrop-blur-sm hover:border-white/[0.12] hover:bg-white/[0.03] hover:-translate-y-1 hover:shadow-xl transition-all duration-200 p-5 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-base truncate flex-1 mr-2 text-zinc-200">
          {project.name}
        </h3>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all text-sm shrink-0"
          title="删除项目"
        >
          ✕
        </button>
      </div>

      <p className="text-sm text-zinc-500 mb-3 line-clamp-2 flex-1 leading-relaxed">
        {project.description || "暂无描述"}
      </p>

      {project.genre.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {project.genre.map((g) => (
            <span key={g} className="text-[10px] px-2 py-0.5 rounded-lg bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
              {g}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 text-[10px] text-zinc-600 mb-3">
        <span>👤 {project._count.characters} 角色</span>
        <span>📚 {project._count.lorebookEntries} 词条</span>
        <span>📄 {project._count.storyNodes} 节点</span>
        <span>🎯 {formatWordCount(project.targetWordCount)}</span>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
        <span className="text-[10px] text-zinc-600">{timeAgo}</span>
        <Link
          href={`/workspace/${project.id}`}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
        >
          进入工作台 →
        </Link>
      </div>
    </div>
  );
}

// ─── 子组件：创建对话框 ─────────────────────────────────────

function CreateProjectDialog({
  form, onChange, onConfirm, onCancel,
}: {
  form: { name: string; description: string; genre: string; synopsis: string; toneKeywords: string; targetWordCount: number };
  onChange: (f: typeof form) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-950/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl w-full max-w-lg p-6 shadow-2xl shadow-black/40 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-1 h-5 rounded-full bg-indigo-400/60" />
          <h2 className="text-lg font-semibold text-zinc-100">创建新项目</h2>
        </div>

        <div className="space-y-4">
          <Field label="项目名称" required>
            <input
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-400/40 focus:ring-2 focus:ring-indigo-500/10 transition-all duration-200"
              placeholder="比如：星辰陨落之时"
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              autoFocus
            />
          </Field>

          <Field label="简介">
            <textarea
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-400/40 focus:ring-2 focus:ring-indigo-500/10 resize-none transition-all duration-200"
              rows={2}
              placeholder="一句话概括你的故事"
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
            />
          </Field>

          <Field label="类型标签（逗号分隔）">
            <input
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-400/40 focus:ring-2 focus:ring-indigo-500/10 transition-all duration-200"
              placeholder="奇幻, 冒险, 悬疑"
              value={form.genre}
              onChange={(e) => onChange({ ...form, genre: e.target.value })}
            />
          </Field>

          <Field label="主线总纲">
            <textarea
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-400/40 focus:ring-2 focus:ring-indigo-500/10 resize-none transition-all duration-200"
              rows={4}
              placeholder="写清楚故事的主线剧情走向、核心冲突、结局方向"
              value={form.synopsis}
              onChange={(e) => onChange({ ...form, synopsis: e.target.value })}
            />
          </Field>

          <Field label="基调关键词（逗号分隔）">
            <input
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-400/40 focus:ring-2 focus:ring-indigo-500/10 transition-all duration-200"
              placeholder="黑暗, 史诗, 悲剧, 复仇"
              value={form.toneKeywords}
              onChange={(e) => onChange({ ...form, toneKeywords: e.target.value })}
            />
          </Field>

          <Field label="目标字数">
            <input
              type="number"
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-indigo-400/40 focus:ring-2 focus:ring-indigo-500/10 transition-all duration-200"
              value={form.targetWordCount}
              onChange={(e) => onChange({ ...form, targetWordCount: parseInt(e.target.value) || 100000 })}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/[0.06]">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl text-sm font-medium border border-white/[0.08] text-zinc-400 hover:bg-white/[0.04] transition-all duration-200 active:scale-95"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={!form.name.trim()}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-40 transition-all duration-200 active:scale-95"
          >
            创建项目
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 助手函数 ───────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-500 mb-1.5 block">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}

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
  return date.toLocaleDateString("zh-CN");
}

function formatWordCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万字`;
  if (n >= 1000) return `${n.toLocaleString()}字`;
  return `${n}字`;
}
