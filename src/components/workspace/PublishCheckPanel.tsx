"use client";

import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icons";

type PlatformId = "fanqie" | "qidian" | "jjwxc" | "wechat" | "general";

interface PlatformOption {
  id: PlatformId;
  label: string;
}
const PLATFORMS: PlatformOption[] = [
  { id: "fanqie", label: "番茄小说" },
  { id: "qidian", label: "起点中文网" },
  { id: "jjwxc", label: "晋江文学城" },
  { id: "wechat", label: "微信公众号" },
  { id: "general", label: "通用（先自查）" },
];

const PLATFORM_LABEL: Record<string, string> = {
  fanqie: "番茄",
  qidian: "起点",
  jjwxc: "晋江",
  wechat: "公众号",
  general: "通用",
};

const sevClass: Record<string, string> = {
  high: "border-[var(--nv-danger)] bg-[var(--nv-danger)]/5 text-[var(--nv-danger)]",
  medium: "border-[#d99300] bg-[#d99300]/10 text-[#d99300]",
  low: "border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] text-[var(--nv-text-secondary)]",
};

function RiskBadge({ level, label }: { level: string; label: string }) {
  const cls =
    level === "high"
      ? "bg-[var(--nv-danger)] text-white"
      : level === "medium"
        ? "bg-[#d99300] text-white"
        : "bg-[var(--nv-primary)] text-white";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

function SectionTitle({ icon, children, hint }: { icon: IconName; children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] font-medium text-[var(--nv-text-secondary)]">
      <Icon name={icon} size={13} />
      <span>{children}</span>
      {hint && <span className="ml-auto text-[10px] text-[var(--nv-text-tertiary)]">{hint}</span>}
    </div>
  );
}

