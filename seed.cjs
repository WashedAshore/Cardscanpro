const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgres://cardscan:cardscan@127.0.0.1:5433/cardscan' });
(async () => {
  const r = await p.query(`
    INSERT INTO analyses (image_url, sport, player_name, player_tier, brand_tier, set_name, year, print_run, grader, grade, auto_type, is_rookie, base_card_value, estimated_fmv, confidence, user_id, created_at)
    VALUES ($1,'baseball','Shohei Ohtani','goat','premium','2018 Topps Chrome','2018','unlimited','raw','n/a','none',true,100,145,'high',1,$2)
    RETURNING id
  `, ['data:image/png;base64,xx', new Date().toISOString()]);
  console.log('analysis id:', r.rows[0].id);
  // Also a low-value one
  const r2 = await p.query(`
    INSERT INTO analyses (image_url, sport, player_name, player_tier, brand_tier, set_name, year, print_run, grader, grade, auto_type, is_rookie, base_card_value, estimated_fmv, confidence, user_id, created_at)
    VALUES ($1,'baseball','Random Player','common','budget','2024 Topps Series 1','2024','unlimited','raw','n/a','none',false,1,5,'medium',1,$2)
    RETURNING id
  `, ['data:image/png;base64,xx', new Date().toISOString()]);
  console.log('analysis id (low):', r2.rows[0].id);
  // Upgrade user 1 to pro
  await p.query(`UPDATE users SET tier='pro' WHERE id=1`);
  console.log('user 1 tier -> pro');
  await p.end();
})().catch(e => { console.error(e); process.exit(1); });
