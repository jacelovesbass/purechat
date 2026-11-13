import { chromium } from 'playwright';
const out = process.argv[2] || 'ttt.png';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:390,height:800} })).newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto('file:///C:/Users/Jason/dev/HOB_2026_001/public/tic-tak-toe-boom.html');
await p.waitForTimeout(700);
// Get past the start screen if there is one.
for (const label of [/two players/i, /start/i, /play/i]) {
  const btn = p.getByRole('button', { name: label }).first();
  if (await btn.count() && await btn.isVisible().catch(()=>false)) { await btn.click(); break; }
}
await p.waitForTimeout(900);
await p.screenshot({ path: out });
console.log('shot', out, errs.length ? errs.slice(0,2) : '');
await b.close();
