const key = "process.env.SILICONFLOW_API_KEY";
const url = "https://api.deepseek.com/v1/chat/completions";
(async () => {
  const res = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${key}` },
    body: JSON.stringify({ model:"deepseek-v4-flash", stream:true, messages:[{role:"user",content:"写一句武侠开场。"}], max_tokens:300 }) });
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf=""; let last=null; let contentChunks=[];
  while(true){ const {done,value}=await reader.read(); if(done) break; buf+=dec.decode(value,{stream:true});
    const lines=buf.split("\n"); buf=lines.pop();
    for(const l of lines){ if(l.startsWith("data:")&&l.slice(5).trim()!=="[DONE]"){ try{ const j=JSON.parse(l.slice(5)); const d=j.choices?.[0]?.delta; if(d){ last=d; if(d.content) contentChunks.push(d.content);} }catch{} } }
  }
  console.log("last delta:", JSON.stringify(last).slice(0,300));
  console.log("non-null content chunks count:", contentChunks.length);
  console.log("content joined:", contentChunks.join("").slice(0,200));
})();
