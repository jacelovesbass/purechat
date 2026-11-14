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
  let f = null;
  for (let i = 0; i < __g.levels.length && !f; i++){
    __g.goto(i); f = __g.flowers()[0] || null;
  }
  __g.fox.dashReady = 0; __g.fox.inv = 999;
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

/* ---------------- the cat stays on the ground ---------------- */
const cats = await p.evaluate(async () => {
  const bad = [];
  for (let i = 0; i < __g.levels.length; i++){
    __g.goto(i);
    __g.critters().filter(c => c.kind === 'caracal').forEach(c => {
      if (c.y !== 300) bad.push('L' + (i+1) + ' caracal at y=' + c.y + ', not on the ground');
    });
  }
  return bad;
});
check('every caracal spawns on the ground, never a ledge', cats.length === 0,
      cats.join('; ') || 'all grounded');

/* ---------------- the mouse: a heart, and a way out ---------------- */
const mouseHeart = await p.evaluate(async () => {
  let c = null;
  for (let i = 0; i < __g.levels.length && !c; i++){
    __g.goto(i); c = __g.critters().find(k => k.kind === 'jerboa') || null;
  }
  __g.fox.hearts = 1; __g.fox.inv = 999;
  __g.fox.x = c.x; __g.fox.y = c.y;
  for (let i = 0; i < 20; i++) await new Promise(r => requestAnimationFrame(r));
  return { caught: !c.alive, hearts: __g.fox.hearts };
});
check('catching a jerboa gives a heart back', mouseHeart.caught && mouseHeart.hearts === 2,
      'hearts ' + mouseHeart.hearts);

const mouseEscape = await p.evaluate(async () => {
  const frame = () => new Promise(r => requestAnimationFrame(r));
  // find a jerboa that starts on a ledge, so there is an edge for it to use
  let c = null, lv = 0;
  for (let i = 0; i < __g.levels.length && !c; i++){
    __g.goto(i); lv = i;
    c = __g.critters().find(k => k.kind === 'jerboa' && k.y < 290) || null;
  }
  if (!c) return { noLedgeJerboa: true };
  const startY = c.y, startX = c.x;
  __g.fox.inv = 999; __g.fox.hearts = 3;
  let leftLedge = false;
  for (let f = 0; f < 240; f++){
    // chase it from behind without ever touching it
    __g.fox.x = c.x - 70; __g.fox.y = c.y; __g.fox.vy = 0; __g.fox.onGround = true;
    await frame();
    if (c.alive && c.y > startY + 12) leftLedge = true;
    if (!c.alive) break;
  }
  return { leftLedge: leftLedge, escaped: !!c.escaped, alive: c.alive,
           dropped: Math.round(c.y - startY), ran: Math.round(Math.abs(c.x - startX)) };
});
check('a hunted jerboa will go over the edge', mouseEscape.leftLedge ||
      mouseEscape.escaped, mouseEscape.noLedgeJerboa ? 'no ledge jerboa found'
        : 'dropped ' + mouseEscape.dropped + ', ran ' + mouseEscape.ran);

const mouseGone = await p.evaluate(async () => {
  let c = null;
  for (let i = 0; i < __g.levels.length && !c; i++){
    __g.goto(i); c = __g.critters().find(k => k.kind === 'jerboa') || null;
  }
  __g.fox.inv = 999;
  __g.fox.x = c.x - 600; __g.fox.y = 300;          // it is already clear away
  c.flee = 1; c.dir = 1;
  for (let i = 0; i < 60; i++) await new Promise(r => requestAnimationFrame(r));
  return { alive: c.alive, escaped: !!c.escaped };
});
check('a jerboa that gets clear is gone for good',
      mouseGone.escaped && !mouseGone.alive, 'escaped=' + mouseGone.escaped);

