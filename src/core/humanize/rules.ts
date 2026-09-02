// ============================================================
// AI 写作痕迹规则引擎（纯本地 / 零 API 成本 / 无网络请求）
// ============================================================
//
// 为什么做成规则而不是让 AI 来判：
//  1. 本地优先 —— 调用 AI 就得把未发表稿件传出去，那跟云端检测没区别了，
//     而「稿件不出本机」正是我们相对云端工具唯一决定性的优势。
//  2. 零成本 —— 规则层跑一万字不花一分钱，可以随意反复检测。
//  3. 可解释 —— 每条命中都能指出「哪一句、为什么、怎么改」，AI 判的分是黑箱。
//
// 误报控制（关键）：
//  中文里「似乎」「仿佛」这类词真人也会用，单独命中不算问题。
//  所以把词表分成两档：
//   - 强特征词（值得注意的是/综上所述/不由得/心中一凛…）：真人极少这么写，直接标出；
//   - 弱特征词（似乎/仿佛/微微/些许…）：只计入密度统计，密度超标才整体提示一次。
//  这样既能抓到机器味，又不会把正常写作刷成满屏红。

import type { AiTraceHit, Severity } from "./types";

// ─── 文本切分工具 ────────────────────────────────────────────

export interface Slice {
  text: string;
  /** 在全文中的起始下标 */
  start: number;
  end: number;
}

/** 按空行/换行切段，保留全文下标以便高亮 */
export function splitParagraphs(text: string): Slice[] {
  if (!text) return [];
  const out: Slice[] = [];
  const re = /\n\s*\n|\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const seg = text.slice(last, m.index);
    if (seg.trim()) {
      const lead = seg.length - seg.replace(/^\s+/, "").length;
      out.push({ text: seg.trim(), start: last + lead, end: m.index });
    }
    last = m.index + m[0].length;
  }
  const tail = text.slice(last);
  if (tail.trim()) {
    const lead = tail.length - tail.replace(/^\s+/, "").length;
    out.push({ text: tail.trim(), start: last + lead, end: text.length });
  }
  return out;
}

/** 按句末标点切句，保留全文下标。引号内的句末标点不切，避免把对话切碎。 */
export function splitSentences(text: string, offset = 0): Slice[] {
  if (!text) return [];
  const out: Slice[] = [];
  let start = 0;
  let depth = 0; // 引号深度
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "“" || ch === "‘" || ch === "《") depth++;
    else if (ch === "”" || ch === "’" || ch === "》") depth = Math.max(0, depth - 1);
    if (depth > 0) continue;
    if (ch === "。" || ch === "！" || ch === "？" || ch === "；" || ch === "…") {
      // 吞掉连续的省略号
      let j = i;
      while (j + 1 < text.length && text[j + 1] === "…") j++;
      const seg = text.slice(start, j + 1);
      if (seg.trim()) out.push({ text: seg, start: offset + start, end: offset + j + 1 });
      start = j + 1;
      i = j;
    }
  }
  const tail = text.slice(start);
  if (tail.trim()) out.push({ text: tail, start: offset + start, end: offset + text.length });
  return out;
}

// ─── 词表 ────────────────────────────────────────────────────

interface VocabEntry {
  word: string;
  severity: Severity;
  reason: string;
  suggestion: string;
}

