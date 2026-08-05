// 质量分闸门盲测（Max Loop Round2·Step2 检验）：analyzer 误判率实证
// 目的：证伪/证实「质量分≥60 就自动放行」这道闸门的可信度——劣质文过线率(假放行)与优质文拦下率(假拦截)。
// 用法：npx tsx scripts/agent-quality-blind-test.cjs
// 诚实边界：样本为人工构造+标注（反自欺：含灰色地带，不全放明显好/坏），非真实用户语料，仅作基线。

import { analyzeQuality } from "../src/lib/quality-analyzer";

interface Sample {
  label: string;
  expect: "good" | "mediocre" | "bad";
  text: string;
}

const SAMPLES: Sample[] = [
  {
    label: "优质长文（连贯叙事，有场景/动作/情绪）",
    expect: "good",
    text:
      "灯塔熄灭的瞬间，林澈把钥匙攥进掌心，铁锈的味道渗进指缝。他没有回头，因为身后是整整十年的沉默。螺旋阶梯在脚下延伸，每一步都像踩进深水。阶梯尽头的低语越来越近，他忽然想起父亲临终前说的最后一句话——那不是遗嘱，是一句道歉。潮声从墙壁渗出来，漫过他的脚踝。他停下，把钥匙插进最后一扇铁门的锁孔，转动。门开了。光从门缝里涌出来，刺得他闭上眼睛，而那道低语，在这一刻变得清晰而温柔。",
  },
  {
    label: "优质对话（人物互动有张力）",
    expect: "good",
    text:
      "「你真的要下去？」阿岚拦住他，声音压得很低，「下面那些东西，不认活人。」林澈把钥匙举到灯光下，让锈迹在两人之间晃了晃。「它认得我。」他说。「十年前它就该认得。」阿岚沉默了很久，最后侧身让开路，只说了一句：「活着回来。」",
  },
  {
    label: "平庸流水账（罗列事件，无起伏）",
    expect: "mediocre",
    text:
      "他起床，洗漱，吃了早饭。出门坐车，到了公司。开会，写报告，中午吃盒饭。下午继续写报告，五点下班。回家路上买了菜，做了饭，吃了饭，洗了碗。看了会电视，洗澡，睡觉。第二天又重复了一遍。第三天也差不多。",
  },
  {
    label: "劣质重复短句（句式单一，逻辑断裂）",
    expect: "bad",
    text:
      "他走了。他走了很久。他又走了。他还是走。他一直在走。他走啊走。他走不动了。他停下来。他又开始走。他不想停。他不敢停。他只好走。他走了。",
  },
  {
    label: "劣质空话（口号堆砌，无信息量）",
    expect: "bad",
    text:
      "这是一个很好的故事。这个故事非常好。它非常好。真的非常好。太好了。棒极了。特别棒。非常非常棒。每个人都应该看。所有人都应该喜欢。它是最好的。没有比它更好的了。",
  },
  {
    label: "对话体（无叙事，纯对白）",
    expect: "mediocre",
    text:
      "「在吗？」「在。」「你睡了吗？」「没。」「我想跟你说件事。」「你说。」「算了。」「怎么了？」「没事。」「真的没事？」「嗯。」「那睡吧。」「好。」",
  },
  {
    label: "无标点长句（一气到底）",
    expect: "mediocre",
    text:
      "他沿着海岸线一直走一直走直到天完全黑下来才想起自己已经一整天没有喝水吃东西而远处的灯塔灯光像一只睁着的眼睛死死盯着他后背让他浑身发冷他却不知道自己在害怕什么",
  },
  {
    label: "短文本（不足50字）",
    expect: "bad",
    text: "他推开了门。",
  },
  {
    label: "空文本",
    expect: "bad",
    text: "",
  },
  {
    label: "劣质长重复（400字同一句，长度已过150结构门槛）",
    expect: "bad",
    text: "他走了。".repeat(100),
  },
  {
    label: "无信息量长文（口号堆砌 250+ 字）",
    expect: "bad",
    text: "这个故事非常好，非常精彩，非常动人。每个人都应该读，每个人都应该喜欢。它是最好的作品，没有之一。作者太厉害了，太有才华了。这书必火，必大卖，必封神。".repeat(5),
  },
  {
    label: "中长普通文（150+ 字完整但平庸）",
    expect: "mediocre",
    text: "清晨六点，他醒了。洗漱，吃早饭，出门。地铁上人很多，他站着，看着窗外发呆。到公司，打卡，开晨会，汇报昨天的工作。中午和同事吃饭，聊了聊周末的安排。下午继续写代码，修了两个 bug。五点半下班，去超市买了菜，回家做饭。吃完饭看了一会儿剧，十点洗澡睡觉。",
  },
];

function passLine(s: Sample, score: number) {
  const passed = score >= 60;
  const ok = (s.expect === "good" && passed) || (s.expect === "bad" && !passed);
  const flag = ok ? "  " : (s.expect === "bad" && passed ? "⚠️假放行" : "⚠️假拦截");
  return `${flag} ${s.label} | 分=${score} ${passed ? "PASS(≥60)" : "拦截(<60)"} | 期望=${s.expect}`;
}

let badPassed = 0; // 劣质文过线（假放行）
let goodBlocked = 0; // 优质文被拦（假拦截）
let badTotal = 0;
let goodTotal = 0;

console.log("=== 质量分闸门盲测（analyzeQuality 误判率基线） ===\n");
for (const s of SAMPLES) {
  const r = analyzeQuality(s.text, []);
  const score = r.overallScore;
  console.log(passLine(s, score));
  if (s.expect === "bad") { badTotal++; if (score >= 60) badPassed++; }
  if (s.expect === "good") { goodTotal++; if (score < 60) goodBlocked++; }
}

const fakePassRate = badTotal ? (badPassed / badTotal) * 100 : 0;
const fakeBlockRate = goodTotal ? (goodBlocked / goodTotal) * 100 : 0;
console.log("\n=== 汇总 ===");
console.log(`劣质文样本 ${badTotal} 个，过线(假放行) ${badPassed} 个 → 假放行率 ${fakePassRate.toFixed(0)}%`);
console.log(`优质文样本 ${goodTotal} 个，被拦(假拦截) ${goodBlocked} 个 → 假拦截率 ${fakeBlockRate.toFixed(0)}%`);
console.log("\n结论：假放行率=劣质章静默入库风险；假拦截率=合格章被拦需人工。两者越低，闸门越可信。");
