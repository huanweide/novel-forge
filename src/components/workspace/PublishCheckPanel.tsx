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
  { id: "general", label: "通用（不套平台规矩）" },
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

function SectionTitle({ icon, children, hint }: { icon: IconName; children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] font-medium text-[var(--nv-text-secondary)]">
      <Icon name={icon} size={13} />
      <span>{children}</span>
      {hint && <span className="ml-auto text-[10px] text-[var(--nv-text-tertiary)]">{hint}</span>}
    </div>
  );
}

function RiskBadge({ level, label }: { level: string; label: string }) {
  const cls =
    level === "high"
      ? "bg-[var(--nv-danger)] text-white"
      : level === "medium"
        ? "bg-[#d99300] text-white"
        : "bg-[var(--nv-primary)] text-white";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

export function PublishCheckPanel({ projectId }: { projectId: string }) {
  const [platform, setPlatform] = useState<PlatformId>("fanqie");
  const [format, setFormat] = useState<"txt" | "html">("txt");
  const [includeAttribution, setIncludeAttribution] = useState(true);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPreCheck, setShowPreCheck] = useState(false);

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
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const getExportBody = () => {
    if (!data?.export) return "";
    let raw = format === "html" ? data.export.html : data.export.text;
    if (!raw) return "";
    if (!includeAttribution) {
      // 去掉文本与 HTML 两种署名后缀
      raw = raw
        .replace(/\n\n---\n\n本书由 novel-smith[\s\S]*$/, "")
        .replace(/<!-- novel-smith 署名页 -->[\s\S]*?<\/section>/, "")
        .trim();
    }
    return raw;
  };

  const download = () => {
    const body = getExportBody();
    if (!body) return;
    const blob = new Blob([body], {
      type: format === "html" ? "text/html;charset=utf-8" : "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `导出稿-${PLATFORM_LABEL[platform]}-${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    const body = getExportBody();
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 部分浏览器禁止剪贴板，静默失败
    }
  };

  const publish = data?.publish;
  const risk = data?.risk;
  const consistency = data?.consistency;
  const meta = data?.meta;
  const chapters = publish?.chapters || [];

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

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--nv-text-tertiary)] shrink-0">导出格式</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "txt" | "html")}
            className="flex-1 rounded border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] px-1.5 py-1 text-xs text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]"
          >
            <option value="txt">TXT（纯文本，直接丢后台）</option>
            <option value="html">HTML（带排版，浏览器可读）</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-[10px] text-[var(--nv-text-secondary)]">
          <input
            type="checkbox"
            checked={includeAttribution}
            onChange={(e) => setIncludeAttribution(e.target.checked)}
            className="rounded border-[var(--nv-border-2)]"
          />
          导出时附带 novel-smith 署名页（作品即媒体，传播留痕）
        </label>

        <button
          onClick={run}
          disabled={loading}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[var(--nv-primary)] py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <Icon name="rocket" size={13} className={loading ? "animate-spin" : ""} />
          {loading ? "正在排版整书…" : "加载并导出整书"}
        </button>

        {error && <div className="text-[11px] text-[var(--nv-danger)]">导出失败：{error}</div>}

        {meta && (
          <div className="text-[10px] text-[var(--nv-text-muted)] leading-relaxed">
            预检口径：{PLATFORM_LABEL[meta.riskPlatform] ?? meta.riskPlatform} · 排版口径：
            {PLATFORM_LABEL[meta.publishPlatform] ?? meta.publishPlatform}
            {meta.truncated ? ` · 已扫描 ${meta.scannedChars} 字（超长截断）` : ""}
          </div>
        )}
      </div>

      {/* 结果区 */}
      <div className="flex-1 overflow-y-auto">
        {!data && !loading && (
          <div className="p-4 text-[11px] text-[var(--nv-text-tertiary)] leading-relaxed">
            选好目标平台后点上方按钮，一键拿到按平台规矩排版好的全本导出稿。
            <br />
            番茄会短段切、起点会保留完整世界观、公众号会去章节编号。
            <br />
            稿件全程在你自己电脑上处理，不上传。
          </div>
        )}

        {publish && (
          <div className="border-b border-[var(--nv-border-2)] pb-2">
            <SectionTitle icon="upload" hint={`共 ${publish.summary?.totalWords?.toLocaleString() ?? 0} 字`}>
              导出结果
            </SectionTitle>

            <div className="px-3 space-y-2">
              {/* 操作按钮 */}
              <div className="flex gap-2">
                <button
                  onClick={download}
                  className="flex-1 rounded border border-[var(--nv-primary)] bg-[var(--nv-primary)]/10 py-1.5 text-[11px] font-medium text-[var(--nv-primary)] hover:bg-[var(--nv-primary)]/20"
                >
                  下载 {format.toUpperCase()}
                </button>
                <button
                  onClick={copy}
                  className="flex-1 rounded border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] py-1.5 text-[11px] font-medium text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-3)]"
                >
                  {copied ? "已复制" : "复制全文"}
                </button>
              </div>

              {/* 统计摘要 */}
              <div className="grid grid-cols-4 gap-1 text-center">
                <div className="rounded bg-[var(--nv-surface-2)] py-1">
                  <div className="text-sm font-bold text-[var(--nv-text-primary)]">{publish.summary?.total ?? 0}</div>
                  <div className="text-[9px] text-[var(--nv-text-tertiary)]">章</div>
                </div>
                <div className="rounded bg-[var(--nv-primary)]/10 py-1">
                  <div className="text-sm font-bold text-[var(--nv-primary)]">{publish.summary?.ok ?? 0}</div>
                  <div className="text-[9px] text-[var(--nv-text-tertiary)]">达标</div>
                </div>
                <div className="rounded bg-[#d99300]/10 py-1">
                  <div className="text-sm font-bold text-[#d99300]">{publish.summary?.short ?? 0}</div>
                  <div className="text-[9px] text-[var(--nv-text-tertiary)]">偏短</div>
                </div>
                <div className="rounded bg-[#3b82f6]/10 py-1">
                  <div className="text-sm font-bold text-[#3b82f6]">{publish.summary?.long ?? 0}</div>
                  <div className="text-[9px] text-[var(--nv-text-tertiary)]">偏长</div>
                </div>
              </div>

              {/* 章节列表 */}
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {chapters.map((c: any) => {
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
          </div>
        )}

        {/* 可选预检（默认折叠，避免机械感） */}
        {data && (
          <div className="border-b border-[var(--nv-border-2)]">
            <button
              onClick={() => setShowPreCheck((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)]"
            >
              <span className="flex items-center gap-1.5">
                <Icon name="shield" size={13} />
                过审预检与一致性巡检（可选）
              </span>
              <span>{showPreCheck ? "收起" : "展开"}</span>
            </button>

            {showPreCheck && (
              <div className="pb-2">
                {/* M2 */}
                {risk && (
                  <section className="border-t border-[var(--nv-border-2)]">
                    <SectionTitle icon="shield" hint={`风险 ${risk.riskScore ?? 0} · ${risk.platformLabel}`}>
                      过审预检
                    </SectionTitle>
                    <div className="px-3 pb-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <RiskBadge level={risk.riskLevel} label={risk.riskLevelLabel} />
                      </div>
                      <p className="text-[10px] text-[var(--nv-text-muted)] leading-relaxed">{risk.platformNote}</p>
                      <div className="space-y-1.5">
                        {(risk.dimensions || []).map((d: any) => {
                          const score = d.score ?? 0;
                          const c = score >= 60 ? "var(--nv-danger)" : score >= 35 ? "#d99300" : "var(--nv-primary)";
                          return (
                            <div key={d.key}>
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-[var(--nv-text-secondary)]">{d.label}</span>
                                <span className="text-[var(--nv-text-tertiary)]">{score}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-[var(--nv-surface-3)] overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${score}%`, background: c }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {(risk.findings || []).length > 0 && (
                        <div className="space-y-1">
                          {(risk.findings || []).map((f: any, i: number) => (
                            <div
                              key={i}
                              className="rounded border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-1.5"
                            >
                              <div className="text-[10px] font-medium text-[var(--nv-text-primary)]">{f.ruleName}</div>
                              <div className="mt-0.5 text-[10px] text-[var(--nv-text-tertiary)] line-clamp-2">
                                「{f.excerpt}」
                              </div>
                              <div className="mt-0.5 text-[10px] text-[var(--nv-text-muted)]">建议：{f.suggestion}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* M3 */}
                {consistency && (
                  <section className="border-t border-[var(--nv-border-2)]">
                    <SectionTitle
                      icon="bookmarked"
                      hint={`M3 · ${(consistency.issues || []).length} 项`}
                    >
                      长篇一致性巡检
                    </SectionTitle>
                    <div className="px-3 pb-2 space-y-1.5">
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        <span className="rounded bg-[var(--nv-surface-2)] px-1.5 py-0.5 text-[var(--nv-text-tertiary)]">
                          全书 {consistency.stats?.chapters ?? 0} 章
                        </span>
                        <span className="rounded bg-[var(--nv-surface-2)] px-1.5 py-0.5 text-[var(--nv-text-tertiary)]">
                          角色 {consistency.stats?.characters ?? 0}
                        </span>
                        <span className="rounded bg-[var(--nv-surface-2)] px-1.5 py-0.5 text-[var(--nv-text-tertiary)]">
                          {consistency.stats?.chars ?? 0} 字
                        </span>
                      </div>
                      {(consistency.issues || []).length === 0 ? (
                        <div className="rounded border border-[var(--nv-primary)]/30 bg-[var(--nv-primary)]/5 px-2 py-1.5 text-[10px] text-[var(--nv-primary)]">
                          未发现明显一致性问题 ✓
                        </div>
                      ) : (
                        (consistency.issues || []).map((iss: any, i: number) => (
                          <div
                            key={i}
                            className={`rounded border p-1.5 ${sevClass[iss.severity] || sevClass.low}`}
                          >
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
                              <div className="mt-0.5 text-[10px] text-[var(--nv-text-tertiary)] line-clamp-2">
                                「{iss.excerpt}」
                              </div>
                            )}
                            <div className="mt-0.5 text-[10px] text-[var(--nv-text-muted)]">建议：{iss.suggestion}</div>
                          </div>
                        ))
                      )}
                      <p className="text-[9px] text-[var(--nv-text-muted)] leading-snug">{consistency.disclaimer}</p>
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
