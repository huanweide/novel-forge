const key = "process.env.SILICONFLOW_API_KEY";
const url = "https://api.deepseek.com/v1/chat/completions";
const SYS = `你是小说数据库填表助手（宝宝流数据库·国模填表·DeepSeek篇）。
任务：阅读【最新章节正文】，提取结构化事实，写入对应结构化表格。
铁律：1.名称零杜撰；2.复用已有；3.新增慎重；4.完整性；5.填后自检。
输出严格 JSON（response_format=json_object），不要任何解释文字、不要 Markdown。
返回结构：{"operations":[{"table":"表英文key","op":"insert|update|delete","match":{"col":"列key","val":"匹配值"},"values":{"列key":"值"}}]}
若某事实在表中已存在用update。每个表只处理与本章相关的行。`;
const TABLES = `表「妃嫔居住建筑表」 key=buildings
说明：
列：名称(name)、描述(desc)
【权威名录·已有名称】
（空，可放心新增）
【已有样例（全量前 60 行）】
（空）`;
const USER = `【结构化表格定义】
${TABLES}

【最新章节正文】
青云笑道：「此处风景甚好，便在此结庐而居吧。」他望向远山，缓步走向那座不知名的楼阁。

请提取本章事实，输出 operations 的严格 JSON。`;
(async () => {
  const res = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${key}` },
    body: JSON.stringify({ model:"deepseek-v4-flash", messages:[{role:"system",content:SYS},{role:"user",content:USER}], max_tokens:8000, response_format:{type:"json_object"}, temperature:1 }) });
  const j = await res.json();
  console.log("CONTENT:", (j.choices?.[0]?.message?.content||"").slice(0,1000));
  console.log("REASONING:", (j.choices?.[0]?.message?.reasoning_content||"").slice(0,400));
})();
