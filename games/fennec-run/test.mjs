// Drive the game the way a player would, and check the things a screenshot cannot.
import { chromium } from 'playwright';

const URL = 'file:///C:/Users/Jason/dev/HOB_2026_001/games/fennec-run/index.html';
// Headless Chromium throttles requestAnimationFrame on a backgrounded page, which
// freezes the game loop and makes every physics check fail for no reason.
const b = await chromium.launch({ args: [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows'
]});
const ctx = await b.newContext({ viewport:{width:820,height:460}, deviceScaleFactor:2 });
const p = await ctx.newPage();
await p.bringToFront();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto(URL);

const S = () => p.evaluate(() => ({
  st: __g.state, lv: __g.lv, x:+__g.fox.x.toFixed(0), y:+__g.fox.y.toFixed(0),
  hp: __g.fox.hearts, dates: __g.dates, total: __g.total, ground: __g.fox.onGround
}));
const ok = [], bad = [];
const check = (name, cond, got) => {
  const line = name + (got !== undefined ? '  → ' + got : '');
  (cond ? ok : bad).push(line);
  console.log((cond ? '  ok  ' : '  FAIL ') + line);
};

// --- title card present, game not running yet
let s = await S();
check('starts on the title card', s.st === 'title', s.st);
check('title card is visible', await p.locator('#card.on').isVisible());

// The title card read "three five stretches" for several builds, because a
// count was changed in one branch of a sentence and not the other. Copy gets
// no compiler and no review, so it gets a check. Read it HERE, while the
// title card is the card on screen: later it is the death card and this would
// pass without ever looking at the right text.
const title = await p.evaluate(() => document.getElementById('inner').textContent);
check('the title card names the right number of stages',
      /five stretches of real Sahara/i.test(title) &&
      !/(three|two|four)\s+five/i.test(title),
      (title.match(/[A-Za-z]+ stretches of real Sahara/) || ['NOT FOUND'])[0]);

await p.click('#start');
await p.waitForTimeout(120);
s = await S();
check('start button begins play', s.st === 'play', s.st);
check('three hearts at the start', s.hp === 3, s.hp);

// Guard: if rAF is throttled the loop never advances and every physics check below
// fails for a reason that has nothing to do with the game. Say so instead.
const frames = await p.evaluate(async () => {
  let n = 0; const t0 = performance.now();
  while (performance.now() - t0 < 300){ await new Promise(r => requestAnimationFrame(r)); n++; }
  return n;
});
if (frames < 8){
  console.log('\nABORT: the animation loop is not running (' + frames +
              ' frames in 300ms). Physics checks would be meaningless.');
  await b.close(); process.exit(2);
}
check('animation loop is running', frames >= 8, frames + ' frames / 300ms');

// --- running
await p.keyboard.down('ArrowRight');
await p.waitForTimeout(900);
s = await S();
check('runs to the right', s.x > 200, 'x=' + s.x);
await p.keyboard.up('ArrowRight');       // every later check sets position itself
await p.waitForTimeout(120);

// --- jumping and landing on a platform
// Read the target out of the level rather than naming a coordinate: the stages
// are generated, so any number written here goes stale the next time they are.
const landed = await p.evaluate(async () => {
  const t = __g.levels[0].plats[0];
  __g.fox.x = t.x + t.w / 2; __g.fox.y = 300; __g.fox.vx = 0; __g.fox.vy = 0;
  await new Promise(r => setTimeout(r, 60));
  __g.fox.vy = -10.4; __g.fox.onGround = false;
  for (let i = 0; i < 70; i++){ await new Promise(r => requestAnimationFrame(r));
    if (__g.fox.onGround && __g.fox.y < 295) return { y:+__g.fox.y.toFixed(0), want:t.y }; }
  return { y:+__g.fox.y.toFixed(0), want:t.y };
});
check('lands on the first raised platform', landed.y === landed.want,
      'landed y=' + landed.y + ', platform y=' + landed.want);

// --- the ear glide must actually slow the fall
const [freeFall, glideFall] = await p.evaluate(async () => {
  async function drop(hold){
    __g.fox.x = 300; __g.fox.y = 80; __g.fox.vy = 2; __g.fox.onGround = false;
    const y0 = __g.fox.y;
    for (let i = 0; i < 26; i++){
      if (hold) __g.fox.buffer = 0;
      await new Promise(r => requestAnimationFrame(r));
    }
    return __g.fox.y - y0;
  }
  const a = await drop(false);
  window.dispatchEvent(new KeyboardEvent('keydown', { key:' ' }));
  const c = await drop(true);
  window.dispatchEvent(new KeyboardEvent('keyup', { key:' ' }));
  return [+a.toFixed(0), +c.toFixed(0)];
});
check('glide slows the fall', glideFall < freeFall * 0.75,
      'free=' + freeFall + ' glide=' + glideFall);