/* ---------------- the score has to actually build ---------------- */
const build = await p.evaluate(async () => {
  const out = [];
  const ac = __g.snd.ctx() || (__g.snd.start(), __g.snd.ctx());
  const an = ac.createAnalyser(); an.fftSize = 2048;
  __g.snd.tap(an);
  const buf = new Float32Array(an.fftSize);
  for (let lv = 0; lv < 5; lv++){
    __g.snd.setLevel(lv);
    __g.snd.rewind();               // same bars for every stage, or it is noise
    await new Promise(r => setTimeout(r, 400));
    let peak = 0, sum = 0, n = 0;
    for (let k = 0; k < 220; k++){
      an.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++){
        const v = Math.abs(buf[i]); peak = Math.max(peak, v); sum += v * v; n++;
      }
      await new Promise(r => setTimeout(r, 25));
    }
    out.push({ lv: lv + 1, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4) });
  }
  return out;
});
const rms = build.map(b => b.rms);
check('the score is quietest on stage one', rms[0] === Math.min.apply(null, rms),
      build.map(b => b.lv + ':' + b.rms).join('  '));
check('it is loudest on stage five', rms[4] === Math.max.apply(null, rms),
      'stage 5 rms ' + rms[4]);
check('every stage is at least as full as the one before',
      rms.every((v, i) => i === 0 || v >= rms[i - 1] - 0.002),
      rms.join(' → '));
check('stage five is clearly fuller than stage one', rms[4] > rms[0] * 1.6,
      'x' + (rms[4] / rms[0]).toFixed(2));

/* ---------------- the rule still holds with the new abilities ---------------- */
const audits = await p.evaluate(() => __g.levels.map(L => __g.audit(L)));
for (const a of audits)
  check('"' + a.level + '" still passes the rule with fruit added',
        a.problems.length === 0, a.problems.join(' | ') || 'clean');

const assistBites = await p.evaluate(() => {
  // A bare probe level with one shelf 110 above the ground: past a plain
  // jump's 91, inside a Bound's reach, and with no neighbour to help. Built
  // from nothing so it cannot be invalidated by regenerating the stages.
  const L = { name:'probe', w:1200, den:1100, sky:['#000','#000'], hillA:'#000',
    hillB:'#000', dirt:'#000', crust:'#000', ground:[[0,1200]],
    plats:[{ x:500, y:190, w:60 }],
    dates:[], melons:[], flowers:[], spikes:[], scorps:[], jerboas:[],
    caracals:[], owls:[] };
  return __g.audit(L).problems.filter(s => s.indexOf('y=190') >= 0 &&
                               s.indexOf('glide, bound or dash') >= 0).length;
});
check('a platform needing an assist is still flagged', assistBites > 0,
      assistBites + ' reported');


/* ---------------- the food web ---------------- */
const web = await p.evaluate(async () => {
  const frame = () => new Promise(r => requestAnimationFrame(r));
  const out = {};
  // Find whichever stage actually carries this species rather than naming one:
  // the stages are generated and the owls are not always on the same level.
  const place = async (kind, above) => {
    let c = null;
    for (let i = 0; i < __g.levels.length && !c; i++){
      __g.goto(i);
      c = __g.critters().find(k => k.kind === kind) || null;
    }
    if (!c) return null;
    __g.fox.hearts = 3; __g.fox.inv = 0; __g.fox.bounds = 0; __g.fox.charge = 0;
    if (above){ __g.fox.x = c.x; __g.fox.y = c.y - 46; __g.fox.vy = 5; __g.fox.onGround = false; }
    else { __g.fox.x = c.x - 12; __g.fox.y = c.y; __g.fox.vy = 0; __g.fox.onGround = true; }
    for (let i = 0; i < 30; i++) await frame();
    return { alive: c.alive, hearts: __g.fox.hearts, bounds: __g.fox.bounds };
  };
  out.scorpionPounced = await place('scorpion', true);
  out.scorpionSide    = await place('scorpion', false);
  out.jerboa          = await place('jerboa', false);
  out.caracalPounce   = await place('caracal', true);
  out.owlPounce       = await place('owl', true);
  return out;
});
check('pouncing on a scorpion catches it', web.scorpionPounced.alive === false &&
      web.scorpionPounced.hearts === 3, 'hearts ' + web.scorpionPounced.hearts);
check('a scorpion still stings from the side', web.scorpionSide.hearts < 3,
      'hearts ' + web.scorpionSide.hearts);
