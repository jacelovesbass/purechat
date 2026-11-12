// The database is closed.
//
// This is the suite that exists to fail loudly if the exposure ever comes
// back. On 2026-11-06 and again on 2026-11-07, every group, join code and
// message in the real database could be read with one command, using only the
// publishable key that ships inside the browser bundle. No login.
//
// So the first checks here are deliberately written as the ATTACK, not as a
// feature test: take the key out of the public bundle, ask for everything, and
// assert you get nothing. A test phrased as "a member can read their room"
// would pass just as happily with the door wide open.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { sessionFor } from './sessions.mjs';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;

const fresh = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/**
 * A signed-in client, reusing a pooled identity rather than minting one.
 *
 * These identities must be members of nothing, which they are: the room this
 * suite creates is deleted at the end and `members` cascades with it, so each
 * pooled identity comes back to this suite as clean as it started. Minting
 * four new ones per run was burning the project's anonymous sign-in rate
 * limit, and the suite was failing on that rather than on anything real.
 */
async function signedIn(who) {
  const sb = fresh();
  const s = await sessionFor(`lockdown-${who}`);
  const { error } = await sb.auth.setSession({
    access_token: s.access_token, refresh_token: s.refresh_token,
  });
  if (error) throw new Error(`could not restore ${who}: ${error.message}`);
  return sb;
}
const TABLES = ['rooms', 'messages', 'members', 'packs', 'emoji', 'games'];

let failed = 0;
const check = (ok, pass, fail) => { console.log(ok ? `PASS: ${pass}` : `FAIL: ${fail}`); if (!ok) failed++; };

/* ---- 1. The key on its own, with no session at all ---- */

const stranger = fresh();
const leaked = [];
for (const t of TABLES) {
  const { data } = await stranger.from(t).select('*').limit(5);
  if (data && data.length) leaked.push(`${t}:${data.length}`);
}
check(leaked.length === 0,
  'the publishable key with no session reads nothing from any table',
  `the key still reads ${leaked.join(' ')}`);

/* ---- 2. Signed in, but a member of nothing ---- */

let nobody;
try {
  nobody = await signedIn('nobody');
} catch (e) {
  console.log(`FAIL: could not get an anonymous identity (${e.message})`);
  console.log('  Check: Dashboard > Authentication > Sign In / Providers > Anonymous sign-ins');
  process.exit(1);
}
const { data: { user: anonUser } } = await nobody.auth.getUser();
check(Boolean(anonUser?.id) && anonUser.is_anonymous,
  'a device can get an identity without an account', 'no anonymous uid');

const seen = [];
for (const t of TABLES) {
  const { data } = await nobody.from(t).select('*').limit(5);
  if (data && data.length) seen.push(`${t}:${data.length}`);
}
check(seen.length === 0,
  'a signed-in stranger who has joined nothing still reads nothing',
  `a stranger reads ${seen.join(' ')}`);

// Enumeration is the specific thing that was possible: list every room, take
// its join code, walk in.
const { data: allRooms } = await nobody.from('rooms').select('id,join_code');
check(!allRooms || allRooms.length === 0,
  'rooms cannot be enumerated, so join codes cannot be harvested',
  `${allRooms?.length} rooms are still listable`);

/* ---- 3. A member can use their own group, and only their own ---- */

const alice = await signedIn('alice');
const bob = await signedIn('bob');

const code = 'ZZ' + Math.random().toString(36).slice(2, 5).toUpperCase();
const one = d => { const r = Array.isArray(d) ? d[0] : d; return r && r.id ? r : null; };

const { data: madeRaw, error: makeErr } = await alice.rpc('create_room',
  { p_name: 'BOOM-TEST-ROOM', p_code: code, p_member: 'Alice' });
const made = one(madeRaw);
check(!makeErr && made?.id, 'a signed-in device can create a group', `create_room failed: ${makeErr?.message}`);

const { error: postErr } = await alice.from('messages')
  .insert({ room_id: made.id, author: 'Alice', body: 'hello' });
const { data: mine } = await alice.from('messages').select('*').eq('room_id', made.id);
check(mine?.length === 1, 'the creator can post and read in their own group',
  `the creator sees ${mine?.length} messages${postErr ? ' (' + postErr.message + ')' : ''}`);

// Bob holds the key and a session, and knows nothing else.
const { data: bobSees } = await bob.from('messages').select('*').eq('room_id', made.id);
check(!bobSees || bobSees.length === 0,
  'someone outside the group cannot read it even knowing its id',
  `an outsider read ${bobSees?.length} messages`);

const { data: bobWrite, error: bobWriteErr } = await bob.from('messages')
  .insert({ room_id: made.id, author: 'Bob', body: 'let me in' }).select();
check(bobWriteErr || !bobWrite?.length,
  'an outsider cannot post into a group they are not in',
  'an outsider posted a message');

