"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { toastSuccess, toastError, toastInfo, confirmDialog, toastAdded, toastCreated } from "@/components/ui/toast";
import { EmptyState, Loading } from "@/components/ui/States";

interface Preset {
  id: string;
  type: string;
  title: string;
  description: string;
  author: string;
  tags: string[];
  downloads: number;
  isBuiltin: boolean;
  content: any;
}

const TABS = [
  { key: "all", label: "全部" },
  { key: "table_template", label: "表格模板" },
  { key: "story_progression", label: "剧情推进" },
  { key: "style", label: "文风" },
  { key: "worldview", label: "世界观" },
  { key: "character", label: "角色卡" },
  { key: "regex", label: "正则" },
  { key: "lorebook", label: "世界书" },
  { key: "api_config", label: "API参数" },
];

const TYPE_LABEL: Record<string, string> = {
  table_template: "表格模板",
  story_progression: "剧情推进",
  style: "文风",
  worldview: "世界观",
  character: "角色卡",
  regex: "正则",
  lorebook: "世界书",
  api_config: "API参数",
};

const PLACEHOLDER: Record<string, string> = {
  table_template: `{\n  "tables": [\n    { "key": "my_table", "name": "我的表", "note": "说明", "category": "custom",\n      "columns": [{"key":"name","label":"名称","type":"text"}], "rows": [] }\n  ]\n}`,
  style: `{\n  "styleDescription": "文风描述", "povType": "third_person_limited",\n  "avgSentenceLength": 25, "dialogueRatio": 0.35, "descriptionRatio": 0.25, "actionRatio": 0.25, "innerThoughtRatio": 0.15\n}`,
  worldview: `{\n  "entries": [ { "title": "条目名", "content": "设定内容", "keys": ["触发词"] } ]\n}`,
  story_progression: `{\n  "entries": [ { "title": "推进模板", "content": "<if cell=\\"属性表/角色/好感度 <= 10\\">阶段一...<else>...</if>", "keys": ["好感度"] } ]\n}`,
  character: `{\n  "name": "角色名", "role": "supporting", "background": "背景", "tags": ["标签"]\n}`,
  regex: `{\n  "rules": [\n    { "name": "删除思维链", "pattern": "<think(?:ing)?>[\\\\s\\\\S]*?</think(?:ing)?>", "flags": "gi", "replace": "" }\n  ]\n}`,
  lorebook: `{\n  "entries": [ { "title": "世界书条目", "content": "设定细节", "keys": ["触发词"] } ]\n}`,
  api_config: `{\n  "temperature": 0.85, "topP": 0.95, "maxTokens": 4000\n}`,
};