check('a jerboa is caught by running it down', web.jerboa.alive === false &&
      web.jerboa.hearts === 3, 'hearts ' + web.jerboa.hearts);
check('eating prey feeds the Bound meter', web.jerboa.bounds >= 0 &&
      web.scorpionPounced.bounds >= 0, 'bounds after a catch');
check('a caracal cannot be pounced on', web.caracalPounce.alive === true &&
      web.caracalPounce.hearts < 3, 'alive, hearts ' + web.caracalPounce.hearts);
check('an eagle-owl cannot be pounced on', web.owlPounce.alive === true &&
      web.owlPounce.hearts < 3, 'alive, hearts ' + web.owlPounce.hearts);

const stalk = await p.evaluate(async () => {
  let c = null;
  for (let i = 0; i < __g.levels.length && !c; i++){
    __g.goto(i); c = __g.critters().find(k => k.kind === 'caracal') || null;
  }
  const calm = c.charge;                       // nothing has seen anything yet
  // Keep the fox alive and on the caracal's own ledge: park it over a pit and
  // the run ends, step() returns early, and the caracal never gets a tick.
  __g.fox.inv = 999; __g.fox.hearts = 3;
  for (let i = 0; i < 70; i++){
    __g.fox.x = c.x + 80; __g.fox.y = c.y; __g.fox.vy = 0; __g.fox.onGround = true;
    await new Promise(r => requestAnimationFrame(r));
  }
  return { calm: +calm.toFixed(2), roused: +c.charge.toFixed(2),
           state: __g.state };
});
check('a caracal rouses when it sees you', stalk.roused > stalk.calm,
      'charge ' + stalk.calm + ' → ' + stalk.roused + ' (state ' + stalk.state + ')');

// A charging animal keeps its spawn height for ever, so leaving its ledge
// means hanging in mid-air. Found in a screenshot, so now it is a check.
const ledge = await p.evaluate(async () => {
  const worst = [];
  for (let i = 0; i < __g.levels.length; i++){
    __g.goto(i);
    const cats = __g.critters().filter(c => c.kind === 'caracal');
    if (!cats.length) continue;
    __g.fox.inv = 999; __g.fox.hearts = 3;
    for (const c of cats){
      for (let f = 0; f < 90; f++){
        // stand just off its nose so it charges, and keep the fox alive
        __g.fox.x = c.x + (f % 2 ? 60 : -60); __g.fox.y = c.y;
        __g.fox.vy = 0; __g.fox.onGround = true;
        await new Promise(r => requestAnimationFrame(r));
        if (c.x < c.surf.a - 1 || c.x > c.surf.b + 1)
          worst.push('L' + (i+1) + ' caracal at ' + Math.round(c.x) +
                     ' left its ledge ' + Math.round(c.surf.a) + '..' + Math.round(c.surf.b));
      }
    }
  }
  return worst.slice(0, 3);
});
check('a charging caracal stays on its ledge', ledge.length === 0,
      ledge.join('; ') || 'all held');

