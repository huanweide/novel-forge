const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:5432/novelforge' });
c.connect().then(async () => {
  const r = await c.query('SELECT "llmApiKey","llmModel","llmBaseUrl" FROM "AppSettings" LIMIT 1');
  console.log(JSON.stringify(r.rows[0]));
  await c.end();
}).catch(e => { console.error('ERR', e.message); process.exit(1); });
