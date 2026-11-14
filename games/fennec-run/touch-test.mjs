// The controls, under the two things a thumb actually does: hold one down, and
// hold two at once. Both were broken before this file existed.
import { chromium } from 'playwright';

const URL = process.argv[2] || 'file:///C:/Users/Jason/dev/HOB_2026_001/games/fennec-run/index.html';
const b = await chromium.launch({ args:['--disable-background-timer-throttling',
  '--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'] });
const p = await (await b.newContext({ viewport:{width:390,height:720},
  hasTouch:true, isMobile:true, deviceScaleFactor:2 })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(URL);
await p.waitForTimeout(400);

const ok = [], bad = [];
const check = (n, c, got) => { const l = n + (got !== undefined ? '  → ' + got : '');
  (c ? ok : bad).push(l); console.log((c ? '  ok  ' : '  FAIL ') + l); };

// --- nothing in the control bar may be selectable
const sel = await p.evaluate(() => {
  const read = el => {
    const s = getComputedStyle(el);
    return s.webkitUserSelect || s.userSelect;
  };
  return {
    jump: read(document.getElementById('bJ')),
    bar:  read(document.getElementById('pads')),
    body: read(document.body),
    callout: getComputedStyle(document.getElementById('bJ')).webkitTouchCallout || 'unset'
  };
});
check('JUMP button is not selectable', sel.jump === 'none', sel.jump);
check('control bar is not selectable', sel.bar === 'none', sel.bar);
check('long-press callout is off', sel.callout === 'none' || sel.callout === 'unset',
      sel.callout);

// --- holding a button must not create a selection
await p.tap('#start');
await p.waitForTimeout(150);
const selected = await p.evaluate(async () => {
  const el = document.getElementById('bJ');
  const r = el.getBoundingClientRect();
  const cx = r.x + r.width/2, cy = r.y + r.height/2;
  const o = p => ({ bubbles:true, cancelable:true, pointerId:1, isPrimary:true,
                    pointerType:'touch', clientX:p[0], clientY:p[1] });
  el.dispatchEvent(new PointerEvent('pointerdown', o([cx, cy])));
  // drag a little, the way a thumb wanders while holding
  for (let i = 0; i < 6; i++)
    el.dispatchEvent(new PointerEvent('pointermove', o([cx + i*4, cy - i*3])));
  await new Promise(r => setTimeout(r, 250));
  const s = String(getSelection());
  el.dispatchEvent(new PointerEvent('pointerup', o([cx + 20, cy - 15])));
  return s;
});
check('holding and dragging selects no text', selected === '',
      selected === '' ? 'nothing selected' : JSON.stringify(selected));

// --- two fingers: running while jumping, and releasing one must not release the other
const multi = await p.evaluate(async () => {
  // start from a known grounded state: the checks above leave the fox mid-air
  __g.fox.x = 120; __g.fox.y = 300; __g.fox.vx = 0; __g.fox.vy = 0;
  __g.fox.onGround = true; __g.fox.buffer = 0;
  await new Promise(r => requestAnimationFrame(r));

  const R = document.getElementById('bR'), J = document.getElementById('bJ');
  const at = el => { const r = el.getBoundingClientRect();
    return [r.x + r.width/2, r.y + r.height/2]; };
  const ev = (el, type, id, pt) => el.dispatchEvent(new PointerEvent(type,
    { bubbles:true, cancelable:true, pointerId:id, pointerType:'touch',
      clientX:pt[0], clientY:pt[1] }));
  const frame = () => new Promise(r => requestAnimationFrame(r));

  ev(R, 'pointerdown', 1, at(R));                    // finger 1 holds run
  for (let i = 0; i < 20; i++) await frame();
  const movedBefore = __g.fox.vx;

  ev(J, 'pointerdown', 2, at(J));                    // finger 2 taps jump
  for (let i = 0; i < 8; i++) await frame();
  const airborne = !__g.fox.onGround;

  ev(J, 'pointerup', 2, at(J));                      // let go of jump only
  for (let i = 0; i < 12; i++) await frame();
  const stillRunning = __g.fox.vx;

  ev(R, 'pointerup', 1, at(R));                      // let go of run
  for (let i = 0; i < 40; i++) await frame();
  const stopped = Math.abs(__g.fox.vx) < 0.2;

  return { movedBefore:+movedBefore.toFixed(2), airborne,
           stillRunning:+stillRunning.toFixed(2), stopped };
});
check('one finger runs', multi.movedBefore > 1, 'vx=' + multi.movedBefore);
check('second finger jumps while running', multi.airborne);
check('releasing jump does not stop the run', multi.stillRunning > 1,
      'vx=' + multi.stillRunning);
check('releasing run does stop it', multi.stopped);

// --- a thumb that slides off the button must not leave it stuck down
const stuck = await p.evaluate(async () => {
  const R = document.getElementById('bR');
  const r = R.getBoundingClientRect();
  const ev = (el, type, pt) => el.dispatchEvent(new PointerEvent(type,
    { bubbles:true, cancelable:true, pointerId:9, pointerType:'touch',
      clientX:pt[0], clientY:pt[1] }));
  ev(R, 'pointerdown', [r.x + r.width/2, r.y + r.height/2]);
  for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));
  // finger lifts somewhere else entirely, off the button
  window.dispatchEvent(new PointerEvent('pointerup',
    { bubbles:true, pointerId:9, pointerType:'touch', clientX:5, clientY:5 }));
  for (let i = 0; i < 50; i++) await new Promise(r => requestAnimationFrame(r));
  return { vx:+__g.fox.vx.toFixed(2), lit: R.classList.contains('on') };
});
check('sliding off the button releases it', Math.abs(stuck.vx) < 0.2, 'vx=' + stuck.vx);
check('the button does not stay lit', !stuck.lit);

