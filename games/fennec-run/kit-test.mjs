// The power-ups and the sound. Both are new verbs, so both get driven rather
// than looked at. Audio is checked by measuring the output, not by trusting
// that a node was created.
import { chromium } from 'playwright';

const URL = process.argv[2] || 'file:///C:/Users/Jason/dev/HOB_2026_001/games/fennec-run/index.html';
const b = await chromium.launch({ args:[
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--autoplay-policy=no-user-gesture-required'
]});
const p = await (await b.newContext({ viewport:{width:900,height:560} })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto(URL);
await p.waitForTimeout(300);

const ok = [], bad = [];
const check = (n, c, got) => { const l = n + (got !== undefined ? '  → ' + got : '');
  (c ? ok : bad).push(l); console.log((c ? '  ok  ' : '  FAIL ') + l); };
const frames = n => p.evaluate(async k => {
  for (let i = 0; i < k; i++) await new Promise(r => requestAnimationFrame(r)); }, n);

await p.click('#start');
await p.waitForTimeout(200);

/* ---------------- the Bound ---------------- */
const noBound = await p.evaluate(async () => {
  __g.fox.x = 150; __g.fox.y = 300; __g.fox.vx = 0; __g.fox.vy = 0;
  __g.fox.onGround = true; __g.fox.bounds = 0;
  __g.fox.buffer = 8;                                   // jump
  for (let i = 0; i < 14; i++) await new Promise(r => requestAnimationFrame(r));
  const beforeY = __g.fox.y, beforeVy = __g.fox.vy;
  __g.fox.buffer = 8;                                   // ask for a second one
  for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
  return { rose: beforeVy - __g.fox.vy, beforeY: Math.round(beforeY) };
});
check('no second jump without a Bound charge', noBound.rose < 2, 'vy change ' +
      noBound.rose.toFixed(1));

const withBound = await p.evaluate(async () => {
  __g.fox.x = 150; __g.fox.y = 300; __g.fox.vx = 0; __g.fox.vy = 0;
  __g.fox.onGround = true; __g.fox.bounds = 1; __g.fox.usedBound = false;
  __g.fox.buffer = 8;
  for (let i = 0; i < 16; i++) await new Promise(r => requestAnimationFrame(r));
  const apex1 = __g.fox.y, vyBefore = __g.fox.vy;
  __g.fox.buffer = 8;
  for (let i = 0; i < 2; i++) await new Promise(r => requestAnimationFrame(r));
  const vyAfter = __g.fox.vy;
  let top = apex1;
  for (let i = 0; i < 40; i++){ await new Promise(r => requestAnimationFrame(r));
    top = Math.min(top, __g.fox.y); }
  return { kicked: vyBefore - vyAfter, higher: apex1 - top,
           left: __g.fox.bounds, used: __g.fox.usedBound };
});
check('a Bound kicks the fox upward again', withBound.kicked > 5,
      'vy jumped by ' + withBound.kicked.toFixed(1));
check('the Bound gains real height', withBound.higher > 30,
      'rose a further ' + Math.round(withBound.higher));
check('the Bound is spent', withBound.left === 0, 'charges left ' + withBound.left);

const onlyOne = await p.evaluate(async () => {
  __g.fox.bounds = 2;                                   // plenty of charge
  __g.fox.buffer = 8;                                   // but already bounded
  for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
  return __g.fox.bounds;
});
check('only one Bound per trip through the air', onlyOne === 2, 'charges still ' + onlyOne);

const recharges = await p.evaluate(async () => {
  __g.fox.y = 300; __g.fox.vy = 0; __g.fox.onGround = true; __g.fox.bounds = 1;
  for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r));
  return __g.fox.usedBound;
});
check('landing restores the right to Bound again', recharges === false);

const earns = await p.evaluate(async () => {
  __g.goto(0);
  __g.fox.bounds = 0; __g.fox.charge = 0; __g.fox.inv = 999;
  const take = __g.pickups().filter(d => !d.got).slice(0, 5);
  for (const d of take){
    __g.fox.x = d.x; __g.fox.y = d.y + 26;
    await new Promise(r => requestAnimationFrame(r));
  }
  return __g.fox.bounds;
});
check('five dates buy a Bound', earns >= 1, earns + ' charge(s)');

/* ---------------- the Dash ---------------- */
const noDash = await p.evaluate(async () => {
  __g.goto(0);
  __g.fox.x = 200; __g.fox.y = 300; __g.fox.vx = 0; __g.fox.dashReady = 0;
  __g.fox.dashBuf = 8;
  for (let i = 0; i < 8; i++) await new Promise(r => requestAnimationFrame(r));
  return { moved: Math.round(__g.fox.x - 200), dashing: __g.fox.dashing };
});
check('no dash without a moonflower', noDash.dashing <= 0 && noDash.moved < 10,
      'moved ' + noDash.moved);

