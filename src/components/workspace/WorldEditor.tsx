"use client";

import { Icon, type IconName } from "@/components/ui/icons";
import type { ModuleKey, WorldFieldDef } from "./worldPanelData";

interface ModuleInfo {
  key: ModuleKey;
  label: string;
  icon: IconName;
  desc: string;
}

interface WorldEditorProps {
  activeModule: ModuleKey;
  moduleInfo: ModuleInfo | undefined;
  currentFields: WorldFieldDef[];
  showCreate: boolean;
  createForm: Record<string, string>;
  saving: boolean;
  onSetShowCreate: (v: boolean) => void;
  onChangeField: (key: string, value: string) => void;
  onCreate: () => void;
}

export function WorldEditor({
  activeModule, moduleInfo, currentFields, showCreate, createForm, saving,
  onSetShowCreate, onChangeField, onCreate,
}: WorldEditorProps) {
  return (
    <>
      {/* 标题栏 */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--nv-border-2)] px-3 py-2">
        <div>
          <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--nv-text-primary)]">
            {moduleInfo?.icon && <Icon name={moduleInfo.icon} size={15} className="text-[var(--nv-primary)]" />}
            {moduleInfo?.label}
          </span>
          <p className="text-[10px] text-[var(--nv-text-tertiary)]">{moduleInfo?.desc}</p>
        </div>
        <button
          onClick={() => onSetShowCreate(!showCreate)}
          className="btn-primary shrink-0 rounded px-2 py-1 text-[10px] font-medium"
        >
          + 新建
        </button>
      </div>

      {/* 新建表单 */}
      {showCreate && (
        <div className="shrink-0 border-b border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3 backdrop-blur-sm">
          {activeModule !== "character_relationship" && (
            <input
              value={createForm["title"] || ""}
              onChange={(e) => onChangeField("title", e.target.value)}
              placeholder={`${moduleInfo?.label}名称`}
              className="input-glass mb-2 w-full rounded px-2 py-1 text-xs placeholder:text-[var(--nv-text-muted)]"
            />
          )}
          {currentFields.map((f) =>
            f.type === "textarea" ? (
              <textarea
                key={f.key}
                value={createForm[f.key] || ""}
                onChange={(e) => onChangeField(f.key, e.target.value)}
                placeholder={f.placeholder}
                rows={2}
                className="input-glass mb-1.5 w-full resize-none rounded px-2 py-1 text-xs placeholder:text-[var(--nv-text-muted)]"
              />
            ) : (
              <input
                key={f.key}
                value={createForm[f.key] || ""}
                onChange={(e) => onChangeField(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="input-glass mb-1.5 w-full rounded px-2 py-1 text-xs placeholder:text-[var(--nv-text-muted)]"
              />
            )
          )}
          <div className="mb-2 mt-1">
            <label className="mb-0.5 block text-[10px] text-[var(--nv-text-muted)]">记忆注入方式（常驻=始终在场 · 触发=关键词命中才出现）</label>
            <select
              value={createForm["depth"] || "3"}
              onChange={(e) => onChangeField("depth", e.target.value)}
              className="input-glass w-full rounded px-2 py-1 text-xs"
            >
              <option value="0">0 · 常驻·强效（正文前，优先级最高）</option>
              <option value="1">1 · 常驻·指令上方</option>
              <option value="2">2 · 常驻·系统上下文（始终在场）</option>
              <option value="3">3 · 触发·背景设定（关键词命中才出现，默认）</option>
              <option value="4">4 · 触发·深层背景</option>
            </select>
          </div>
          <div className="mt-1 flex gap-2">
            <button onClick={onCreate} disabled={saving}
              className="btn-primary rounded px-2 py-1 text-[10px] font-medium disabled:opacity-50">
              {saving ? <span className="flex items-center gap-1"><Icon name="loader" size={11} className="animate-spin" /> 创建中...</span> : <span className="flex items-center gap-1"><Icon name="save" size={11} /> 保存</span>}
            </button>
            <button onClick={() => onSetShowCreate(false)}
              className="btn-ghost rounded border border-[var(--nv-border-2)] px-2 py-1 text-[10px]"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </>
  );
}
