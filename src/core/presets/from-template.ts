// 本地模板 ↔ 创意工坊 的桥接层：把仓库根 templates/*.md 的填空模板
// 解析成「预设草稿」，从而可以一键加入市集——加入后即可注入、撤销、自配置，
// 与创意工坊里的其它预设完全同权。

export interface PresetDraft {
  type: string;
  title: string;
  description: string;
  tags: string[];
  content: Record<string, unknown>;
}

interface Section {
  heading: string;
  body: string;
}

/** 提取 `>` 引用块作为描述 */
function extractDescription(md: string): string {
  const quotes: string[] = [];
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith(">")) continue;
    const text = line.replace(/^>\s?/, "").trim();
    if (text) quotes.push(text);
  }
  return quotes.join(" ").slice(0, 200);
}

/** 按 `## ` 切分小节 */
function extractSections(md: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      current = { heading: line.replace(/^##\s+/, "").trim(), body: "" };
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  if (current) sections.push(current);
  return sections;
}

/** 提取 `- 标签：值` 列表项；无冒号则整行当标签、值为空 */
function extractList(body: string): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("- ")) continue;
    const text = line.replace(/^-\s+/, "").trim();
    const idx = text.indexOf("：");
    if (idx >= 0) items.push({ label: text.slice(0, idx).trim(), value: text.slice(idx + 1).trim() });
    else items.push({ label: text, value: "" });
  }
  return items;
}

function findSection(sections: Section[], keyword: string): Section | undefined {
  return sections.find((s) => s.heading.includes(keyword));
}

function sectionText(s: Section | undefined): string {
  if (!s) return "";
  return s.body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * 解析模板文件。无法识别（文件名不含风格卡/角色卡/大纲）时返回 null，调用方跳过即可。
 * 返回的 content 保证能通过 validatePresetContent，因此一定可落库、可套用。
 */
export function parseTemplateToDraft(filename: string, markdown: string): PresetDraft | null {
  const description = extractDescription(markdown);
  const sections = extractSections(markdown);
  const h1 = markdown.split(/\r?\n/).find((l) => l.trim().startsWith("# ")) || "";
  const baseTitle = h1.replace(/^#\s+/, "").replace(/[《》]/g, "").trim();

  // ── 风格卡模板 → style 预设 ──
  if (filename.includes("风格卡")) {
    const kwText = sectionText(findSection(sections, "文风关键词")).replace(/^例[:：]\s*/, "");
    const povItems = extractList(findSection(sections, "叙事视角")?.body || "");
    const povRaw = (povItems.find((i) => i.label.includes("视角"))?.value || "").trim();
    let povType = "third_person_limited";
    if (povRaw.includes("第一")) povType = "first_person";
    else if (povRaw.includes("全知")) povType = "third_person_omniscient";

    const avoidPatterns = extractList(findSection(sections, "禁用写法")?.body || "")
      .map((i) => (i.value || i.label).replace(/^避免[:：]\s*/, "").trim())
      .filter(Boolean);

    return {
      type: "style",
      title: baseTitle || "风格卡模板",
      description: description || "由本地模板生成的文风预设，可自行配置后套用到项目。",
      tags: ["本地模板", "文风"],
      content: {
        styleDescription: kwText || "（待填写文风关键词）",
        povType,
        // 模板里的节奏/情绪/禁用写法作为补充字段随预设保存，套用时一并带入
        rhythmNotes: sectionText(findSection(sections, "节奏偏好")),
        emotionNotes: sectionText(findSection(sections, "情绪曲线")),
        avoidPatterns,
      },
    };
  }

  // ── 角色卡预设 → character 预设 ──
  if (filename.includes("角色卡")) {
    const basicItems = extractList(findSection(sections, "基础")?.body || "");
    const pick = (kw: string) => basicItems.find((i) => i.label.includes(kw))?.value || "";
    // 模板里姓名常为空，给一个可注入的占位名（character 类型要求 name 非空）
    const name = pick("姓名") || "模板角色·待命名";

    const pItems = extractList(findSection(sections, "性格")?.body || "");
    const personality: Record<string, string> = {};
    for (const key of ["表层", "里层", "核层"]) {
      personality[key] = pItems.find((i) => i.label.includes(key))?.value || "";
    }

    const background = [
      sectionText(findSection(sections, "动机与恐惧")),
      sectionText(findSection(sections, "人物弧光")),
    ]
      .filter(Boolean)
      .join("\n");

    return {
      type: "character",
      title: name,
      description: description || `由本地模板生成的角色预设（${name}），可自行配置后加入项目。`,
      tags: ["本地模板", "角色"],
      content: {
        name,
        role: "supporting",
        background,
        personality,
        appearance: { description: sectionText(findSection(sections, "外貌")) },
        relations: sectionText(findSection(sections, "关系网")),
        speechHints: sectionText(findSection(sections, "口头禅")),
        profile: {
          gender: pick("性别"),
          age: pick("年龄"),
          occupation: pick("身份"),
          faction: pick("所属势力"),
        },
      },
    };
  }

  // ── 大纲模板 → story_progression 预设（各节转成剧情推进词条）──
  if (filename.includes("大纲")) {
    const entries = sections
      .filter((s) => !s.heading.includes("角色初稿"))
      .map((s) => ({
        title: s.heading,
        content: sectionText(s) || "（待填写）",
        keys: [s.heading],
        depth: 3,
      }));

    // 兜底：极端情况下（模板被改坏没有小节）也保证 entries 非空，否则无法入库
    const safeEntries = entries.length
      ? entries
      : [{ title: baseTitle || "大纲模板", content: markdown.slice(0, 2000), keys: [], depth: 3 }];

    return {
      type: "story_progression",
      title: baseTitle || "大纲模板",
      description: description || "由本地模板生成的剧情推进预设，套用后各节会成为项目的剧情推进词条。",
      tags: ["本地模板", "大纲"],
      content: { entries: safeEntries },
    };
  }

  return null;
}
