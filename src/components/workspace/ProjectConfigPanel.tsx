"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";

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
        alert(d.error || "移除失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const saveRules = async () => {
    setBusy(true);
    setRulesHint("");
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

  return (
    <Modal open onClose={onClose} bare panelClassName="w-full max-w-2xl max-h-[88vh] overflow-y-auto">
      <div className="rounded-2xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-[var(--nv-border-2)] px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--nv-text-primary)]">
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
              <button
                onClick={() => setRules((rs) => [...rs, { name: "", pattern: "", flags: "g", replace: "" }])}
                className="rounded-lg bg-[var(--nv-primary)]/15 px-2 py-1 text-xs font-medium text-[var(--nv-primary)] hover:bg-[var(--nv-primary)]/25 transition"
              >
                + 新增规则
              </button>
            </div>
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
                className="rounded-xl bg-[var(--nv-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition disabled:opacity-50"
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
                placeholder="模型名（如 deepseek-v4-flash）"
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
                className="rounded-xl bg-[var(--nv-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition disabled:opacity-50"
              >
                保存 LLM 配置
              </button>
              {llmHint && <span className="text-xs text-[var(--nv-text-secondary)]">{llmHint}</span>}
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}
