// Run the game the way Pure Chat actually runs it: an iframe with sandbox="allow-scripts"
// and no allow-same-origin, loaded from srcdoc. That is an opaque origin with no storage,
// no cookies and no network, and it is the only condition that proves anything.
import { chromium } from 'playwright';
import fs from 'node:fs';

const html = fs.readFileSync('games/fennec-run/index.html', 'utf8');

const b = await chromium.launch({ args: [
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows'
]});
const p = await (await b.newContext({ viewport:{width:430,height:760} })).newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

// a stand-in host page
await p.setContent(`<!doctype html><style>
  html,body{margin:0;height:100%;background:#1b1f2a;display:flex;flex-direction:column}
  #bar{color:#9aa6c0;font:13px system-ui;padding:8px 12px}
  iframe{border:0;flex:1;width:100%}
</style>
<div id="bar">Pure Chat (stand-in host)</div>
<iframe id="f" sandbox="allow-scripts"></iframe>
<script>
  window.__got = [];
  addEventListener('message', e => {
    __got.push(e.data);
    if (e.data && e.data.type === 'ready')
      document.getElementById('f').contentWindow.postMessage({ type:'host', name:'Sam' }, '*');
  });
</script>`);

await p.evaluate(src => { document.getElementById('f').srcdoc = src; }, html);
await p.waitForTimeout(900);

const ok = [], bad = [];
const check = (n, c, got) => { const l = n + (got !== undefined ? '  → ' + got : '');
  (c ? ok : bad).push(l); console.log((c ? '  ok  ' : '  FAIL ') + l); };

const frame = p.frames().find(f => f !== p.mainFrame());
check('the sandboxed frame is reachable', !!frame);

// it must be a genuinely opaque origin, or this test proves nothing
const opaque = await frame.evaluate(() => {
  let storage = 'available';
  try { localStorage.getItem('x'); } catch (e) { storage = 'blocked'; }
  return { origin: String(location.origin), storage: storage, sameOrigin: (() => {
    try { return !!parent.document; } catch (e) { return false; } })() };
});
check('origin is opaque', opaque.origin === 'null', opaque.origin);
check('localStorage is blocked', opaque.storage === 'blocked', opaque.storage);
check('cannot reach the host document', opaque.sameOrigin === false);

// the game itself
const ready = await p.evaluate(() => window.__got.map(m => m && m.type));
check('game announced itself with ready', ready.indexOf('ready') >= 0, JSON.stringify(ready));

const greeted = await frame.evaluate(() => document.getElementById('inner').textContent);
check('host name reached the title card', greeted.indexOf('Sam') >= 0,
      greeted.slice(0, 48).trim() + '…');

const loop = await frame.evaluate(async () => {
  const a = __g.frames;
  await new Promise(r => setTimeout(r, 400));
  return __g.frames - a;
});
check('the loop runs inside the sandbox', loop > 8, loop + ' frames / 400ms');

await frame.click('#start');
await frame.waitForTimeout(200);
const moved = await frame.evaluate(async () => {
  const x0 = __g.fox.x;
  const b = document.getElementById('bJ');
  window.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowRight' }));
  await new Promise(r => setTimeout(r, 600));
  window.dispatchEvent(new KeyboardEvent('keyup', { key:'ArrowRight' }));
  return { moved: __g.fox.x - x0, state: __g.state, hasBtn: !!b };
});
check('the fox runs inside the sandbox', moved.moved > 50, 'moved ' + Math.round(moved.moved));

// a score must reach the host across the opaque boundary
await frame.evaluate(() => { __g.fox.hearts = 1; __g.fox.y = 1000; });
await p.waitForTimeout(600);
const dead = await frame.evaluate(() => __g.state);
check('a pit still ends the run in the sandbox', dead === 'dead', dead);
await frame.click('#post');
await p.waitForTimeout(200);
const got = await p.evaluate(() => window.__got.filter(m => m && m.type === 'score'));
check('the score crossed into the host', got.length === 1, JSON.stringify(got[0] || null));
check('score is a number', typeof (got[0]||{}).score === 'number', (got[0]||{}).score);

await p.screenshot({ path: 'games/fennec-run/in-chat.png' });
await b.close();

console.log(errs.length ? '\nPAGE ERRORS:\n' + errs.join('\n') : '\nno page errors');
console.log(bad.length ? '\n' + bad.length + ' FAILED' : '\nall ' + ok.length + ' sandbox checks passed');
process.exit(bad.length || errs.length ? 1 : 0);
