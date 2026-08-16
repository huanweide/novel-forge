"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { toastSuccess, toastError, confirmDialog } from "@/components/ui/toast";

interface RecycledProject {
  id: string;
  name: string;
  description: string;
  genre: string[];
  deletedAt: string;
  _count: { characters: number; lorebookEntries: number; storyNodes: number };
}

interface RecycledNode {
  id: string;
  title: string;
  type: string;
  deletedAt: string;
  projectId: string;
  project: { name: string } | null;
}

function formatTime(s: string): string {
  return new Date(s).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

const NODE_TYPE_LABEL: Record<string, string> = {
  volume: "卷",
  chapter: "章",
  section: "节",
  scene: "幕",
};

export default function RecyclePage() {
  const [projects, setProjects] = useState<RecycledProject[]>([]);
  const [nodes, setNodes] = useState<RecycledNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pres, nres] = await Promise.all([
        fetch("/api/projects/recycle"),
        fetch("/api/story/nodes/recycle"),
      ]);
      const pData = await pres.json().catch(() => []);
      const nData = await nres.json().catch(() => []);
      setProjects(pres.ok ? pData : []);
      setNodes(nres.ok ? nData : []);
    } catch {
      setProjects([]);
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const restore = async (p: RecycledProject) => {
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/projects/${p.id}/restore`, { method: "POST" });
      if (res.ok) {
        toastSuccess(`已恢复「${p.name}」`);
        setProjects((prev) => prev.filter((x) => x.id !== p.id));
      } else {
        const d = await res.json().catch(() => ({}));
        toastError(d.error || "恢复失败");
      }
    } catch {
      toastError("恢复失败");
    } finally {
      setBusyId(null);
    }
  };

  const purge = async (p: RecycledProject) => {
    const ok = await confirmDialog({
      title: "彻底删除",
      description: `确定彻底删除「${p.name}」？其下所有章节 / 角色 / 世界书将永久清除，不可恢复。`,
    });
    if (!ok) return;
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/projects/${p.id}/purge`, { method: "POST" });
      if (res.ok) {
        toastSuccess(`已彻底删除「${p.name}」`);
        setProjects((prev) => prev.filter((x) => x.id !== p.id));
      } else {
        const d = await res.json().catch(() => ({}));
        toastError(d.error || "删除失败");
      }
    } catch {
      toastError("删除失败");
    } finally {
      setBusyId(null);
    }
  };

  const restoreNode = async (n: RecycledNode) => {
    setBusyId(n.id);
    try {
      const res = await fetch(`/api/story/nodes/${n.id}/restore`, { method: "POST" });
      if (res.ok) {
        toastSuccess(`已恢复「${n.title}」`);
        setNodes((prev) => prev.filter((x) => x.id !== n.id));
      } else {
        const d = await res.json().catch(() => ({}));
        toastError(d.error || "恢复失败");
      }
    } catch {
      toastError("恢复失败");
    } finally {
      setBusyId(null);
    }
  };

  const purgeNode = async (n: RecycledNode) => {
    const ok = await confirmDialog({
      title: "彻底删除节点",
      description: `确定彻底删除「${n.title}」？该节点及其全部子节点将永久清除，不可恢复。`,
    });
    if (!ok) return;
    setBusyId(n.id);
    try {
      const res = await fetch(`/api/story/nodes/${n.id}/purge`, { method: "POST" });
      if (res.ok) {
        toastSuccess(`已彻底删除「${n.title}」`);
        setNodes((prev) => prev.filter((x) => x.id !== n.id));
      } else {
        const d = await res.json().catch(() => ({}));
        toastError(d.error || "删除失败");
      }
    } catch {
      toastError("删除失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-foreground">
      <header className="border-b border-[var(--nv-border-2)] bg-[var(--nv-void)]/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] transition-colors">
              <Icon name="arrowLeft" size={16} />
            </Link>
            <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <Icon name="trash" size={18} className="text-accent-label" /> 回收站
            </h1>
          </div>
          <Link href="/" className="btn-primary text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 font-medium">
            <Icon name="plus" size={14} /> 返回主页
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 animate-in fade-in slide-in-from-bottom-2">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="inline-flex items-center gap-2 text-[var(--nv-text-tertiary)]">
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse delay-150" />
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse delay-300" />
            </span>
          </div>
        ) : (
          <>
            {/* 项目回收 */}
            {projects.length === 0 ? (
              <div className="text-center py-24">
                <div className="w-16 h-16 rounded-2xl surface-elevated flex items-center justify-center mx-auto mb-5">
                  <Icon name="trash" size={28} className="text-[var(--nv-text-muted)]" />
                </div>
                <h2 className="text-xl font-semibold text-[var(--nv-text-secondary)] mb-2">项目回收站是空的</h2>
                <p className="text-[var(--nv-text-tertiary)] text-sm">被删除的项目会出现在这里，可随时恢复。</p>
              </div>
            ) : (
              <>
                <h2 className="text-base font-bold tracking-tight flex items-center gap-2 mb-1">
                  <Icon name="package" size={16} className="text-accent-label" /> 项目回收站
                </h2>
                <p className="text-xs text-[var(--nv-text-tertiary)] mb-5">
                  共 {projects.length} 个项目在回收站。恢复将回到主页；彻底删除会永久清除全部内容。
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {projects.map((p) => (
                    <div key={p.id} className="surface-elevated card-lift rounded-2xl p-5 flex flex-col opacity-90">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-semibold text-base truncate flex-1 mr-2 text-foreground">{p.name}</h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)] shrink-0">已删除</span>
                      </div>
                      <p className="text-sm text-[var(--nv-text-tertiary)] mb-3 line-clamp-2 flex-1 leading-relaxed">
                        {p.description || "暂无描述"}
                      </p>
                      <div className="flex items-center gap-4 text-[10px] text-[var(--nv-text-muted)] mb-3">
                        <span className="flex items-center gap-1"><Icon name="user" size={11} /> {p._count.characters} 角色</span>
                        <span className="flex items-center gap-1"><Icon name="book" size={11} /> {p._count.lorebookEntries} 词条</span>
                        <span className="flex items-center gap-1"><Icon name="file" size={11} /> {p._count.storyNodes} 节点</span>
                      </div>
                      <p className="text-[10px] text-[var(--nv-text-muted)] mb-3">删除于 {formatTime(p.deletedAt)}</p>
                      <div className="flex items-center gap-2 pt-3 border-t border-[var(--nv-border-2)]">
                        <button onClick={() => restore(p)} disabled={busyId === p.id}
                          className="flex-1 text-xs btn-primary rounded-xl py-2 inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
                          {busyId === p.id ? <Icon name="loader" size={12} className="animate-spin" /> : <Icon name="refresh" size={12} />} 恢复
                        </button>
                        <button onClick={() => purge(p)} disabled={busyId === p.id}
                          className="flex-1 text-xs rounded-xl py-2 inline-flex items-center justify-center gap-1.5 border border-[var(--nv-danger)]/40 text-[var(--nv-danger)] hover:bg-[var(--nv-danger)]/10 transition-colors disabled:opacity-50">
                          {busyId === p.id ? <Icon name="loader" size={12} className="animate-spin" /> : <Icon name="trash" size={12} />} 彻底删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 节点回收（#123 软删除回收站） */}
            <div className="mt-14 pt-10 border-t border-[var(--nv-border-2)]">
              <h2 className="text-base font-bold tracking-tight flex items-center gap-2 mb-1">
                <Icon name="file" size={16} className="text-accent-label" /> 节点回收站
              </h2>
              <p className="text-xs text-[var(--nv-text-tertiary)] mb-5">
                共 {nodes.length} 个章节节点在回收站。恢复将回到原大纲；彻底删除会永久清除该节点及其全部子节点。
              </p>
              {nodes.length === 0 ? (
                <p className="text-sm text-[var(--nv-text-muted)] py-8">暂无已删除的章节节点。</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {nodes.map((n) => (
                    <div key={n.id} className="surface-elevated card-lift rounded-2xl p-5 flex flex-col opacity-90">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-semibold text-base truncate flex-1 mr-2 text-foreground">{n.title}</h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)] shrink-0">
                          {NODE_TYPE_LABEL[n.type] || n.type}
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--nv-text-muted)] mb-3">
                        所属项目：{n.project?.name || "（已删除）"}
                      </p>
                      <p className="text-[10px] text-[var(--nv-text-muted)] mb-3">删除于 {formatTime(n.deletedAt)}</p>
                      <div className="flex items-center gap-2 pt-3 border-t border-[var(--nv-border-2)]">
                        <button onClick={() => restoreNode(n)} disabled={busyId === n.id}
                          className="flex-1 text-xs btn-primary rounded-xl py-2 inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
                          {busyId === n.id ? <Icon name="loader" size={12} className="animate-spin" /> : <Icon name="refresh" size={12} />} 恢复
                        </button>
                        <button onClick={() => purgeNode(n)} disabled={busyId === n.id}
                          className="flex-1 text-xs rounded-xl py-2 inline-flex items-center justify-center gap-1.5 border border-[var(--nv-danger)]/40 text-[var(--nv-danger)] hover:bg-[var(--nv-danger)]/10 transition-colors disabled:opacity-50">
                          {busyId === n.id ? <Icon name="loader" size={12} className="animate-spin" /> : <Icon name="trash" size={12} />} 彻底删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
