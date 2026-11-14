// The bench is only useful if the sliders actually move the sound, so it gets
// measured the same way the game's mix does.
import { chromium } from 'playwright';
const URL = process.argv[2] || 'file:///C:/Users/Jason/dev/HOB_2026_001/games/fennec-run/music.html';
const b = await chromium.launch({ args:['--disable-background-timer-throttling',
  '--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
  '--autoplay-policy=no-user-gesture-required'] });
const p = await (await b.newContext({viewport:{width:430,height:860}})).newPage();
const errs=[]; p.on('pageerror', e=>errs.push(String(e)));
p.on('console', m => { if (m.type()==='error') errs.push('console: '+m.text()); });
await p.goto(URL);
await p.waitForTimeout(300);
const ok=[], bad=[];
const check=(n,c,g)=>{const l=n+(g!==undefined?'  → '+g:'');(c?ok:bad).push(l);
  console.log((c?'  ok  ':'  FAIL ')+l);};

check('five stage buttons', await p.locator('.stage').count() === 5);
check('six layer sliders', await p.locator('#sliders input[type=range]').count() === 6);

await p.click('#play');
await p.waitForTimeout(600);

const measure = () => p.evaluate(async () => {
  const ac = __bench.SND.ctx();
  const an = ac.createAnalyser(); an.fftSize = 2048;
  __bench.SND.tap(an);
  const buf = new Float32Array(an.fftSize);
  let sum=0, n=0;
  for (let k=0;k<90;k++){
    an.getFloatTimeDomainData(buf);
    for (let i=0;i<buf.length;i++){ sum += buf[i]*buf[i]; n++; }
    await new Promise(r=>setTimeout(r,25));
  }
  return +Math.sqrt(sum/n).toFixed(4);
});

const quiet = await measure();
check('the bench makes sound', quiet > 0.001, 'rms ' + quiet);

// stage 5 must be audibly fuller than stage 1, on the same bars
const perStage = await p.evaluate(async () => {
  const out=[];
  const ac=__bench.SND.ctx(); const an=ac.createAnalyser(); an.fftSize=2048;
  __bench.SND.tap(an); const buf=new Float32Array(an.fftSize);
  for (const s of [0,4]){
    __bench.SND.setLevel(s); __bench.SND.rewind();
    await new Promise(r=>setTimeout(r,400));
    let sum=0,n=0;
    for (let k=0;k<200;k++){ an.getFloatTimeDomainData(buf);
      for (let i=0;i<buf.length;i++){ sum+=buf[i]*buf[i]; n++; }
      await new Promise(r=>setTimeout(r,25)); }
    out.push(+Math.sqrt(sum/n).toFixed(4));
  }
  return out;
});
check('stage five is fuller than stage one on the bench', perStage[1] > perStage[0]*1.5,
      perStage[0] + ' → ' + perStage[1]);

// a slider must change the sound, not just the readout
const slid = await p.evaluate(async () => {
  __bench.SND.setLevel(4); __bench.SND.rewind();
  const before = __bench.SND.mix()[4].slice();
  const m = __bench.SND.mix(); m[4] = m[4].map(() => 0.001);
  __bench.SND.setMix(m);
  const after = __bench.SND.mix()[4].slice();
  __bench.SND.setMix((() => { const z = __bench.SND.mix(); z[4] = before; return z; })());
  return { before: before[0], after: after[0], restored: __bench.SND.mix()[4][0] };
});
check('setting a layer changes the live mix', slid.after < slid.before,
      slid.before + ' → ' + slid.after);
check('and it can be put back', slid.restored === slid.before, 'back to ' + slid.restored);

const master = await p.evaluate(() => {
  __bench.SND.setMaster(0.2); const a = __bench.SND.master();
  __bench.SND.setMaster(0.55); return { a, b: __bench.SND.master() };
});
// AudioParam stores float32, so 0.2 comes back as 0.20000000298. Compare with
// a tolerance rather than pretending floats are exact.
const near = (a, b) => Math.abs(a - b) < 1e-5;
check('master responds', near(master.a, 0.2) && near(master.b, 0.55),
      master.a.toFixed(3) + ' / ' + master.b.toFixed(3));

// The share link shipped once with a regex of [d.]+ instead of [\d.]+, because
// a backslash was eaten on the way in and the warning was ignored. It round
// trips now, and this is the check that says so.
const made = await p.evaluate(() => {
  const m = __bench.SND.mix();
  m[2][0] = 0.321; m[4][5] = 0.123;
  __bench.SND.setMix(m); __bench.SND.setMaster(0.42);
  const flat = __bench.SND.mix().reduce((a, r) => a.concat(r), []);
  return location.origin + location.pathname + '#m=' +
    flat.map(v => Math.round(v * 1000)).join('.') + '&v=42';
});
check('a share link can be built', made.indexOf('#m=') > 0,
      '…' + made.slice(made.indexOf('#m=')).slice(0, 34) + '…');

await p.goto(made);
await p.waitForTimeout(300);
await p.click('#play');
await p.waitForTimeout(400);
const back = await p.evaluate(() => ({
  a: __bench.SND.mix()[2][0], b: __bench.SND.mix()[4][5], v: __bench.SND.master()
}));
check('opening the link restores the mix', Math.abs(back.a - 0.321) < 1e-6 &&
      Math.abs(back.b - 0.123) < 1e-6, 'pad@3=' + back.a + ' choir@5=' + back.b);
check('and restores the master', Math.abs(back.v - 0.42) < 1e-5, back.v.toFixed(2));

const text = await p.locator('#out').textContent();
check('it prints a MIX you can paste back', text.indexOf('const MIX = [') === 0,
      text.split('\n')[1].trim());

await p.screenshot({ path:'games/fennec-run/bench.png', fullPage:true });
await b.close();
console.log(errs.length ? '\nPAGE ERRORS:\n'+errs.join('\n') : '\nno page errors');
console.log(bad.length ? '\n'+bad.length+' FAILED' : '\nall '+ok.length+' bench checks passed');
process.exit(bad.length || errs.length ? 1 : 0);
