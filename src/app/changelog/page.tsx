"use client";

import Link from "next/link";
import { VERSIONS, LATEST_VERSION } from "@/lib/changelog-data";
import { Icon } from "@/components/ui/icons";

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      {/* 顶栏 */}
      <header className="border-b border-white/[0.06] bg-zinc-950/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon name="clipboard" size={20} className="text-zinc-300" />
            <h1 className="text-base font-bold text-zinc-100">更新面板</h1>
            <span className="text-xs text-zinc-600">Novel Forge 版本与更新记录</span>
          </div>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            ← 回首页
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* 当前版本卡 */}
        <div className="mb-10 rounded-2xl border border-indigo-400/20 bg-indigo-500/[0.06] p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
            <Icon name="sparkles" size={22} />
          </div>
          <div>
            <p className="text-xs text-zinc-500">当前版本</p>
            <p className="font-mono text-2xl font-bold text-indigo-200">{LATEST_VERSION}</p>
          </div>
          <p className="ml-auto max-w-[14rem] text-xs text-zinc-500">
            每一次改动都会在这里登记版本号与更新内容，可随时回看。
          </p>
        </div>

        <div className="space-y-8">
          {VERSIONS.map((v, idx) => (
            <div key={v.version} className="relative pl-6 border-l-2 border-white/[0.06]">
              {/* 时间线圆点 */}
              <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-zinc-950 shadow-[0_0_8px_rgba(99,102,241,0.4)]" />

              {/* 版本头部 */}
              <div className="mb-4">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono bg-indigo-500/[0.08] border border-indigo-400/20 text-indigo-300">
                    {v.version}
                  </span>
                  <span className="text-xs text-zinc-600">{v.date}</span>
                  {idx === 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-400/20">
                      最新
                    </span>
                  ) : null}
                </div>
                <h2 className="text-lg font-semibold text-zinc-100 mt-2">{v.title}</h2>
              </div>

              {/* 内容区 */}
              <div className="space-y-3">
                {v.sections.map((s, i) => (
                  <div
                    key={i}
                    className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 backdrop-blur-sm hover:border-white/[0.1] transition-all duration-200"
                  >
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="w-1 h-3.5 rounded-full bg-indigo-400/60" />
                      <h3 className="text-sm font-medium text-zinc-400">{s.label}</h3>
                    </div>
                    <ul className="space-y-1.5">
                      {s.items.map((item, j) => (
                        <li key={j} className="text-sm text-zinc-300 flex items-start gap-2.5">
                          <span className="w-1 h-1 rounded-full bg-zinc-700 mt-2 shrink-0" />
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

        <p className="text-xs text-zinc-700 text-center mt-12">
          Novel Forge · 每次部署自动更新
        </p>
      </div>
    </div>
  );
}
