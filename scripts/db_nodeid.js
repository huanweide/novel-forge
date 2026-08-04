const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: "postgresql://postgres@127.0.0.1:5432/novelforge" });
  await c.connect();
  const r = await c.query("SELECT id, title, \"order\" FROM \"StoryNode\" WHERE \"projectId\" IN (SELECT id FROM \"Project\" WHERE name LIKE '%R12-E2E-GEN%') ORDER BY \"order\" LIMIT 5");
  console.log("NODES:", JSON.stringify(r.rows));
  const p = await c.query("SELECT id, name FROM \"Project\" WHERE name LIKE '%R12-E2E%' ORDER BY name");
  console.log("PROJS:", JSON.stringify(p.rows));
  await c.end();
})().catch(e=>{console.error(e.message);process.exit(1);});