/** 强特征词：真人写作极少出现，命中即标出 */
const STRONG_VOCAB: VocabEntry[] = [
  {
    word: "值得注意的是",
    severity: "high",
    reason: "典型的说明文过渡腔，小说对话与叙述里几乎没人会这么起句。",
    suggestion: "直接删掉，让事实自己说话，或换成具体的人物动作。",
  },
  {
    word: "不难发现",
    severity: "high",
    reason: "AI 最爱用的「替读者下结论」句式，真人写作很少主动替读者总结。",
    suggestion: "删掉。读者自己能发现的事，写出来就是废话。",
  },
  {
    word: "综上所述",
    severity: "high",
    reason: "论文腔，出现在小说正文里非常突兀。",
    suggestion: "整句删掉，或改成人物的判断与抉择。",
  },
  {
    word: "总而言之",
    severity: "high",
    reason: "同上，属于总结性过渡，不适合叙事文本。",
    suggestion: "删除，用情节推进代替总结。",
  },
  {
    word: "由此可见",
    severity: "high",
    reason: "议论腔，叙事文里极少使用。",
    suggestion: "删除，直接写结果。",
  },
  {
    word: "简而言之",
    severity: "medium",
    reason: "总结腔，小说里出现会打断叙事节奏。",
    suggestion: "删除。",
  },
  {
    word: "一言以蔽之",
    severity: "medium",
    reason: "文言总结腔，叙事文本罕见。",
    suggestion: "删除或改成口语。",
  },
  {
    word: "某种程度上",
    severity: "high",
    reason: "模糊限定词，AI 为了「说得稳妥」而大量堆砌，真人很少这么绕。",
    suggestion: "删掉，直接下判断；或换成明确的条件。",
  },
  {
    word: "从某种意义上",
    severity: "high",
    reason: "同上的变体，属于典型的稳妥腔。",
    suggestion: "删除，直接说清楚。",
  },
  {
    word: "在一定程度上",
    severity: "high",
    reason: "模糊限定词，AI 高频。",
    suggestion: "删除或给出具体程度。",
  },
  {
    word: "不由得",
    severity: "medium",
    reason: "AI 写心理活动的万能开头，出现频率远高于真人写作。",
    suggestion: "换成具体的身体反应或动作，别用这个词概括。",
  },
  {
    word: "情不自禁",
    severity: "medium",
    reason: "套路心理描写词，已被大量 AI 文本用滥。",
    suggestion: "改成具体动作或直接写心理内容。",
  },
  {
    word: "下意识",
    severity: "low",
    reason: "套路心理副词，AI 用得比真人频繁得多。",
    suggestion: "多数情况可直接删，动作本身已经够了。",
  },
  {
    word: "心中一凛",
    severity: "high",
    reason: "网文套路心理词，AI 生成时高频复现。",
    suggestion: "换成这个角色独有的反应方式。",
  },
  {
    word: "心头一紧",
    severity: "high",
    reason: "同上，属于模板化心理反应。",
    suggestion: "换成具体、属于这个角色的反应。",
  },
  {
    word: "心中暗暗",
    severity: "medium",
    reason: "套路心理描写，AI 高频。",
    suggestion: "删除，直接写想法内容。",
  },
  {
    word: "宛如",
    severity: "low",
    reason: "书面比喻词，AI 爱用；真人写小说更常用「像」。",
    suggestion: "改成「像」，或直接删掉比喻。",
  },
  {
    word: "仿佛整个世界",
    severity: "high",
    reason: "AI 经典的夸张模板句。",
    suggestion: "删掉，换成具体的、小尺度的感受。",
  },
  {
    word: "这一刻",
    severity: "medium",
    reason: "AI 常用的时间强调模板，连续出现尤其明显。",
    suggestion: "删掉，叙事本身已经说明时间。",
  },
  {
    word: "空气仿佛凝固",
    severity: "high",
    reason: "AI 写紧张场面的固定模板。",
    suggestion: "换成具体的、可感知的细节。",
  },
  {
    word: "阳光透过树叶",
    severity: "high",
    reason: "AI 写环境描写的固定模板句。",
    suggestion: "换成与情节相关的环境细节，别用通用美景填充。",
  },
  {
    word: "斑驳的光影",
    severity: "high",
    reason: "同上，模板化环境描写。",
    suggestion: "换成有功能性的环境细节。",
  },
];

/** 弱特征词：只计密度，不单独标红（避免误伤正常写作） */
const WEAK_VOCAB: string[] = [
  "似乎",
  "仿佛",
  "好像",
  "隐约",
  "悄然",
  "微微",
  "一丝",
  "些许",
  "几分",
  "某种",
  "略带",
  "稍稍",
  "不禁",
  "静静地",
  "缓缓地",
  "轻轻地",
];

