const EmbeddedPostgres = require('embedded-postgres').default;
(async () => {
  const pg = new EmbeddedPostgres({
    databaseDir: '/tmp/pgdata',
    user: 'cardscan',
    password: 'cardscan',
    port: 5433,
    persistent: true,
  });
  try {
    await pg.initialise();
  } catch (e) { console.log('init existed:', e.message); }
  await pg.start();
  try { await pg.createDatabase('cardscan'); } catch(e) { console.log('db existed'); }
  console.log('PG running on 5433');
})().catch(e => { console.error(e); process.exit(1); });
