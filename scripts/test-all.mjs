// Run every suite, then remove what they created.
//
// Cleanup is centralised here rather than repeated in ten files. It is
// deliberately narrow: a room is only removed if its name is one the suites
// use, it was created in the last two hours, and it is not on the keep list.
// Any one of those failing leaves the room alone, because deleting a real
// conversation is far worse than leaving a test room behind.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { connect } from './db.mjs';

const SUITES = [
  'rejoin', 'people', 'packs', 'collision', 'gif',
  'library', 'history-gifs', 'navigation', 'refresh', 'update', 'isolation', 'tools', 'games', 'kelp',
  'boom', 'boom-cpu', 'versus', 'lockdown', 'kit',
];

// Never put a name here that a real group might plausibly use. 'Pure' was in
// test-rejoin and would have been one typo away from deleting the real group.
const TEST_ROOM_NAMES = [
  'Pack Test', 'Collision', 'Gif Test', 'Library', 'History', 'Refresh',
  'First', 'Second', 'People Test', 'Friday Crew', 'Demo', 'Wide Test',
  'Peek', 'Navigation', 'Rejoin Test', 'BOOM-TEST-ROOM',
];
const KEEP_CODES = ['J3TXB', '6MNPQ'];

let failed = 0;
const results = [];

for (const s of SUITES) {
  const file = `test/test-${s}.mjs`;
  if (!fs.existsSync(file)) { console.log(`SKIP ${s} (missing)`); continue; }
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', env: process.env });
  const out = (r.stdout || '') + (r.stderr || '');
  const pass = (out.match(/^PASS/gm) || []).length;
  const fail = (out.match(/^FAIL/gm) || []).length;
  const crashed = r.status !== 0 && fail === 0;
  if (fail || crashed) {
    failed++;
    console.log(`\n--- ${s} ---\n${out.trim().split('\n').slice(-12).join('\n')}`);
  }
  results.push({ s, pass, fail, crashed });
  process.stdout.write(`${s} ${fail || crashed ? 'FAIL' : 'ok'} (${pass})  `);
}

console.log('\n');
for (const r of results) {
  console.log(`  ${r.s.padEnd(14)} ${String(r.pass).padStart(2)} pass  ${r.fail} fail${r.crashed ? '  CRASHED' : ''}`);
}

// Teardown.
const client = await connect();
const { rowCount } = await client.query(
  `delete from rooms
   where name = any($1) and created_at > now() - interval '2 hours' and join_code <> all($2)`,
  [TEST_ROOM_NAMES, KEEP_CODES]);
const left = (await client.query('select count(*) n from rooms')).rows[0].n;
await client.end();
console.log(`\ncleanup: removed ${rowCount} test rooms, ${left} remain`);

process.exit(failed ? 1 : 0);