// The code is the capability. With it, Bob is in.
const { data: joinedRaw, error: joinErr } = await bob.rpc('join_room', { p_code: code, p_name: 'Bob' });
check(!joinErr && one(joinedRaw)?.id === made.id,
  'the join code, and only the join code, lets you in',
  `join_room failed: ${joinErr?.message}`);

const { data: bobNow } = await bob.from('messages').select('*').eq('room_id', made.id);
check(bobNow?.length === 1, 'once joined, the history is readable',
  `a member sees ${bobNow?.length} messages`);

// A wrong code is simply nothing, not an error that confirms the room exists.
const { data: wrongRaw } = await bob.rpc('join_room', { p_code: 'AAAAA', p_name: 'Bob' });
check(one(wrongRaw) === null, 'a wrong code returns nothing', 'a wrong code returned a room');

/* ---- 4. Joining is idempotent, which the chat relies on ---- */

await bob.rpc('join_room', { p_code: code, p_name: 'Bob' });
await bob.rpc('join_room', { p_code: code, p_name: 'Bob' });
const { data: roster } = await alice.from('members').select('name').eq('room_id', made.id);
check(roster?.length === 2,
  're-joining is a heartbeat, not a second seat',
  `the roster holds ${roster?.length} rows: ${JSON.stringify(roster)}`);

/* ---- 5. Two devices, one name, nobody evicted ---- */

const impostor = await signedIn('impostor');
await impostor.rpc('join_room', { p_code: code, p_name: 'Bob' });
const { data: bobStill } = await bob.from('messages').select('id').eq('room_id', made.id);
check(bobStill?.length === 1,
  'somebody joining under your name does not take your membership',
  'the original Bob was evicted by a name clash');

/* ---- 6. A person may own two phones ---- */

// The case the first version got wrong. Identity is per browser, and on iOS
// the installed app and the browser tab are separate storage, so one person
// routinely arrives twice. They must still be called what they are called.
// The rule that used to rename the second arrival was guarding against name
// squatting inside a private group of friends, which is not a threat anybody
// has, and it cost a real person their name in the real group.
{
  const phone = await signedIn('alice-phone');
  await phone.rpc('join_room', { p_code: code, p_name: 'Alice' });

  const { data: rows } = await alice.from('members').select('name,user_id').eq('room_id', made.id);
  const alices = rows.filter(r => r.name === 'Alice');
  check(alices.length === 2 && new Set(alices.map(r => r.user_id)).size === 2,
    'a second device keeps your name instead of becoming "Alice (2)"',
    `Alice rows: ${JSON.stringify(rows.map(r => r.name))}`);

  const { data: phoneSees } = await phone.from('messages').select('id').eq('room_id', made.id);
  check(phoneSees?.length === 1, 'and the second device can read the group',
    `the second device sees ${phoneSees?.length} messages`);

  // The first device must not have been displaced by the second.
  const { data: stillThere } = await alice.from('messages').select('id').eq('room_id', made.id);
  check(stillThere?.length === 1, 'while the first device keeps working',
    'the first device lost access when the second arrived');
}

/* ---- 7. The upgrade path everybody already in a group will take ---- */

// Rows created before identities existed have no owner. The first device to
// turn up with that name must CLAIM the row, not sit beside it as a duplicate.
// This is exactly what the four people already in Pure Empathy will do on
// their next load, and it is the one path that cannot be retried if it is
// wrong, so it is tested on a planted row rather than on them.
{
  const { connect } = await import('../scripts/db.mjs');
  const db0 = await connect();
  await db0.query(
    `insert into members (room_id, name, user_id) values ($1, 'Oldtimer', null)`, [made.id]);
  await db0.end();

  const returning = await signedIn('oldtimer');
  const { data: backRaw } = await returning.rpc('join_room', { p_code: code, p_name: 'Oldtimer' });
  check(one(backRaw)?.id === made.id, 'an existing member can re-join after identities arrive',
    'the upgrade path failed');

  const { data: rows } = await alice.from('members').select('name,user_id').eq('room_id', made.id);
  const oldtimers = rows.filter(r => r.name === 'Oldtimer');
  check(oldtimers.length === 1 && oldtimers[0].user_id,
    'the old row is claimed, not duplicated, so nobody becomes "Name (2)"',
    `Oldtimer rows: ${JSON.stringify(oldtimers)}`);

  const { data: canRead } = await returning.from('messages').select('id').eq('room_id', made.id);
  check(canRead?.length === 1, 'and they can read the history they always could',
    `they see ${canRead?.length} messages`);
}

/* ---- clean up ---- */

const { connect } = await import('../scripts/db.mjs');
const db = await connect();
await db.query('delete from rooms where join_code = $1', [code]);
await db.end();

process.exit(failed ? 1 : 0);
