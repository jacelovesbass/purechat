// Wrap Mechafauna as a puregame/1 pack, and publish the bare file beside it.
// Same shape as make-fennec-pack.mjs, and deliberately the same guards: this
// game came from outside the project, so it gets checked harder, not less.
import JSZip from 'jszip';
import fs from 'node:fs';

const DIR = 'games/mechafauna';
const html = fs.readFileSync(`${DIR}/index.html`, 'utf8');
const meta = JSON.parse(fs.readFileSync(`${DIR}/game.json`, 'utf8'));

// A game has to carry everything it uses. Mechafauna arrived pulling two
// typefaces from Google Fonts, which is why this check earns its keep.
const remote = html.match(/(src|href)\s*=\s*["']https?:/gi);
if (remote) throw new Error(`game loads ${remote.length} remote asset(s); a game must be self-contained`);

const bytes = Buffer.byteLength(html);
const LIMIT = 512 * 1024;
if (bytes > LIMIT) throw new Error(`index.html is ${bytes} bytes, over the ${LIMIT} limit`);

// Built, not hand-edited: index.html is assembled from src/ by tools/build.py in
// the game's own repo, and the placeholders must not survive into a shipped file.
for (const ph of ['/*__ART__*/', '/*__AUDIO__*/'])
  if (html.includes(ph)) throw new Error(`unbuilt game: ${ph} is still in index.html`);
if (!html.includes('ART_FN')) throw new Error('index.html does not look like the built game');

const zip = new JSZip();
zip.file('game.json', JSON.stringify(meta, null, 2));
zip.file('index.html', html);

const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync('public/mechafauna.zip', out);
fs.writeFileSync('public/mechafauna.html', html);

const fonts = (html.match(/@font-face/g) || []).length;
console.log(`mechafauna.zip    ${(out.length / 1024).toFixed(1)} KB`);
console.log(`mechafauna.html   ${(bytes / 1024).toFixed(1)} KB of the 512 KB limit`);
console.log(`no remote assets, ${fonts} inlined font faces`);
