// Install Mechafauna into the Pure Empathy group, BY URL.
//
// Same choice as Feni Fox, for the same reason: a url is a pointer, so a deploy
// is the update and nobody reinstalls. An inlined copy is frozen at install and
// would have to be removed and re-added every time the game changes, which for
// a game still being worked on is the wrong default. The cost is that it needs
// a connection to play.
//
// This game came from outside the project, so the url check below is stricter
// than Fennec's: it asserts the served file is the built game, carries its
// inlined fonts, and pulls nothing from the network.
//
// Run with:  node scripts/install-mechafauna.mjs
import { connect } from './db.mjs';
import fs from 'node:fs';

const ROOM = '78f237c3-bd53-4a48-9d9b-a7a37471ed70';   // Pure Empathy
const NAME = 'Mechafauna';
const URL  = 'https://jacelovesbass.github.io/purechat/mechafauna.html';

const meta = JSON.parse(fs.readFileSync('games/mechafauna/game.json', 'utf8'));

// Installing a pointer to something that is not there yet would put a broken
// game in front of four people, so check the url serves the real build first.
const res0 = await fetch(URL);
if (!res0.ok) throw new Error('the game url is not serving: HTTP ' + res0.status);
const body = await res0.text();
if (body.indexOf('ART_FN') < 0 || body.indexOf('function drawAnimal') < 0)
  throw new Error('the url served something, but it is not the game');
if (body.indexOf('/*__ART__*/') >= 0 || body.indexOf('/*__AUDIO__*/') >= 0)
  throw new Error('the url is serving an unbuilt source file');
if ((body.match(/@font-face/g) || []).length < 3)
  throw new Error('the served build is missing its inlined fonts');
if (/(src|href)\s*=\s*["']https?:/i.test(body))
  throw new Error('the served build pulls a remote asset; it must be self-contained');
console.log('url checks out: HTTP 200, ' + (body.length / 1024).toFixed(1) +
  ' KB, built, fonts inlined, nothing remote');

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
console.log('\nIt posts no score: this game does not speak the host API.');

const all = await c.query(
  `select name, author, url, length(html) b from games
    where room_id = $1 order by created_at`, [ROOM]);
console.log('\nthe group now has:');
all.rows.forEach(r => console.log('  ' + String(r.name).padEnd(20) +
  'by ' + String(r.author || '-').padEnd(8) +
  (r.url ? 'url (updates itself)' : (r.b / 1024).toFixed(0) + ' KB frozen copy')));

await c.end();
