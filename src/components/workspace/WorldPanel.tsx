"use client";

import { useState, useEffect } from "react";
import type { LorebookData } from "./types";
import { Icon, type IconName } from "@/components/ui/icons";
import { confirmDialog, toastError, toastSuccess, toastInfo, toastAdded } from "@/components/ui/toast";
import { useConfirmDelete } from "@/components/workspace/useConfirmDelete";

// ─── 板块定义：每个板块独立的词汇、图标、描述 ──────────────

const WORLD_MODULES = [
  { key: "geography",   label: "地理地图", icon: "globe" as IconName, desc: "大陆、国家、城市、宗门、秘境" },
  { key: "faction",     label: "势力阵营", icon: "sword" as IconName, desc: "宗门、家族、帝国、帮派、圣地" },
  { key: "item",        label: "物品列表", icon: "gem" as IconName, desc: "法宝、丹药、材料、法器、装备" },
  { key: "magic_system",label: "力量体系", icon: "sparkles" as IconName, desc: "修炼等级、能量规则、境界划分" },
  { key: "technique",   label: "功法体系", icon: "scroll" as IconName, desc: "攻击/防御/辅助/身法/阵法" },
  { key: "creature",    label: "生物种族", icon: "skull" as IconName, desc: "妖兽、神兽、异族、灵物" },
  { key: "culture",     label: "文化风俗", icon: "palette" as IconName, desc: "传统、习俗、节日、礼仪" },
  { key: "history",     label: "历史背景", icon: "book" as IconName, desc: "重大事件、纪元更迭、传说" },
  { key: "law",         label: "规则法则", icon: "shield" as IconName, desc: "天道规则、世界法则、禁忌" },
  { key: "currency",    label: "货币体系", icon: "gem" as IconName, desc: "灵石、金币、兑换比例" },
  { key: "custom",      label: "特殊设定", icon: "sparkles" as IconName, desc: "金手指、系统、血脉、漏洞" },
  { key: "character_relationship", label: "角色关系", icon: "users" as IconName, desc: "角色间的互动关系——从正文自动提取，生成时必定读取" },
] as const;

type ModuleKey = (typeof WORLD_MODULES)[number]["key"];

// ─── category 中文 → DB key 映射 ────────────────────────

const CATEGORY_TO_MODULE: Record<string, ModuleKey> = {
  geography: "geography",
  faction: "faction",
  item: "item",
  magic_system: "magic_system",
  technique: "technique",
  creature: "creature",
  culture: "culture",
  history: "history",
  law: "law",
  currency: "currency",
  character_relationship: "character_relationship",
  custom: "custom",
};

// ─── 每个板块的新建字段模板 ──────────────────────────────