// --- the reported fault: a press whose release never arrives must not leave the
//     button held, and must not make it deaf to the next press
const lost = await p.evaluate(async () => {
  const R = document.getElementById('bR');
  const r = R.getBoundingClientRect();
  const pt = [r.x + r.width/2, r.y + r.height/2];
  const fire = (type, id, at, target) => (target || window).dispatchEvent(
    new PointerEvent(type, { bubbles:true, cancelable:true, pointerId:id,
      pointerType:'touch', clientX:at[0], clientY:at[1] }));
  const frames = n => new Promise(async res => {
    for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); res(); });

  __g.fox.x = 120; __g.fox.y = 300; __g.fox.vx = 0; __g.fox.vy = 0; __g.fox.onGround = true;

  fire('pointerdown', 20, pt, R);
  await frames(10);
  const whileHeld = __g.fox.vx;

  // the browser eats the release entirely, then the page is backgrounded
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'hidden', { configurable:true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
  await frames(40);
  const afterLoss = __g.fox.vx;
  Object.defineProperty(document, 'hidden', { configurable:true, get: () => false });

  // and now the button must still work
  fire('pointerdown', 21, pt, R);
  await frames(12);
  const pressedAgain = __g.fox.vx;
  fire('pointerup', 21, pt, R);
  await frames(30);
  return { whileHeld:+whileHeld.toFixed(2), afterLoss:+afterLoss.toFixed(2),
           pressedAgain:+pressedAgain.toFixed(2), lit: R.classList.contains('on') };
});
check('a held button runs', lost.whileHeld > 1, 'vx=' + lost.whileHeld);
check('a release that never arrives still releases', Math.abs(lost.afterLoss) < 0.2,
      'vx=' + lost.afterLoss);
check('the button still responds to the next press', lost.pressedAgain > 1,
      'vx=' + lost.pressedAgain);
check('and is not left lit', !lost.lit);

// --- sliding from one button to the other should hand over, like a d-pad
const slide = await p.evaluate(async () => {
  const L = document.getElementById('bL'), R = document.getElementById('bR');
  const c = el => { const r = el.getBoundingClientRect();
    return [r.x + r.width/2, r.y + r.height/2]; };
  const fire = (t, at) => window.dispatchEvent(new PointerEvent(t,
    { bubbles:true, cancelable:true, pointerId:30, pointerType:'touch',
      clientX:at[0], clientY:at[1] }));
  const frames = n => new Promise(async res => {
    for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); res(); });
  __g.fox.x = 400; __g.fox.vx = 0;
  fire('pointerdown', c(R)); await frames(14);
  const right = __g.fox.vx;
  fire('pointermove', c(L)); await frames(22);
  const left = __g.fox.vx;
  fire('pointerup', c(L)); await frames(30);
  return { right:+right.toFixed(2), left:+left.toFixed(2) };
});
check('sliding onto the other button hands over', slide.right > 1 && slide.left < -1,
      'right vx=' + slide.right + ' then left vx=' + slide.left);

// --- nothing in the control bar is a text node any more
const texts = await p.evaluate(() =>
  ['bL','bR','bJ'].map(id => document.getElementById(id).textContent.trim()));
check('buttons contain no selectable text', texts.every(t => t === ''),
      JSON.stringify(texts));

await b.close();
console.log(errs.length ? '\nPAGE ERRORS:\n' + errs.join('\n') : '\nno page errors');
console.log(bad.length ? '\n' + bad.length + ' FAILED' : '\nall ' + ok.length + ' touch checks passed');
process.exit(bad.length || errs.length ? 1 : 0);
