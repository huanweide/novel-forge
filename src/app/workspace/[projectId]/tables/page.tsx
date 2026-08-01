"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { toastSuccess, toastError, confirmDialog, toastCreated } from "@/components/ui/toast";
import { EmptyState, Loading } from "@/components/ui/States";

interface LoreTableT {
  id: string;
  name: string;
  key: string;
  note: string;
  category: string;
  columns: { key: string; label: string; type: string }[];
  rows: Record<string, any>[];
  marker: string;
}

export default function TablesPage() {
  const params = useParams();
  const projectId = String(params.projectId);
  const [tables, setTables] = useState<LoreTableT[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [create, setCreate] = useState({ name: "", key: "", note: "", category: "custom", columnsText: "name:名称,status:状态" });

  const [chapterText, setChapterText] = useState("");
  const [fillResult, setFillResult] = useState<any>(null);
  const [recallCtx, setRecallCtx] = useState("");
  const [recallItems, setRecallItems] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/lore-tables`);
    if (res.ok) setTables(await res.json());
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const saveTable = async (t: LoreTableT) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/lore-tables/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: t.name, note: t.note, category: t.category, columns: t.columns, rows: t.rows }),
      });
      if (res.ok) toastSuccess("已保存");
      else toastError("保存失败");
    } finally { setBusy(false); }
  };

  const addRow = (t: LoreTableT) => {
    const maxId = t.rows.reduce((m, r) => Math.max(m, Number(r.row_id) || 0), 0);
    const newRow: any = { row_id: maxId + 1 };
    (t.columns || []).forEach((c) => { newRow[c.key] = ""; });
    setTables((ts) => ts.map((x) => (x.id === t.id ? { ...x, rows: [...x.rows, newRow] } : x)));
  };

  const deleteTable = async (t: LoreTableT) => {
    const ok = await confirmDialog({
      title: "删除表格",
      description: `确定要删除表格「${t.name}」吗？此操作不可撤销，表格内的所有行数据将一并删除。`,
      confirmText: "删除",
      cancelText: "取消",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/lore-tables/${t.id}`, { method: "DELETE" });
      if (res.ok) { toastSuccess("已删除"); setTables((ts) => ts.filter((x) => x.id !== t.id)); }
      else toastError("删除失败");
    } finally { setBusy(false); }
  };

  const createTable = async () => {
    if (!create.name.trim() || !create.key.trim()) { toastError("请填写名称与英文 key"); return; }
    const columns = create.columnsText.split(",").map((s) => s.trim()).filter(Boolean).map((pair) => {
      const [key, label] = pair.split(":").map((x) => x.trim());
      return { key: key || pair, label: label || key || pair, type: "text" };
    });
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/lore-tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: create.name.trim(), key: create.key.trim(), note: create.note, category: create.category, columns, rows: [] }),
      });
      if (res.ok) {
        toastCreated(create.name.trim(), "表格");
        setShowCreate(false);
        setCreate({ name: "", key: "", note: "", category: "custom", columnsText: "name:名称,status:状态" });
        load();
      } else toastError("创建失败");
    } finally { setBusy(false); }
  };

  const runFill = async () => {
    if (!chapterText.trim()) { toastError("请粘贴一章正文"); return; }
    setBusy(true);
    setFillResult(null);
    try {
      const res = await fetch(`/api/babylore/fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, chapterText }),
      });
      const d = await res.json();
      d.at = new Date().toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai" });
      setFillResult(d);
      if (res.ok && d.ok) { toastSuccess(`自动填表完成：应用 ${d.applied} 条`); load(); }
      else toastError(d.error || "填表失败");
    } finally { setBusy(false); }
  };

  const runRecall = async () => {
    if (!recallCtx.trim()) { toastError("请输入上下文"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/babylore/recall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, context: recallCtx }),
      });
      const d = await res.json();
      setRecallItems(d.items || []);
      if (!res.ok) toastError(d.error || "召回失败");
    } finally { setBusy(false); }
  };

  const updateCell = (t: LoreTableT, rowId: number, col: string, val: string) => {
    setTables((ts) => ts.map((x) => x.id === t.id ? {
      ...x,
      rows: x.rows.map((r) => (Number(r.row_id) === rowId ? { ...r, [col]: val } : r)),
    } : x));
  };

  return (
    <div className="min-h-screen bg-[var(--nv-void)] text-[var(--nv-text-primary)]">
      <header className="border-b border-[var(--nv-border-2)] bg-[var(--nv-void)]/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/workspace/${projectId}`} className="btn-ghost text-xs px-3 py-1.5 rounded-xl flex items-center gap-1">
              <Icon name="arrowRight" size={13} className="rotate-180" /> 返回项目
            </Link>
            <h1 className="text-lg font-bold tracking-tight">结构化表格 · 宝宝流数据库</h1>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 font-medium">
            <Icon name="sparkles" size={14} /> 新建表格
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* 自动填表 + 召回预览 */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="surface-elevated rounded-2xl p-5">
            <h2 className="font-semibold mb-2 flex items-center gap-2"><Icon name="sparkles" size={15} /> 自动填表（LLM 填充）</h2>
            <p className="text-xs text-[var(--nv-text-muted)] mb-3">粘贴一章正文，DeepSeek 按表格模板自动抽取结构化事实写入（宝宝流国模填表：关COT+严格JSON+失败重试3次）。</p>
            <textarea
              value={chapterText}
              onChange={(e) => setChapterText(e.target.value)}
              rows={6}
              placeholder="在此粘贴刚写完的一章正文…"
              className="input-glass w-full rounded-xl px-3 py-2 text-xs font-mono"
            />
            <button onClick={runFill} disabled={busy} className="btn-primary text-xs py-2 px-4 rounded-xl mt-2 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "运行中…" : "运行自动填表"}</button>
            {fillResult && (
              <div className={`mt-3 text-xs rounded-xl px-3 py-2 border ${fillResult.ok ? "border-[var(--nv-success)]/30 bg-[var(--nv-success)]/10 text-[var(--nv-success)]" : "border-[var(--nv-danger)]/40 bg-[var(--nv-danger)]/10 text-[var(--nv-danger)]"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{fillResult.ok ? `✓ 操作 ${fillResult.operations} 条，应用 ${fillResult.applied} 条` : `✗ 失败：${fillResult.error ?? "未知错误"}`}</span>
                  {!fillResult.ok && (
                    <button onClick={runFill} disabled={busy} className="shrink-0 rounded-lg bg-[var(--nv-danger)]/20 px-2.5 py-1 font-medium hover:bg-[var(--nv-danger)]/30 transition disabled:opacity-50">重试</button>
                  )}
                </div>
                <div className="mt-1 opacity-70">执行时间：{fillResult.at}</div>
              </div>
            )}
          </div>

          <div className="surface-elevated rounded-2xl p-5">
            <h2 className="font-semibold mb-2">剧情推进 · 记忆召回预览</h2>
            <p className="text-xs text-[var(--nv-text-muted)] mb-3">输入当前上下文（章节草稿），按世界书绿灯关键词与表格行匹配，预览将注入正文 AI 的记忆片段。</p>
            <textarea
              value={recallCtx}
              onChange={(e) => setRecallCtx(e.target.value)}
              rows={6}
              placeholder="输入当前章节上下文…"
              className="input-glass w-full rounded-xl px-3 py-2 text-xs font-mono"
            />
            <button onClick={runRecall} disabled={busy} className="btn-ghost text-xs py-2 px-4 rounded-xl mt-2 disabled:opacity-50">预览召回</button>
            {recallItems.length > 0 && (
              <div className="mt-3 space-y-2">
                {recallItems.map((it, i) => (
                  <div key={i} className="text-xs bg-[var(--nv-surface-2)] rounded-lg p-2">
                    <span className="text-[var(--nv-primary)]">[{it.source}] {it.title}</span>：{it.content}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 表格列表 */}
        <section>
          <h2 className="font-semibold mb-3">项目表格（{tables.length}）</h2>
          {loading ? (
            <div className="surface-elevated rounded-2xl py-12">
              <Loading label="正在加载项目表格…" />
            </div>
          ) : tables.length === 0 ? (
            <EmptyState
              icon="grid"
              title="还没有结构化表格"
              description="宝宝流数据库可把正文事实沉淀为结构化表格。可从「创意工坊」套用表格模板预设，或点右上角「新建表格」。"
              className="surface-elevated border-solid border-[var(--nv-border-2)]"
            />
          ) : (
            <div className="space-y-4">
              {tables.map((t) => (
                <div key={t.id} className="surface-elevated rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-semibold">{t.name} <span className="text-xs text-[var(--nv-text-muted)]">（{t.key} · {t.category}）</span></h3>
                      {t.key === "auto_facts" && (
                        <span className="ml-2 rounded-md bg-[var(--nv-primary)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--nv-primary)] align-middle">🤖 写作自动维护</span>
                      )}
                      <p className="text-xs text-[var(--nv-text-muted)]">{t.note || "—"} · {t.rows.length} 行</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setExpanded(expanded === t.id ? null : t.id)} className="btn-ghost text-xs px-3 py-1.5 rounded-xl">
                        {expanded === t.id ? "收起" : "查看/编辑"}
                      </button>
                      <button onClick={() => deleteTable(t)} disabled={busy} className="btn-ghost text-xs px-3 py-1.5 rounded-xl text-[var(--nv-danger)] disabled:cursor-not-allowed disabled:opacity-50">删除</button>
                    </div>
                  </div>

                  {expanded === t.id && (
                    <div className="mt-3 space-y-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[var(--nv-text-muted)]">
                              <th className="text-left p-1">row_id</th>
                              {(t.columns || []).map((c) => (
                                <th key={c.key} className="text-left p-1">{c.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {t.rows.map((r) => (
                              <tr key={r.row_id} className="border-t border-[var(--nv-border-2)]">
                                <td className="p-1 text-[var(--nv-text-muted)]">{r.row_id}</td>
                                {(t.columns || []).map((c) => (
                                  <td key={c.key} className="p-1">
                                    <input
                                      value={r[c.key] ?? ""}
                                      onChange={(e) => updateCell(t, Number(r.row_id), c.key, e.target.value)}
                                      className="input-glass w-32 rounded px-2 py-1"
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => addRow(t)} className="btn-ghost text-xs px-3 py-1.5 rounded-xl">+ 行</button>
                        <button onClick={() => saveTable(t)} disabled={busy} className="btn-primary text-xs px-3 py-1.5 rounded-xl disabled:opacity-50">保存</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="surface-floating rounded-2xl w-full max-w-md p-6 animate-spring">
            <h2 className="text-lg font-semibold mb-4">新建结构化表格</h2>
            <div className="space-y-3">
              <input value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} placeholder="表名，如 妃嫔居住建筑表" className="input-glass w-full rounded-xl px-3 py-2 text-sm" />
              <input value={create.key} onChange={(e) => setCreate({ ...create, key: e.target.value })} placeholder="英文 key，如 woman_live" className="input-glass w-full rounded-xl px-3 py-2 text-sm" />
              <input value={create.note} onChange={(e) => setCreate({ ...create, note: e.target.value })} placeholder="表格说明（每列含义）" className="input-glass w-full rounded-xl px-3 py-2 text-sm" />
              <input value={create.columnsText} onChange={(e) => setCreate({ ...create, columnsText: e.target.value })} placeholder="列：key:标签,key:标签" className="input-glass w-full rounded-xl px-3 py-2 text-xs font-mono" />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost rounded-xl py-2.5 text-sm">取消</button>
              <button onClick={createTable} disabled={busy} className="flex-1 btn-primary rounded-xl py-2.5 text-sm font-medium disabled:opacity-50">创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
