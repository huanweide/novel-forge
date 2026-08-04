const key = "sk-5f1d310e04bf4eba9335ade23e637964";
const url = "https://api.deepseek.com/v1/chat/completions";
(async () => {
  const res = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${key}` },
    body: JSON.stringify({ model:"deepseek-v4-flash", stream:true, messages:[{role:"user",content:"写一句武侠开场。"}], max_tokens:200 }) });
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf=""; let n=0;
  while(true){ const {done,value}=await reader.read(); if(done) break; buf+=dec.decode(value,{stream:true});
    const lines=buf.split("\n"); buf=lines.pop();
    for(const l of lines){ if(l.startsWith("data:")&&l.slice(5).trim()!=="[DONE]"){ try{ const j=JSON.parse(l.slice(5)); const d=j.choices?.[0]?.delta; if(d && n<6){ console.log("delta keys:", JSON.stringify(d).slice(0,200)); n++; } }catch(e){ console.log("RAW:", l.slice(0,120)); } } }
  }
})();
