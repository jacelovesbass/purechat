// Can a game make sound inside Pure Chat at all? The iframe is sandboxed with
// allow-scripts and nothing else, and autoplay is a Permissions Policy that a
// cross-origin frame does not inherit by default. Worth knowing before writing
// a soundtrack.
import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--autoplay-policy=document-user-activation-required'] });
const p = await (await b.newContext({ viewport:{width:430,height:760} })).newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));

await p.setContent(`<!doctype html><body style="margin:0">
<iframe id="f" sandbox="allow-scripts" style="width:100%;height:700px;border:0"></iframe>`);

const game = `<!doctype html><body><button id="go" style="width:300px;height:200px;font-size:30px">tap</button>
<script>
  window.__r = { created:false, state:'none', ran:false, sampled:-1, err:'' };
  document.getElementById('go').onclick = async () => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      __r.created = true; __r.state = ac.state;
      await ac.resume();
      __r.ran = ac.state === 'running';
      // prove it actually produces samples, not just that it says running
      const osc = ac.createOscillator(), an = ac.createAnalyser(), g = ac.createGain();
      g.gain.value = 0.0001;                   // audible to the analyser, not to a person
      osc.connect(g); g.connect(an); an.connect(ac.destination);
      osc.start();
      await new Promise(r => setTimeout(r, 250));
      const buf = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(buf);
      __r.sampled = Math.max(...Array.from(buf, Math.abs));
      __r.state = ac.state;
      osc.stop();
    } catch (e) { __r.err = String(e); }
  };
<\/script>`;
await p.evaluate(src => { document.getElementById('f').srcdoc = src; }, game);
await p.waitForTimeout(400);
const f = p.frames().find(x => x !== p.mainFrame());
await f.click('#go');
await p.waitForTimeout(700);
console.log(JSON.stringify(await f.evaluate(() => window.__r), null, 1));
console.log(errs.length ? 'ERRORS: ' + errs.join('\n') : 'no page errors');
await b.close();
