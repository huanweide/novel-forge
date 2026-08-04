"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/icons";
import { toastError } from "@/components/ui/toast";

/**
 * 导入备份包选择弹窗（v0.46.58）
 * 选择 .nfproject 后先勾选「保留哪些设定」再导入为新项目——与导出选择对称。
 */
const IMPORT_ITEMS: { key: string; label: string; desc: string }[] = [
  { key: "characters", label: "角色卡", desc: "全部角色设定" },
  { key: "lorebook", label: "世界书词条", desc: "世界观/势力/宝物等词条" },
  { key: "chapters", label: "章节正文", desc: "全部章节（含大纲与正文）" },
  { key: "branches", label: "分支", desc: "故事分支节点" },
  { key: "storylines", label: "剧情线", desc: "主线/支线及七要素" },
  { key: "style", label: "文风卡", desc: "文风模板与风格卡" },
  { key: "tables", label: "世界表", desc: "结构化表格（宝宝流）" },
  { key: "rules", label: "正则规则", desc: "写作后处理正则" },
];

export function ImportDialog({
  file,
  onDone,
  onClose,
}: {
  file: File;
  onDone: (id: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(IMPORT_ITEMS.map((i) => i.key)));
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState("");

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const doImport = async () => {
    setImporting(true);
    setErr("");
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      bundle.include = IMPORT_ITEMS.filter((i) => selected.has(i.key)).map((i) => i.key);
      const res = await fetch("/api/projects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
      });
      const d = await res.json();
      if (res.ok && d.id) onDone(d.id);
      else setErr(d.error || `导入失败（HTTP ${res.status}）`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "文件读取失败");
      toastError("导入失败：" + (e instanceof Error ? e.message : "请重试"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open onClose={onClose} bare ariaLabel="导入备份包" panelClassName="max-w-md max-h-[88vh] overflow-y-auto">
      <div className="p-5">
        <div className="mb-1 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--nv-text-primary)]">导入备份包</h3>
            <p className="mt-1 text-xs text-[var(--nv-text-tertiary)]">《{file.name}》— 勾选要导入的设定（默认全选），将作为新项目导入</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]" aria-label="关闭"><Icon name="x" size={16} /></button>
        </div>

        <div className="mt-4 space-y-1.5">
          {IMPORT_ITEMS.map((item) => (
            <label
              key={item.key}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--nv-border-1)] bg-[var(--nv-surface-1)] px-3 py-2.5 transition-colors hover:border-[var(--nv-border-3)]"
            >
              <span className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(item.key)}
                  onChange={() => toggle(item.key)}
                  className="h-3.5 w-3.5 accent-[var(--nv-primary)]"
                />
                <span>
                  <span className="block text-xs font-medium text-[var(--nv-text-primary)]">{item.label}</span>
                  <span className="block text-[10px] text-[var(--nv-text-muted)]">{item.desc}</span>
                </span>
              </span>
              {selected.has(item.key) && <Icon name="check" size={12} className="text-[var(--nv-success)]" />}
            </label>
          ))}
        </div>

        {err && <p className="mt-2 text-xs text-danger">{err}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={doImport}
            disabled={selected.size === 0 || importing}
            className="flex-1 btn-primary rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {importing ? <span className="inline-flex items-center gap-1.5"><Icon name="loader" size={13} className="animate-spin" /> 导入中…</span> : <>导入为新项目（{selected.size} 项）</>}
          </button>
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2.5 text-sm">取消</button>
        </div>
      </div>
    </Modal>
  );
}
