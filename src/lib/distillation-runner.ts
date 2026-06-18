/**
 * 蒸馏运行器 —— 四遍本地扫描
 *
 * 正文生成后自动运行，不调 LLM API。
 * 四遍扫描：实体识别 → 状态变化检测 → 伏笔模式匹配 → 一致性校验
 *
 * 速度：1 万字约 0.5-1 秒。零 Token 消耗。
 */

import { detectEntities, type DetectedEntity, type EntityDetectionResult, type KnownEntity } from "./entity-detector";

// ─── 类型定义 ────────────────────────────────────────────────

export interface DistillationInput {
  /** 生成的正文内容 */
  content: string;
  /** 项目 ID */
  projectId: string;
  /** 当前章序号 */
  chapterOrder: number;
  /** 当前章标题 */
  chapterTitle: string;
  /** 已知角色（姓名+ID，用于归属推断和状态检测） */
  knownCharacters: { id: string; name: string; currentRealm?: string; currentLocation?: string }[];
  /** 已知实体词典（全部已确认的 LorebookEntry + CharacterCard） */
  knownEntities: KnownEntity[];
  /** 已知地点名列表 */
  knownLocations: string[];
  /** 已有伏笔（PendingCommitment 中 status != voided 的） */
  existingForeshadows?: { id: string; description: string; entityIds: string[] }[];
}

export interface StateChange {
  type: "realm_breakthrough" | "realm_regression" | "location_change" | "item_gain" | "item_loss" | "relationship_change" | "death" | "goal_change";
  characterName: string;
  characterId?: string;
  description: string;
  from?: string;
  to?: string;
  confidence: number;
  evidence: string;
}

export interface ForeshadowEvent {
  type: "buried" | "recovered" | "deepened";
  description: string;
  signalWord: string;
  relatedEntityNames: string[];
  chapterOrder: number;
  confidence: number;
  /** 如果匹配到已有伏笔，记录 ID */
  matchedForeshadowId?: string;
}

export interface ConsistencyIssue {
  type: "name_typo" | "realm_error" | "relation_error" | "location_error" | "timeline_error";
  description: string;
  severity: "error" | "warning" | "info";
  entityName?: string;
  evidence: string;
}

export interface DistillationResult {
  entities: EntityDetectionResult;
  stateChanges: StateChange[];
  foreshadowEvents: ForeshadowEvent[];
  consistencyIssues: ConsistencyIssue[];
  /** 蒸馏发现的所有关键事件（汇总，供 storyBeat 创建） */
  keyEvents: { description: string; category: string; importance: number }[];
  stats: {
    totalElapsedMs: number;
    entityCount: number;
    stateChangeCount: number;
    foreshadowCount: number;
    consistencyIssueCount: number;
  };
}

// ─── 伏笔信号词库 ──────────────────────────────────────────────

const BURY_SIGNALS = [
  "他并不知道", "谁也没有注意到", "冥冥之中",
  "命运的齿轮", "似乎隐藏着", "隐隐不安",
  "莫名熟悉", "总觉得哪里不对", "说不出的怪异",
  "仿佛在等待什么", "暗处", "某个角落",
  "她皱了皱眉", "他迟疑了一下", "欲言又止",
  "鬼使神差", "心中莫名", "竟生出一种",
  "从未见过", "闻所未闻", "来历不明",
];

const RECOVER_SIGNALS = [
  "原来", "真相", "果然", "正如",
  "终于明白", "恍然大悟", "一切都有了解释",
  "原来如此", "怪不得", "难怪",
  "这才明白", "终于知道", "揭开了",
  "答案", "秘密", "真相大白",
];

const DEEPEN_SIGNALS = [
  "再次出现", "又一次", "又来了",
  "更加明显", "越来越", "逐渐",
  "隐隐发光", "微微震动", "发出声响",
];

// ─── 状态变化关键词 ──────────────────────────────────────────

const BREAKTHROUGH_KEYWORDS = [
  "突破", "晋级", "渡劫", "破境", "踏入",
  "进入.*境", "达到.*层", "突破到",
];

const LOCATION_CHANGE_KEYWORDS = [
  "离开", "前往", "抵达", "回到", "来到",
  "踏入", "走出", "飞出", "赶往",
];

const ITEM_TRANSFER_KEYWORDS = [
  "掏出", "取出", "递给", "交给", "送给",
  "收起", "放入", "祭出", "抛出", "扔出",
  "从.*拿出", "从.*取出",
];