const MODULE_FIELDS: Record<ModuleKey, Array<{ key: string; label: string; placeholder: string; type: "text" | "textarea" }>> = {
  geography: [
    { key: "type", label: "类型", placeholder: "大陆/国家/城市/宗门/秘境/禁地", type: "text" },
    { key: "parent", label: "所属上层地域", placeholder: "如：东荒", type: "text" },
    { key: "description", label: "描述", placeholder: "环境特征、重要地标、法则特性...", type: "textarea" },
  ],
  faction: [
    { key: "type", label: "类型", placeholder: "宗门/家族/帝国/帮派/圣地", type: "text" },
    { key: "alignment", label: "阵营", placeholder: "正道/邪道/中立", type: "text" },
    { key: "leader", label: "首领", placeholder: "掌门/家主/帝王", type: "text" },
    { key: "territory", label: "领地", placeholder: "势力范围", type: "text" },
    { key: "description", label: "描述", placeholder: "核心目标、成员规模、特殊能力...", type: "textarea" },
  ],
  item: [
    { key: "type", label: "类型", placeholder: "武器/丹药/法宝/材料/法器", type: "text" },
    { key: "rarity", label: "稀有度", placeholder: "凡品/灵品/宝品/仙品/神品/禁忌", type: "text" },
    { key: "owner", label: "持有者", placeholder: "角色名", type: "text" },
    { key: "status", label: "状态", placeholder: "完好/损坏/遗失/封印中", type: "text" },
    { key: "description", label: "描述", placeholder: "外观、功能、来历...", type: "textarea" },
  ],
  magic_system: [
    { key: "levels", label: "等级序列", placeholder: "炼气→筑基→金丹→元婴→化神→渡劫→大乘→帝境", type: "text" },
    { key: "energySource", label: "能量来源", placeholder: "灵气/魔气/血脉/信仰", type: "text" },
    { key: "breakthrough", label: "突破条件", placeholder: "资源/心境/契机", type: "text" },
    { key: "description", label: "描述", placeholder: "各等级特征、末法时代影响...", type: "textarea" },
  ],
  technique: [
    { key: "type", label: "类型", placeholder: "攻击/防御/辅助/身法/阵法", type: "text" },
    { key: "grade", label: "品阶", placeholder: "凡/灵/宝/仙/神/禁忌", type: "text" },
    { key: "element", label: "属性", placeholder: "火/水/雷/木/土/无", type: "text" },
    { key: "inheritance", label: "传承方式", placeholder: "师徒/血脉/石碑/秘籍", type: "text" },
    { key: "description", label: "描述", placeholder: "核心效果、修炼要求、副作用...", type: "textarea" },
  ],
  creature: [
    { key: "type", label: "类型", placeholder: "妖兽/神兽/异族/灵物/古族", type: "text" },
    { key: "habitat", label: "栖息地", placeholder: "地点名", type: "text" },
    { key: "powerLevel", label: "实力等级", placeholder: "筑基级/金丹级...", type: "text" },
    { key: "description", label: "描述", placeholder: "外貌、习性、能力...", type: "textarea" },
  ],
  culture: [
    { key: "region", label: "所属区域", placeholder: "地域/势力", type: "text" },
    { key: "description", label: "描述", placeholder: "传统、习俗、节日、礼仪...", type: "textarea" },
  ],
  history: [
    { key: "era", label: "纪元/时代", placeholder: "上古纪元/末法时代/黄金纪元", type: "text" },
    { key: "date", label: "时间标记", placeholder: "X年前/X纪元", type: "text" },
    { key: "description", label: "描述", placeholder: "事件概述、影响、关联人物...", type: "textarea" },
  ],
  law: [
    { key: "scope", label: "作用范围", placeholder: "全大陆/某势力/某秘境", type: "text" },
    { key: "penalty", label: "违反后果", placeholder: "天劫/抹杀/放逐", type: "text" },
    { key: "description", label: "描述", placeholder: "规则内容、触发条件、例外...", type: "textarea" },
  ],
  currency: [
    { key: "material", label: "材质/形态", placeholder: "灵石/金币/玉简/晶石", type: "text" },
    { key: "tiers", label: "价值层级", placeholder: "下品→中品→上品→极品，100:1", type: "text" },
    { key: "circulation", label: "流通范围", placeholder: "全大陆/某势力", type: "text" },
    { key: "description", label: "描述", placeholder: "获取方式、特殊功能、通胀影响...", type: "textarea" },
  ],
  custom: [
    { key: "type", label: "类型", placeholder: "系统/金手指/天赋/血脉/世界漏洞", type: "text" },
    { key: "trigger", label: "触发条件", placeholder: "条件/代价", type: "text" },
    { key: "description", label: "描述", placeholder: "效果、限制、未解之谜...", type: "textarea" },
  ],
  character_relationship: [
    { key: "charA", label: "角色A", placeholder: "角色名（如：陈凡）", type: "text" },
    { key: "charB", label: "角色B", placeholder: "角色名（如：凌霜）", type: "text" },
    { key: "relation", label: "关系类型", placeholder: "师徒/敌对/暗恋/盟友/血亲/利用/守护/竞争", type: "text" },
    { key: "reason", label: "关系原因", placeholder: "为什么有这样的关系（从正文中提取）", type: "text" },
    { key: "dynamic", label: "关系动态", placeholder: "关系的变化趋势（升温/降温/稳定/反复）", type: "text" },
    { key: "evidence", label: "正文证据", placeholder: "摘录正文中体现此关系的句子", type: "textarea" },
  ],
};

// ─── 组件 ──────────────────────────────────────────────────