/** 肢体动作套路库：连续堆砌三个以上即机器味明显 */
const STOCK_ACTIONS: string[] = [
  "握紧拳头",
  "攥紧拳头",
  "咬紧牙关",
  "深吸一口气",
  "抿了抿唇",
  "抿唇",
  "皱起眉头",
  "皱了皱眉",
  "攥紧双拳",
  "紧握双拳",
  "咬了咬牙",
  "闭上眼睛",
  "微微一怔",
  "心头一沉",
  "咽了口唾沫",
  "拳头紧握",
  "双拳紧攥",
  "死死盯着",
  "猛地抬头",
  "浑身一震",
];

// ─── 单条规则实现 ────────────────────────────────────────────

/**
 * 规则1：AI 高频词（强特征）
 * 直接扫描强特征词表，命中即标出。
 */
export function detectAiVocab(text: string, offset = 0): AiTraceHit[] {
  const hits: AiTraceHit[] = [];
  for (const v of STRONG_VOCAB) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(v.word, from);
      if (i === -1) break;
      hits.push({
        ruleId: "ai-vocab",
        ruleName: "AI 高频词",
        severity: v.severity,
        excerpt: excerptAt(text, i, v.word.length),
        start: offset + i,
        end: offset + i + v.word.length,
        reason: v.reason,
        suggestion: v.suggestion,
      });
      from = i + v.word.length;
    }
  }
  return hits;
}

/**
 * 规则2：「不是…而是…」对照句式
 * AI 极度偏好这种「先否定再肯定」的修辞，密度高时机器味很重。
 */
export function detectNotBut(text: string, offset = 0): AiTraceHit[] {
  const hits: AiTraceHit[] = [];
  const re = /不是([^。！？；\n]{1,30}?)而是([^。！？；\n]{1,30}?)([，。！？；])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hits.push({
      ruleId: "not-but",
      ruleName: "「不是…而是…」句式",
      severity: "medium",
      excerpt: excerptAt(text, m.index, m[0].length),
      start: offset + m.index,
      end: offset + m.index + m[0].length,
      reason: "「先否定再肯定」是 AI 最爱的对照修辞，用多了整段都是同一个腔调。",
      suggestion: "保留一两处点睛的即可，其余改成直接陈述或具体动作。",
    });
  }
  return hits;
}

/**
 * 规则2b：递进句式「不仅…而且…」
 * AI 惯用这一句把两件本可以直接说的话拧成一个长句，凑字数的同时制造「很有层次」的错觉。
 */
export function detectProgressivePair(text: string, offset = 0): AiTraceHit[] {
  const hits: AiTraceHit[] = [];
  const re = /(?:不仅仅?|不但|不只|非但)([^。！？；\n]{1,30}?)(?:而且|并且|还|更|同时也)([^。！？；\n]{1,30}?)([，。！？；])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hits.push({
      ruleId: "progressive-pair",
      ruleName: "「不仅…而且…」递进句",
      severity: "medium",
      excerpt: excerptAt(text, m.index, m[0].length),
      start: offset + m.index,
      end: offset + m.index + m[0].length,
      reason: "把两件能分开说的事拧成一个长句，读着累，也是 AI 凑层次感的常用手法。",
      suggestion: "拆成两句，或者干脆只留更重要的一句。",
    });
  }
  return hits;
}

/**
 * 规则3：三段式排比
 * 连续三个以上「XX的XX」结构的短语并列。
 */
