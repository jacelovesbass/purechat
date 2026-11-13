import { chromium } from 'playwright';
import fs from 'node:fs';
const b = await chromium.launch();
const errs = [];

const shoot = async (name, fn) => {
  const p = await (await b.newContext({ viewport:{width:420,height:460}, deviceScaleFactor:2 })).newPage();
  p.on('pageerror', e => errs.push(name + ': ' + e));
  await p.goto('file:///C:/Users/Jason/dev/HOB_2026_001/public/tic-tak-toe-boom.html');
  await p.waitForTimeout(500);
  for (const l of [/two players/i, /start/i, /play/i]) {
    const btn = p.getByRole('button', { name: l }).first();
    if (await btn.count() && await btn.isVisible().catch(()=>false)) { await btn.click(); break; }
  }
  await p.waitForTimeout(600);
  await fn(p);
  await p.locator('#board').screenshot({ path: `_s-${name}.png` });
  return p;
};

const drop = async (p, cols) => {
  const c = p.locator('#board .col');
  for (const i of cols) { await c.nth(i).click(); await p.waitForTimeout(400); }
};

await shoot('play', async p => { await drop(p, [3,3,2,4,2,5]); await p.waitForTimeout(400); });
await shoot('target', async p => {
  await drop(p, [3,3,2,4]);
  const boom = p.locator('.panel .boom').last();
  if (await boom.count()) { await boom.click(); await p.waitForTimeout(600); }
});

const tile = (n, label) => `<figure style="margin:0;text-align:center">
  <img src="data:image/png;base64,${fs.readFileSync(`_s-${n}.png`).toString('base64')}" style="width:330px;display:block;border-radius:10px">
  <figcaption style="color:#8b93a3;font:12px system-ui;padding-top:7px">${label}</figcaption></figure>`;
const p = await (await b.newContext({ viewport:{width:730,height:330}, deviceScaleFactor:2 })).newPage();
await p.setContent(`<body style="margin:0;background:#0f1115;display:flex;gap:18px;padding:16px">
  ${tile('play','In play')}${tile('target','BOOM armed, choosing a target')}</body>`, { waitUntil:'domcontentloaded' });
await p.waitForTimeout(300);
await p.screenshot({ path: 'ttt-states.png' });
await b.close();
console.log(errs.length ? 'errors: ' + errs.slice(0,3).join(' | ') : 'no page errors');