export function WorldPanel({
  projectId, entries = [], onRefresh,
}: {
  projectId: string; entries?: LorebookData[]; onRefresh: () => void;
}) {
  const [activeModule, setActiveModule] = useState<ModuleKey>("geography");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // 按当前板块过滤
  const moduleEntries = entries.filter((e) => {
    const mapped = CATEGORY_TO_MODULE[e.category] || "custom";
    return mapped === activeModule || (activeModule === "custom" && !CATEGORY_TO_MODULE[e.category]);
  });

  // 板块计数
  const getCount = (key: ModuleKey) => {
    if (key === "custom") {
      return entries.filter((e) => !CATEGORY_TO_MODULE[e.category]).length;
    }
    return entries.filter((e) => CATEGORY_TO_MODULE[e.category] === key).length;
  };

  // 新建
  const handleCreate = async () => {
    const fields = MODULE_FIELDS[activeModule];
    const contentParts: string[] = [];
    for (const f of fields) {
      const val = createForm[f.key]?.trim();
      if (val) contentParts.push(`【${f.label}】${val}`);
    }
    const content = contentParts.join("\n") || "（待补充）";

    // 关系条目：自动生成标题和 keys
    let title: string;
    let keys: string[];
    if (activeModule === "character_relationship") {
      const charA = createForm["charA"]?.trim() || "?";
      const charB = createForm["charB"]?.trim() || "?";
      const relation = createForm["relation"]?.trim() || "关系";
      title = `${charA} ↔ ${charB}：${relation}`;
      keys = [charA, charB, relation].filter(Boolean);
    } else {
      title = createForm["title"]?.trim() || "未命名";
      keys = [title];
    }

    setSaving(true);
    try {
      const res = await fetch("/api/lorebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId, title,
          category: activeModule === "custom" ? "custom" : activeModule,
          keys,
          content,
          insertionOrder: 50,
        }),
      });
      if (res.ok) { setShowCreate(false); setCreateForm({}); toastAdded(title, "世界书"); onRefresh(); }
      else { const d = await res.json().catch(() => ({ error: "未知错误" })); toastError("条目创建失败：" + (d.error || `HTTP ${res.status}`)); }
    } catch (err) { toastError("条目创建失败（网络错误）：" + (err instanceof Error ? err.message : "请重试")); }
    finally { setSaving(false); }
  };

  // 删除
  const { deletingId, remove: deleteEntry } = useConfirmDelete({
    title: "删除条目",
    description: "确定删除此世界书条目？此操作不可恢复。",
    deleteFn: async (id) => {
      const res = await fetch(`/api/lorebook/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({ error: "未知错误" })); throw new Error(d.error || `HTTP ${res.status}`); }
    },
    onSuccess: onRefresh,
    errorPrefix: "条目删除失败",
  });

  const moduleInfo = WORLD_MODULES.find((m) => m.key === activeModule);
  const currentFields = MODULE_FIELDS[activeModule];

  return (
    <div className="flex flex-col h-full">
      {/* 板块选择器 */}
      <div className="max-h-[40%] flex-shrink-0 space-y-0.5 overflow-y-auto border-b border-[var(--nv-border-2)] p-2">
        {WORLD_MODULES.map((mod) => {
          const count = getCount(mod.key);
          const active = activeModule === mod.key;
          return (
            <button
              key={mod.key}
              onClick={() => { setActiveModule(mod.key); setShowCreate(false); }}
              className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors ${
                active
                  ? "border border-[var(--nv-primary)]/40 bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]"
                  : "border border-transparent text-[var(--nv-text-tertiary)] hover:bg-white/[0.04] hover:text-[var(--nv-text-primary)]"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon name={mod.icon} size={14} />
                <span>{mod.label}</span>
              </span>
              <span className={`text-[10px] ${count > 0 ? "text-[var(--nv-text-tertiary)]" : "text-[var(--nv-text-muted)]"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 当前板块内容 */}
      <div className="flex min-h-0 flex-1 flex-col">
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
            onClick={() => setShowCreate(!showCreate)}
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
                onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={`${moduleInfo?.label}名称`}
                className="input-glass mb-2 w-full rounded px-2 py-1 text-xs placeholder:text-[var(--nv-text-muted)]"
              />
            )}
            {currentFields.map((f) =>
              f.type === "textarea" ? (
                <textarea
                  key={f.key}
                  value={createForm[f.key] || ""}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  rows={2}
                  className="input-glass mb-1.5 w-full resize-none rounded px-2 py-1 text-xs placeholder:text-[var(--nv-text-muted)]"
                />
              ) : (
                <input
                  key={f.key}
                  value={createForm[f.key] || ""}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="input-glass mb-1.5 w-full rounded px-2 py-1 text-xs placeholder:text-[var(--nv-text-muted)]"
                />
              )
            )}
            <div className="mt-1 flex gap-2">
              <button onClick={handleCreate} disabled={saving}
                className="btn-primary rounded px-2 py-1 text-[10px] font-medium disabled:opacity-50">
                {saving ? <span className="flex items-center gap-1"><Icon name="loader" size={11} className="animate-spin" /> 创建中...</span> : <span className="flex items-center gap-1"><Icon name="save" size={11} /> 保存</span>}
              </button>
              <button onClick={() => setShowCreate(false)}
                className="btn-ghost rounded border border-[var(--nv-border-2)] px-2 py-1 text-[10px]"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 条目列表 */}
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {moduleEntries.length === 0 && (
            <p className="py-8 text-center text-xs text-[var(--nv-text-tertiary)]">
              暂无{moduleInfo?.label}设定<br />
              <span className="text-[10px]">点击"+ 新建"或写完章节后自动提取</span>
            </p>
          )}
          {moduleEntries.map((entry) => (
            <div key={entry.id}
              className="group rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-2 transition-colors hover:border-[var(--nv-border-3)]"
            >
              <div className="flex items-start justify-between">
                <span className="text-xs font-medium leading-tight text-[var(--nv-text-primary)]">{entry.title}</span>
                <button
                  onClick={() => deleteEntry(entry.id)}
                  disabled={deletingId === entry.id}
                  className="ml-1 shrink-0 text-[var(--nv-text-muted)] opacity-0 transition-all hover:text-[var(--nv-danger)] group-hover:opacity-100 disabled:opacity-40"
                  aria-label="删除条目"
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
              {entry.content && (
                <p className="mt-0.5 line-clamp-3 text-[10px] leading-relaxed text-[var(--nv-text-tertiary)]">
                  {entry.content}
                </p>
              )}
              {/* 触发关键词 */}
              {entry.keys && entry.keys.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {entry.keys.slice(0, 4).map((k, i) => (
                    <span key={i} className="rounded bg-[var(--nv-surface-2)] px-1 py-0.5 text-[8px] text-[var(--nv-text-tertiary)]">{k}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