export function detectTripleParallel(text: string, offset = 0): AiTraceHit[] {
  const hits: AiTraceHit[] = [];
  const sents = splitSentences(text, offset);
  for (const s of sents) {
    // 找形如「A的a，B的b，C的c」的连用
    const re = /((?:[\u4e00-\u9fa5]{1,6}的[\u4e00-\u9fa5]{1,6}[，、]){2,}[\u4e00-\u9fa5]{1,6}的[\u4e00-\u9fa5]{1,6})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s.text)) !== null) {
      const localStart = m.index;
      hits.push({
        ruleId: "triple-parallel",
        ruleName: "三段式排比",
        severity: "low",
        excerpt: excerptAt(s.text, localStart, m[0].length),
        start: s.start + localStart,
        end: s.start + localStart + m[0].length,
        reason: "三个以上结构完全相同的短语并列，是 AI 凑篇幅的典型手法。",
        suggestion: "打散成不同长度的句式，或只留一个最有画面感的。",
      });
    }
  }
  return hits;
}

/**
 * 规则4：否定式排比
 * 「不是A，不是B，而是C」——连续否定再转折。
 */
export function detectNegativeParallel(text: string, offset = 0): AiTraceHit[] {
  const hits: AiTraceHit[] = [];
  // 第三项可选，且可以是「而是C」也可以是「不是C」——
  // 纯三重否定（不是A，不是B，不是C）同样是 AI 签名句式，此前只认「…而是」收尾会整条漏掉。
  const re = /不是([^，。！？；\n]{1,20})[，、]不是([^，。！？；\n]{1,20})(?:[，、](?:而是|不是)[^，。！？；\n]{1,20})?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hits.push({
      ruleId: "negative-parallel",
      ruleName: "否定式排比",
      severity: "high",
      excerpt: excerptAt(text, m.index, m[0].length),
      start: offset + m.index,
      end: offset + m.index + m[0].length,
      reason: "连续两次否定再转折，几乎成了 AI 写作的签名句式。",
      suggestion: "直接写「是什么」，别先绕两个「不是什么」。",
    });
  }
  return hits;
}

/**
 * 规则5：肢体动作堆砌
 * 同一句里连续出现三个以上套路动作。
 */
export function detectActionStack(text: string, offset = 0): AiTraceHit[] {
  const hits: AiTraceHit[] = [];
  const sents = splitSentences(text, offset);
  for (const s of sents) {
    const found: Array<{ word: string; at: number }> = [];
    for (const act of STOCK_ACTIONS) {
      let from = 0;
      for (;;) {
        const i = s.text.indexOf(act, from);
        if (i === -1) break;
        found.push({ word: act, at: i });
        from = i + act.length;
      }
    }
    if (found.length >= 3) {
      found.sort((a, b) => a.at - b.at);
      const first = found[0];
      const last = found[found.length - 1];
      const end = last.at + last.word.length;
      hits.push({
        ruleId: "action-stack",
        ruleName: "肢体动作堆砌",
        severity: "medium",
        excerpt: excerptAt(s.text, first.at, end - first.at),
        start: s.start + first.at,
        end: s.start + end,
        reason: `一句话里塞了 ${found.length} 个套路动作（${found
          .map((f) => f.word)
          .slice(0, 4)
          .join("、")}…），像在按模板填空。`,
        suggestion: "保留一个最有力度的动作，其余删掉或换成这个角色独有的小动作。",
      });
    }
  }
  return hits;
}

/**
 * 规则6：情感词堆叠
 * 顿号连接的四个以上情绪词。
 */
export function detectEmotionStack(text: string, offset = 0): AiTraceHit[] {
  const hits: AiTraceHit[] = [];
  const re = /([\u4e00-\u9fa5]{2,4}(?:[、][\u4e00-\u9fa5]{2,4}){3,})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const items = m[0].split("、");
    // 只有短词并列才像情绪堆砌（长词并列可能是正常列举）
    if (items.every((it) => it.length <= 4)) {
      hits.push({
        ruleId: "emotion-stack",
        ruleName: "情感词堆叠",
        severity: "low",
        excerpt: excerptAt(text, m.index, m[0].length),
        start: offset + m.index,
        end: offset + m.index + m[0].length,
        reason: `${items.length} 个词用顿号串成一串，是 AI 凑情绪强度的常用手法。`,
        suggestion: "挑一个最准的词，其余用具体行为或细节体现，别靠堆词。",
      });
    }
  }
  return hits;
}

