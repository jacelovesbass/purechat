// Install Fennec into the Pure Empathy group, BY URL.
//
// The format allows a game to carry a url instead of inlined html, and
// src/tools/games.jsx renders it the same way: same iframe, same
// sandbox="allow-scripts", no allow-same-origin. The difference is what the
// group gets afterwards.
//
//   html mode  the copy is snapshotted at install and frozen. Every update
//              means removing it and adding it again.
//   url mode   the copy is a pointer. Deploying is the update, and everyone
//              has it the next time they open the game.
//
// url mode is the one that matches how this actually gets worked on, so it is
// what this installs. The cost is that it needs a connection to play, where an
// inlined copy would run offline.
//
// Re-checked under url mode before choosing it (games/fennec-run/url-mode-test.mjs):
// storage unreachable, host document unreachable, host location unreachable,
// score still crosses to the chat. The sandbox still holds.
//
// Run with:  node scripts/install-fennec.mjs
import { connect } from './db.mjs';
import fs from 'node:fs';

const ROOM = '78f237c3-bd53-4a48-9d9b-a7a37471ed70';   // Pure Empathy
const NAME = 'Fennec';
const URL  = 'https://jacelovesbass.github.io/purechat/fennec.html';

const meta = JSON.parse(fs.readFileSync('games/fennec-run/game.json', 'utf8'));

// Installing a pointer to something that is not there yet would put a broken
// game in front of four people, so check the url serves the real build first.
const res0 = await fetch(URL);
if (!res0.ok) throw new Error('the game url is not serving: HTTP ' + res0.status);
const body = await res0.text();
if (body.indexOf('const LEVELS = [') < 0 || body.indexOf('__g') < 0)
  throw new Error('the url served something, but it is not the game');
console.log('url checks out: HTTP 200, ' + (body.length / 1024).toFixed(1) + ' KB, looks like the game');

const c = await connect();
const room = await c.query('select name from rooms where id = $1', [ROOM]);
if (!room.rows.length) throw new Error('room not found: ' + ROOM);

const already = await c.query(
  'select id, url, length(html) as b from games where room_id = $1 and name = $2',
  [ROOM, NAME]);
if (already.rows.length){
  const r = already.rows[0];
  console.log(NAME + ' is already in ' + room.rows[0].name +
    (r.url ? ' as a url, so deploying is already the update. Nothing to do.'
           : ' as a frozen copy. Remove it in the app and run this again to switch it to a url.'));
  await c.end();
  process.exit(0);
}

const ins = await c.query(
  `insert into games (room_id, name, author, added_by, url)
   values ($1, $2, $3, $4, $5)
   returning id, created_at`,
  [ROOM, NAME, meta.author, 'Jason', URL]);

console.log('\ninstalled "' + NAME + '" into ' + room.rows[0].name + ' as a url');
console.log('  id   ' + ins.rows[0].id);
console.log('  url  ' + URL);
console.log('  at   ' + ins.rows[0].created_at.toISOString());
console.log('\nFrom here, deploying updates it. Nobody has to reinstall anything.');

const all = await c.query(
  `select name, author, url, length(html) b from games
    where room_id = $1 order by created_at`, [ROOM]);
console.log('\nthe group now has:');
all.rows.forEach(r => console.log('  ' + String(r.name).padEnd(20) +
  'by ' + String(r.author || '-').padEnd(8) +
  (r.url ? 'url (updates itself)' : (r.b / 1024).toFixed(0) + ' KB frozen copy')));

await c.end();
