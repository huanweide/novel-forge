const key = "sk-5f1d310e04bf4eba9335ade23e637964";
const url = "https://api.deepseek.com/v1/chat/completions";
(async () => {
  const res = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${key}` },
    body: JSON.stringify({ model:"deepseek-v4-flash", stream:true, messages:[{role:"user",content:"用三句话写一段武侠开场，结尾给出3个编号选项。"}], max_tokens:400 }) });
  console.log("status", res.status, "ctype", res.headers.get("content-type"));
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf=""; let gotContent=false;
  while(true){ const {done,value}=await reader.read(); if(done) break; buf+=dec.decode(value,{stream:true});
    const lines=buf.split("\n"); buf=lines.pop();
    for(const l of lines){ if(l.startsWith("data:")&&l.slice(5).trim()!=="[DONE]"){ try{ const j=JSON.parse(l.slice(5)); const c=j.choices?.[0]?.delta?.content; if(c){gotContent=true; process.stdout.write(c);} }catch{} } }
  }
  console.log("\n--- gotContent:", gotContent);
})();