/**
 * 规则7：括号补充过度
 * AI 爱用括号补充说明，一段里出现多个就显得啰嗦。
 */
export function detectParenOveruse(text: string, offset = 0): AiTraceHit[] {
  const hits: AiTraceHit[] = [];
  const re = /[（(]([^）)]{2,20})[）)]/g;
  let m: RegExpExecArray | null;
  const found: Array<{ at: number; len: number }> = [];
  while ((m = re.exec(text)) !== null) {
    found.push({ at: m.index, len: m[0].length });
  }
  // 每千字超过 3 个才算过度；短文本按比例放宽
  const perK = found.length / Math.max(0.1, countChars(text) / 1000);
  if (perK > 3 && found.length >= 2) {
    for (const f of found) {
      hits.push({
        ruleId: "paren-overuse",
        ruleName: "括号补充过度",
        severity: "low",
        excerpt: excerptAt(text, f.at, f.len),
        start: offset + f.at,
        end: offset + f.at + f.len,
        reason: `全文括号密度约 ${perK.toFixed(1)} 个/千字，超过 3 个/千字，读起来像在不停插话。`,
        suggestion: "把补充说明融进正文，或干脆删掉——读者能推断的就别解释。",
      });
    }
  }
  return hits;
}

/**
 * 规则8：句首重复
 * 连续多个句子用同一个词开头。
 */
export function detectSentenceStartRepeat(text: string, offset = 0): AiTraceHit[] {
  const hits: AiTraceHit[] = [];
  const sents = splitSentences(text, offset).filter((s) => s.text.trim().length > 2);
  let runStart = 0;
  for (let i = 1; i <= sents.length; i++) {
    const prev = sents[i - 1].text.replace(/^\s+/, "");
    const cur = i < sents.length ? sents[i].text.replace(/^\s+/, "") : "";
    const sameStart =
      i < sents.length && prev.length > 1 && cur.length > 1 && prev.slice(0, 2) === cur.slice(0, 2);
    if (!sameStart) {
      const runLen = i - runStart;
      if (runLen >= 3) {
        const head = sents[runStart];
        hits.push({
          ruleId: "start-repeat",
          ruleName: "句首重复",
          severity: "medium",
          excerpt: excerptAt(text, head.start - offset, Math.min(60, sents[i - 1].end - head.start)),
          start: head.start,
          end: sents[i - 1].end,
          reason: `连续 ${runLen} 句都用「${prev.slice(0, 2)}」开头，节奏机械。`,
          suggestion: "换掉其中几句的开头，用状语、对话或动作起句。",
        });
      }
      runStart = i;
    }
  }
  return hits;
}

/**
 * 规则9：句长过于均匀（机器感的核心统计特征）
 * 真人写作长短句交错，AI 倾向于产出长度接近的句子。
 */
export function detectUniformSentence(text: string, offset = 0): AiTraceHit[] {
  const sents = splitSentences(text, offset).filter((s) => countChars(s.text) >= 2);
  if (sents.length < 6) return []; // 样本太少，统计不可靠
  const lens = sents.map((s) => countChars(s.text));
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
  const variance = lens.reduce((a, b) => a + (b - avg) ** 2, 0) / lens.length;
  const std = Math.sqrt(variance);
  // 变异系数（标准差/均值）低于 0.35 说明句长高度一致
  const cv = avg > 0 ? std / avg : 1;
  if (cv >= 0.35) return [];
  return [
    {
      ruleId: "uniform-sentence",
      ruleName: "句长过于均匀",
      severity: std < 3 ? "high" : "medium",
      excerpt: excerptAt(text, 0, Math.min(80, text.length)),
      start: offset,
      end: offset + Math.min(80, text.length),
      reason: `${sents.length} 个句子的长度标准差只有 ${std.toFixed(1)} 字（平均 ${avg.toFixed(
        1
      )} 字），像用尺子量过。真人写作会长短句交错。`,
      suggestion: "刻意加入几个短句（3-8 字）制造节奏变化，长句里塞进一个破句。",
    },
  ];
}