// --- stomping a scorpion kills it; walking into one costs a heart
const stomp = await p.evaluate(async () => {
  const s = __g.scorps()[0];
  __g.fox.inv = 0; __g.fox.x = s.x; __g.fox.y = s.y - 50; __g.fox.vy = 4; __g.fox.onGround = false;
  for (let i = 0; i < 40; i++){ await new Promise(r => requestAnimationFrame(r));
    if (!s.alive) return { dead:true, hp:__g.fox.hearts }; }
  return { dead:false, hp:__g.fox.hearts };
});
check('stomping a scorpion kills it', stomp.dead, 'dead=' + stomp.dead);
check('stomping costs no heart', stomp.hp === 3, 'hp=' + stomp.hp);

const sideHit = await p.evaluate(async () => {
  const s = __g.scorps()[1];
  const hp0 = __g.fox.hearts;
  __g.fox.inv = 0; __g.fox.x = s.x - 14; __g.fox.y = s.y; __g.fox.vy = 0; __g.fox.onGround = true;
  for (let i = 0; i < 40; i++){ await new Promise(r => requestAnimationFrame(r));
    if (__g.fox.hearts < hp0) return { hit:true, hp:__g.fox.hearts }; }
  return { hit:false, hp:__g.fox.hearts };
});
check('walking into a scorpion costs a heart', sideHit.hit, 'hp=' + sideHit.hp);

// --- invulnerability stops a second hit landing immediately
const doubleHit = await p.evaluate(async () => {
  const hp0 = __g.fox.hearts;
  for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));
  return __g.fox.hearts === hp0;
});
check('brief invulnerability after a hit', doubleHit);

// --- a pit is fatal
const pit = await p.evaluate(async () => {
  const g = __g.levels[0].ground;
  const mid = (g[0][1] + g[1][0]) / 2;          // the middle of the first pit
  __g.fox.hearts = 3; __g.fox.x = mid; __g.fox.y = 200;
  __g.fox.vx = 0; __g.fox.vy = 6; __g.fox.onGround = false;
  for (let i = 0; i < 90; i++){ await new Promise(r => requestAnimationFrame(r));
    if (__g.state === 'dead') return true; }
  return false;
});
check('falling down a pit ends the run', pit);
check('death card is shown', await p.locator('#card.on').isVisible());

// "1 bombs left" shipped in the last game in this folder. Check the text, not
// just that a card appeared.
const wording = await p.evaluate(() => document.getElementById('inner').textContent);

check('the death card does not say "1 dates"', !/1 dates/.test(wording),
      (wording.match(/with [^.]*/) || ['?'])[0]);

// --- score posting reaches the parent
await p.evaluate(() => { window.__sent = []; });
await p.evaluate(() => {
  // stand in for the host frame: the game posts to parent, so watch it there
  const real = window.parent;
  Object.defineProperty(window, 'parent', { configurable:true, get: () => ({
    postMessage: (m) => window.__sent.push(m)
  })});
  window.__realParent = real;
});
await p.click('#post');
const sent = await p.evaluate(() => window.__sent);
check('posts a score message', sent.length === 1 && sent[0].type === 'score',
      JSON.stringify(sent[0] || null));
check('score is a number', typeof (sent[0] || {}).score === 'number',
      (sent[0] || {}).score);

// --- retry restarts the same level with full hearts
await p.evaluate(() => { Object.defineProperty(window, 'parent',
  { configurable:true, get: () => window.__realParent }); });
await p.click('#retry');
await p.waitForTimeout(150);
s = await S();
check('retry resets hearts and level', s.st === 'play' && s.hp === 3 && s.lv === 0,
      'st=' + s.st + ' hp=' + s.hp + ' lv=' + s.lv);

// --- reaching the den clears the level and moves on
const cleared = await p.evaluate(async () => {
  __g.fox.x = __g.levels[0].den + 10; __g.fox.y = 300; __g.fox.onGround = true;
  for (let i = 0; i < 40; i++){ await new Promise(r => requestAnimationFrame(r));
    if (__g.state === 'clear') return true; }
  return false;
});
check('reaching the den clears the level', cleared);
await p.click('#next');
await p.waitForTimeout(150);
s = await S();
check('advances to level 2', s.lv === 1 && s.st === 'play', 'lv=' + s.lv + ' st=' + s.st);
check('level 2 has its own name', await p.evaluate(() => __g.levels[1].name) === 'The Wadi');

// --- every level is finishable in principle: no date is out of reach of a platform,
//     and the den sits on solid ground
const reach = await p.evaluate(() => {
  const out = [];
  __g.levels.forEach((L, i) => {
    const onGround = px => L.ground.some(g => px >= g[0] && px <= g[1]);
    if (!onGround(L.den)) out.push('L' + (i+1) + ': den over a pit');
    // owls fly; everything else has to spawn on something solid
    for (const kind of ['scorps', 'jerboas', 'caracals'])
      (L[kind] || []).forEach((s, j) => {
        if (!onGround(s.x) && !L.plats.some(p => s.x >= p.x && s.x <= p.x + p.w))
          out.push('L' + (i+1) + ' ' + kind + ' ' + j + ' floats over a pit at x=' + s.x);
      });
    L.spikes.forEach((s, j) => {
      if (!onGround(s.x)) out.push('L' + (i+1) + ' spike ' + j + ' over a pit at x=' + s.x);
    });
  });
  return out;
});
check('no enemy or spike floats over a pit', reach.length === 0, reach.join('; ') || 'clean');

