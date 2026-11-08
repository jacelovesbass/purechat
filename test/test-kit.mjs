// A room kit: save everything a group brought with it, load it into another.
//
// The test is the round trip through two real groups, because that is the
// thing being asked for. Checking that the zip contains the right files would
// pass just as well if nothing could be loaded back out of it.
import { launch, open, until, closeSheet } from './helpers.mjs';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const browser = await launch();
const a = await open(browser, 'Jason');

/* ---- A group with something in it ---- */

await a.getByPlaceholder('Group name').fill('BOOM-TEST-ROOM');
await a.getByRole('button', { name: 'Create group' }).click();
await a.waitForSelector('.chat header');

await a.locator('.tool.tool-emoji').click();
await a.waitForSelector('.sheet-card');
await a.locator('input[type=file][accept=".zip"]').setInputFiles(path.resolve('public/starter-faces.zip'));
await a.waitForSelector('.cell', { timeout: 20000 });
const emojiBefore = await a.locator('.pack .cell').count();
await closeSheet(a);

await a.locator('.tool.tool-games').click();
await a.waitForSelector('.sheet-card');
await a.locator('input[type=file]').setInputFiles(path.resolve('public/tic-tak-toe-boom.zip'));
await a.waitForSelector('.game-row', { timeout: 20000 });
await closeSheet(a);

console.log(emojiBefore > 0
  ? `PASS: the group has something to save (${emojiBefore} emoji, 1 game)`
  : 'FAIL: nothing was set up to save');

/* ---- Save the kit ---- */

await a.getByRole('button', { name: /^People/ }).click();
await a.waitForSelector('.kit');
const download = await Promise.all([
  a.waitForEvent('download', { timeout: 30000 }),
  a.getByRole('button', { name: 'Save kit' }).click(),
]).then(([d]) => d);

const kitPath = path.join(os.tmpdir(), `purechat-kit-${Date.now()}.zip`);
await download.saveAs(kitPath);
const size = fs.statSync(kitPath).size;
console.log(size > 0
  ? `PASS: the kit saved as one file (${Math.round(size / 1024)} KB)`
  : 'FAIL: the kit is empty');

// It must be a plain zip of plain zips, openable by anything.
const JSZip = (await import('jszip')).default;
const zip = await JSZip.loadAsync(fs.readFileSync(kitPath));
const names = Object.keys(zip.files).filter(n => !zip.files[n].dir).sort();
const manifest = JSON.parse(await zip.file('kit.json').async('string'));
console.log(names.includes('kit.json') && names.some(n => n.startsWith('packs/')) && names.some(n => n.startsWith('games/'))
  ? `PASS: it holds an index, the packs and the games (${names.join(', ')})`
  : `FAIL: the kit holds ${names.join(', ')}`);
console.log(manifest.format === 'purekit/1' && manifest.packs.length === 1 && manifest.games.length === 1
  ? 'PASS: the index names what is inside'
  : `FAIL: manifest is ${JSON.stringify(manifest)}`);

// An inner pack must still be a pack on its own, not something only a kit
// understands. This is the whole reason for nesting zips.
const inner = await JSZip.loadAsync(await zip.file(manifest.packs[0].file).async('nodebuffer'));
console.log(inner.file('pack.json')
  ? 'PASS: a pack pulled out of a kit is still an ordinary pack'
  : `FAIL: the inner file holds ${Object.keys(inner.files).join(', ')}`);

await closeSheet(a);

/* ---- Load it into a different group ---- */

await a.locator('header .back').click();
await a.waitForSelector('.gate');
await a.getByPlaceholder('Group name').fill('BOOM-TEST-ROOM');
await a.getByRole('button', { name: 'Create group' }).click();
await a.waitForSelector('.chat header');

await a.locator('.tool.tool-emoji').click();
await a.waitForSelector('.sheet-card');
const emptyStart = await a.locator('.pack .cell').count();
await closeSheet(a);
console.log(emptyStart === 0
  ? 'PASS: the new group starts with nothing'
  : `FAIL: the new group already has ${emptyStart} emoji`);

await a.getByRole('button', { name: /^People/ }).click();
await a.waitForSelector('.kit');
await a.locator('.kit input[type=file]').setInputFiles(kitPath);
await until(async () => /Added/.test(await a.locator('.kit .muted').allInnerTexts().then(t => t.join(' '))),
  { timeout: 40000 });
const said = (await a.locator('.kit .muted').allInnerTexts()).join(' ');
console.log(/Added 1 pack and 1 game/.test(said)
  ? `PASS: it says what it added ("${said.trim().split('\n')[0]}")`
  : `FAIL: it said "${said}"`);
await closeSheet(a);

/* ---- And the things actually work in the new group ---- */

await a.locator('.tool.tool-emoji').click();
await a.waitForSelector('.sheet-card');
await until(async () => (await a.locator('.pack .cell').count()) === emojiBefore, { timeout: 25000 });
const emojiAfter = await a.locator('.pack .cell').count();
console.log(emojiAfter === emojiBefore
  ? `PASS: all ${emojiAfter} emoji arrived`
  : `FAIL: ${emojiAfter} of ${emojiBefore} emoji arrived`);
await closeSheet(a);

await a.locator('.tool.tool-games').click();
await a.waitForSelector('.sheet-card');
const gameName = await a.locator('.game-name').first().innerText();
console.log(gameName === 'Tic Tak Toe BOOM!'
  ? 'PASS: the game arrived with its proper name, not its filename'
  : `FAIL: the game is called "${gameName}"`);

// The real test of a game is that it runs.
await a.locator('.game-play').first().click();
await a.waitForSelector('iframe.game-frame');
await a.frameLocator('iframe.game-frame').locator('#go').waitFor({ timeout: 15000 });
console.log('PASS: and it still runs');

await a.screenshot({ path: 'shot-kit-1.png' });
fs.unlinkSync(kitPath);
await browser.close();
