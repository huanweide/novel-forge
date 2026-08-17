"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
import { toastError } from "@/components/ui/toast";

type PresetRec = {
  presetId: string;
  type: string;
  title: string;
  appliedAt?: string;
  ruleNames?: string[];
  configKeys?: string[];
};

type Rule = { name: string; pattern: string; flags?: string; replace: string };

const PRESET_TYPE_LABEL: Record<string, string> = {
  api_config: "API参数",
  regex: "正则",
  style: "文风",
  lorebook: "世界书",
  worldview: "世界观",
  story_progression: "剧情推进",
  character: "角色卡",
  table_template: "表格模板",
};

export function ProjectConfigPanel({
  projectId,
  project,
  onSaved,
  onClose,
}: {
  projectId: string;
  project: any;
  onSaved: (patch: { postProcessingRules?: Rule[]; llmConfig?: Record<string, unknown> }) => void;
  onClose: () => void;
}) {
  const [presets, setPresets] = useState<PresetRec[]>(project.appliedPresets || []);
  const [rules, setRules] = useState<Rule[]>(project.postProcessingRules || []);
  const [llm, setLlm] = useState<Record<string, unknown>>({
    model: "",
    baseUrl: "",
    apiKey: "",
    ...(project.llmConfig || {}),
  });
  const [busy, setBusy] = useState(false);
  const [rulesHint, setRulesHint] = useState("");
  const [llmHint, setLlmHint] = useState("");
  const [regexPresets, setRegexPresets] = useState<{ id: string; title: string; description?: string; rules: Rule[] }[]>([]);
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [presetHint, setPresetHint] = useState("");
  const [showNewRule, setShowNewRule] = useState(false);
  const [draft, setDraft] = useState<Rule>({ name: "", pattern: "", flags: "g", replace: "" });
  const [draftErr, setDraftErr] = useState("");

  // v0.46.58：从创意工坊 regex 预设一键添加（不必手写正则名字/pattern）
  const loadRegexPresets = async () => {
    try {
      const res = await fetch("/api/presets");
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.presets || [];
      const regexOnes = items
        .filter((p: any) => p.type === "regex")
        .map((p: any) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          rules: (p.content?.rules || []) as Rule[],
        }));
      setRegexPresets(regexOnes);
      setShowPresetPicker(true);
      setPresetHint("");
    } catch {
      setPresetHint("读取创意工坊预设失败，请确认后端已启动");
    }
  };

  const applyRegexPreset = (p: { title: string; rules: Rule[] }) => {
    if (!p.rules.length) { setPresetHint(`预设「${p.title}」没有可用的规则`); return; }
    setRules((rs) => [...rs, ...p.rules.map((r) => ({ name: r.name, pattern: r.pattern, flags: r.flags || "g", replace: r.replace || "" }))]);
    setShowPresetPicker(false);
    setRulesHint(`已从预设「${p.title}」添加 ${p.rules.length} 条规则，点「保存规则」生效`);
  };

  const removePreset = async (presetId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/applied-presets`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setPresets((p) => p.filter((x) => x.presetId !== presetId));
      } else {
        toastError(d.error || "移除失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const saveRules = async () => {
    setBusy(true);
    setRulesHint("");
    // 校验所有正则规则合法性（含手改已有规则），避免非法正则在生成后处理时崩溃（工坊 P1）
    for (const r of rules) {
      if (!r.pattern) continue;
      try {
        new RegExp(r.pattern, r.flags || "g");
      } catch (e) {
        setRulesHint("正则无效（" + (r.name || "未命名") + "）：" + (e instanceof Error ? e.message : "格式错误"));
        setBusy(false);
        return;
      }
    }
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postProcessingRules: rules }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        onSaved({ postProcessingRules: rules });
        setRulesHint("正则规则已保存 ✓");
      } else {
        setRulesHint(d.error || "保存失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const saveLlm = async () => {
    setBusy(true);
    setLlmHint("");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llmConfig: llm }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        onSaved({ llmConfig: llm });
        setLlmHint("项目级 LLM 配置已保存 ✓");
      } else {
        setLlmHint(d.error || "保存失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const updateRule = (idx: number, key: keyof Rule, val: string) => {
    setRules((rs) => rs.map((r, i) => (i === idx ? { ...r, [key]: val } : r)));
  };

  // I-2：新增规则改为与「规则」面板一致的模态弹窗，并在提交前校验正则合法性
  const openNewRule = () => {
    setDraft({ name: "", pattern: "", flags: "g", replace: "" });
    setDraftErr("");
    setShowNewRule(true);
  };

  const confirmNewRule = () => {
    if (!draft.name.trim() || !draft.pattern.trim()) {
      setDraftErr("规则名与正则 pattern 必填");
      return;
    }
    try {
      new RegExp(draft.pattern, draft.flags || "g");
    } catch (e) {
      setDraftErr("正则无效：" + (e instanceof Error ? e.message : "格式错误"));
      return;
    }
    setRules((rs) => [...rs, { name: draft.name.trim(), pattern: draft.pattern, flags: draft.flags || "g", replace: draft.replace }]);
    setShowNewRule(false);
    setRulesHint("已新增 1 条规则，点「保存规则」生效");
  };

  return (
    <>
      <Modal open onClose={onClose} bare panelClassName="w-full max-w-2xl max-h-[88vh] overflow-y-auto" labelledBy="project-config-title">
      <div>
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-[var(--nv-border-2)] px-5 py-4">
          <h3 id="project-config-title" className="flex items-center gap-2 text-base font-semibold text-[var(--nv-text-primary)]">
            <Icon name="settings" size={16} /> 项目配置中心
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--nv-text-muted)] hover:text-[var(--nv-text-primary)] transition"
            aria-label="关闭"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          {/* 分区 1：已应用预设 */}
          <section>
            <h4 className="mb-2 text-sm font-semibold text-[var(--nv-text-secondary)]">
              已应用创意工坊预设
            </h4>
            {presets.length === 0 ? (
              <p className="text-xs text-[var(--nv-text-muted)]">
                暂无已应用预设。可在「创意工坊」套用预设后在此追踪与管理。
              </p>
            ) : (
              <ul className="space-y-2">
                {presets.map((p) => (
                  <li
                    key={p.presetId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--nv-border-1)] bg-[var(--nv-surface-1)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-[var(--nv-primary)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--nv-primary)]">
                          {PRESET_TYPE_LABEL[p.type] || p.type}
                        </span>
                        <span className="truncate text-sm text-[var(--nv-text-primary)]">{p.title}</span>
                      </div>
                      {p.appliedAt && (
                        <span className="text-[10px] text-[var(--nv-text-muted)]">
                          套用时间：{new Date(p.appliedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removePreset(p.presetId)}
                      disabled={busy}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs text-[var(--nv-text-muted)] hover:bg-danger/10 hover:text-danger transition"
                    >
                      移除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 分区 2：正则后处理规则 */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-[var(--nv-text-secondary)]">
                正则后处理规则
              </h4>
              <div className="flex gap-1.5">
                <button
                  onClick={loadRegexPresets}
                  className="rounded-lg bg-[var(--nv-creative)]/15 px-2 py-1 text-xs font-medium text-[var(--nv-creative)] hover:bg-[var(--nv-creative)]/25 transition"
                  title="从创意工坊已有的正则预设一键添加（无需手写）"
                >
                  + 从预设添加
                </button>
                <button
                  onClick={openNewRule}
                  className="rounded-lg bg-[var(--nv-primary)]/15 px-2 py-1 text-xs font-medium text-[var(--nv-primary)] hover:bg-[var(--nv-primary)]/25 transition"
                >
                  + 新增规则
                </button>
              </div>
            </div>
            <p className="mb-3 text-[10px] leading-relaxed text-[var(--nv-text-muted)]">
              生成完成后，系统用这些正则对正文做替换/清洗（后处理）。它不同于「规则」面板的「创作铁律」——后者把约束写进 AI 提示词、约定它怎么写，两者互不影响、各管一段。
            </p>
            {showPresetPicker && (
              <div className="mb-3 rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--nv-text-secondary)]">选择正则预设（点击即添加其全部规则）</span>
                  <button onClick={() => setShowPresetPicker(false)} className="text-xs text-[var(--nv-text-muted)] hover:text-[var(--nv-text-primary)]">✕</button>
                </div>
                {regexPresets.length === 0 ? (
                  <p className="text-xs text-[var(--nv-text-muted)]">暂无正则类预设。可先去「创意工坊」创建/导入正则预设。</p>
                ) : (
                  <div className="space-y-1.5">
                    {regexPresets.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => applyRegexPreset(p)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--nv-border-1)] bg-[var(--nv-surface-1)] px-3 py-2 text-left transition-colors hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-2)]"
                      >
                        <span>
                          <span className="block text-xs font-medium text-[var(--nv-text-primary)]">{p.title}</span>
                          <span className="block text-[10px] text-[var(--nv-text-muted)] mt-0.5">{p.description || `${p.rules.length} 条规则`}</span>
                        </span>
                        <span className="shrink-0 text-[10px] rounded bg-[var(--nv-surface-3)] px-1.5 py-0.5 text-[var(--nv-text-secondary)]">{p.rules.length} 条</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {presetHint && <p className="mb-2 text-[11px] text-[var(--nv-warning)]">{presetHint}</p>}
            {rules.length === 0 ? (
              <p className="text-xs text-[var(--nv-text-muted)]">
                暂无规则。可在「创意工坊」套用 regex 预设，或在此手动新增。
              </p>
            ) : (
              <div className="space-y-3">
                {rules.map((r, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[var(--nv-border-1)] bg-[var(--nv-surface-1)] p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        value={r.name}
                        onChange={(e) => updateRule(idx, "name", e.target.value)}
                        placeholder="规则名"
                        className="flex-1 rounded-lg border border-[var(--nv-border-1)] bg-[var(--nv-void)] px-2 py-1 text-xs text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]"
                      />
                      <button
                        onClick={() => setRules((rs) => rs.filter((_, i) => i !== idx))}
                        className="shrink-0 rounded-lg px-2 py-1 text-xs text-[var(--nv-text-muted)] hover:bg-danger/10 hover:text-danger transition"
                      >
                        删除
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={r.pattern}
                        onChange={(e) => updateRule(idx, "pattern", e.target.value)}
                        placeholder="正则 pattern（如 &nbsp;）"
                        className="flex-1 rounded-lg border border-[var(--nv-border-1)] bg-[var(--nv-void)] px-2 py-1 text-xs text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]"
                      />
                      <input
                        value={r.flags || ""}
                        onChange={(e) => updateRule(idx, "flags", e.target.value)}
                        placeholder="flags"
                        className="w-16 rounded-lg border border-[var(--nv-border-1)] bg-[var(--nv-void)] px-2 py-1 text-xs text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]"
                      />
                    </div>
                    <input
                      value={r.replace}
                      onChange={(e) => updateRule(idx, "replace", e.target.value)}
                      placeholder="替换为（留空=删除匹配内容）"
                      className="w-full rounded-lg border border-[var(--nv-border-1)] bg-[var(--nv-void)] px-2 py-1 text-xs text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]"
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={saveRules}
                disabled={busy}
                className="rounded-xl bg-[var(--nv-primary)] px-3 py-1.5 text-xs font-medium text-[var(--nv-text-primary)] hover:opacity-90 transition disabled:opacity-50"
              >
                保存规则
              </button>
              {rulesHint && <span className="text-xs text-[var(--nv-text-secondary)]">{rulesHint}</span>}
            </div>
          </section>

          {/* 分区 3：项目级 LLM 覆盖 */}
          <section>
            <h4 className="mb-1 text-sm font-semibold text-[var(--nv-text-secondary)]">
              项目级 LLM 覆盖
            </h4>
            <p className="mb-2 text-[10px] text-[var(--nv-text-muted)]">
              留空则继承全局设置（设置页）。填写后，本项目生成优先使用以下配置。
            </p>
            <div className="space-y-2">
              <input
                value={(llm.model as string) || ""}
                onChange={(e) => setLlm((l) => ({ ...l, model: e.target.value }))}
                placeholder="模型名（如 deepseek-chat）"
                className="w-full rounded-lg border border-[var(--nv-border-1)] bg-[var(--nv-void)] px-2 py-1.5 text-xs text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]"
              />
              <input
                value={(llm.baseUrl as string) || ""}
                onChange={(e) => setLlm((l) => ({ ...l, baseUrl: e.target.value }))}
                placeholder="Base URL（如 https://api.deepseek.com）"
                className="w-full rounded-lg border border-[var(--nv-border-1)] bg-[var(--nv-void)] px-2 py-1.5 text-xs text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]"
              />
              <input
                value={(llm.apiKey as string) || ""}
                onChange={(e) => setLlm((l) => ({ ...l, apiKey: e.target.value }))}
                placeholder="API Key（留空继承全局）"
                type="password"
                className="w-full rounded-lg border border-[var(--nv-border-1)] bg-[var(--nv-void)] px-2 py-1.5 text-xs text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]"
              />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={saveLlm}
                disabled={busy}
                className="rounded-xl bg-[var(--nv-primary)] px-3 py-1.5 text-xs font-medium text-[var(--nv-text-primary)] hover:opacity-90 transition disabled:opacity-50"
              >
                保存 LLM 配置
              </button>
              {llmHint && <span className="text-xs text-[var(--nv-text-secondary)]">{llmHint}</span>}
            </div>
          </section>
        </div>
      </div>
    </Modal>

      {/* I-2：新增正则规则——与「规则」面板新建规则风格统一的模态弹窗（同级渲染，避免嵌套在 animate-spring 面板内被 transform 影响 fixed 定位） */}
      {showNewRule && (
        <Modal open onClose={() => setShowNewRule(false)} bare panelClassName="max-h-[85vh] w-full max-w-lg overflow-y-auto" labelledBy="new-rule-title">
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 id="new-rule-title" className="flex items-center gap-2 text-base font-semibold text-[var(--nv-text-primary)]">
                <Icon name="settings" size={16} /> 新增正则后处理规则
              </h4>
              <button onClick={() => setShowNewRule(false)} className="text-[var(--nv-text-muted)] hover:text-[var(--nv-text-primary)] transition" aria-label="关闭">
                <Icon name="x" size={18} />
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--nv-text-muted)]">
              保存后，生成完成阶段会用此正则对正文做替换/清洗（后处理），不影响 AI 写作时的提示词。
            </p>
            <div className="space-y-2">
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="规则名（如：去除&nbsp;）"
                className="w-full rounded-lg border border-[var(--nv-border-1)] bg-[var(--nv-void)] px-2 py-1.5 text-xs text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]"
              />
              <input
                value={draft.pattern}
                onChange={(e) => setDraft((d) => ({ ...d, pattern: e.target.value }))}
                placeholder="正则 pattern（如 &nbsp;）"
                className="w-full rounded-lg border border-[var(--nv-border-1)] bg-[var(--nv-void)] px-2 py-1.5 text-xs text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]"
              />
              <input
                value={draft.flags || ""}
                onChange={(e) => setDraft((d) => ({ ...d, flags: e.target.value }))}
                placeholder="flags（默认 g）"
                className="w-full rounded-lg border border-[var(--nv-border-1)] bg-[var(--nv-void)] px-2 py-1.5 text-xs text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]"
              />
              <input
                value={draft.replace}
                onChange={(e) => setDraft((d) => ({ ...d, replace: e.target.value }))}
                placeholder="替换为（留空=删除匹配内容）"
                className="w-full rounded-lg border border-[var(--nv-border-1)] bg-[var(--nv-void)] px-2 py-1.5 text-xs text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]"
              />
            </div>
            {draftErr && <p className="text-[11px] text-[var(--nv-warning)]">{draftErr}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowNewRule(false)} className="flex-1 rounded-xl border border-[var(--nv-border-2)] py-2 text-sm text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-3)] transition">取消</button>
              <button onClick={confirmNewRule} className="flex-1 rounded-xl bg-[var(--nv-primary)] py-2 text-sm font-medium text-[var(--nv-text-primary)] hover:opacity-90 transition">添加规则</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