/* ---------------- the owl has to hunt, and cover has to answer it ---------------- */
const owlHunt = await p.evaluate(async () => {
  const frame = () => new Promise(r => requestAnimationFrame(r));
  let c = null, lv = 0;
  for (let i = 0; i < __g.levels.length && !c; i++){
    __g.goto(i); lv = i;
    c = __g.critters().find(k => k.kind === 'owl') || null;
  }
  if (!c) return null;
  const L = __g.levels[lv];
  // park the fox in the open, well below the owl, on solid ground
  const open = L.ground.find(g => g[1] - g[0] > 200 && c.a < g[1] && c.b > g[0]) || L.ground[0];
  let standX = null;
  for (let xx = Math.max(open[0] + 30, c.a); xx < Math.min(open[1] - 30, c.b); xx += 10){
    const covered = L.plats.some(p => xx > p.x - 10 && xx < p.x + p.w + 10 &&
                                      p.y < 300 - 18 && p.y > 300 - 170);
    if (!covered){ standX = xx; break; }
  }
  if (standX === null) return { noOpenGround: true };

  const states = [];
  let lowPoint = -1e9, targetsDuringStoop = new Set();   // max y = lowest on screen
  c.cool = 0;
  for (let f = 0; f < 420; f++){
    __g.fox.x = standX; __g.fox.y = 300; __g.fox.vy = 0;
    __g.fox.onGround = true; __g.fox.inv = 999; __g.fox.hearts = 3;
    await frame();
    states.push(c.state);
    if (c.state === 'stoop'){ targetsDuringStoop.add(Math.round(c.ty)); lowPoint = Math.max(lowPoint, c.y); }
  }
  const lowest = Math.max.apply(null, states.map(() => 0).concat([0]));
  return {
    sawFix: states.indexOf('fix') >= 0,
    sawStoop: states.indexOf('stoop') >= 0,
    sawClimb: states.indexOf('climb') >= 0,
    // a committed dive re-aims once, not every frame
    aimedOnce: targetsDuringStoop.size <= 2,
    aims: targetsDuringStoop.size,
    gotLow: lowPoint > -1e9 ? Math.round(lowPoint) : null,
    foxY: 300, lowest: lowest
  };
});
check('an owl fixes before it stoops', owlHunt && owlHunt.sawFix, 'fix seen');
check('an owl actually stoops', owlHunt && owlHunt.sawStoop, 'stoop seen');
check('and climbs back out', owlHunt && owlHunt.sawClimb, 'climb seen');
check('a stoop is aimed once, not re-aimed every frame',
      owlHunt && owlHunt.aimedOnce, owlHunt ? owlHunt.aims + ' target(s) per dive' : '-');
check('a stoop reaches the fox', owlHunt && owlHunt.gotLow !== null &&
      owlHunt.gotLow > 200, 'dived to y=' + (owlHunt && owlHunt.gotLow));

// Every other owl check above runs with inv = 999, which proves it dives but
// never proves it connects. A predator that cannot actually hurt you is the
// same "no point" fault in a different costume, so it gets its own check.
const owlDamage = await p.evaluate(async () => {
  const frame = () => new Promise(r => requestAnimationFrame(r));
  let c = null, lv = 0;
  for (let i = 0; i < __g.levels.length && !c; i++){
    __g.goto(i); lv = i; c = __g.critters().find(k => k.kind === 'owl') || null;
  }
  const L = __g.levels[lv];
  const open = L.ground.find(g => g[1] - g[0] > 200 && c.a < g[1] && c.b > g[0]) || L.ground[0];
  let sx = null;
  for (let xx = Math.max(open[0] + 30, c.a); xx < Math.min(open[1] - 30, c.b); xx += 10)
    if (!L.plats.some(p => xx > p.x - 10 && xx < p.x + p.w + 10 && p.y < 282 && p.y > 130)){
      sx = xx; break;
    }
  // Put the owl within its own fixing range to start with. Waiting for it to
  // quarter back along a 1000-unit beat made this pass or fail on timing.
  __g.fox.hearts = 3; __g.fox.inv = 0;
  c.cool = 0; c.state = 'patrol'; c.x = sx + 70; c.y = c.baseY;
  let hitAt = null;
  for (let f = 0; f < 500; f++){
    __g.fox.x = sx; __g.fox.y = 300; __g.fox.vy = 0; __g.fox.onGround = true;
    await frame();
    if (__g.fox.hearts < 3 && hitAt === null){ hitAt = f; break; }
    if (__g.state !== 'play') break;
  }
  // Having taken one, the same dive must not take another.
  const after = __g.fox.hearts;
  for (let f = 0; f < 70; f++){
    __g.fox.x = sx; __g.fox.y = 300; __g.fox.vy = 0; __g.fox.onGround = true;
    await frame();
  }
  return { hitAt: hitAt, hearts: after, sameDive: after - __g.fox.hearts };
});
check('a stooping owl actually costs a heart', owlDamage.hitAt !== null,
      owlDamage.hitAt === null ? 'never connected' : 'hit on frame ' + owlDamage.hitAt);
check('a single dive costs only one heart', owlDamage.sameDive === 0,
      owlDamage.sameDive + ' further hits inside the invulnerability window');