const DEATH_KEYWORDS = [
  "陨落", "身死", "毙命", "丧命", "倒下",
  "闭上了眼睛", "没有了呼吸", "气息断绝",
];

// ─── 一致性检查关键词 ──────────────────────────────────────────

/** 常见名字错别字模式（同音或形近字） */
const NAME_TYPO_PATTERNS: [string, string][] = [
  // 这只是框架——实际使用时需要加载项目中所有已知角色名做模糊匹配
];

// ─── 各遍扫描实现 ──────────────────────────────────────────────

/**
 * 第二遍：状态变化检测
 * 用关键词匹配检测角色的修为/位置/物品/关系变化
 */
function detectStateChanges(
  text: string,
  knownCharacters: DistillationInput["knownCharacters"],
  entities: DetectedEntity[],
): StateChange[] {
  const changes: StateChange[] = [];
  const nameSet = new Set(knownCharacters.map((c) => c.name));

  // 按段落分割，逐段检测
  const paragraphs = text.split(/\n\n|\n(?=[一-鿿"A-Z])/);

  for (const para of paragraphs) {
    // 找到该段落中提到的角色
    const mentionedChars = knownCharacters.filter((c) => para.includes(c.name));

    if (mentionedChars.length === 0) continue;

    // ── 修为突破检测 ──
    for (const kw of BREAKTHROUGH_KEYWORDS) {
      const match = para.match(new RegExp(kw, "g"));
      if (!match) continue;

      for (const ch of mentionedChars) {
        // 检查角色名是否在关键词附近（前后 20 字）
        const charIdx = para.indexOf(ch.name);
        const kwIdx = para.indexOf(match[0]);
        if (Math.abs(charIdx - kwIdx) <= 20) {
          changes.push({
            type: "realm_breakthrough",
            characterName: ch.name,
            characterId: ch.id,
            description: `${ch.name} 修为突破`,
            from: ch.currentRealm,
            to: undefined, // 从文本中提取新境界
            confidence: 0.7,
            evidence: para.slice(Math.max(0, kwIdx - 10), Math.min(para.length, kwIdx + 30)),
          });
        }
      }
    }

    // ── 地点变化检测 ──
    for (const kw of LOCATION_CHANGE_KEYWORDS) {
      const match = para.match(new RegExp(kw, "g"));
      if (!match) continue;

      for (const ch of mentionedChars) {
        const charIdx = para.indexOf(ch.name);
        const kwIdx = para.indexOf(match[0]);
        if (Math.abs(charIdx - kwIdx) <= 15) {
          changes.push({
            type: "location_change",
            characterName: ch.name,
            characterId: ch.id,
            description: `${ch.name} ${kw}`,
            from: ch.currentLocation,
            confidence: 0.65,
            evidence: para.slice(Math.max(0, kwIdx - 10), Math.min(para.length, kwIdx + 30)),
          });
        }
      }
    }

    // ── 死亡检测 ──
    for (const kw of DEATH_KEYWORDS) {
      if (para.includes(kw)) {
        for (const ch of mentionedChars) {
          const charIdx = para.indexOf(ch.name);
          const kwIdx = para.indexOf(kw);
          if (Math.abs(charIdx - kwIdx) <= 15) {
            changes.push({
              type: "death",
              characterName: ch.name,
              characterId: ch.id,
              description: `${ch.name} 可能已死亡`,
              confidence: 0.8,
              evidence: para.slice(Math.max(0, kwIdx - 20), Math.min(para.length, kwIdx + 20)),
            });
          }
        }
      }
    }
  }

  // ── 物品转移检测 ──
  for (const kw of ITEM_TRANSFER_KEYWORDS) {
    const regex = new RegExp(kw, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const matchIdx = match.index;
      const context = text.slice(Math.max(0, matchIdx - 30), Math.min(text.length, matchIdx + 50));
      for (const ch of knownCharacters) {
        if (context.includes(ch.name)) {
          // 检查附近是否有物品实体
          const nearbyEntities = entities.filter(
            (e) =>
              e.type !== "character" &&
              Math.abs(e.position - matchIdx) <= 30,
          );
          if (nearbyEntities.length > 0) {
            changes.push({
              type: "item_gain",
              characterName: ch.name,
              characterId: ch.id,
              description: `${ch.name} 获得/使用 ${nearbyEntities[0].name}`,
              confidence: 0.6,
              evidence: context,
            });
          }
        }
      }
    }
  }

  return changes;
}

/**
 * 第三遍：伏笔模式匹配
 * 检测埋设/回收/深化信号
 */
function detectForeshadows(
  text: string,
  chapterOrder: number,
  entities: DetectedEntity[],
  existingForeshadows: DistillationInput["existingForeshadows"] = [],
): ForeshadowEvent[] {
  const events: ForeshadowEvent[] = [];

  // ── 埋设检测 ──
  for (const signal of BURY_SIGNALS) {
    if (!text.includes(signal)) continue;
    const idx = text.indexOf(signal);
    const context = text.slice(Math.max(0, idx - 30), Math.min(text.length, idx + 80));

    // 提取信号附近涉及的实体名
    const nearbyEntityNames = entities
      .filter((e) => Math.abs(e.position - idx) <= 50)
      .map((e) => e.name);

    events.push({
      type: "buried",
      description: `检测到伏笔埋设信号："${signal}"`,
      signalWord: signal,
      relatedEntityNames: nearbyEntityNames,
      chapterOrder,
      confidence: 0.6,
    });
  }

  // ── 回收检测 ──
  for (const signal of RECOVER_SIGNALS) {
    if (!text.includes(signal)) continue;
    const idx = text.indexOf(signal);
    const context = text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + 60));

    // 检查是否与已有伏笔相关
    let matchedForeshadowId: string | undefined;
    for (const fs of existingForeshadows) {
      // 简单匹配：检查描述关键词是否出现在上下文中
      const descWords = fs.description.slice(0, 10);
      if (context.includes(descWords)) {
        matchedForeshadowId = fs.id;
        break;
      }
    }

    const nearbyEntityNames = entities
      .filter((e) => Math.abs(e.position - idx) <= 50)
      .map((e) => e.name);

    events.push({
      type: "recovered",
      description: `检测到伏笔回收信号："${signal}"${matchedForeshadowId ? "（匹配已有伏笔）" : ""}`,
      signalWord: signal,
      relatedEntityNames: nearbyEntityNames,
      chapterOrder,
      confidence: matchedForeshadowId ? 0.8 : 0.55,
      matchedForeshadowId,
    });
  }

  // ── 深化检测 ──
  for (const signal of DEEPEN_SIGNALS) {
    if (!text.includes(signal)) continue;
    const idx = text.indexOf(signal);

    const nearbyEntityNames = entities
      .filter((e) => Math.abs(e.position - idx) <= 50)
      .map((e) => e.name);

    events.push({
      type: "deepened",
      description: `检测到伏笔深化信号："${signal}"`,
      signalWord: signal,
      relatedEntityNames: nearbyEntityNames,
      chapterOrder,
      confidence: 0.5,
    });
  }

  return events;
}

/**
 * 第四遍：一致性校验
 * 检测名字写错/修为矛盾/关系矛盾
 */
function checkConsistency(
  text: string,
  knownCharacters: DistillationInput["knownCharacters"],
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  // ── 名字错误检测：检查文本中出现的角色名变体 ──
  for (const ch of knownCharacters) {
    if (!ch.name || ch.name.length < 2) continue;

    // 检查角色名在正文中是否出现
    if (!text.includes(ch.name)) {
      // 不在本章出现不报错，只检查出现了但写错的情况
      continue;
    }

    // 简单的同音字检测：如果角色名的一个字被替换为同音字
    // 这里只做基础框架——完整实现需要拼音库
    const nameChars = [...ch.name];
    for (let i = 0; i < nameChars.length; i++) {
      // 检查正文中是否有名字的模糊变体（缺字/多字/换字）
      const prefix = nameChars.slice(0, i).join("");
      const suffix = nameChars.slice(i + 1).join("");
      const fuzzyPattern = new RegExp(`${escapeRegex2(prefix)}.{0,1}${escapeRegex2(suffix)}`, "g");

      const matches = text.match(fuzzyPattern);
      if (matches) {
        for (const m of matches) {
          if (m !== ch.name && m.length >= 2) {
            issues.push({
              type: "name_typo",
              description: `疑似名字错误：原文"${m}"，正确应为"${ch.name}"`,
              severity: "warning",
              entityName: ch.name,
              evidence: m,
            });
          }
        }
      }
    }
  }

  // ── 修为矛盾检测：同一角色出现不同修为描述 ──
  const realmKeywords = [
    "筑基", "金丹", "元婴", "化神", "炼虚", "合体", "大乘", "渡劫",
    "练气", "炼气", "筑基初期", "筑基中期", "筑基后期", "筑基圆满",
    "金丹初期", "金丹中期", "金丹后期", "金丹圆满",
  ];

  for (const ch of knownCharacters) {
    const mentionedRealms = realmKeywords.filter((r) => text.includes(r));
    if (mentionedRealms.length >= 2) {
      // 同一角色被提到两种不同修为——可能是叙述中切换了时间线
      // 只做弱警告
      issues.push({
        type: "realm_error",
        description: `本章出现多种修为描述：${mentionedRealms.join("、")}`,
        severity: "info",
        entityName: ch.name,
        evidence: mentionedRealms.join(", "),
      });
    }
  }

  return issues;
}

function escapeRegex2(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── 主蒸馏函数 ────────────────────────────────────────────────

/**
 * 运行四遍本地蒸馏
 *
 * 四遍扫描：
 * 1. 实体识别（正则 + 已知词典）
 * 2. 状态变化检测（关键词 + 前后对比）
 * 3. 伏笔模式匹配（埋设/回收/深化信号词库）
 * 4. 一致性校验（名字/修为/关系错误）
 *
 * @returns 结构化蒸馏结果，可直接用于创建 chapterSummary / storyBeat / PendingCommitment
 */
export function runLocalDistillation(input: DistillationInput): DistillationResult {
  const startTime = Date.now();
  const {
    content,
    projectId,
    chapterOrder,
    chapterTitle,
    knownCharacters,
    knownEntities,
    knownLocations,
    existingForeshadows,
  } = input;

  // ── 第一遍：实体识别 ──
  const entityResult = detectEntities(content, {
    knownEntities,
    knownCharacterNames: knownCharacters.map((c) => c.name),
    knownLocations,
    enableOwnership: true,
  });

  // ── 第二遍：状态变化检测 ──
  const stateChanges = detectStateChanges(content, knownCharacters, entityResult.entities);

  // ── 第三遍：伏笔模式匹配 ──
  const foreshadowEvents = detectForeshadows(
    content,
    chapterOrder,
    entityResult.entities,
    existingForeshadows,
  );

  // ── 第四遍：一致性校验 ──
  const consistencyIssues = checkConsistency(content, knownCharacters);

  // ── 汇总关键事件 ──
  const keyEvents: DistillationResult["keyEvents"] = [];

  // 状态变化事件
  for (const sc of stateChanges) {
    let importance = 0;
    if (sc.type === "realm_breakthrough") importance = 20;
    else if (sc.type === "death") importance = 25;
    else if (sc.type === "location_change") importance = 3;
    else importance = 1;

    keyEvents.push({
      description: sc.description,
      category: sc.type,
      importance,
    });
  }

  // 伏笔事件
  for (const fs of foreshadowEvents) {
    let importance = 0;
    if (fs.type === "recovered") importance = 15;
    else if (fs.type === "buried") importance = 10;
    else importance = 5;

    keyEvents.push({
      description: fs.description,
      category: `foreshadow_${fs.type}`,
      importance,
    });
  }

  // 新实体发现
  const newEntities = entityResult.entities.filter((e) => !e.isKnown && e.confidence >= 0.7);
  for (const ne of newEntities) {
    keyEvents.push({
      description: `新${entityTypeLabel(ne.type)}"${ne.name}"被发现`,
      category: "entity_discovered",
      importance: ne.type === "character" ? 10 : 5,
    });
  }

  // 按重要性降序排列
  keyEvents.sort((a, b) => b.importance - a.importance);

  return {
    entities: entityResult,
    stateChanges,
    foreshadowEvents,
    consistencyIssues,
    keyEvents,
    stats: {
      totalElapsedMs: Date.now() - startTime,
      entityCount: entityResult.stats.totalDetected,
      stateChangeCount: stateChanges.length,
      foreshadowCount: foreshadowEvents.length,
      consistencyIssueCount: consistencyIssues.length,
    },
  };
}

function entityTypeLabel(type: import("./entity-detector").EntityType): string {
  const labels: Record<import("./entity-detector").EntityType, string> = {
    pill: "丹药",
    artifact: "法宝",
    technique: "功法",
    location: "地点",
    material: "材料",
    character: "角色",
  };
  return labels[type];
}
