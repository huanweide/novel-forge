"use client";

import { useState, useRef } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { DialogOverlay, DialogField, DialogInput } from "./DialogUI";
import type { CharacterData } from "./types";
import { toastError } from "@/components/ui/toast";

function toText(p: unknown) {
  if (typeof p === "object" && p !== null && !Array.isArray(p)) {
    const o = p as Record<string, unknown>;
    const lines: string[] = [];
    if (o.dominant) lines.push(`主导：${o.dominant}`);
    if (o.drive) lines.push(`驱动：${o.drive}`);
    if (o.contradiction) lines.push(`矛盾：${o.contradiction}`);
    if (Array.isArray(o.habits) && o.habits.length) lines.push(`习惯：${(o.habits as string[]).join("、")}`);
    if (o.socialMask) lines.push(`面具：${o.socialMask}`);
    return lines.join("\n") || "";
  }
  if (Array.isArray(p)) return (p as string[]).join("、");
  return String(p || "");
}

function fromText(text: string): Record<string, unknown> {
  const lines = text.split("\n");
  let dominant = "", drive = "", contradiction = "", habits: string[] = [], socialMask = "";
  for (const line of lines) {
    if (line.startsWith("主导：") || line.startsWith("主导:")) dominant = line.replace(/^主导[：:]\s*/, "").trim();
    else if (line.startsWith("驱动：") || line.startsWith("驱动:")) drive = line.replace(/^驱动[：:]\s*/, "").trim();
    else if (line.startsWith("矛盾：") || line.startsWith("矛盾:")) contradiction = line.replace(/^矛盾[：:]\s*/, "").trim();
    else if (line.startsWith("习惯：") || line.startsWith("习惯:")) habits = line.replace(/^习惯[：:]\s*/, "").split(/[,，、]/).map(s => s.trim()).filter(Boolean);
    else if (line.startsWith("面具：") || line.startsWith("面具:")) socialMask = line.replace(/^面具[：:]\s*/, "").trim();
    else if (line.trim()) { if (!dominant) dominant = line.trim(); else habits.push(line.trim()); }
  }
  return { dominant, drive, contradiction, habits, socialMask };
}

function timelineToText(tl?: { age: number; event: string; era: string }[]) {
  if (!tl || !tl.length) return "";
  return tl.map(t => `${t.age}岁：${t.event}（${t.era}）`).join("\n");
}

function textToTimeline(text: string): { age: number; event: string; era: string }[] {
  return text.split("\n").filter(Boolean).map(line => {
    const m = line.match(/^(\d+)\s*岁\s*[：:]\s*(.+?)\s*[（(]([^)）]*)[)）]\s*$/);
    if (m) return { age: parseInt(m[1]), event: m[2].trim(), era: m[3].trim() };
    const m2 = line.match(/^(\d+)\s*岁\s*[：:]\s*(.+)$/);
    if (m2) return { age: parseInt(m2[1]), event: m2[2].trim(), era: "" };
    return { age: 0, event: line.trim(), era: "" };
  });
}

