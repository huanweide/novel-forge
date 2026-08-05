// 马斯克智能体：真实 LLM 逐章生成（消费 SSE 流直到 done 事件）
// 用法: node musk-generate.cjs <order>  或  node musk-generate.cjs all
const PROJECT_ID = "45bda999-ddd0-4954-b75f-497b17b2f76b";
const BASE = "http://localhost:3001/api/generate/write";

// 章节 ID 映射（由创建脚本产出）
const NODES = {
  1: "96839dde-55a3-49cc-9c63-6f699f34be32",
  2: "e93b6c6e-8f95-40d6-bdb0-c86d963aefac",
  3: "f5a56d6e-ca5e-4637-80c5-c207060f5e47",
  4: "9774f366-3a85-447e-8be3-1afc5c4ba7e7",
  5: "c27b14d9-d012-4543-ad39-afcdca638353",
  6: "2b084be8-d827-4e9b-836d-0381ffaffc06",
  7: "4635f304-d3d2-48fb-ab18-8e604986fe1d",
  8: "9eaafbc9-562a-4d1c-acf8-df3a6979cdad",
  9: "38218788-45b4-4fbc-918d-45676d6d4de6",
  10: "42930978-04fb-4f03-a165-46f8c15f09e2",
  11: "e6171fbc-337c-4429-a197-febf990f012d",
  12: "72269285-7614-4ab0-86aa-2b8597ec6198",
};

const TITLES = {
  1: "发射窗口", 2: "火种编码", 3: "轨道投送网", 4: "火星前哨", 5: "木卫二冰下",
  6: "资源博弈", 7: "辐射风暴", 8: "比邻星航程", 9: "记忆裂隙", 10: "叛逃者",
  11: "最后一次发射", 12: "火种点亮",
};

const arg = process.argv[2] || "1";
let orders;
if (arg === "999") {
  orders = Object.keys(NODES).map(Number);
} else if (arg.includes("-")) {
  const [a, b] = arg.split("-").map((n) => parseInt(n, 10));
  orders = [];
  for (let i = a; i <= b; i++) if (NODES[i]) orders.push(i);
} else {
  orders = [parseInt(arg, 10)];
}

function parseSSE(buffer) {
  // 返回 { events: [{type,data}], rest }
  const parts = buffer.split("\n\n");
  const rest = parts.pop();
  const events = [];
  for (const part of parts) {
    const lines = part.split("\n").filter((l) => l.startsWith("data:"));
    for (const l of lines) {
      try {
        events.push(JSON.parse(l.slice(5).trim()));
      } catch {}
    }
  }
  return { events, rest };
}

async function generateOne(order) {
  const nodeId = NODES[order];
  const body = {
    projectId: PROJECT_ID,
    nodeId,
    authorNote: `以马斯克视角驱动：硬核、紧迫、工程美学、存在主义。第${order}章《${TITLES[order]}》。`,
    targetWordCount: 2200,
  };
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  let buf = "";
  let text = "";
  let done = false;
  let usage = null;
  let finalStatus = null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buf += decoder.decode(value, { stream: true });
    const { events, rest } = parseSSE(buf);
    buf = rest;
    for (const ev of events) {
      if (ev.type === "token" && ev.content) text += ev.content;
      if (ev.type === "done") { done = true; usage = ev.usage; finalStatus = ev.status; }
      if (ev.type === "error") throw new Error("SSE error: " + JSON.stringify(ev));
    }
  }
  return { text, done, usage, finalStatus };
}

(async () => {
  const fail = [];
  for (const order of orders) {
    try {
      process.stdout.write(`生成 #${order} ${TITLES[order]} ... `);
      const t0 = Date.now();
      const { text, done, usage, finalStatus } = await generateOne(order);
      const sec = ((Date.now() - t0) / 1000).toFixed(1);
      const wc = text.replace(/\s/g, "").length;
      console.log(`done=${done} status=${finalStatus} 字数=${wc} 耗时=${sec}s tokens=${usage ? JSON.stringify(usage) : "n/a"}`);
      if (!done) { fail.push(order); console.error(`  !! #${order} 未收到 done`); }
    } catch (e) {
      fail.push(order);
      console.error(`  !! #${order} 失败: ${e.message || e}`);
    }
  }
  console.log(`\nDONE. 成功=${orders.length - fail.length}/${orders.length}` + (fail.length ? ` 失败章: ${fail.join(",")}` : ""));
  if (fail.length) process.exit(2);
})().catch((e) => {
  console.error("ERR", e.message || e);
  process.exit(1);
});