const dash = await p.evaluate(async () => {
  __g.fox.x = 200; __g.fox.y = 300; __g.fox.vx = 0; __g.fox.vy = 0;
  __g.fox.dir = 1; __g.fox.onGround = true; __g.fox.dashReady = 1;
  __g.fox.dashBuf = 8;
  let airborneY = null;
  for (let i = 0; i < 12; i++){ await new Promise(r => requestAnimationFrame(r));
    if (i === 4) airborneY = __g.fox.y; }
  return { moved: Math.round(__g.fox.x - 200), left: __g.fox.dashReady,
           heldHeight: Math.round(Math.abs(airborneY - 300)) };
});
check('a dash throws the fox forward', dash.moved > 50, 'moved ' + dash.moved + ' units');
check('the dash is spent', dash.left === 0, 'dashes left ' + dash.left);
check('gravity is suspended during the dash', dash.heldHeight < 3,
      'drifted ' + dash.heldHeight);

const flower = await p.evaluate(async () => {
  __g.goto(1);
  __g.fox.dashReady = 0; __g.fox.inv = 999;
  const f = __g.flowers()[0];
  __g.fox.x = f.x; __g.fox.y = f.y + 26;
  for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
  return { got: f.got, ready: __g.fox.dashReady,
           cls: document.body.classList.contains('candash') };
});
check('a moonflower grants a dash', flower.got && flower.ready === 1, 'ready=' + flower.ready);
check('the DASH button appears only once earned', flower.cls);

/* ---------------- the melon ---------------- */
const melon = await p.evaluate(async () => {
  __g.goto(0);
  __g.fox.hearts = 1; __g.fox.inv = 999;
  const m = __g.melons()[0];
  __g.fox.x = m.x; __g.fox.y = m.y + 26;
  for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
  const after = __g.fox.hearts;
  // a second one at full hearts must not go to four
  __g.fox.hearts = 3;
  const m2 = __g.melons()[1] || null;
  if (m2){ __g.fox.x = m2.x; __g.fox.y = m2.y + 26;
    for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r)); }
  return { after: after, capped: __g.fox.hearts };
});
check('a melon restores a heart', melon.after === 2, 'hearts ' + melon.after);
check('hearts never exceed three', melon.capped === 3, 'hearts ' + melon.capped);

/* ---------------- sound ---------------- */
const audio = await p.evaluate(async () => {
  // Reach into the running context and measure what it is actually emitting.
  const ctxs = [];
  const probe = { state:'none', peak:0, nodes:0 };
  try {
    __g.snd.start();
    const ac = __g.snd.ctx();
    if (!ac) return probe;
    probe.state = ac.state;
    const an = ac.createAnalyser();
    __g.snd.tap(an);
    await new Promise(r => setTimeout(r, 1400));   // let a bar or two go by
    const buf = new Float32Array(an.fftSize);
    let peak = 0;
    for (let k = 0; k < 16; k++){
      an.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      await new Promise(r => setTimeout(r, 60));
    }
    probe.peak = peak;
    probe.state = ac.state;
  } catch (e) { probe.state = 'error: ' + e; }
  return probe;
});
check('the audio context is running', audio.state === 'running', audio.state);
check('the music actually produces sound', audio.peak > 0.001,
      'peak amplitude ' + audio.peak.toFixed(4));

// drive the button a player actually taps, not the function behind it
await p.dispatchEvent('#mute', 'pointerdown');
await p.waitForTimeout(350);
const muted = await p.evaluate(() => ({
  quiet: document.body.classList.contains('quiet'),
  st: __g.snd.ctx() ? __g.snd.ctx().state : 'none'
}));
await p.dispatchEvent('#mute', 'pointerdown');
await p.waitForTimeout(250);
muted.on = await p.evaluate(() => __g.snd.enabled() &&
  !document.body.classList.contains('quiet'));
check('muting suspends the audio', muted.st === 'suspended', muted.st);
check('muting marks the page quiet', muted.quiet);
check('unmuting restores it', muted.on === true);

/* ---------------- the rule still holds with the new abilities ---------------- */
const audits = await p.evaluate(() => __g.levels.map(L => __g.audit(L)));
for (const a of audits)
  check('"' + a.level + '" still passes the rule with fruit added',
        a.problems.length === 0, a.problems.join(' | ') || 'clean');

const assistBites = await p.evaluate(() => {
  // a platform only a dash can reach must be reported, not quietly allowed
  const L = JSON.parse(JSON.stringify(__g.levels[0]));
  // 110 above the ground directly below it: past a plain jump's 91, inside a
  // Bound's reach, and too far from any neighbour to be had the easy way
  L.plats.push({ x: 2500, y: 190, w: 40 });
  const r = __g.audit(L);
  return r.problems.filter(s => s.indexOf('y=190') >= 0 &&
                               s.indexOf('glide, bound or dash') >= 0).length;
});
check('a platform needing an assist is still flagged', assistBites > 0,
      assistBites + ' reported');

await p.screenshot({ path: 'games/fennec-run/kit.png' });
await b.close();
console.log(errs.length ? '\nPAGE ERRORS:\n' + errs.join('\n') : '\nno page errors');
console.log(bad.length ? '\n' + bad.length + ' FAILED' : '\nall ' + ok.length + ' checks passed');
process.exit(bad.length || errs.length ? 1 : 0);