export default function Workshop() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [targetProject, setTargetProject] = useState("");
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [upload, setUpload] = useState({
    type: "style",
    title: "",
    description: "",
    tags: "",
    styleFeeling: "",
    povType: "third_person_limited",
    pace: "medium",
    entries: [{ title: "", content: "" }],
    charName: "",
    charDesc: "",
    charRole: "supporting",
    tableName: "",
    tableCols: "",
    content: "",
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tab !== "all") params.set("type", tab);
    if (q) params.set("q", q);
    const res = await fetch(`/api/presets?${params.toString()}`);
    if (res.ok) setPresets(await res.json());
    setLoading(false);
  }, [tab, q]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: any) => {
        const list = Array.isArray(d) ? d : [];
        setProjects(list);
        if (list[0]) setTargetProject(list[0].id);
      })
      .catch(() => {});
  }, []);

  const apply = async (p: Preset) => {
    if (!targetProject) { toastError("请先在右上角选择目标项目"); return; }
    const ok = await confirmDialog({
      title: "应用预设",
      description: `确定将「${p.title}」应用到当前选择的项目吗？该操作将向项目写入对应的 ${TYPE_LABEL[p.type] ?? "预设"} 内容。`,
      confirmText: "应用",
      cancelText: "取消",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/presets/${p.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: targetProject }),
      });
      const d = await res.json();
      if (res.ok) toastSuccess(`已应用：${d.created.map((c: any) => c.name).join("、") || "完成"}`);
      else toastError(d.error || "应用失败");
    } finally { setBusy(false); }
  };

  const fork = async (p: Preset) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/presets/${p.id}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: "我" }),
      });
      const d = await res.json();
      if (res.ok) { toastAdded(p.title, "预设副本"); load(); }
      else toastError(d.error || "复刻失败");
    } finally { setBusy(false); }
  };

  const seedBuiltins = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/seed/presets`, { method: "POST" });
      const d = await res.json();
      if (res.ok) {
        toastCreated(`示范预设 ${d.created} 条`, "创意工坊");
        load();
      } else toastError(d.error || "载入失败");
    } finally { setBusy(false); }
  };

  const buildStyleContent = (u: any) => {
    const paceMap: any = {
      fast: { avgSentenceLength: 18, dialogueRatio: 0.5, actionRatio: 0.35 },
      medium: { avgSentenceLength: 28, dialogueRatio: 0.35, actionRatio: 0.25 },
      slow: { avgSentenceLength: 42, dialogueRatio: 0.22, actionRatio: 0.15 },
    };
    const p = paceMap[u.pace] || paceMap.medium;
    return {
      styleDescription: u.styleFeeling.trim(),
      povType: u.povType,
      avgSentenceLength: p.avgSentenceLength,
      shortSentenceRatio: 0.3,
      longSentenceRatio: 0.15,
      dialogueRatio: p.dialogueRatio,
      descriptionRatio: 0.25,
      actionRatio: p.actionRatio,
      innerThoughtRatio: 0.15,
      tonalMarkers: {},
      lexicalFeatures: {},
      sampleText: null,
    };
  };

  const uploadPreset = async () => {
    const t = upload.type;
    let content: any;
    if (t === "style") {
      if (!upload.styleFeeling.trim()) { toastError("请描述你想要的文风感觉"); return; }
      content = buildStyleContent(upload);
    } else if (t === "worldview" || t === "story_progression" || t === "lorebook") {
      const entries = upload.entries
        .filter((e) => e.title.trim() && e.content.trim())
        .map((e) => ({ title: e.title.trim(), content: e.content.trim(), keys: [] }));
      if (entries.length === 0) { toastError("请至少填写一个词条（标题+内容）"); return; }
      content = { entries };
    } else if (t === "character") {
      if (!upload.charName.trim()) { toastError("请填写角色名"); return; }
      content = { name: upload.charName.trim(), role: upload.charRole, background: upload.charDesc, personality: {}, appearance: {} };
    } else if (t === "table_template") {
      if (!upload.tableName.trim()) { toastError("请填写表名"); return; }
      const cols = upload.tableCols.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      content = {
        tables: [
          {
            key: upload.tableName.trim(),
            name: upload.tableName.trim(),
            note: "",
            category: "custom",
            columns: cols.map((c) => ({ key: c, name: c, type: "text" })),
            rows: [],
          },
        ],
      };
    } else {
      try { content = JSON.parse(upload.content || "{}"); } catch { toastError("高级模式 content 必须是合法 JSON"); return; }
    }
    if (!upload.title.trim()) { toastError("请填写标题"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: t,
          title: upload.title.trim(),
          description: upload.description.trim(),
          tags: upload.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
          content,
          author: "我",
        }),
      });
      const d = await res.json();
      if (res.ok) {
        toastCreated(upload.title.trim(), "创意工坊预设");
        setShowUpload(false);
        setUpload({
          type: "style",
          title: "",
          description: "",
          tags: "",
          styleFeeling: "",
          povType: "third_person_limited",
          pace: "medium",
          entries: [{ title: "", content: "" }],
          charName: "",
          charDesc: "",
          charRole: "supporting",
          tableName: "",
          tableCols: "",
          content: "",
        });
        load();
      } else toastError(d.error || "发布失败");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[var(--nv-void)] text-[var(--nv-text-primary)]">
      <header className="border-b border-[var(--nv-border-2)] bg-[var(--nv-void)]/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/" className="btn-ghost text-xs px-3 py-1.5 rounded-xl flex items-center gap-1">
              <Icon name="arrowRight" size={13} className="rotate-180" /> 返回
            </Link>
            <h1 className="text-lg font-bold tracking-tight">创意工坊 · 共创社区</h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={targetProject}
              onChange={(e) => setTargetProject(e.target.value)}
              className="input-glass rounded-xl px-3 py-1.5 text-xs"
            >
              {projects.length === 0 && <option value="">（无项目）</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={seedBuiltins}
              disabled={busy}
              className="btn-ghost text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-medium"
            >
              <Icon name="download" size={14} /> 载入示范预设
            </button>
            <button
              onClick={() => { setUpload((u) => ({ ...u, content: PLACEHOLDER[u.type] })); setShowUpload(true); }}
              className="btn-primary text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 font-medium"
            >
              <Icon name="sparkles" size={14} /> 上传预设
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <p className="text-[var(--nv-text-muted)] text-sm mb-6">
          把参考资料里的「预设」变成可共享资产：表格模板预设、剧情推进预设、文风、世界观、角色卡。
          免费、非商业——你上传、他人套用、可一键复刻二创。
        </p>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-xs px-3 py-1.5 rounded-xl transition-colors ${
                tab === t.key ? "bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]" : "bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索标题/描述…"
            className="input-glass ml-auto rounded-xl px-3 py-1.5 text-xs w-48"
          />
        </div>

        {loading ? (
          <div className="surface-elevated rounded-2xl py-16">
            <Loading label="正在加载创意工坊预设…" />
          </div>
        ) : presets.length === 0 ? (
          <EmptyState
            icon="package"
            title="还没有预设"
            description="把参考资料里的「预设」变成可共享资产，点右上角「上传预设」发布第一个吧。"
            className="surface-elevated border-solid border-[var(--nv-border-2)]"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {presets.map((p) => (
              <div key={p.id} className="surface-elevated rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--nv-primary)]/15 text-[var(--nv-primary)]">
                    {TYPE_LABEL[p.type] || p.type}
                  </span>
                  {p.isBuiltin && <span className="text-[11px] text-[var(--nv-accent)]">内置</span>}
                </div>
                <h3 className="font-semibold text-[var(--nv-text-primary)]">{p.title}</h3>
                <p className="text-xs text-[var(--nv-text-tertiary)] leading-relaxed flex-1">{p.description || "—"}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.tags.map((t) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)]">{t}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--nv-text-muted)]">
                  <span>by {p.author}</span>
                  <span className="flex items-center gap-1"><Icon name="download" size={11} /> {p.downloads}</span>
                </div>
                <div className="flex gap-2 mt-1">
                  <button
                    disabled={busy}
                    onClick={() => apply(p)}
                    className="flex-1 btn-primary text-xs py-2 rounded-xl disabled:opacity-50"
                  >
                    应用到项目
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => fork(p)}
                    className="btn-ghost text-xs px-3 py-2 rounded-xl disabled:opacity-50"
                  >
                    复刻
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="surface-floating rounded-2xl w-full max-w-lg p-6 animate-spring max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">上传预设</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[var(--nv-text-tertiary)]">类型</label>
                <select
                  value={upload.type}
                  onChange={(e) => setUpload({ ...upload, type: e.target.value, content: PLACEHOLDER[e.target.value] })}
                  className="input-glass w-full mt-1 rounded-xl px-3 py-2 text-sm"
                >
                  {Object.keys(TYPE_LABEL).map((k) => (
                    <option key={k} value={k}>{TYPE_LABEL[k]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--nv-text-tertiary)]">标题</label>
                <input
                  value={upload.title}
                  onChange={(e) => setUpload({ ...upload, title: e.target.value })}
                  className="input-glass w-full mt-1 rounded-xl px-3 py-2 text-sm"
                  placeholder="如：古风·缠绵文笔"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--nv-text-tertiary)]">描述</label>
                <input
                  value={upload.description}
                  onChange={(e) => setUpload({ ...upload, description: e.target.value })}
                  className="input-glass w-full mt-1 rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--nv-text-tertiary)]">标签（逗号分隔，如：古风,仙侠）</label>
                <input
                  value={upload.tags}
                  onChange={(e) => setUpload({ ...upload, tags: e.target.value })}
                  className="input-glass w-full mt-1 rounded-xl px-3 py-2 text-sm"
                />
              </div>
              {upload.type === "style" && (
                <>
                  <div>
                    <label className="text-xs text-[var(--nv-text-tertiary)]">文风感觉（用大白话描述你想要的味道，如「舞台剧风格：对白密集、动作夸张、情绪克制」）</label>
                    <textarea
                      value={upload.styleFeeling}
                      onChange={(e) => setUpload({ ...upload, styleFeeling: e.target.value })}
                      rows={4}
                      placeholder="例如：古风缠绵、对白如诗、少动作多意境"
                      className="input-glass w-full mt-1 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--nv-text-tertiary)]">叙事视角</label>
                      <select
                        value={upload.povType}
                        onChange={(e) => setUpload({ ...upload, povType: e.target.value })}
                        className="input-glass w-full mt-1 rounded-xl px-3 py-2 text-sm"
                      >
                        <option value="first_person">第一人称</option>
                        <option value="third_person_limited">第三人称·限知</option>
                        <option value="third_person_omniscient">第三人称·全知</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--nv-text-tertiary)]">节奏</label>
                      <select
                        value={upload.pace}
                        onChange={(e) => setUpload({ ...upload, pace: e.target.value })}
                        className="input-glass w-full mt-1 rounded-xl px-3 py-2 text-sm"
                      >
                        <option value="fast">快节奏</option>
                        <option value="medium">中节奏</option>
                        <option value="slow">慢节奏</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {(upload.type === "worldview" || upload.type === "story_progression" || upload.type === "lorebook") && (
                <div>
                  <label className="text-xs text-[var(--nv-text-tertiary)]">词条（每条一个设定/剧情点，自由写；可加多条）</label>
                  <div className="space-y-2 mt-1">
                    {upload.entries.map((en, i) => (
                      <div key={i} className="rounded-xl border border-[var(--nv-border-2)] p-2 space-y-1">
                        <div className="flex gap-2">
                          <input
                            value={en.title}
                            onChange={(e) => {
                              const v = [...upload.entries];
                              v[i] = { ...v[i], title: e.target.value };
                              setUpload({ ...upload, entries: v });
                            }}
                            placeholder="词条标题"
                            className="input-glass flex-1 rounded-lg px-2 py-1.5 text-sm"
                          />
                          {upload.entries.length > 1 && (
                            <button
                              onClick={() => setUpload({ ...upload, entries: upload.entries.filter((_, j) => j !== i) })}
                              className="btn-ghost text-xs px-2 rounded-lg"
                            >
                              删
                            </button>
                          )}
                        </div>
                        <textarea
                          value={en.content}
                          onChange={(e) => {
                            const v = [...upload.entries];
                            v[i] = { ...v[i], content: e.target.value };
                            setUpload({ ...upload, entries: v });
                          }}
                          rows={3}
                          placeholder="设定/剧情内容，自由写"
                          className="input-glass w-full rounded-lg px-2 py-1.5 text-sm"
                        />
                      </div>
                    ))}
                    <button
                      onClick={() => setUpload({ ...upload, entries: [...upload.entries, { title: "", content: "" }] })}
                      className="btn-ghost text-xs px-3 py-1.5 rounded-xl"
                    >
                      + 添加词条
                    </button>
                  </div>
                </div>
              )}

              {upload.type === "character" && (
                <>
                  <div>
                    <label className="text-xs text-[var(--nv-text-tertiary)]">角色名</label>
                    <input
                      value={upload.charName}
                      onChange={(e) => setUpload({ ...upload, charName: e.target.value })}
                      placeholder="如：苏苏"
                      className="input-glass w-full mt-1 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--nv-text-tertiary)]">角色定位</label>
                    <select
                      value={upload.charRole}
                      onChange={(e) => setUpload({ ...upload, charRole: e.target.value })}
                      className="input-glass w-full mt-1 rounded-xl px-3 py-2 text-sm"
                    >
                      <option value="protagonist">主角</option>
                      <option value="supporting">配角</option>
                      <option value="antagonist">反派</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--nv-text-tertiary)]">角色描述（外貌/性格/背景，自由写）</label>
                    <textarea
                      value={upload.charDesc}
                      onChange={(e) => setUpload({ ...upload, charDesc: e.target.value })}
                      rows={4}
                      placeholder="例如：表面温柔实则腹黑，擅长用甜言掩盖算计"
                      className="input-glass w-full mt-1 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                </>
              )}

              {upload.type === "table_template" && (
                <>
                  <div>
                    <label className="text-xs text-[var(--nv-text-tertiary)]">表名</label>
                    <input
                      value={upload.tableName}
                      onChange={(e) => setUpload({ ...upload, tableName: e.target.value })}
                      placeholder="如：主角信息表"
                      className="input-glass w-full mt-1 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--nv-text-tertiary)]">列名（逗号分隔）</label>
                    <input
                      value={upload.tableCols}
                      onChange={(e) => setUpload({ ...upload, tableCols: e.target.value })}
                      placeholder="如：姓名,年龄,好感度,资产"
                      className="input-glass w-full mt-1 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                </>
              )}

              {(upload.type === "regex" || upload.type === "api_config") && (
                <div>
                  <label className="text-xs text-[var(--nv-text-tertiary)]">高级内容（JSON）</label>
                  <textarea
                    value={upload.content}
                    onChange={(e) => setUpload({ ...upload, content: e.target.value })}
                    rows={8}
                    placeholder={PLACEHOLDER[upload.type]}
                    className="input-glass w-full mt-1 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowUpload(false)} className="flex-1 btn-ghost rounded-xl py-2.5 text-sm">取消</button>
              <button onClick={uploadPreset} disabled={busy} className="flex-1 btn-primary rounded-xl py-2.5 text-sm font-medium disabled:opacity-50">
                发布
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
