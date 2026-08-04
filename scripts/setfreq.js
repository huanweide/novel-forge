const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:5432/novelforge' });
c.connect().then(async () => {
  await c.query('UPDATE "Project" SET "fillFrequency"=1 WHERE id=$1', ['757834b6-8100-41f7-8699-88587276cac0']);
  const r = await c.query('SELECT "fillFrequency" FROM "Project" WHERE id=$1', ['757834b6-8100-41f7-8699-88587276cac0']);
  console.log('fillFrequency now:', r.rows[0].fillFrequency);
  await c.end();
}).catch(e => { console.error('ERR', e.message); process.exit(1); });
