"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Collapse } from "@/components/ui/collapse";
import { DialogField, DialogInput } from "./DialogUI";
import { Modal } from "@/components/ui/Modal";
import type { CharacterData } from "./types";
import { toastError, toastCreated } from "@/components/ui/toast";
import { RelationshipGraph } from "@/components/workspace/RelationshipGraph";
import {
  CHARACTER_ROLE_OPTIONS,
  fromText,
  toText,
  timelineToText,
  textToTimeline,
} from "@/lib/character-parse";

export function CharacterDialog({
  character,
  projectId,
  onClose,
  onSave,
  allCharacters,
  storyNodes,
  onSelectChapter,
  onEditCharacter,
}: {
  character?: CharacterData;
  projectId: string;
  onClose: () => void;
  onSave: () => void;
  allCharacters?: CharacterData[];
  storyNodes?: { id: string; title?: string | null; content?: string | null }[];
  onSelectChapter?: (nodeId: string) => void;
  onEditCharacter?: (id: string) => void;
}) {
  const isEdit = !!character;
  const [relView, setRelView] = useState<"list" | "graph">("list");

  const app = (character?.appearance || {}) as Record<string, unknown>;
  const ds = (character?.dialogueStyle || {}) as Record<string, unknown>;
  const rels =
    character && Array.isArray(character.relationships)
      ? (character.relationships as any[])
          .map((r: any) => [r.targetName, r.relation, r.dynamic].filter(Boolean).join("："))
          .join("\n")
      : "";

  const [form, setForm] = useState({
    name: character?.name || "",
    aliases: (character?.aliases || []).join("、"),
    role: character?.role || "supporting",
    age: character?.age || "",
    gender: character?.gender || "",
    appearanceHair: String(app.hair || ""),
    appearanceEyes: String(app.eyes || ""),
    appearanceHeight: String(app.height || ""),
    appearanceBuild: String(app.build || ""),
    appearanceFeatures: String(app.features || ""),
    appearanceAttire: String(app.attire || ""),
    personality: toText(character?.personality),
    surface: String((character?.personality as Record<string, unknown> | undefined)?.surface || ""),
    middle: String((character?.personality as Record<string, unknown> | undefined)?.middle || ""),
    core: String((character?.personality as Record<string, unknown> | undefined)?.core || ""),
    background: character?.background || "",
    storyLine: character?.storyLine || "",
    abilities: (character?.abilities || []).join("、"),
    hiddenMotives: (character?.hiddenMotives || []).join("、"),
    relationships: rels,
    dialogueDesc: String(ds.description || ""),
    dialogueExamples: (Array.isArray(ds.examples) ? ds.examples : []).join("\n"),
    dialogueVocab: (Array.isArray(ds.vocabulary) ? ds.vocabulary : []).join("、"),
    dialoguePatterns: (Array.isArray(ds.speechPatterns) ? ds.speechPatterns : []).join("\n"),
    timeline: timelineToText(character?.timeline as any),
    arcProgress: character?.arcProgress || "",
    currentStatus: character?.currentStatus || "alive",
  });

  const [autofilling, setAutofilling] = useState(false);
  const [autofillMsg, setAutofillMsg] = useState("");

  const handleAutofill = async () => {
    if (!character) return;
    setAutofilling(true);
    setAutofillMsg("AI 正在补全角色卡…");
    try {
      const res = await fetch(`/api/characters/${character.id}/autofill`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "补全失败");

      const updated = data.character;
      if (updated) {
        const ua = (updated.appearance || {}) as Record<string, unknown>;
        const ud = (updated.dialogueStyle || {}) as Record<string, unknown>;
        const up =
          updated.personality && typeof updated.personality === "object" && !Array.isArray(updated.personality)
            ? (updated.personality as Record<string, unknown>)
            : {};
        setForm({
          name: updated.name || form.name,
          aliases: (updated.aliases || []).join("、"),
          role: updated.role || form.role,
          age: updated.age || form.age,
          gender: updated.gender || form.gender,
          appearanceHair: String(ua.hair || form.appearanceHair),
          appearanceEyes: String(ua.eyes || form.appearanceEyes),
          appearanceHeight: String(ua.height || form.appearanceHeight),
          appearanceBuild: String(ua.build || form.appearanceBuild),
          appearanceFeatures: String(ua.features || form.appearanceFeatures),
          appearanceAttire: String(ua.attire || form.appearanceAttire),
          personality: toText(updated.personality) || form.personality,
          surface: String(up.surface || form.surface),
          middle: String(up.middle || form.middle),
          core: String(up.core || form.core),
          background: updated.background || form.background,
          storyLine: updated.storyLine || form.storyLine,
          abilities: (updated.abilities || form.abilities.split(/[,，、\n]+/).filter(Boolean)).join("、"),
          hiddenMotives: (updated.hiddenMotives || form.hiddenMotives.split(/[,，、\n]+/).filter(Boolean)).join("、"),
          relationships:
            updated.relationships && Array.isArray(updated.relationships) && updated.relationships.length > 0
              ? (updated.relationships as any[])
                  .map((r: any) => [r.targetName, r.relation, r.dynamic].filter(Boolean).join("："))
                  .join("\n")
              : form.relationships,
          dialogueDesc: String(ud.description || form.dialogueDesc),
          dialogueExamples: (Array.isArray(ud.examples) ? ud.examples : form.dialogueExamples.split("\n").filter(Boolean)).join("\n"),
          dialogueVocab: (Array.isArray(ud.vocabulary) ? ud.vocabulary : form.dialogueVocab.split(/[,，、]/).filter(Boolean)).join("、"),
          dialoguePatterns: (Array.isArray(ud.speechPatterns) ? ud.speechPatterns : form.dialoguePatterns.split("\n").filter(Boolean)).join("\n"),
          timeline: updated.timeline && Array.isArray(updated.timeline) && updated.timeline.length > 0 ? timelineToText(updated.timeline) : form.timeline,
          arcProgress: updated.arcProgress || form.arcProgress,
          currentStatus: updated.currentStatus || form.currentStatus,
        });
      }
      setAutofillMsg(`补全完成 · ${data.message || ""}`);
    } catch (err: any) {
      setAutofillMsg(`补全失败：${err.message}`);
    } finally {
      setAutofilling(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const relLines = form.relationships.split("\n").filter(Boolean);
    const relationships = relLines.map((line) => {
      const parts = line.split(/[：:]/);
      return { targetName: parts[0]?.trim() || "", relation: parts[1]?.trim() || "", dynamic: parts[2]?.trim() || "" };
    });
    const personalityBody = { ...fromText(form.personality), surface: form.surface, middle: form.middle, core: form.core };
    try {
      if (isEdit && character) {
        const res = await fetch(`/api/characters/${character.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            aliases: form.aliases.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
            role: form.role,
            age: form.age,
            gender: form.gender,
            appearance: {
              hair: form.appearanceHair,
              eyes: form.appearanceEyes,
              height: form.appearanceHeight,
              build: form.appearanceBuild,
              features: form.appearanceFeatures,
              attire: form.appearanceAttire,
            },
            personality: personalityBody,
            background: form.background,
            storyLine: form.storyLine,
            abilities: form.abilities.split(/[,，、\n]+/).map((s) => s.trim()).filter(Boolean),
            hiddenMotives: form.hiddenMotives.split(/[,，、\n]+/).map((s) => s.trim()).filter(Boolean),
            relationships,
            dialogueStyle: {
              description: form.dialogueDesc,
              examples: form.dialogueExamples.split("\n").filter(Boolean),
              vocabulary: form.dialogueVocab.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
              speechPatterns: form.dialoguePatterns.split("\n").filter(Boolean),
            },
            timeline: textToTimeline(form.timeline),
            arcProgress: form.arcProgress,
            currentStatus: form.currentStatus,
          }),
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          toastError(d.error || "角色保存失败，请重试");
          return;
        }
        onSave();
        onClose();
      } else {
        const res = await fetch("/api/characters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            name: form.name,
            role: form.role,
            age: form.age,
            gender: form.gender,
            personality: personalityBody,
            currentStatus: form.currentStatus,
          }),
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          toastError(d.error || "角色创建失败，请重试");
          return;
        }
        onSave();
        toastCreated(form.name, "角色");
        onClose();
      }
    } catch (err) {
      toastError((isEdit ? "角色保存失败：" : "角色创建失败：") + (err instanceof Error ? err.message : "网络错误"));
    }
  };

  const roleSelect = (
    <select
      className="input-glass w-full rounded-lg px-3 py-2 text-sm"
      value={form.role}
      onChange={(e) => setForm({ ...form, role: e.target.value })}
    >
      {CHARACTER_ROLE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    opts?: { placeholder?: string; textarea?: boolean; rows?: number },
  ) => (
    <DialogField label={label}>
      {opts?.textarea ? (
        <textarea
          className="input-glass w-full rounded-lg px-3 py-2 text-sm leading-relaxed resize-y"
          style={{ minHeight: `${(opts.rows || 2) * 24}px` }}
          value={value}
          onChange={(e) => set(e.target.value)}
          placeholder={opts?.placeholder}
        />
      ) : (
        <DialogInput value={value} onChange={set} placeholder={opts?.placeholder} />
      )}
    </DialogField>
  );

  const statusColor =
    form.currentStatus === "alive"
      ? "text-[var(--nv-success)]"
      : form.currentStatus === "dead"
        ? "text-[var(--nv-danger)]"
        : "text-[var(--nv-warning)]";

  return (
    <Modal
      open
      onClose={onClose}
      bare
      ariaLabel={isEdit ? `编辑角色：${character?.name ?? ""}` : "创建新角色"}
      panelClassName={isEdit ? "w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" : "max-w-md"}
      showClose
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--nv-border-2)] px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]">
            <Icon name={form.currentStatus === "dead" ? "skull" : "user"} size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-[var(--nv-text-primary)]">
              {isEdit ? `编辑角色：${character!.name}` : "创建新角色"}
            </h3>
            <p className="truncate text-xs text-[var(--nv-text-tertiary)]">
              {CHARACTER_ROLE_OPTIONS.find((o) => o.value === form.role)?.label} · <span className={statusColor}>{form.currentStatus}</span>
            </p>
          </div>
        </div>

        {isEdit && (
          <div className="flex items-center gap-2 shrink-0">
            {autofillMsg && (
              <span
                className={`hidden sm:inline-block max-w-[180px] truncate text-xs ${
                  autofillMsg.startsWith("补全完成")
                    ? "text-[var(--nv-success)]"
                    : autofillMsg.startsWith("补全失败")
                      ? "text-[var(--nv-danger)]"
                      : "text-[var(--nv-accent)]"
                }`}
                title={autofillMsg}
              >
                {autofillMsg}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutofill}
              disabled={autofilling}
              className="gap-1.5 border-[var(--nv-creative)]/30 bg-[var(--nv-creative-soft)] text-[var(--nv-creative)] hover:bg-[var(--nv-creative)]/20 hover:text-[var(--nv-creative)]"
            >
              {autofilling ? (
                <>
                  <Icon name="loader" size={14} className="animate-spin" /> AI 补全中…
                </>
              ) : (
                <>
                  <Icon name="sparkles" size={14} /> AI 填满
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {autofillMsg && (
        <div
          className={`mx-5 mt-3 rounded-lg border px-3 py-2 text-xs sm:hidden ${
            autofillMsg.startsWith("补全完成")
              ? "border-[var(--nv-success)]/30 bg-[var(--nv-success)]/10 text-[var(--nv-success)]"
              : autofillMsg.startsWith("补全失败")
                ? "border-[var(--nv-danger)]/30 bg-[var(--nv-danger)]/10 text-[var(--nv-danger)]"
                : "border-[var(--nv-accent)]/30 bg-[var(--nv-accent)]/10 text-[var(--nv-accent)]"
          }`}
        >
          {autofillMsg}
        </div>
      )}

      {isEdit ? (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 基本标识 */}
          <section className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4">
            <Collapse title="基本标识" icon="user" size="md">
              <div className="space-y-3 pt-2">
                {field("姓名", form.name, (v) => setForm({ ...form, name: v }))}
                {field("别名（逗号分隔）", form.aliases, (v) => setForm({ ...form, aliases: v }), { placeholder: "阿三, 剑圣, 老疯" })}
                <div className="grid grid-cols-3 gap-3">
                  <DialogField label="角色定位">{roleSelect}</DialogField>
                  {field("年龄", form.age, (v) => setForm({ ...form, age: v }), { placeholder: "25岁" })}
                  {field("性别", form.gender, (v) => setForm({ ...form, gender: v }), { placeholder: "男" })}
                </div>
                <DialogField label="当前状态">
                  <select
                    className="input-glass w-full rounded-lg px-3 py-2 text-sm"
                    value={form.currentStatus}
                    onChange={(e) => setForm({ ...form, currentStatus: e.target.value })}
                  >
                    <option value="alive">存活</option>
                    <option value="dead">死亡</option>
                    <option value="missing">失踪</option>
                    <option value="incapacitated">失去能力</option>
                  </select>
                </DialogField>
              </div>
            </Collapse>
          </section>

          {/* 外貌 */}
          <section className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4">
            <Collapse title="外貌" icon="eye" size="md">
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-3 gap-3">
                  {field("发型发色", form.appearanceHair, (v) => setForm({ ...form, appearanceHair: v }), { placeholder: "黑长直" })}
                  {field("眼睛", form.appearanceEyes, (v) => setForm({ ...form, appearanceEyes: v }), { placeholder: "丹凤眼" })}
                  {field("身高", form.appearanceHeight, (v) => setForm({ ...form, appearanceHeight: v }), { placeholder: "178cm" })}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {field("体型", form.appearanceBuild, (v) => setForm({ ...form, appearanceBuild: v }), { placeholder: "修长偏瘦" })}
                  {field("特殊印记", form.appearanceFeatures, (v) => setForm({ ...form, appearanceFeatures: v }), { placeholder: "左脸刀疤、虎口老茧" })}
                </div>
                {field("标志性着装", form.appearanceAttire, (v) => setForm({ ...form, appearanceAttire: v }), { placeholder: "黑色劲装, 腰间佩剑, 银质护腕" })}
              </div>
            </Collapse>
          </section>

          {/* 性格 */}
          <section className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4">
            <Collapse title="性格详析" icon="heart" size="md">
              <div className="space-y-3 pt-2">
                {field("性格特征", form.personality, (v) => setForm({ ...form, personality: v }), {
                  textarea: true,
                  rows: 5,
                  placeholder: "主导：外冷内热\n驱动：复仇执念\n矛盾：渴望认可但自尊极强\n习惯：咬指甲、自言自语\n面具：对外冷漠，对熟人话多",
                })}
                <div className="rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)]/50 p-3 space-y-3">
                  <p className="text-xs text-[var(--nv-text-muted)]">性格三层（可选 · 由浅入深帮 AI 写出立体人物，不与上文冲突，可只填其一）：</p>
                  {field("表层 · 对外展现", form.surface, (v) => setForm({ ...form, surface: v }), {
                    textarea: true,
                    rows: 2,
                    placeholder: "旁人眼中他是怎样的人？例如：温和有礼、慢条斯理、不轻易表态",
                  })}
                  {field("中层 · 日常互动", form.middle, (v) => setForm({ ...form, middle: v }), {
                    textarea: true,
                    rows: 2,
                    placeholder: "熟悉后才显露的一面？例如：其实很要强、怕被看轻、对亲近者格外护短",
                  })}
                  {field("内核 · 本质驱动", form.core, (v) => setForm({ ...form, core: v }), {
                    textarea: true,
                    rows: 2,
                    placeholder: "最深处本性/创伤/欲望？例如：童年被弃导致极度缺乏安全感，所有强势都是伪装",
                  })}
                </div>
              </div>
            </Collapse>
          </section>

          {/* 背景 */}
          <section className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4">
            <Collapse title="背景状态" icon="backpack" size="md">
              <div className="space-y-3 pt-2">
                {field("背景", form.background, (v) => setForm({ ...form, background: v }), {
                  textarea: true,
                  rows: 8,
                  placeholder: "1)所在位置与境遇：xxx\n2)当前短期目标：xxx\n3)长期欲望：xxx\n4)所持资源与限制：xxx\n5)卷入核心事件的方式与态度：xxx",
                })}
              </div>
            </Collapse>
          </section>

          {/* 故事线 */}
          <section className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4">
            <Collapse title="故事线" icon="book" size="md">
              <div className="space-y-3 pt-2">
                {field("故事线（该角色在全书主线中的起落）", form.storyLine, (v) => setForm({ ...form, storyLine: v }), {
                  textarea: true,
                  rows: 4,
                  placeholder: "登场的身份与处境 → 卷入主线冲突的方式 → 中途的关键转折 → 结局走向",
                })}
                <p className="text-xs text-[var(--nv-text-muted)]">
                  AI 填满会自动补全；写正文时这段会指导 AI 让角色始终沿着主线走，不会写着写着跑偏。
                </p>
              </div>
            </Collapse>
          </section>

          {/* 能力 */}
          <section className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4">
            <Collapse title="能力/功法" icon="sword" size="md">
              <div className="space-y-3 pt-2">
                {field("能力（每行一个，或用逗号分隔）", form.abilities, (v) => setForm({ ...form, abilities: v }), {
                  textarea: true,
                  rows: 4,
                  placeholder: "步频幻觉\n伪九号回撤\n节奏变奏\n逆足终结",
                })}
                {field("隐藏动机（每行一个，或用逗号分隔）", form.hiddenMotives, (v) => setForm({ ...form, hiddenMotives: v }), {
                  textarea: true,
                  rows: 3,
                  placeholder: "暗中寻找灭门仇人\n表面臣服实则谋反",
                })}
              </div>
            </Collapse>
          </section>

          {/* 时间线 */}
          <section className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4">
            <Collapse title="经历时间线" icon="calendar" size="md">
              <div className="space-y-3 pt-2">
                {field("时间线", form.timeline, (v) => setForm({ ...form, timeline: v }), {
                  textarea: true,
                  rows: 5,
                  placeholder: "0岁：出生于青云镇铁匠铺（故事开始前18年）\n12岁：拜入青云宗外门（故事开始前6年）\n16岁：觉醒剑灵血脉（故事开始前2年）\n18岁：故事起点——宗门大比夺冠（第一卷）",
                })}
                <p className="text-xs text-[var(--nv-text-muted)]">
                  设定角色人生关键时间点，防止AI把前期角色写成后期状态。age 填该事件时角色的年龄。
                </p>
              </div>
            </Collapse>
          </section>

          {/* 关系 */}
          <section className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4">
            <Collapse title="人际关系" icon="users" size="md">
              <div className="pt-2">
                <div className="mb-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRelView("list")}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      relView === "list"
                        ? "border-[var(--nv-primary)]/50 text-[var(--nv-primary)] bg-[var(--nv-primary-soft)]"
                        : "border-[var(--nv-border-2)] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]"
                    }`}
                  >
                    列表
                  </button>
                  <button
                    type="button"
                    onClick={() => setRelView("graph")}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      relView === "graph"
                        ? "border-[var(--nv-primary)]/50 text-[var(--nv-primary)] bg-[var(--nv-primary-soft)]"
                        : "border-[var(--nv-border-2)] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]"
                    }`}
                  >
                    关系图
                  </button>
                  <span className="text-[10px] text-[var(--nv-text-tertiary)] ml-1">
                    {relView === "list" ? "每行：人物名：关系：动态" : "节点可拖动，连线即关系"}
                  </span>
                </div>
                {relView === "list" ? (
                  field("关系", form.relationships, (v) => setForm({ ...form, relationships: v }), {
                    textarea: true,
                    rows: 4,
                    placeholder: "张三：师徒：亦师亦友\n李四：宿敌：互相欣赏但立场对立\n王五：暗恋对象：尚未表白",
                  })
                ) : (
                  <div className="rounded-xl border border-[var(--nv-border-2)] overflow-hidden">
                    {allCharacters && allCharacters.length > 0 ? (
                      <div className="h-72 overflow-auto">
                        <RelationshipGraph
                          characters={allCharacters as any}
                          projectId={projectId}
                          onEditCharacter={onEditCharacter}
                          storyNodes={storyNodes}
                          onSelectChapter={onSelectChapter}
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--nv-text-muted)] p-4">
                        还没有其他角色。保存本卡或新建更多角色后，这里会以关系图展示角色间的联系。
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Collapse>
          </section>

          {/* 对话风格 */}
          <section className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4">
            <Collapse title="对话风格" icon="messageCircle" size="md">
              <div className="space-y-3 pt-2">
                {field("风格描述", form.dialogueDesc, (v) => setForm({ ...form, dialogueDesc: v }), { placeholder: "冷漠寡言，但关键时字字千钧" })}
                {field("典型台词（每行一句）", form.dialogueExamples, (v) => setForm({ ...form, dialogueExamples: v }), {
                  textarea: true,
                  rows: 3,
                  placeholder: "哼，就这？\n我欠你一条命。",
                })}
                {field("用词特点（逗号分隔）", form.dialogueVocab, (v) => setForm({ ...form, dialogueVocab: v }), { placeholder: "古风, 简洁, 偶带讽刺" })}
                {field("句式模式（每行一种）", form.dialoguePatterns, (v) => setForm({ ...form, dialoguePatterns: v }), {
                  textarea: true,
                  rows: 3,
                  placeholder: "多用反问句\n主语常省略\n偏爱四字短语",
                })}
              </div>
            </Collapse>
          </section>

          {/* 弧光 */}
          <section className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4">
            <Collapse title="人物弧光" icon="sparkles" size="md">
              <div className="space-y-3 pt-2">
                {field("弧光进度", form.arcProgress, (v) => setForm({ ...form, arcProgress: v }), {
                  textarea: true,
                  rows: 3,
                  placeholder: "信念动摇触发点：xxx\n蜕变方向：xxx→xxx\n堕落风险：xxx",
                })}
              </div>
            </Collapse>
          </section>
        </div>
      ) : (
        <div className="space-y-4 px-5 py-4">
          <section className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-4 space-y-3">
            <DialogField label="姓名" required>
              <DialogInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoFocus />
            </DialogField>
            <DialogField label="角色定位">{roleSelect}</DialogField>
            <DialogField label="性格特征（逗号分隔）">
              <textarea
                className="input-glass w-full rounded-lg px-3 py-2 text-sm min-h-[100px] resize-y leading-relaxed"
                value={form.personality}
                onChange={(e) => setForm({ ...form, personality: e.target.value })}
                placeholder={`主导：外冷内热\n驱动：复仇执念\n矛盾：渴望认可但自尊极强\n习惯：咬指甲、自言自语\n面具：对外冷漠`}
              />
            </DialogField>
          </section>
        </div>
      )}

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--nv-border-2)] px-5 py-3">
        <Button variant="outline" onClick={onClose} className="border-[var(--nv-border-2)]">
          取消
        </Button>
        <Button onClick={handleSave} className="btn-primary gap-1.5" disabled={!form.name.trim()}>
          <Icon name="save" size={15} /> {isEdit ? "保存" : "创建"}
        </Button>
      </div>
    </Modal>
  );
}