export function PublishCheckPanel({ projectId }: { projectId: string }) {
  const [platform, setPlatform] = useState<PlatformId>("fanqie");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);
  const [ran, setRan] = useState(false);

  const run = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/publish-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `请求失败（${res.status}）`);
      setData(json);
      setRan(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const risk = data?.risk;
  const consistency = data?.consistency;
  const publish = data?.publish;
  const meta = data?.meta;

  return (
    <div className="flex flex-col h-full">
      {/* 控制条 */}
      <div className="px-3 py-2 border-b border-[var(--nv-border-2)] space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--nv-text-tertiary)] shrink-0">目标平台</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as PlatformId)}
            className="flex-1 rounded border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] px-1.5 py-1 text-xs text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]"
          >
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[var(--nv-primary)] py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <Icon name="rocket" size={13} className={loading ? "animate-spin" : ""} />
          {loading ? "检查中…" : "开始检查"}
        </button>
        {meta && (
          <div className="text-[10px] text-[var(--nv-text-muted)] leading-relaxed">
            实际口径：过审预检 = {PLATFORM_LABEL[meta.riskPlatform] ?? meta.riskPlatform} · 发布诊断 ={" "}
            {PLATFORM_LABEL[meta.publishPlatform] ?? meta.publishPlatform}
            {meta.truncated ? ` · 已扫描 ${meta.scannedChars} 字（超长截断）` : ""}
          </div>
        )}
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto">
        {!ran && !loading && (
          <div className="p-4 text-[11px] text-[var(--nv-text-tertiary)] leading-relaxed">
            选好目标平台，点「开始检查」一次拿到三份报告：
            <br />
            ① 过审预检（按平台口味预判被判 AI 的风险）
            <br />
            ② 长篇一致性（性别 / 外貌 / 已故 / 伏笔拖延）
            <br />
            ③ 发布诊断（逐章字数达标情况）
            <br />
            全部在本机计算，稿件不上传。
          </div>
        )}
        {loading && <div className="p-4 text-[11px] text-[var(--nv-text-tertiary)]">正在分析全书…</div>}
        {error && <div className="p-4 text-[11px] text-[var(--nv-danger)]">检查失败：{error}</div>}

        {/* M2 平台过审预检 */}
        {risk && (
          <section className="border-b border-[var(--nv-border-2)]">
            <SectionTitle icon="shield" hint={`M2 · ${risk.platformLabel}`}>
              平台过审预检
            </SectionTitle>
            <div className="px-3 pb-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-[var(--nv-text-primary)]">{risk.riskScore}</span>
                <span className="text-[10px] text-[var(--nv-text-tertiary)]">/100 风险分</span>
                <RiskBadge level={risk.riskLevel} label={risk.riskLevelLabel} />
              </div>
              <p className="text-[10px] text-[var(--nv-text-muted)] leading-relaxed">{risk.platformNote}</p>
              <div className="space-y-1.5">
                {risk.dimensions.map((d: any) => {
                  const c = d.score >= 60 ? "var(--nv-danger)" : d.score >= 35 ? "#d99300" : "var(--nv-primary)";
                  return (
                    <div key={d.key}>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-[var(--nv-text-secondary)]">{d.label}</span>
                        <span className="text-[var(--nv-text-tertiary)]">{d.score}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--nv-surface-3)] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${d.score}%`, background: c }} />
                      </div>
                      <div className="text-[9px] text-[var(--nv-text-muted)] leading-snug">{d.detail}</div>
                    </div>
                  );
                })}
              </div>
              {risk.findings.length > 0 && (
                <div className="space-y-1">
                  {risk.findings.map((f: any, i: number) => (
                    <div key={i} className="rounded border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-1.5">
                      <div className="text-[10px] font-medium text-[var(--nv-text-primary)]">{f.ruleName}</div>
                      <div className="mt-0.5 text-[10px] text-[var(--nv-text-tertiary)] line-clamp-2">「{f.excerpt}」</div>
                      <div className="mt-0.5 text-[10px] text-[var(--nv-text-muted)]">建议：{f.suggestion}</div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[9px] text-[var(--nv-text-muted)] leading-snug">{risk.disclaimer}</p>
            </div>
          </section>
        )}

        {/* M3 长篇一致性巡检 */}
        {consistency && (
          <section className="border-b border-[var(--nv-border-2)]">
            <SectionTitle icon="bookmarked" hint={`M3 · ${consistency.stats.issues.length} 项`}>
              长篇一致性巡检
            </SectionTitle>
            <div className="px-3 pb-2 space-y-1.5">
              <div className="flex flex-wrap gap-1 text-[10px]">
                <span className="rounded bg-[var(--nv-surface-2)] px-1.5 py-0.5 text-[var(--nv-text-tertiary)]">
                  全书 {consistency.stats.chapters} 章
                </span>
                <span className="rounded bg-[var(--nv-surface-2)] px-1.5 py-0.5 text-[var(--nv-text-tertiary)]">
                  角色 {consistency.stats.characters}
                </span>
                <span className="rounded bg-[var(--nv-surface-2)] px-1.5 py-0.5 text-[var(--nv-text-tertiary)]">
                  {consistency.stats.chars} 字
                </span>
              </div>
              {consistency.issues.length === 0 ? (
                <div className="rounded border border-[var(--nv-primary)]/30 bg-[var(--nv-primary)]/5 px-2 py-1.5 text-[10px] text-[var(--nv-primary)]">
                  未发现明显一致性问题 ✓
                </div>
              ) : (
                consistency.issues.map((iss: any, i: number) => (
                  <div key={i} className={`rounded border p-1.5 ${sevClass[iss.severity] || sevClass.low}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-medium">{iss.title}</span>
                      <span className="shrink-0 rounded bg-black/10 px-1 text-[9px]">
                        {iss.severity === "high" ? "高" : iss.severity === "medium" ? "中" : "低"}
                      </span>
                    </div>
                    {iss.chapterTitle && (
                      <div className="text-[9px] text-[var(--nv-text-tertiary)]">{iss.chapterTitle}</div>
                    )}
                    {iss.excerpt && (
                      <div className="mt-0.5 text-[10px] text-[var(--nv-text-tertiary)] line-clamp-2">「{iss.excerpt}」</div>
                    )}
                    <div className="mt-0.5 text-[10px] text-[var(--nv-text-muted)]">建议：{iss.suggestion}</div>
                  </div>
                ))
              )}
              <p className="text-[9px] text-[var(--nv-text-muted)] leading-snug">{consistency.disclaimer}</p>
            </div>
          </section>
        )}

        {/* M4 发布管线诊断 */}
        {publish && (
          <section>
            <SectionTitle icon="upload" hint={`M4 · 达标 ${publish.summary.okRate}%`}>
              发布管线诊断
            </SectionTitle>
            <div className="px-3 pb-2 space-y-2">
              <p className="text-[10px] text-[var(--nv-text-muted)] leading-relaxed">{publish.preset.note}</p>
              <div className="grid grid-cols-4 gap-1 text-center">
                <div className="rounded bg-[var(--nv-surface-2)] py-1">
                  <div className="text-sm font-bold text-[var(--nv-text-primary)]">{publish.summary.total}</div>
                  <div className="text-[9px] text-[var(--nv-text-tertiary)]">章</div>
                </div>
                <div className="rounded bg-[var(--nv-primary)]/10 py-1">
                  <div className="text-sm font-bold text-[var(--nv-primary)]">{publish.summary.ok}</div>
                  <div className="text-[9px] text-[var(--nv-text-tertiary)]">达标</div>
                </div>
                <div className="rounded bg-[#d99300]/10 py-1">
                  <div className="text-sm font-bold text-[#d99300]">{publish.summary.short}</div>
                  <div className="text-[9px] text-[var(--nv-text-tertiary)]">偏短</div>
                </div>
                <div className="rounded bg-[#3b82f6]/10 py-1">
                  <div className="text-sm font-bold text-[#3b82f6]">{publish.summary.long}</div>
                  <div className="text-[9px] text-[var(--nv-text-tertiary)]">偏长</div>
                </div>
              </div>
              <div className="text-[10px] text-[var(--nv-text-tertiary)]">共 {publish.summary.totalWords} 字</div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {publish.chapters.map((c: any) => {
                  const dot =
                    c.status === "ok" ? "var(--nv-primary)" : c.status === "short" ? "#d99300" : "#3b82f6";
                  return (
                    <div
                      key={c.nodeId}
                      className="flex items-start gap-1.5 rounded border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-1.5"
                    >
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[10px] text-[var(--nv-text-primary)]">{c.title}</span>
                          <span className="shrink-0 text-[9px] text-[var(--nv-text-tertiary)]">{c.words} 字</span>
                        </div>
                        <div className="text-[9px] text-[var(--nv-text-muted)] leading-snug">{c.advice}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
