const key = "sk-5f1d310e04bf4eba9335ade23e637964";
const url = "https://api.deepseek.com/v1/chat/completions";
const sys = "你是结构化填表助手。请提取事实，输出严格 JSON：{\"operations\":[{\"table\":\"buildings\",\"op\":\"insert\",\"values\":{\"名称\":\"x\"}}]}";
const user = "【结构化表格定义】\n表 buildings(妃嫔居住建筑表): 名称,描述\n\n【最新章节正文】\n萧薰儿笑道：「这处别院倒是清静。」她缓步走向廊下。\n\n请提取本章事实，输出 operations 的严格 JSON。";
(async () => {
  for (const rf of [undefined, { type: "json_object" }]) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "deepseek-v4-flash", messages: [{role:"system",content:sys},{role:"user",content:user}], max_tokens: 8000, response_format: rf }),
      });
      const j = await res.json();
      console.log("=== response_format:", JSON.stringify(rf), "status", res.status, "===");
      console.log("CONTENT:", (j.choices?.[0]?.message?.content || "").slice(0, 600));
      console.log("ERROR:", j.error ? JSON.stringify(j.error).slice(0,300) : "none");
    } catch (e) { console.error("ERR", e.message); }
  }
})();
