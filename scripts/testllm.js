const key = "sk-5f1d310e04bf4eba9335ade23e637964";
const url = "https://api.deepseek.com/v1/chat/completions";
(async () => {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: "请用一句话介绍李白。" }],
        max_tokens: 200,
      }),
    });
    const txt = await res.text();
    console.log("STATUS", res.status);
    console.log("BODY", txt.slice(0, 800));
  } catch (e) { console.error("ERR", e.message); }
})();
