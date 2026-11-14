// Build the music bench for Fennec.
//
// The synth is LIFTED OUT OF THE GAME, not copied by hand. The bench extracts
// the SND block from index.html at build time and inlines it, so what you hear
// on the bench is the thing that ships. A hand-copied second synth would drift
// within a day and then the tuning would be done against the wrong sound.
import fs from 'node:fs';

const GAME = 'games/fennec-run/index.html';
const src = fs.readFileSync(GAME, 'utf8');

const START = 'const SND = (function(){';
const i0 = src.indexOf(START);
if (i0 < 0) throw new Error('could not find the SND block in ' + GAME);
const i1 = src.indexOf('\n})();', i0);
if (i1 < 0) throw new Error('could not find the end of the SND block');
const synth = src.slice(i0, i1 + '\n})();'.length);

// Sanity: the bench is worthless if it picked up the wrong lump of code.
for (const need of ['const MIX', 'function voice', 'setMix', 'rewind'])
  if (synth.indexOf(need) < 0) throw new Error('extracted block is missing ' + need);

const LAYERS = ['pad', 'bass', 'drum', 'pluck', 'lead', 'voice'];
const STAGES = ['1 Dune Steps', '2 The Wadi', '3 The Erg', '4 Hamada', '5 Before Dawn'];

