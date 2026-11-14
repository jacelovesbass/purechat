// Rename the installed game in the group.
//
// The game is installed as a url, so deploying updates what the game IS. It
// does not touch the row, and the name and description shown in the games list
// live in the row. So a rename is two things: the file, and this.
//
// Run with:  node scripts/rename-fennec.mjs
import { connect } from './db.mjs';
import fs from 'node:fs';

const ROOM = '78f237c3-bd53-4a48-9d9b-a7a37471ed70';   // Pure Empathy
const WAS  = 'Fennec';
const meta = JSON.parse(fs.readFileSync('games/fennec-run/game.json', 'utf8'));

const c = await connect();
const row = await c.query(
  'select id, name, url from games where room_id = $1 and name = $2', [ROOM, WAS]);

if (!row.rows.length){
  const now = await c.query('select name from games where room_id = $1', [ROOM]);
  console.log('nothing named "' + WAS + '" in that room. It currently has: ' +
    now.rows.map(r => r.name).join(', '));
  await c.end();
  process.exit(0);
}

await c.query('update games set name = $1 where id = $2', [meta.name, row.rows[0].id]);
console.log('renamed "' + WAS + '" to "' + meta.name + '"');
console.log('  id   ' + row.rows[0].id);
console.log('  url  ' + row.rows[0].url + '   (unchanged, so the pointer still resolves)');

const all = await c.query(
  'select name, url, length(html) b from games where room_id = $1 order by created_at', [ROOM]);
console.log('\nthe group now has:');
all.rows.forEach(r => console.log('  ' + String(r.name).padEnd(20) +
  (r.url ? 'url (updates itself)' : (r.b / 1024).toFixed(0) + ' KB frozen copy')));

await c.end();
