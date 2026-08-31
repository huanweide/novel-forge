"use client";

import Link from "next/link";
import { VERSIONS, LATEST_VERSION } from "@/lib/changelog-data";
import { Icon } from "@/components/ui/icons";

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-[var(--nv-void)] text-[var(--nv-text-secondary)] animate-in fade-in">
      {/* 顶栏 */}
      <header className="border-b border-[var(--nv-border-2)] bg-[var(--nv-void)]/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon name="clipboard" size={20} className="text-[var(--nv-text-secondary)]" />
            <h1 className="text-base font-bold text-[var(--nv-text-primary)]">更新面板</h1>
            <span className="text-xs text-[var(--nv-text-muted)]">Novel Smith 版本与更新记录</span>
          </div>
          <Link href="/" className="text-sm text-[var(--nv-text-muted)] hover:text-[var(--nv-text-secondary)] transition-colors inline-flex items-center gap-1.5">
            <Icon name="arrowLeft" size={14} /> 回首页
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* 当前版本卡 */}
        <div className="mb-10 rounded-2xl border border-[var(--nv-primary)]/20 bg-[var(--nv-primary)]/[0.06] p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--nv-primary)]/15 text-[var(--nv-primary)]">
            <Icon name="sparkles" size={22} />
          </div>
          <div>
            <p className="text-xs text-[var(--nv-text-muted)]">当前版本</p>
            <p className="font-mono text-2xl font-bold text-[var(--nv-primary)]">{LATEST_VERSION}</p>
          </div>
          <p className="ml-auto max-w-[14rem] text-xs text-[var(--nv-text-muted)]">
            每一次改动都会在这里登记版本号与更新内容，可随时回看。
          </p>
        </div>

        <div className="space-y-8">
          {VERSIONS.map((v, idx) => (
            <div key={v.version} className="relative pl-6 border-l-2 border-[var(--nv-border-2)]">
              {/* 时间线圆点 */}
              <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[var(--nv-primary)] ring-4 ring-[var(--nv-border-3)] shadow-[0_0_8px_var(--nv-primary)]" />

              {/* 版本头部 */}
              <div className="mb-4">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono bg-[var(--nv-primary)]/[0.08] border border-[var(--nv-primary)]/20 text-[var(--nv-primary)]">
                    {v.version}
                  </span>
                  <span className="text-xs text-[var(--nv-text-muted)]">{v.date}</span>
                  {idx === 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--nv-primary)]/15 text-[var(--nv-primary)] border border-[var(--nv-primary)]/20">
                      最新
                    </span>
                  ) : null}
                </div>
                <h2 className="text-lg font-semibold text-[var(--nv-text-primary)] mt-2">{v.title}</h2>
              </div>

              {/* 内容区 */}
              <div className="space-y-3">
                {v.sections.map((s, i) => (
                  <div
                    key={i}
                    className="bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded-xl p-4 backdrop-blur-sm hover:border-[var(--nv-border-2)] transition-all duration-200"
                  >
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="w-1 h-3.5 rounded-full bg-[var(--nv-primary)]/60" />
                      <h3 className="text-sm font-medium text-[var(--nv-text-tertiary)]">{s.label}</h3>
                    </div>
                    <ul className="space-y-1.5">
                      {s.items.map((item, j) => (
                        <li key={j} className="text-sm text-[var(--nv-text-secondary)] flex items-start gap-2.5">
                          <span className="w-1 h-1 rounded-full bg-[var(--nv-surface-2)] mt-2 shrink-0" />
                          <span className="leading-relaxed">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-[var(--nv-text-primary)] text-center mt-12">
          Novel Smith · 每次部署自动更新
        </p>
      </div>
    </div>
  );
}
