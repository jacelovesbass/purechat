// Read only. Answers one question: what is actually installed in the group.
import { connect } from '../../scripts/db.mjs';
const c = await connect();
const g = await c.query(
  `select r.name as room, g.name, g.author, g.added_by,
          length(g.html) as bytes, g.created_at
     from games g join rooms r on r.id = g.room_id
    order by r.name, g.created_at`);
if (!g.rows.length) console.log('no games installed in any room');
g.rows.forEach(r => console.log(
  String(r.room).padEnd(14) + String(r.name).padEnd(20) +
  'by ' + String(r.author || '-').padEnd(8) +
  (r.bytes / 1024).toFixed(0).padStart(4) + ' KB   ' +
  r.created_at.toISOString().slice(0, 16).replace('T', ' ')));
const f = g.rows.filter(r => /fennec/i.test(r.name));
console.log('\nFennec installed: ' + (f.length ? 'YES in ' + f.map(r => r.room).join(', ') : 'NO'));
await c.end();