/**
 * 规则10：破折号密度过高
 */
export function detectDashOveruse(text: string, offset = 0): AiTraceHit[] {
  const chars = countChars(text);
  if (chars < 200) return []; // 太短不判
  const re = /——/g;
  let count = 0;
  let m: RegExpExecArray | null;
  const positions: number[] = [];
  while ((m = re.exec(text)) !== null) {
    count++;
    positions.push(m.index);
  }
  const perK = count / (chars / 1000);
  if (perK <= 5) return [];
  return positions.slice(0, 12).map((at) => ({
    ruleId: "dash-overuse",
    ruleName: "破折号过多",
    severity: perK > 10 ? "high" : "medium",
    excerpt: excerptAt(text, at, 2),
    start: offset + at,
    end: offset + at + 2,
    reason: `全文破折号密度 ${perK.toFixed(1)} 个/千字，远高于中文小说常见水平（约 1-3 个/千字）。`,
    suggestion: "多数破折号可以换成逗号、句号，或直接断成两句。",
  }));
}

/**
 * 规则11：弱特征词密度过高
 * 弱特征词单独不标红，但密度超标说明整体腔调偏 AI。
 */
export function detectWeakVocabDensity(text: string, offset = 0): AiTraceHit[] {
  const chars = countChars(text);
  if (chars < 300) return [];
  let count = 0;
  const matched: string[] = [];
  for (const w of WEAK_VOCAB) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(w, from);
      if (i === -1) break;
      count++;
      if (matched.length < 5) matched.push(w);
      from = i + w.length;
    }
  }
  const perK = count / (chars / 1000);
  if (perK <= 12) return [];
  return [
    {
      ruleId: "weak-vocab-density",
      ruleName: "模糊词密度过高",
      severity: perK > 20 ? "high" : "medium",
      excerpt: excerptAt(text, 0, Math.min(80, text.length)),
      start: offset,
      end: offset + Math.min(80, text.length),
      reason: `「${matched.slice(0, 5).join("」「")}」这类模糊词密度达 ${perK.toFixed(
        1
      )} 个/千字。单独用没问题，堆在一起整段就飘了。`,
      suggestion: "删掉一半，把模糊的感受改成确定的动作、数字或事实。",
    },
  ];
}

// ─── 辅助 ────────────────────────────────────────────────────

/** 统计有效字符数（不含空白） */
export function countChars(text: string): number {
  return text ? text.replace(/\s/g, "").length : 0;
}

/** 截取证据片段：命中位置前后各留一点上下文 */
function excerptAt(text: string, at: number, len: number): string {
  const pad = 12;
  const s = Math.max(0, at - pad);
  const e = Math.min(text.length, at + len + pad);
  let out = text.slice(s, e).replace(/\s+/g, " ").trim();
  if (s > 0) out = "…" + out;
  if (e < text.length) out = out + "…";
  return out;
}

/**
 * 段落级规则：逐段执行。
 * 这些规则只看局部文本，段落多短都能判。
 */
export const PARAGRAPH_RULES = [
  detectAiVocab,
  detectNegativeParallel,
  detectNotBut,
  detectProgressivePair,
  detectActionStack,
  detectEmotionStack,
  detectTripleParallel,
  detectSentenceStartRepeat,
  detectParenOveruse,
] as const;

/**
 * 全文级规则：只在整篇文本上跑一次。
 * 这三条都是统计型规则，样本太小会严重误报（比如单段只有两三句话，
 * 句长标准差天然很小，不能据此判「机械」），所以必须拿到全文才跑。
 */
export const TEXT_LEVEL_RULES = [
  detectUniformSentence,
  detectDashOveruse,
  detectWeakVocabDensity,
] as const;