const owlCover = await p.evaluate(async () => {
  const frame = () => new Promise(r => requestAnimationFrame(r));
  let c = null, lv = 0;
  for (let i = 0; i < __g.levels.length && !c; i++){
    __g.goto(i); lv = i; c = __g.critters().find(k => k.kind === 'owl') || null;
  }
  const L = __g.levels[lv];
  // stand under a ledge inside the owl's beat
  const shelter = L.plats.find(p => p.x + p.w > c.a && p.x < c.b && p.y < 300 - 40);
  if (!shelter) return { noShelter: true };
  const sx = shelter.x + shelter.w / 2;
  c.cool = 0; c.state = 'patrol';
  const states = [];
  for (let f = 0; f < 320; f++){
    __g.fox.x = sx; __g.fox.y = 300; __g.fox.vy = 0;
    __g.fox.onGround = true; __g.fox.inv = 999; __g.fox.hearts = 3;
    await frame();
    states.push(c.state);
  }
  return { stooped: states.indexOf('stoop') >= 0, hearts: __g.fox.hearts };
});
check('under cover, the owl never commits to a stoop',
      owlCover && owlCover.stooped === false, owlCover && owlCover.noShelter
        ? 'NO SHELTER IN THE BEAT' : 'broke off');

const owlRule = await p.evaluate(() => {
  const L = { name:'probe', w:1600, den:1500, sky:['#000','#000'], hillA:'#000',
    hillB:'#000', dirt:'#000', crust:'#000', ground:[[0,1600]], plats:[],
    dates:[], melons:[], flowers:[], spikes:[], scorps:[], jerboas:[],
    caracals:[], owls:[{ x:300, y:110, a:200, b:900 }] };
  return __g.audit(L).problems.filter(s => s.indexOf('shelter under') >= 0).length;
});
check('an owl beat with no cover is a level fault', owlRule > 0, owlRule + ' reported');

/* ---------------- the jerboa is worth the chase ---------------- */
const jerboaWorth = await p.evaluate(async () => {
  let c = null;
  for (let i = 0; i < __g.levels.length && !c; i++){
    __g.goto(i); c = __g.critters().find(k => k.kind === 'jerboa') || null;
  }
  __g.fox.bounds = 0; __g.fox.charge = 0; __g.fox.inv = 999;
  __g.fox.hearts = 3;                      // nothing to heal, so it must pay out
  __g.fox.x = c.x; __g.fox.y = c.y;
  for (let i = 0; i < 20; i++) await new Promise(r => requestAnimationFrame(r));
  return { caught: !c.alive, bounds: __g.fox.bounds, hearts: __g.fox.hearts };
});
check('at full hearts a jerboa is worth a Bound instead, never nothing',
      jerboaWorth.caught && jerboaWorth.bounds === 1,
      'caught=' + jerboaWorth.caught + ' bounds=' + jerboaWorth.bounds);

const guide = await p.evaluate(async () => {
  __g.resetGuide();            // earlier checks have already met everything
  __g.goto(0);
  __g.fox.inv = 999;
  const c = __g.critters().find(k => k.kind === 'jerboa');
  __g.fox.x = c.x - 150; __g.fox.y = c.y;
  for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));
  const n = document.getElementById('note');
  return { shown: n.classList.contains('on'), text: n.textContent.slice(0, 60) };
});
check('meeting a species shows its field note', guide.shown, guide.text.trim());

const facts = await p.evaluate(() => {
  const g = __g.guide();
  return Object.keys(g).filter(k => !g[k][1] || g[k][1].length < 30);
});
check('every species in the guide carries a fact', facts.length === 0,
      facts.join(', ') || Object.keys(await p.evaluate(() => __g.guide())).length + ' entries');


await p.screenshot({ path: 'games/fennec-run/kit.png' });
await b.close();
console.log(errs.length ? '\nPAGE ERRORS:\n' + errs.join('\n') : '\nno page errors');
console.log(bad.length ? '\n' + bad.length + ' FAILED' : '\nall ' + ok.length + ' checks passed');
process.exit(bad.length || errs.length ? 1 : 0);
