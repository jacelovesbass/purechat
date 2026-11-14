// A url-backed game loads with src= instead of srcDoc=, which is a different
// iframe entirely: a real https document rather than an inline one. The sandbox
// promises have to be re-checked under that, not assumed from the srcdoc case.
import { chromium } from 'playwright';

const GAME_URL = 'https://jacelovesbass.github.io/purechat/fennec.html';
const b = await chromium.launch({ args:[
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows'
]});
const p = await (await b.newContext({ viewport:{width:430,height:780} })).newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

// the host, exactly as src/tools/games.jsx builds it for a url game
await p.setContent(`<!doctype html><style>
  html,body{margin:0;height:100%;background:#1b1f2a;display:flex;flex-direction:column}
  #bar{color:#9aa6c0;font:13px system-ui;padding:8px 12px}
  iframe{border:0;flex:1;width:100%}
</style>
<div id="bar">Pure Chat (stand-in host, url mode)</div>
<iframe id="f" sandbox="allow-scripts" src="${GAME_URL}"></iframe>
<script>
  window.__got = [];
  addEventListener('message', e => {
    __got.push(e.data);
    if (e.data && e.data.type === 'ready')
      document.getElementById('f').contentWindow.postMessage({ type:'host', name:'Sam' }, '*');
  });
<\/script>`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);

const ok = [], bad = [];
const check = (n, c, got) => { const l = n + (got !== undefined ? '  → ' + got : '');
  (c ? ok : bad).push(l); console.log((c ? '  ok  ' : '  FAIL ') + l); };

const frame = p.frames().find(f => f !== p.mainFrame());
check('the url frame loaded', !!frame);

const opaque = await frame.evaluate(() => {
  let storage = 'available';
  try { localStorage.getItem('x'); } catch (e) { storage = 'blocked'; }
  let session = 'available';
  try { sessionStorage.getItem('x'); } catch (e) { session = 'blocked'; }
  let cookies = 'available';
  try { void document.cookie; } catch (e) { cookies = 'blocked'; }
  let host = true;
  try { host = !!parent.document; } catch (e) { host = false; }
  let hostLoc = true;
  try { hostLoc = !!String(parent.location.href); } catch (e) { hostLoc = false; }
  return { origin: String(location.origin), storage, session, cookies, host, hostLoc,
           href: location.href };
});
// In url mode location.origin reports the URL's origin rather than "null".
// That is a reporting quirk, not the security boundary: the boundary is that
// storage is unreachable, which is only true BECAUSE the sandbox has forced an
// opaque origin. The game is served from the same origin as the app, so if the
// opaque origin were not in force this is exactly where it would read the
// app's Supabase session out of localStorage. It cannot.
check('cannot touch localStorage, where the app keeps its session',
      opaque.storage === 'blocked', opaque.storage);
check('cannot touch sessionStorage', opaque.session === 'blocked', opaque.session);
check('cannot reach the host document', opaque.host === false);
check('cannot read the host location', opaque.hostLoc === false);
check('it is the deployed file', /fennec\.html$/.test(opaque.href), opaque.href);

const ready = await p.evaluate(() => window.__got.map(m => m && m.type));
check('announces ready across the boundary', ready.indexOf('ready') >= 0, JSON.stringify(ready));

const greeted = await frame.evaluate(() => document.getElementById('inner').textContent);
check('the host name reaches the title card', greeted.indexOf('Sam') >= 0,
      greeted.slice(0, 40).trim() + '…');

const live = await frame.evaluate(async () => {
  const a = __g.frames;
  await new Promise(r => setTimeout(r, 500));
  return { frames: __g.frames - a, stages: __g.levels.length,
           maxzoom: typeof __g.view.scale === 'number' };
});
check('the loop runs', live.frames > 10, live.frames + ' frames / 500ms');
check('it is the five stage build', live.stages === 5, live.stages + ' stages');

await frame.click('#start');
await frame.waitForTimeout(300);
const moved = await frame.evaluate(async () => {
  const x0 = __g.fox.x;
  window.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowRight' }));
  await new Promise(r => setTimeout(r, 600));
  window.dispatchEvent(new KeyboardEvent('keyup', { key:'ArrowRight' }));
  return __g.fox.x - x0;
});
check('the fox runs', moved > 50, 'moved ' + Math.round(moved));

const sound = await frame.evaluate(async () => {
  try {
    __g.snd.start();
    const ac = __g.snd.ctx();
    if (!ac) return { state:'no context', peak:0 };
    const an = ac.createAnalyser(); __g.snd.tap(an);
    await new Promise(r => setTimeout(r, 1200));
    const buf = new Float32Array(an.fftSize);
    let peak = 0;
    for (let k = 0; k < 12; k++){
      an.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      await new Promise(r => setTimeout(r, 60));
    }
    return { state: ac.state, peak: +peak.toFixed(4) };
  } catch (e) { return { state: 'error: ' + e, peak: 0 }; }
});
check('music plays in url mode', sound.state === 'running' && sound.peak > 0.001,
      sound.state + ', peak ' + sound.peak);

await frame.evaluate(() => { __g.fox.hearts = 1; __g.fox.y = 2000; });
await p.waitForTimeout(700);
await frame.click('#post');
await p.waitForTimeout(300);
const score = await p.evaluate(() => window.__got.filter(m => m && m.type === 'score'));
check('a score still reaches the chat', score.length === 1, JSON.stringify(score[0] || null));

await b.close();
console.log(errs.length ? '\nPAGE ERRORS:\n' + errs.join('\n') : '\nno page errors');
console.log(bad.length ? '\n' + bad.length + ' FAILED' : '\nall ' + ok.length + ' url-mode checks passed');
process.exit(bad.length ? 1 : 0);
