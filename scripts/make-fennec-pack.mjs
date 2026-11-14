// Wrap Fennec as a puregame/1 pack, so it arrives with its name, a credit and a
// description instead of being named after the file it came from.
import JSZip from 'jszip';
import fs from 'node:fs';

const DIR = 'games/fennec-run';
const html = fs.readFileSync(`${DIR}/index.html`, 'utf8');
const meta = JSON.parse(fs.readFileSync(`${DIR}/game.json`, 'utf8'));

// The sandbox has no network, so anything the game needs must already be inside it.
const remote = html.match(/(src|href)\s*=\s*["']https?:/gi);
if (remote) throw new Error(`game loads ${remote.length} remote asset(s); the sandbox has no network`);

const bytes = Buffer.byteLength(html);
const LIMIT = 512 * 1024;
if (bytes > LIMIT) throw new Error(`index.html is ${bytes} bytes, over the ${LIMIT} limit`);

const zip = new JSZip();
zip.file('game.json', JSON.stringify(meta, null, 2));
zip.file('index.html', html);

const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync('public/fennec.zip', out);

// Also publish the bare file, so the game can be played at a URL before anyone
// decides whether it belongs in a group. games/fennec-run/index.html stays the
// one source; both of these are built from it.
fs.writeFileSync('public/fennec.html', html);

console.log(`fennec.zip        ${(out.length / 1024).toFixed(1)} KB`);
console.log(`fennec.html       ${(bytes / 1024).toFixed(1)} KB of the 512 KB limit`);
console.log(`no remote assets`);