// --- the reachability rule. Every surface must be gettable by plain jumping,
//     every date collectable, every pit crossable, with slack. Measured from
//     the physics constants, so it re-derives itself if any of them move.
const audits = await p.evaluate(() => __g.levels.map(L => __g.audit(L)));
for (const a of audits)
  check('level "' + a.level + '" satisfies the reachability rule',
        a.problems.length === 0,
        a.problems.length ? a.problems.join(' | ')
                          : a.plainReached + '/' + a.surfaces + ' surfaces by plain jump');

// a scorpion must stay on the surface it spawned on
const floaters = await p.evaluate(() => {
  const out = [];
  __g.levels.forEach((L, i) => {
    __g.goto(i);
    __g.critters().filter(c => c.kind !== 'owl').forEach((s, j) => {
      const onPlat = L.plats.some(p => s.a >= p.x && s.b <= p.x + p.w && Math.abs(s.y - p.y) < 1);
      const onGnd  = L.ground.some(g => s.a >= g[0] && s.b <= g[1]) && s.y === 300;
      if (!onPlat && !onGnd) out.push('L' + (i+1) + ' ' + s.kind + ' ' + j +
        ' patrols ' + Math.round(s.a) + '..' + Math.round(s.b) + ' at y=' + s.y);
    });
  });
  __g.goto(0);
  return out;
});
check('no scorpion patrols off its surface', floaters.length === 0,
      floaters.join('; ') || 'all clamped');

// the rule must actually bite: a deliberately unreachable platform is caught
const bites = await p.evaluate(() => {
  // A bare probe level, so the check does not depend on generated geometry.
  const L = { name:'probe', w:1200, den:1100, sky:['#000','#000'], hillA:'#000',
    hillB:'#000', dirt:'#000', crust:'#000', ground:[[0,1200]],
    plats:[{ x:500, y:40, w:60 }],              // far above any possible jump
    dates:[], melons:[], flowers:[], spikes:[], scorps:[], jerboas:[],
    caracals:[], owls:[] };
  return __g.audit(L).problems.filter(s => s.indexOf('y=40') >= 0).length;
});
check('the rule catches a platform placed out of reach', bites > 0, bites + ' reported');

// --- screenshots of each level for the eye
for (const i of [0, 1, 2]){
  await p.evaluate(n => {
    __g.goto(n);
    __g.fox.x = n === 0 ? 470 : n === 1 ? 800 : 760;
    __g.fox.y = 240; __g.fox.vy = 2; __g.fox.onGround = false;
  }, i);
  await p.waitForTimeout(260);
  await p.screenshot({ path: 'games/fennec-run/level-' + (i + 1) + '.png' });
}

// --- portrait phone: a playable span must still be visible with the ground on screen
const pctx = await b.newContext({ viewport:{width:390,height:720},
                                  hasTouch:true, isMobile:true, deviceScaleFactor:2 });
const phone = await pctx.newPage();
await phone.goto(URL);
await phone.waitForTimeout(200);
check('control bar is shown on a touch device',
      await phone.locator('#pads').isVisible());
await phone.tap('#start');
await phone.waitForTimeout(300);
const span = await phone.evaluate(() => ({
  across: Math.round(__g.view.VW), down: Math.round(__g.view.VH),
  sky: Math.round(__g.view.yOff),
  padsOverlapCanvas: document.getElementById('pads').getBoundingClientRect().top >=
                     document.getElementById('cv').getBoundingClientRect().bottom - 1
}));
check('portrait shows a playable span', span.across >= 300 && span.across <= 460,
      span.across + ' wide x ' + span.down + ' tall, world units');
check('dead sky is under a third of the view', span.sky < span.down / 3,
      span.sky + ' of ' + span.down);
check('controls sit below the canvas, not over it', span.padsOverlapCanvas);

// the JUMP button must actually move the fox
const jumped = await phone.evaluate(async () => {
  const y0 = __g.fox.y;
  const b = document.getElementById('bJ');
  const r = b.getBoundingClientRect();
  const o = { bubbles:true, cancelable:true, pointerId:1, clientX:r.x+r.width/2, clientY:r.y+r.height/2 };
  b.dispatchEvent(new PointerEvent('pointerdown', o));
  for (let i = 0; i < 14; i++) await new Promise(r => requestAnimationFrame(r));
  b.dispatchEvent(new PointerEvent('pointerup', o));
  return y0 - __g.fox.y;
});
check('JUMP button lifts the fox', jumped > 25, 'rose ' + Math.round(jumped) + ' units');
await phone.screenshot({ path: 'games/fennec-run/phone.png' });

await b.close();
console.log('\nPASS (' + ok.length + ')');
ok.forEach(l => console.log('  ✓ ' + l));
if (bad.length){ console.log('\nFAIL (' + bad.length + ')'); bad.forEach(l => console.log('  ✗ ' + l)); }
console.log(errs.length ? '\nPAGE ERRORS:\n' + errs.join('\n') : '\nno page errors');
process.exit(bad.length || errs.length ? 1 : 0);
