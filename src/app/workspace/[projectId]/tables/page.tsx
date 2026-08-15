"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { toastSuccess, toastError, confirmDialog, toastCreated } from "@/components/ui/toast";
import { EmptyState, Loading } from "@/components/ui/States";
import { useVirtualRows } from "@/hooks/use-virtual-rows";
import { Modal } from "@/components/ui/Modal";

interface LoreTableT {
  id: string;
  name: string;
  key: string;
  note: string;
  category: string;
  columns: { key: string; label: string; type: string }[];
  rows: Record<string, any>[]; // 动态列表格数据载体：col.key 运行时确定，值直接进 React 渲染（key/ReactNode/value），any 为合理动态豁免
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
  const [fillAllResult, setFillAllResult] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/lore-tables`);
    if (res.ok) setTables(await res.json());
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // F6：根据一键填表自检「问题行」标记需标红的表格行（row_id 集合，按表名分组）。
  // 「跨表」类问题没有具体 row_id，不参与行级标红。
  const flaggedByTable = useMemo(() => {
    const m = new Map<string, Set<number>>();
    const issues = (fillAllResult?.selfCheck?.issues || []) as any[];
    for (const it of issues) {
      if (it?.row == null || it.row === "跨表") continue;
      const num = Number(it.row);
      if (!Number.isFinite(num)) continue;
      if (!m.has(it.table)) m.set(it.table, new Set());
      m.get(it.table)!.add(num);
    }
    return m;
  }, [fillAllResult]);

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

  const runFillAll = async () => {
    const ok = await confirmDialog({
      title: "一键填表（首章→最新）",
      description: "将按章节顺序自动从第一章填到最新一章（已填过的章节会自动跳过防重复）。每章都会调用 LLM 抽取事实写入表格，可能消耗较多 token，且填完会自动自检地名正确性与信息完整性。是否继续？",
      confirmText: "开始一键填表",
      cancelText: "取消",
    });
    if (!ok) return;
    setBusy(true);
    setFillAllResult(null);
    try {
      const res = await fetch(`/api/babylore/fill-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const d = await res.json();
      d.at = new Date().toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai" });
      setFillAllResult(d);
      if (res.ok && d.ok) {
        toastSuccess(`一键填表完成：处理 ${d.processed} 章，应用 ${d.applied} 条`);
        load();
      } else toastError(d.error || "一键填表失败");
    } finally { setBusy(false); }
  };

  // P2-①（墨白）：当全跳过分支判定为「旧版误标脏标记」时，提供「清理脏标记并重填」出口。
  const clearDirtyAndRefill = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/babylore/clear-filled`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        toastSuccess(`已清理 ${d.cleared} 条脏标记，开始重填…`);
        await runFillAll();
      } else toastError(d.error || "清理脏标记失败");
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
                {fillResult.warnings?.length > 0 && (
                  <div className="mt-2 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-1.5 text-[var(--nv-text-primary)]">
                    <div className="font-medium mb-1">⚠ 疑似错误地名/名称（{fillResult.warnings.length}）</div>
                    <ul className="list-disc pl-4 space-y-0.5 max-h-40 overflow-auto">
                      {fillResult.warnings.slice(0, 30).map((w: string, i: number) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
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

        {/* 一键填表（首章→最新）+ 自检报告 */}
        <section className="surface-elevated rounded-2xl p-5">
          <h2 className="font-semibold mb-2 flex items-center gap-2"><Icon name="sparkles" size={15} /> 一键填表（首章→最新）+ 自动自检</h2>
          <p className="text-xs text-[var(--nv-text-muted)] mb-3">按章节顺序自动从第一章填到最新一章；已填章节自动跳过防重复；填完自动跑「地名正确性 + 信息完整性」自检，列出疑似错误地名与空值。</p>
          <button onClick={runFillAll} disabled={busy} className="btn-primary text-xs py-2 px-4 rounded-xl disabled:cursor-not-allowed disabled:opacity-50">{busy ? "运行中（可能较慢）…" : "一键填表（首章→最新）"}</button>
          {fillAllResult && (
            <div className={`mt-3 text-xs rounded-xl px-3 py-2 border ${fillAllResult.ok ? "border-[var(--nv-success)]/30 bg-[var(--nv-success)]/10" : "border-[var(--nv-danger)]/40 bg-[var(--nv-danger)]/10"}`}>
              {!fillAllResult.ok ? (
                <div className="text-[var(--nv-danger)] font-medium">✗ 失败：{fillAllResult.error ?? "未知错误"}</div>
              ) : (
                <div className="space-y-2">
                  <div className="font-medium text-[var(--nv-success)]">✓ 处理 {fillAllResult.processed} 章 · 跳过已填 {fillAllResult.skipped} 章 · 应用 {fillAllResult.applied} 条</div>
                  {fillAllResult.warnings?.length > 0 && (
                    <div className="rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-2 py-1.5 text-[var(--nv-text-primary)]">
                      <div className="font-medium mb-1">⚠ 疑似错误地名/名称（{fillAllResult.warnings.length}）</div>
                      <ul className="list-disc pl-4 space-y-0.5 max-h-40 overflow-auto">
                        {fillAllResult.warnings.slice(0, 30).map((w: string, i: number) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className="text-[var(--nv-text-muted)]">
                    自检：检查 {fillAllResult.selfCheck?.checkedTables} 个表 · 疑似错误地名 {fillAllResult.selfCheck?.nameIssues} 条 · 空值/缺名称 {fillAllResult.selfCheck?.completenessIssues} 条 · 跨表同名 {fillAllResult.selfCheck?.crossTableIssues} 条
                  </div>
                  {fillAllResult.selfCheck?.issues?.length > 0 && (
                    <ul className="list-disc pl-4 space-y-0.5 max-h-48 overflow-auto text-[var(--nv-text-muted)]">
                      {fillAllResult.selfCheck.issues.slice(0, 40).map((it: any, i: number) => (
                        <li key={i}>表「{it.table}」行{it.row}：{it.value ? `「${it.value}」` : "（空）"} — {it.issue}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {fillAllResult.fillErrorMeta && (
                <div className="mt-2 text-[var(--nv-text-muted)]">
                  诊断类型：{fillAllResult.fillErrorMeta.kind} · 跳过节点 {fillAllResult.fillErrorMeta.nodeIds?.length || 0} 个
                  {(fillAllResult.fillErrorMeta.nodeIds?.length || 0) > 0 && (
                    <span className="ml-1 font-mono text-[10px]">[{fillAllResult.fillErrorMeta.nodeIds.join(", ")}]</span>
                  )}
                </div>
              )}
              {fillAllResult.fillErrorMeta?.kind === "all_skipped_mislabeled" && !fillAllResult.ok && (
                <button onClick={clearDirtyAndRefill} disabled={busy} className="mt-2 btn-primary text-xs py-1.5 px-3 rounded-xl disabled:opacity-50">清理脏标记并重填</button>
              )}
              <div className="mt-1 opacity-70">执行时间：{fillAllResult.at}</div>
            </div>
          )}
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
                        <span className="ml-2 rounded-md bg-[var(--nv-primary)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--nv-primary)] align-middle"><Icon name="bot" size={15} className="inline-block align-text-bottom shrink-0" /> 写作自动维护</span>
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
                    <LoreTableGrid
                      table={t}
                      busy={busy}
                      flaggedRows={flaggedByTable.get(t.name)}
                      onUpdateCell={updateCell}
                      onAddRow={addRow}
                      onSave={saveTable}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {showCreate && (
        <Modal open onClose={() => setShowCreate(false)} bare closeOnOverlay={false} panelClassName="max-w-md" labelledBy="create-table-title">
          <div className="p-6">
            <h2 id="create-table-title" className="text-lg font-semibold mb-4">新建结构化表格</h2>
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
        </Modal>
      )}
    </div>
  );
}

/**
 * 单个结构化表格的展开网格。
 * 行数 ≤ 50：普通 <table> 渲染（零开销）；> 50：自动切换虚拟滚动（useVirtualRows），
 * 万行大表也只渲染「视口内一小段 + 上下 overscan」，不卡。
 */
function LoreTableGrid({ table, busy, flaggedRows, onUpdateCell, onAddRow, onSave }: {
  table: LoreTableT;
  busy: boolean;
  flaggedRows?: Set<number>;
  onUpdateCell: (t: LoreTableT, rowId: number, col: string, val: string) => void;
  onAddRow: (t: LoreTableT) => void;
  onSave: (t: LoreTableT) => void;
}) {
  const ROW_H = 34;
  const { scrollRef, onScroll, enabled, totalHeight, virtualItems } = useVirtualRows(table.rows, {
    rowHeight: ROW_H,
    threshold: 50,
    overscan: 10,
    viewportHeight: 360,
  });
  const cols = table.columns || [];
  const dataColWidth = cols.length > 0 ? `calc((100% - 56px) / ${cols.length})` : "100%";

  return (
    <div className="mt-3 space-y-3">
      {enabled ? (
        <div ref={scrollRef} onScroll={onScroll} className="max-h-[360px] overflow-auto rounded-lg border border-[var(--nv-border-2)]">
          <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead className="sticky top-0 z-10 bg-[var(--nv-surface-1)]">
              <tr className="text-[var(--nv-text-muted)]">
                <th className="text-left p-1" style={{ width: 56 }}>row_id</th>
                {cols.map((c) => (
                  <th key={c.key} className="text-left p-1">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody style={{ display: "block", height: totalHeight, position: "relative" }}>
              {virtualItems.map(({ item: r, offsetTop }) => (
                <tr
                  key={r.row_id}
                  className={flaggedRows?.has(Number(r.row_id)) ? "bg-[var(--nv-danger)]/10" : ""}
                  style={{ display: "block", position: "absolute", top: offsetTop, left: 0, width: "100%", borderTop: "1px solid var(--nv-border-2)" }}
                >
                  <td className="p-1 text-[var(--nv-text-muted)] align-middle" style={{ display: "inline-block", width: 56 }}>{r.row_id}</td>
                  {cols.map((c) => (
                    <td key={c.key} className="p-1 align-middle" style={{ display: "inline-block", width: dataColWidth }}>
                      <input
                        aria-label={`编辑${c.label}`}
                        value={r[c.key] ?? ""}
                        onChange={(e) => onUpdateCell(table, Number(r.row_id), c.key, e.target.value)}
                        className="input-glass w-full rounded px-2 py-1"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--nv-border-2)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--nv-text-muted)]">
                <th className="text-left p-1">row_id</th>
                {cols.map((c) => (
                  <th key={c.key} className="text-left p-1">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={r.row_id} className={flaggedRows?.has(Number(r.row_id)) ? "border-t border-[var(--nv-border-2)] bg-[var(--nv-danger)]/10" : "border-t border-[var(--nv-border-2)]"}>
                  <td className="p-1 text-[var(--nv-text-muted)]">{r.row_id}</td>
                  {cols.map((c) => (
                    <td key={c.key} className="p-1">
                      <input
                        aria-label={`编辑${c.label}`}
                        value={r[c.key] ?? ""}
                        onChange={(e) => onUpdateCell(table, Number(r.row_id), c.key, e.target.value)}
                        className="input-glass w-32 rounded px-2 py-1"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => onAddRow(table)} className="btn-ghost text-xs px-3 py-1.5 rounded-xl">+ 行</button>
        <button onClick={() => onSave(table)} disabled={busy} className="btn-primary text-xs px-3 py-1.5 rounded-xl disabled:opacity-50">保存</button>
      </div>
    </div>
  );
}