export function CharacterEditDialog({
  character,
  projectId,
  onClose,
  onSave,
}: {
  character: CharacterData;
  projectId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const app = (character.appearance || {}) as Record<string, unknown>;
  const ds = (character.dialogueStyle || {}) as Record<string, unknown>;
  const rels = Array.isArray(character.relationships) ? character.relationships.map((r: any) =>
    [r.targetName, r.relation, r.dynamic].filter(Boolean).join("：")
  ).join("\n") : "";

  const [form, setForm] = useState({
    name: character.name || "",
    aliases: (character.aliases || []).join("、"),
    role: character.role || "supporting",
    age: character.age || "",
    gender: character.gender || "",
    appearanceHair: String(app.hair || ""),
    appearanceEyes: String(app.eyes || ""),
    appearanceHeight: String(app.height || ""),
    appearanceBuild: String(app.build || ""),
    appearanceFeatures: String(app.features || ""),
    appearanceAttire: String(app.attire || ""),
    personality: toText(character.personality),
    surface: String((character.personality as Record<string, unknown> | undefined)?.surface || ""),
    middle: String((character.personality as Record<string, unknown> | undefined)?.middle || ""),
    core: String((character.personality as Record<string, unknown> | undefined)?.core || ""),
    background: character.background || "",
    abilities: (character.abilities || []).join("、"),
    hiddenMotives: (character.hiddenMotives || []).join("、"),
    relationships: rels,
    dialogueDesc: String(ds.description || ""),
    dialogueExamples: (Array.isArray(ds.examples) ? ds.examples as string[] : []).join("\n"),
    dialogueVocab: (Array.isArray(ds.vocabulary) ? ds.vocabulary as string[] : []).join("、"),
    dialoguePatterns: (Array.isArray(ds.speechPatterns) ? ds.speechPatterns as string[] : []).join("\n"),
    timeline: timelineToText(character.timeline),
    arcProgress: character.arcProgress || "",
    currentStatus: character.currentStatus || "alive",
  });

  const [autofilling, setAutofilling] = useState(false);
  const [autofillMsg, setAutofillMsg] = useState("");

  const overlayRef = useRef<HTMLDivElement>(null);
  useFocusTrap(overlayRef, true, onClose);

  const handleAutofill = async () => {
    setAutofilling(true);
    setAutofillMsg("AI正在补全...");
    try {
      const res = await fetch(`/api/characters/${character.id}/autofill`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "补全失败");

      // 用返回的数据更新表单
      const updated = data.character;
      if (updated) {
        const ua = (updated.appearance || {}) as Record<string, unknown>;
        const ud = (updated.dialogueStyle || {}) as Record<string, unknown>;
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
          surface: form.surface,
          middle: form.middle,
          core: form.core,
          background: updated.background || form.background,
          abilities: (updated.abilities || form.abilities.split(/[,，、\n]+/).filter(Boolean)).join("、"),
          hiddenMotives: (updated.hiddenMotives || form.hiddenMotives.split(/[,，、\n]+/).filter(Boolean)).join("、"),
          relationships: form.relationships,
          dialogueDesc: String(ud.description || form.dialogueDesc),
          dialogueExamples: (Array.isArray(ud.examples) ? ud.examples as string[] : form.dialogueExamples.split("\n").filter(Boolean)).join("\n"),
          dialogueVocab: (Array.isArray(ud.vocabulary) ? ud.vocabulary as string[] : form.dialogueVocab.split(/[,，、]/).filter(Boolean)).join("、"),
          dialoguePatterns: (Array.isArray(ud.speechPatterns) ? ud.speechPatterns as string[] : form.dialoguePatterns.split("\n").filter(Boolean)).join("\n"),
          timeline: form.timeline,
          arcProgress: updated.arcProgress || form.arcProgress,
          currentStatus: updated.currentStatus || form.currentStatus,
        });
      }
      setAutofillMsg(`补全完成：${data.message || ""}`);
    } catch (err: any) {
      setAutofillMsg(`补全失败：${err.message}`);
    } finally {
      setAutofilling(false);
    }
  };

  const handleSave = async () => {
    const relLines = form.relationships.split("\n").filter(Boolean);
    const relationships = relLines.map(line => {
      const parts = line.split(/[：:]/);
      return { targetName: parts[0]?.trim() || "", relation: parts[1]?.trim() || "", dynamic: parts[2]?.trim() || "" };
    });
    try {
      const res = await fetch(`/api/characters/${character.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          aliases: form.aliases.split(/[,，、]/).map(s => s.trim()).filter(Boolean),
          role: form.role,
          age: form.age,
          gender: form.gender,
          appearance: { hair: form.appearanceHair, eyes: form.appearanceEyes, height: form.appearanceHeight, build: form.appearanceBuild, features: form.appearanceFeatures, attire: form.appearanceAttire },
          personality: { ...fromText(form.personality), surface: form.surface, middle: form.middle, core: form.core },
          background: form.background,
          abilities: form.abilities.split(/[,，、\n]+/).map(s => s.trim()).filter(Boolean),
          hiddenMotives: form.hiddenMotives.split(/[,，、\n]+/).map(s => s.trim()).filter(Boolean),
          relationships,
          dialogueStyle: { description: form.dialogueDesc, examples: form.dialogueExamples.split("\n").filter(Boolean), vocabulary: form.dialogueVocab.split(/[,，、]/).map(s => s.trim()).filter(Boolean), speechPatterns: form.dialoguePatterns.split("\n").filter(Boolean) },
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
    } catch (err) {
      toastError("角色保存失败：" + (err instanceof Error ? err.message : "网络错误"));
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, opts?: { placeholder?: string; textarea?: boolean; rows?: number }) =>
    <DialogField label={label}>
      {opts?.textarea
        ? <textarea className="input-glass w-full rounded px-3 py-2 text-sm resize-y" style={{ minHeight: `${(opts.rows || 2) * 24}px` }} value={value} onChange={e => set(e.target.value)} placeholder={opts?.placeholder} />
        : <DialogInput value={value} onChange={set} placeholder={opts?.placeholder} />}
    </DialogField>;

  return (
    <div ref={overlayRef} tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="surface-floating rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-[var(--nv-border-2)] shrink-0 flex items-center justify-between">
          <h3 className="text-lg font-semibold">编辑角色：{character.name}</h3>
          <div className="flex items-center gap-2">
            {autofillMsg && (
              <span className={`text-xs ${autofillMsg.startsWith("补全完成") ? "text-[var(--nv-success)]" : autofillMsg.startsWith("补全失败") ? "text-[var(--nv-danger)]" : "text-[var(--nv-accent)]"}`}>
                {autofillMsg}
              </span>
            )}
            <button
              onClick={handleAutofill}
              disabled={autofilling}
              className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                autofilling
                  ? "bg-[var(--nv-surface-3)] text-[var(--nv-text-tertiary)] cursor-not-allowed"
                  : "bg-[var(--nv-creative-soft)] text-[var(--nv-creative)] hover:bg-[var(--nv-creative)]/20 border border-[var(--nv-creative)]/30"
              }`}
            >
              {autofilling ? <><Icon name="loader" size={12} className="animate-spin" /> AI补全中...</> : <><Icon name="bot" size={12} /> AI填满</>}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 基本标识 */}
          <div className="border-b border-[var(--nv-border-2)] pb-3">
            <h4 className="text-xs font-semibold text-[var(--nv-text-tertiary)] mb-2 uppercase tracking-wider">基本标识</h4>
            <div className="space-y-2">
              {field("姓名", form.name, v => setForm({ ...form, name: v }))}
              {field("别名（逗号分隔）", form.aliases, v => setForm({ ...form, aliases: v }), { placeholder: "阿三, 剑圣, 老疯" })}
              <div className="grid grid-cols-3 gap-2">
                <DialogField label="角色定位">
                  <select className="input-glass w-full rounded px-3 py-2 text-sm" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                    <option value="protagonist">主角</option>
                    <option value="antagonist">反派</option>
                    <option value="supporting">配角</option>
                    <option value="mentor">导师</option>
                    <option value="love_interest">恋爱对象</option>
                    <option value="background">背景角色</option>
                  </select>
                </DialogField>
                {field("年龄", form.age, v => setForm({ ...form, age: v }), { placeholder: "25岁" })}
                {field("性别", form.gender, v => setForm({ ...form, gender: v }), { placeholder: "男" })}
              </div>
              <DialogField label="当前状态">
                <select className="input-glass w-full rounded px-3 py-2 text-sm" value={form.currentStatus} onChange={e => setForm({ ...form, currentStatus: e.target.value })}>
                  <option value="alive">存活</option>
                  <option value="dead">死亡</option>
                  <option value="missing">失踪</option>
                  <option value="incapacitated">失去能力</option>
                </select>
              </DialogField>
            </div>
          </div>
          {/* 外貌 */}
          <div className="border-b border-[var(--nv-border-2)] pb-3">
            <h4 className="text-xs font-semibold text-[var(--nv-text-tertiary)] mb-2 uppercase tracking-wider">外貌</h4>
            <div className="grid grid-cols-3 gap-2">
              {field("发型发色", form.appearanceHair, v => setForm({ ...form, appearanceHair: v }), { placeholder: "黑长直" })}
              {field("眼睛", form.appearanceEyes, v => setForm({ ...form, appearanceEyes: v }), { placeholder: "丹凤眼" })}
              {field("身高", form.appearanceHeight, v => setForm({ ...form, appearanceHeight: v }), { placeholder: "178cm" })}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {field("体型", form.appearanceBuild, v => setForm({ ...form, appearanceBuild: v }), { placeholder: "修长偏瘦" })}
              {field("特殊印记", form.appearanceFeatures, v => setForm({ ...form, appearanceFeatures: v }), { placeholder: "左脸刀疤、虎口老茧" })}
            </div>
            <div className="mt-2">
              {field("标志性着装", form.appearanceAttire, v => setForm({ ...form, appearanceAttire: v }), { placeholder: "黑色劲装, 腰间佩剑, 银质护腕" })}
            </div>
          </div>
          {/* 性格 */}
          <div className="border-b border-[var(--nv-border-2)] pb-3">
            <h4 className="text-xs font-semibold text-[var(--nv-text-tertiary)] mb-2 uppercase tracking-wider">性格详析</h4>
            {field("性格特征", form.personality, v => setForm({ ...form, personality: v }), { textarea: true, rows: 5, placeholder: "主导：外冷内热\n驱动：复仇执念\n矛盾：渴望认可但自尊极强\n习惯：咬指甲、自言自语\n面具：对外冷漠，对熟人话多" })}
            <div className="mt-3 space-y-2">
              <p className="text-xs text-[var(--nv-text-muted)]">性格三层（可选 · 由浅入深帮 AI 写出立体人物，不与上文冲突，可只填其一）：</p>
              {field("表层 · 对外展现", form.surface, v => setForm({ ...form, surface: v }), { textarea: true, rows: 2, placeholder: "旁人眼中他是怎样的人？例如：温和有礼、慢条斯理、不轻易表态" })}
              {field("中层 · 日常互动", form.middle, v => setForm({ ...form, middle: v }), { textarea: true, rows: 2, placeholder: "熟悉后才显露的一面？例如：其实很要强、怕被看轻、对亲近者格外护短" })}
              {field("内核 · 本质驱动", form.core, v => setForm({ ...form, core: v }), { textarea: true, rows: 2, placeholder: "最深处本性/创伤/欲望？例如：童年被弃导致极度缺乏安全感，所有强势都是伪装" })}
            </div>
          </div>
          {/* 背景 */}
          <div className="border-b border-[var(--nv-border-2)] pb-3">
            <h4 className="text-xs font-semibold text-[var(--nv-text-tertiary)] mb-2 uppercase tracking-wider">背景状态</h4>
            {field("背景", form.background, v => setForm({ ...form, background: v }), { textarea: true, rows: 16, placeholder: "1)所在位置与境遇：xxx\n2)当前短期目标：xxx\n3)长期欲望：xxx\n4)所持资源与限制：xxx\n5)卷入核心事件的方式与态度：xxx" })}
          </div>
          {/* 能力 */}
          <div className="border-b border-[var(--nv-border-2)] pb-3">
            <h4 className="text-xs font-semibold text-[var(--nv-text-tertiary)] mb-2 uppercase tracking-wider">能力/功法</h4>
            {field("能力（每行一个，或用逗号分隔）", form.abilities, v => setForm({ ...form, abilities: v }), { textarea: true, rows: 6, placeholder: "步频幻觉\n伪九号回撤\n节奏变奏\n逆足终结" })}
            {field("隐藏动机（每行一个，或用逗号分隔）", form.hiddenMotives, v => setForm({ ...form, hiddenMotives: v }), { textarea: true, rows: 3, placeholder: "暗中寻找灭门仇人\n表面臣服实则谋反" })}
          </div>
          {/* 时间线 */}
          <div className="border-b border-[var(--nv-border-2)] pb-3">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--nv-text-tertiary)] mb-2 uppercase tracking-wider"><Icon name="calendar" size={13} /> 经历时间线（防OOC·每行：X岁：事件（时间参照））</h4>
            {field("时间线", form.timeline, v => setForm({ ...form, timeline: v }), { textarea: true, rows: 5, placeholder: "0岁：出生于青云镇铁匠铺（故事开始前18年）\n12岁：拜入青云宗外门（故事开始前6年）\n16岁：觉醒剑灵血脉（故事开始前2年）\n18岁：故事起点——宗门大比夺冠（第一卷）" })}
            <p className="text-xs text-[var(--nv-text-muted)] mt-1">设定角色人生关键时间点，防止AI把前期角色写成后期状态。age 填该事件时角色的年龄。</p>
          </div>
          {/* 关系 */}
          <div className="border-b border-[var(--nv-border-2)] pb-3">
            <h4 className="text-xs font-semibold text-[var(--nv-text-tertiary)] mb-2 uppercase tracking-wider">人际关系（每行：人物名：关系：动态）</h4>
            {field("关系", form.relationships, v => setForm({ ...form, relationships: v }), { textarea: true, rows: 3, placeholder: "张三：师徒：亦师亦友\n李四：宿敌：互相欣赏但立场对立\n王五：暗恋对象：尚未表白" })}
          </div>
          {/* 对话风格 */}
          <div className="border-b border-[var(--nv-border-2)] pb-3">
            <h4 className="text-xs font-semibold text-[var(--nv-text-tertiary)] mb-2 uppercase tracking-wider">对话风格</h4>
            {field("风格描述", form.dialogueDesc, v => setForm({ ...form, dialogueDesc: v }), { placeholder: "冷漠寡言，但关键时字字千钧" })}
            {field("典型台词（每行一句）", form.dialogueExamples, v => setForm({ ...form, dialogueExamples: v }), { textarea: true, rows: 2, placeholder: "哼，就这？\n我欠你一条命。" })}
            {field("用词特点（逗号分隔）", form.dialogueVocab, v => setForm({ ...form, dialogueVocab: v }), { placeholder: "古风, 简洁, 偶带讽刺" })}
            {field("句式模式（每行一种）", form.dialoguePatterns, v => setForm({ ...form, dialoguePatterns: v }), { textarea: true, rows: 2, placeholder: "多用反问句\n主语常省略\n偏爱四字短语" })}
          </div>
          {/* 弧光 */}
          <div className="pb-2">
            <h4 className="text-xs font-semibold text-[var(--nv-text-tertiary)] mb-2 uppercase tracking-wider">人物弧光预登记</h4>
            {field("弧光进度", form.arcProgress, v => setForm({ ...form, arcProgress: v }), { textarea: true, rows: 2, placeholder: "信念动摇触发点：xxx\n蜕变方向：xxx→xxx\n堕落风险：xxx" })}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--nv-border-2)] shrink-0">
          <Button variant="outline" onClick={onClose} className="border-[var(--nv-border-2)]">取消</Button>
          <Button onClick={handleSave} className="btn-primary">保存</Button>
        </div>
      </div>
    </div>
  );
}
