"use client";

import { VERSIONS } from "@/lib/changelog-data";

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="max-w-2xl mx-auto px-5 py-12">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-bold">📋 更新公告</h1>
            <p className="text-sm text-zinc-500 mt-1">Novel Forge 版本记录</p>
          </div>
          <a href="/" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
            ← 回首页
          </a>
        </div>

        <div className="space-y-8">
          {VERSIONS.map((v) => (
            <div key={v.version} className="relative pl-6 border-l-2 border-zinc-800">
              {/* 时间线圆点 */}
              <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-zinc-950" />

              {/* 版本头部 */}
              <div className="mb-3">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded text-xs font-mono bg-indigo-950/50 border border-indigo-800/30 text-indigo-300">
                    {v.version}
                  </span>
                  <span className="text-xs text-zinc-600">{v.date}</span>
                </div>
                <h2 className="text-lg font-semibold mt-2">{v.title}</h2>
              </div>

              {/* 内容区 */}
              <div className="space-y-3">
                {v.sections.map((s, i) => (
                  <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <h3 className="text-sm font-medium text-zinc-400 mb-2">{s.label}</h3>
                    <ul className="space-y-1.5">
                      {s.items.map((item, j) => (
                        <li key={j} className="text-sm text-zinc-300 flex items-start gap-2">
                          <span className="text-zinc-700 mt-0.5 shrink-0">•</span>
                          <span>{item}</span>
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
