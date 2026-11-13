import { chromium } from 'playwright';
import fs from 'node:fs';

// Board colour candidates. Must avoid blue (#3b82f6) and amber (#f59e0b),
// which are the two token colours, and must be clearly lighter than the page
// at #0f1115 so the board reads as an object rather than a shadow.
const OPTIONS = [
  { id: 'current', label: 'Current  #171a21', board: '#171a21', line: '#262b36', hole: '#0b0d11' },
  { id: 'slate',   label: 'Slate  #2f3a4d',   board: '#2f3a4d', line: '#46556e', hole: '#0a0d12' },
  { id: 'teal',    label: 'Teal  #174a54',    board: '#174a54', line: '#2a6f7d', hole: '#07171b' },
  { id: 'graphite',label: 'Graphite  #3a3f4a',board: '#3a3f4a', line: '#555c6b', hole: '#0b0d11' },
];

const b = await chromium.launch();

for (const o of OPTIONS) {
  const p = await (await b.newContext({ viewport: { width: 420, height: 420 }, deviceScaleFactor: 2 })).newPage();
  await p.goto('file:///C:/Users/Jason/dev/HOB_2026_001/public/tic-tak-toe-boom.html');
  await p.waitForTimeout(500);
  for (const label of [/two players/i, /start/i, /play/i]) {
    const btn = p.getByRole('button', { name: label }).first();
    if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click(); break; }
  }
  await p.waitForTimeout(600);
  await p.addStyleTag({ content:
    `#board{background:${o.board} !important;border-color:${o.line} !important}
     .hole > i{background:${o.hole} !important}` });
  // Drop a few tokens so both colours are visible against the board.
  const cols = p.locator('#board .col');
  if (await cols.count() >= 7) {
    for (const i of [3, 3, 2, 4]) { await cols.nth(i).click(); await p.waitForTimeout(420); }
  }
  await p.waitForTimeout(500);
  await p.locator('#board').screenshot({ path: `_opt-${o.id}.png` });
  console.log('rendered', o.id);
}

// One comparison sheet, on the real page background.
const tile = o => `<figure style="margin:0;text-align:center">
  <img src="data:image/png;base64,${fs.readFileSync(`_opt-${o.id}.png`).toString('base64')}" style="width:300px;display:block;border-radius:10px">
  <figcaption style="color:#8b93a3;font:12px system-ui;padding-top:7px">${o.label}</figcaption></figure>`;
const p = await (await b.newContext({ viewport: { width: 660, height: 620 }, deviceScaleFactor: 2 })).newPage();
await p.setContent(`<body style="margin:0;background:#0f1115;display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px">
  ${OPTIONS.map(tile).join('')}</body>`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(400);
await p.screenshot({ path: 'ttt-options.png' });
await b.close();
console.log('comparison: ttt-options.png');