const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Fennec — the five mixes</title>
<style>
  :root { --ink:#3A2A18; --line:#8A6338; --paper:#FBF0DE; --warm:#E8A563; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent }
  body {
    margin: 0; padding: 18px 16px 40px; background: #1b1f2a; color: #e8ecf6;
    font: 15px/1.5 "Avenir Next", "Segoe UI", Roboto, system-ui, sans-serif;
  }
  .wrap { max-width: 560px; margin: 0 auto }
  h1 { font-size: 22px; margin: 0 0 4px }
  p.sub { color: #9aa6c0; margin: 0 0 18px; font-size: 14px }
  .panel { background: #242a38; border: 1px solid #39415a; border-radius: 14px;
           padding: 16px; margin-bottom: 14px }
  h2 { font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
       color: #9aa6c0; margin: 0 0 10px; font-weight: 600 }
  .stages { display: grid; grid-template-columns: 1fr 1fr; gap: 8px }
  .stage {
    padding: 13px 12px; border-radius: 10px; border: 2px solid #4a5573;
    background: #39425a; color: #e8ecf6; font: inherit; font-size: 14px;
    text-align: left; cursor: pointer;
  }
  .stage.on { background: var(--warm); border-color: var(--warm); color: #3a2410;
              font-weight: 700 }
  .stage small { display: block; font-size: 11px; opacity: .7 }
  .row { display: grid; grid-template-columns: 58px 1fr 48px; gap: 10px;
         align-items: center; margin-bottom: 9px }
  .row label { font-size: 13px; color: #cfd7ea }
  .row output { font-size: 12px; color: #9aa6c0; text-align: right;
                font-variant-numeric: tabular-nums }
  input[type=range] { width: 100%; accent-color: var(--warm); height: 26px }
  .row.off label, .row.off output { opacity: .35 }
  .btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px }
  button.go {
    flex: 1 1 auto; padding: 13px; border-radius: 10px; border: 2px solid var(--line);
    background: var(--warm); color: #3a2410; font: inherit; font-weight: 700;
    font-size: 15px; cursor: pointer;
  }
  button.ghost { background: transparent; color: #cfd7ea; border-color: #4a5573;
                 font-weight: 600 }
  pre { background: #11161f; border: 1px solid #39415a; border-radius: 10px;
        padding: 12px; overflow-x: auto; font-size: 12px; color: #cfe3c0;
        margin: 0 0 10px }
  .note { color: #9aa6c0; font-size: 13px; margin: 10px 0 0 }
</style>

<div class="wrap">
  <h1>Fennec — the five mixes</h1>
  <p class="sub">The game's own synth, lifted out of the game file at build time,
     so this is the sound that ships. Pick a stage, move the sliders, and the
     numbers at the bottom are what goes back into the game.</p>

  <div class="panel">
    <h2>Stage</h2>
    <div class="stages" id="stages"></div>
    <div class="btns" style="margin-top:10px">
      <button class="go" id="play">Play</button>
      <button class="go ghost" id="stop">Stop</button>
      <button class="go ghost" id="cycle">Play all five</button>
    </div>
  </div>

  <div class="panel">
    <h2>Layers on this stage</h2>
    <div id="sliders"></div>
    <div class="row" style="margin-top:14px;border-top:1px solid #39415a;padding-top:12px">
      <label>master</label>
      <input type="range" id="master" min="0" max="1" step="0.01">
      <output id="masterOut"></output>
    </div>
    <p class="note">A layer at zero is silent on that stage. That is how the build
       works: stage one has no drum, no pluck, no lead and no choir at all.</p>
  </div>

  <div class="panel">
    <h2>Take these back to the game</h2>
    <pre id="out"></pre>
    <div class="btns">
      <button class="go ghost" id="copy">Copy</button>
      <button class="go ghost" id="link">Copy link</button>
      <button class="go ghost" id="reset">Reset to shipped</button>
      <button class="go ghost" id="quieter">All 10% quieter</button>
    </div>
  </div>
</div>

<script>
"use strict";
${synth}

/* ---------------- bench ---------------- */
const LAYERS = ${JSON.stringify(LAYERS)};
const STAGES = ${JSON.stringify(STAGES)};
const SHIPPED = SND.mix();
let stage = 0, cycling = null;

const elStages = document.getElementById('stages');
const elSliders = document.getElementById('sliders');
const elOut = document.getElementById('out');
const elMaster = document.getElementById('master');
const elMasterOut = document.getElementById('masterOut');

elStages.innerHTML = STAGES.map((s, i) =>
  '<button class="stage" data-i="' + i + '">' + s.slice(2) +
  '<small>stage ' + (i + 1) + '</small></button>').join('');

elSliders.innerHTML = LAYERS.map((l, j) =>
  '<div class="row" data-j="' + j + '"><label>' + l + '</label>' +
  '<input type="range" min="0" max="0.6" step="0.005" data-j="' + j + '">' +
  '<output data-j="' + j + '"></output></div>').join('');

function draw(){
  const mix = SND.mix();
  [...elStages.children].forEach((b, i) => b.classList.toggle('on', i === stage));
  LAYERS.forEach((l, j) => {
    const v = mix[stage][j];
    elSliders.querySelector('input[data-j="' + j + '"]').value = v;
    elSliders.querySelector('output[data-j="' + j + '"]').textContent = v.toFixed(3);
    elSliders.querySelector('.row[data-j="' + j + '"]').classList.toggle('off', v === 0);
  });
  const m = SND.master();
  elMaster.value = m; elMasterOut.textContent = m.toFixed(2);
  elOut.textContent = 'const MIX = [' +
    mix.map((r, i) => '\\n  [' + r.map(v => v.toFixed(3)).join(',') + ']' +
      (i < mix.length - 1 ? ',' : '')).join('') + '\\n];\\n' +
    'music.gain.value = ' + m.toFixed(2) + ';';
}

elStages.onclick = e => {
  const b = e.target.closest('.stage'); if (!b) return;
  stage = +b.dataset.i; SND.setLevel(stage); SND.rewind(); draw();
};
elSliders.oninput = e => {
  const j = +e.target.dataset.j;
  const mix = SND.mix();
  mix[stage][j] = +e.target.value;
  SND.setMix(mix); draw();
};
elMaster.oninput = e => { SND.setMaster(+e.target.value); draw(); };

document.getElementById('play').onclick = () => {
  SND.start(); SND.setLevel(stage); SND.rewind();
  // master lives on a gain node, which does not exist until the context does
  if (pendingMaster !== null){ SND.setMaster(pendingMaster); pendingMaster = null; }
  else if (SND.master() === 0) SND.setMaster(0.55);
  draw();
};
document.getElementById('stop').onclick = () => {
  if (cycling){ clearInterval(cycling); cycling = null; }
  if (SND.enabled()) SND.toggle();
  setTimeout(() => { if (!SND.enabled()) SND.toggle(); }, 50);  // keep it armed
  SND.setMaster(0);
  draw();
};
document.getElementById('cycle').onclick = () => {
  SND.start(); if (SND.master() === 0) SND.setMaster(0.55);
  if (cycling){ clearInterval(cycling); cycling = null; return; }
  stage = 0; SND.setLevel(0); SND.rewind(); draw();
  // 20 seconds is one full turn of the chord loop, so each stage is heard
  // through the same music rather than a different slice of it.
  cycling = setInterval(() => {
    stage = (stage + 1) % 5;
    SND.setLevel(stage); SND.rewind(); draw();
  }, 20000);
};
document.getElementById('reset').onclick = () => {
  SND.setMix(SHIPPED.map(r => r.slice())); SND.setMaster(0.55); draw();
};
document.getElementById('quieter').onclick = () => {
  SND.setMix(SND.mix().map(r => r.map(v => +(v * 0.9).toFixed(3)))); draw();
};
document.getElementById('copy').onclick = () => {
  navigator.clipboard && navigator.clipboard.writeText(elOut.textContent);
};

/* A mix lives in this page's memory and nowhere else, so moving the sliders
   and saying "I've changed it" sends nothing to anybody. The hash carries the
   whole mix, which makes a tuned bench a link you can paste. */
function encode(){
  const flat = SND.mix().reduce((a, r) => a.concat(r), []);
  return '#m=' + flat.map(v => Math.round(v * 1000)).join('.') +
         '&v=' + Math.round(SND.master() * 100);
}
function decode(){
  const h = location.hash || '';
  const m = /#m=([\d.]+)&v=(\d+)/.exec(h);
  if (!m) return false;
  const flat = m[1].split('.').map(n => +n / 1000);
  if (flat.length !== 30) return false;
  const rows = [];
  for (let i = 0; i < 5; i++) rows.push(flat.slice(i * 6, i * 6 + 6));
  SND.setMix(rows);
  pendingMaster = +m[2] / 100;
  return true;
}
let pendingMaster = null;
document.getElementById('link').onclick = () => {
  const url = location.origin + location.pathname + encode();
  if (navigator.clipboard) navigator.clipboard.writeText(url);
  const b = document.getElementById('link');
  b.textContent = 'Link copied'; setTimeout(() => { b.textContent = 'Copy link'; }, 1600);
};
if (decode()) document.getElementById('out').scrollIntoView({ block: 'nearest' });

SND.setLevel(0);
draw();
window.__bench = { SND: SND, set stage(v){ stage = v; }, get stage(){ return stage; }, draw: draw };
</script>
`;

fs.writeFileSync('games/fennec-run/music.html', html);
fs.writeFileSync('public/fennec-music.html', html);
console.log('music bench built from the synth inside the game');
console.log('  synth lifted: ' + (synth.length / 1024).toFixed(1) + ' KB');
console.log('  games/fennec-run/music.html and public/fennec-music.html');
