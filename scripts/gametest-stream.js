const https = require("https");

const key = "sk-5f1d310e04bf4eba9335ade23e637964";
const base = "https://api.deepseek.com";

const systemPrompt = "你是一个互动小说游戏引擎。请生成开场叙事，然后给出3-4个编号选项（如 1. xxx）。";
const userPrompt = "【开始游戏】为本章写一个精彩的开场。描述场景、氛围和角色的初始状态，然后给出 3-4 个编号选项。";

const body = JSON.stringify({
  model: "deepseek-v4-flash",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ],
  temperature: 0.85,
  max_tokens: 800,
  stream: true,
});

const req = https.request(
  base + "/chat/completions",
  { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key } },
  (res) => {
    let reasoning = "";
    let content = "";
    let usage = null;
    res.setEncoding("utf8");
    let buf = "";
    res.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data: ")) continue;
        const ds = t.slice(6);
        if (ds === "[DONE]") continue;
        try {
          const d = JSON.parse(ds);
          const delta = d.choices?.[0]?.delta;
          if (delta?.reasoning_content) reasoning += delta.reasoning_content;
          if (delta?.content) content += delta.content;
          if (d.usage) usage = d.usage;
        } catch {}
      }
    });
    res.on("end", () => {
      console.log("=== REASONING (len " + reasoning.length + ") ===");
      console.log(reasoning.slice(0, 400));
      console.log("=== CONTENT (len " + content.length + ") ===");
      console.log(content.slice(0, 800));
      console.log("=== USAGE ===", JSON.stringify(usage));
    });
  }
);
req.on("error", (e) => console.error("ERR", e.message));
req.write(body);
req.end();
