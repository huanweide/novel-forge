// 预设 content 结构校验。
// 原系统 content 是裸 Json，字段拼错也能存进去，直到真正套用才暴露（甚至静默无效果）。
// 这里在「上传 / 编辑 / 自配置」的入口就校验结构，把错误挡在保存之前。

import { LLM_CONFIG_KEYS } from "./llm-config";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function nonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

const STYLE_NUM_FIELDS = [
  "avgSentenceLength",
  "shortSentenceRatio",
  "longSentenceRatio",
  "dialogueRatio",
  "descriptionRatio",
  "actionRatio",
  "innerThoughtRatio",
];

export function validatePresetContent(type: string, content: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObj(content)) {
    return { ok: false, errors: ["content 必须是对象"], warnings };
  }

  switch (type) {
    case "table_template": {
      const tables = content.tables;
      if (!Array.isArray(tables) || tables.length === 0) {
        errors.push("tables 必须是非空数组");
        break;
      }
      tables.forEach((t, i) => {
        if (!isObj(t)) {
          errors.push(`tables[${i}] 必须是对象`);
          return;
        }
        if (!nonEmptyString(t.name)) errors.push(`tables[${i}].name 不能为空`);
        if (!nonEmptyString(t.key)) errors.push(`tables[${i}].key 不能为空`);
        if (t.columns !== undefined && !Array.isArray(t.columns)) errors.push(`tables[${i}].columns 必须是数组`);
        if (t.rows !== undefined && !Array.isArray(t.rows)) errors.push(`tables[${i}].rows 必须是数组`);
        if (!Array.isArray(t.rows) || t.rows.length === 0) warnings.push(`表「${String(t.name || i)}」暂无数据行`);
      });
      break;
    }

    case "style": {
      if (Object.keys(content).length === 0) {
        errors.push("内容为空：请至少填写 styleDescription 或一个文风参数");
        break;
      }
      for (const f of STYLE_NUM_FIELDS) {
        const v = content[f];
        if (v === undefined) continue;
        if (typeof v !== "number" || Number.isNaN(v) || v < 0) {
          errors.push(`${f} 必须是非负数`);
        } else if (f.endsWith("Ratio") && v > 1) {
          warnings.push(`${f}=${v} 超出 0~1 区间，建议填 0~1 的比例值`);
        }
      }
      if (content.povType !== undefined && typeof content.povType !== "string") errors.push("povType 必须是字符串");
      if (content.styleDescription !== undefined && typeof content.styleDescription !== "string") {
        errors.push("styleDescription 必须是字符串");
      }
      if (content.tonalMarkers !== undefined && !isObj(content.tonalMarkers)) errors.push("tonalMarkers 必须是对象");
      if (content.lexicalFeatures !== undefined && !isObj(content.lexicalFeatures)) {
        errors.push("lexicalFeatures 必须是对象");
      }
      if (!nonEmptyString(content.styleDescription)) warnings.push("未填写 styleDescription，套用后文风描述为空");
      break;
    }

    case "worldview":
    case "story_progression":
    case "lorebook": {
      const entries = content.entries;
      if (!Array.isArray(entries) || entries.length === 0) {
        errors.push("entries 必须是非空数组");
        break;
      }
      entries.forEach((e, i) => {
        if (!isObj(e)) {
          errors.push(`entries[${i}] 必须是对象`);
          return;
        }
        if (!nonEmptyString(e.title)) errors.push(`entries[${i}].title 不能为空`);
        if (e.content !== undefined && typeof e.content !== "string") errors.push(`entries[${i}].content 必须是字符串`);
        if (e.keys !== undefined && !Array.isArray(e.keys)) errors.push(`entries[${i}].keys 必须是数组`);
        if (e.depth !== undefined) {
          const d = e.depth;
          if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 4) {
            errors.push(`entries[${i}].depth 必须是 0~4 的整数`);
          }
        }
      });
      break;
    }

    case "character": {
      if (!nonEmptyString(content.name)) errors.push("name 不能为空");
      if (content.role !== undefined && typeof content.role !== "string") errors.push("role 必须是字符串");
      if (content.background !== undefined && typeof content.background !== "string") {
        errors.push("background 必须是字符串");
      }
      if (content.personality !== undefined && !isObj(content.personality)) errors.push("personality 必须是对象");
      if (content.appearance !== undefined && !isObj(content.appearance)) errors.push("appearance 必须是对象");
      if (content.tags !== undefined && !Array.isArray(content.tags)) errors.push("tags 必须是数组");
      break;
    }

    case "regex": {
      const rules = content.rules;
      if (!Array.isArray(rules) || rules.length === 0) {
        errors.push("rules 必须是非空数组");
        break;
      }
      rules.forEach((r, i) => {
        if (!isObj(r)) {
          errors.push(`rules[${i}] 必须是对象`);
          return;
        }
        if (!nonEmptyString(r.name)) errors.push(`rules[${i}].name 不能为空`);
        if (!nonEmptyString(r.pattern)) errors.push(`rules[${i}].pattern 不能为空`);
        if (r.flags !== undefined && typeof r.flags !== "string") errors.push(`rules[${i}].flags 必须是字符串`);
      });
      break;
    }

    case "api_config": {
      const keys = Object.keys(content);
      const valid = keys.filter((k) => LLM_CONFIG_KEYS.has(k));
      const unknown = keys.filter((k) => !LLM_CONFIG_KEYS.has(k));
      if (valid.length === 0) {
        errors.push(`没有白名单内的有效配置项（可用键示例：${[...LLM_CONFIG_KEYS].slice(0, 8).join("、")}…）`);
      }
      if (unknown.length) warnings.push(`以下键不在白名单内，套用后会被忽略：${unknown.join("、")}`);
      break;
    }

    default:
      errors.push(`未知预设类型：${String(type)}`);
  }

  return { ok: errors.length === 0, errors, warnings };
}
