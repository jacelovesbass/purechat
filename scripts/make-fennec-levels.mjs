// Lay out Fennec's stages, and throw away any the game's own rule rejects.
//
// The generator does not re-derive the jump maths. It loads the game, builds a
// candidate, and calls __g.audit() on it: the same code the game ships, so the
// levels are checked against the physics as it actually is rather than as this
// script remembers it. A candidate with any problem is discarded and reseeded.
//
// Output is written into index.html, so what ships is fixed, deterministic data
// that has already passed. Nothing is generated while somebody is playing.
/* global __g */   // evaluated inside the page, not in node
import { chromium } from 'playwright';
import fs from 'node:fs';

const GY = 300;

// Themes are hand-written. The generator does geometry; it has no taste.
// Afternoon, late day, dusk, night, deep night: the arc the score follows.
const THEMES = [
  { name:'Dune Steps', w:3200, sky:['#8FD8EE','#FBE7C7'], hillA:'#E8CFA2', hillB:'#D9B885',
    dirt:'#C98A52', crust:'#E0A96B' },
  { name:'The Wadi', w:3600, sky:['#79C6E6','#F3DDBE'], hillA:'#DDC79C', hillB:'#C9A974',
    dirt:'#BE7C45', crust:'#D89A5C' },
  { name:'The Erg', w:4000, sky:['#5E6FA8','#F0A978'], hillA:'#C89A86', hillB:'#A8807A',
    dirt:'#9A5F46', crust:'#B87B56' },
  { name:'Hamada', w:4400, sky:['#2B3A5C','#5A6A92'], hillA:'#4C5578', hillB:'#3A4260',
    dirt:'#44415A', crust:'#625E7C', night:true },
  { name:'Before Dawn', w:4800, sky:['#241E42','#7C5E86'], hillA:'#463A66', hillB:'#332A50',
    dirt:'#463654', crust:'#655074', night:true }
];

// Difficulty ramp. Pits widen toward the limit, chains climb higher, and the
// predators arrive in the order the player should meet them.
const RAMP = [
  { runMin:420, runMax:620, pitMin:66, pitMax:78, steps:3, minY:200, caracals:0, owls:0, spikes:1 },
  { runMin:380, runMax:560, pitMin:70, pitMax:84, steps:3, minY:175, caracals:2, owls:0, spikes:2 },
  { runMin:360, runMax:520, pitMin:72, pitMax:88, steps:4, minY:150, caracals:2, owls:0, spikes:3 },
  { runMin:340, runMax:500, pitMin:74, pitMax:90, steps:4, minY:130, caracals:3, owls:2, spikes:4 },
  { runMin:320, runMax:480, pitMin:76, pitMax:90, steps:4, minY:118, caracals:3, owls:3, spikes:4 }
];

function rng(seed){
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function build(seed, idx){
  const R = rng(seed), o = RAMP[idx], th = THEMES[idx];
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const w = th.w;

  // --- ground, as solid runs with pits between them ---
  const ground = [];
  let x = 0;
  while (x < w - 520){
    const end = Math.min(x + ri(o.runMin, o.runMax), w);
    ground.push([x, end]);
    x = end + ri(o.pitMin, o.pitMax);
  }
  if (x < w) ground.push([x, w]); else ground[ground.length - 1][1] = w;

  // --- platforms, as chains that start within a jump of the ground ---
  // Every link is kept inside the limits the rule publishes, which is why the
  // first candidate usually passes rather than the fiftieth.
  const plats = [];
  ground.forEach(([g0, g1], gi) => {
    let px = g0 + (gi === 0 ? 220 : ri(60, 120));   // leave the spawn clear
    let py = GY - ri(52, 64);                        // reachable from the ground
    for (let k = 0; k < o.steps; k++){
      const pw = ri(80, 130);
      if (px + pw > g1 - 30) break;
      plats.push({ x:px, y:py, w:pw });
      px += pw + ri(58, 78);
      const climb = R() < 0.62 && py > o.minY + 60;
      py += climb ? -ri(40, 54) : ri(28, 48);
      py = Math.max(o.minY, Math.min(GY - 52, py));
    }
  });

  // --- pickups ---
  const dates = [];
  const row = (rx, ry, n, gap) => {
    for (let i = 0; i < n; i++) dates.push({ x: Math.round(rx + i * (gap || 26)), y: Math.round(ry) });
  };
  for (const p of plats) row(p.x + 14, p.y - 32, Math.min(4, Math.max(2, Math.round(p.w / 34))));
  const pits = [];
  for (let i = 0; i < ground.length - 1; i++)
    pits.push([ground[i][1], ground[i + 1][0]]);
  pits.forEach((pit, i) => {
    if (i % 2 === 0) row(pit[0] + 14, 248, 3, 22);     // a lure out over the drop
  });

  // melons sit over pits, because a fennec's water is never anywhere safe
  const melons = pits.filter((_, i) => i % 3 === 1)
                     .slice(0, 2)
                     .map(pit => ({ x: Math.round((pit[0] + pit[1]) / 2), y: 244 }));
  // moonflowers on solid ground, one early, one late
  const flowers = [ground[1], ground[ground.length - 2]].filter(Boolean)
    .map(g => ({ x: Math.round(g[0] + 90), y: GY - 42 }));

  // --- hazards and animals ---
  const spikes = [];
  for (let i = 1; i < ground.length && spikes.length < o.spikes; i++){
    const [g0, g1] = ground[i];
    if (g1 - g0 < 260) continue;
    spikes.push({ x: Math.round(g0 + (g1 - g0) * 0.55), w: ri(50, 62) });
  }

  const onPlat = p => ({ x: Math.round(p.x + p.w / 2), a: Math.round(p.x), b: Math.round(p.x + p.w) });
  const scorps = plats.filter((_, i) => i % 3 === 0).map(onPlat);
  const jerboas = plats.filter((_, i) => i % 3 === 2).map(onPlat);

  const caracals = [];
  const long = ground.filter(g => g[1] - g[0] > 300);
  for (let i = 0; i < o.caracals && i < long.length; i++){
    const g = long[Math.floor((i + 0.5) * long.length / Math.max(1, o.caracals))] || long[i];
    caracals.push({ x: Math.round((g[0] + g[1]) / 2), a: Math.round(g[0] + 40), b: Math.round(g[1] - 40) });
  }

  const owls = [];
  for (let i = 0; i < o.owls; i++){
    const g = ground[Math.min(ground.length - 1, 2 + i * 2)];
    if (!g) break;
    owls.push({ x: Math.round(g[0] + 60), y: 100 + i * 14,
                a: Math.round(g[0]), b: Math.round(Math.min(g[1] + 200, w - 60)) });
  }

  const last = ground[ground.length - 1];
  const den = Math.round(last[1] - 130);

  return Object.assign({}, th, { ground, plats, dates, melons, flowers,
                                 spikes, scorps, jerboas, caracals, owls, den, seed });
}

/* ---------------- accept or discard, using the game's own rule ---------------- */
const b = await chromium.launch({ args:['--disable-background-timer-throttling'] });
const p = await (await b.newContext({ viewport:{width:820,height:460} })).newPage();
await p.goto('file:///C:/Users/Jason/dev/HOB_2026_001/games/fennec-run/index.html');
await p.waitForTimeout(300);

const accepted = [];
for (let idx = 0; idx < THEMES.length; idx++){
  let got = null, tried = 0;
  for (let seed = 1; seed <= 400 && !got; seed++){
    tried++;
    const cand = build(seed * 7919 + idx * 101, idx);
    const res = await p.evaluate(L => __g.audit(L), cand);
    if (res.problems.length === 0) got = cand;
    else if (seed <= 3)
      console.log(`  ${THEMES[idx].name} seed ${seed}: ${res.problems.length} problem(s) — ` +
                  res.problems[0]);
  }
  if (!got) throw new Error(`${THEMES[idx].name}: no candidate passed in ${tried} tries`);
  const audit = await p.evaluate(L => __g.audit(L), got);
  console.log(`${got.name.padEnd(12)} accepted on try ${tried}, ` +
    `${got.w} wide, ${got.plats.length} platforms, ${got.ground.length - 1} pits, ` +
    `${got.dates.length} dates, ${audit.plainReached}/${audit.surfaces} by plain jump`);
  accepted.push(got);
}
await b.close();

/* ---------------- emit ---------------- */
const q = v => JSON.stringify(v);
const pts = a => '[ ' + a.map(o => '{' + Object.keys(o).map(k => k + ':' + o[k]).join(',') + '}').join(', ') + ' ]';
const wrap = (label, body) => {
  const out = [];
  let line = '    ' + label + ': ';
  for (const part of body.split(/(?<=,) /)){
    if (line.length + part.length > 94){ out.push(line); line = '      '; }
    line += part + ' ';
  }
  out.push(line.trimEnd());
  return out.join('\n');
};

const src = accepted.map(L =>
`  {
    name: ${q(L.name)}, w: ${L.w}, den: ${L.den},
    sky: [${q(L.sky[0])}, ${q(L.sky[1])}], hillA: ${q(L.hillA)}, hillB: ${q(L.hillB)},
    dirt: ${q(L.dirt)}, crust: ${q(L.crust)}${L.night ? ', night: true' : ''},
${wrap('ground', '[' + L.ground.map(g => '[' + g[0] + ',' + g[1] + ']').join(', ') + ']')},
${wrap('plats', pts(L.plats))},
${wrap('spikes', pts(L.spikes))},
${wrap('melons', pts(L.melons))},
${wrap('flowers', pts(L.flowers))},
${wrap('scorps', pts(L.scorps))},
${wrap('jerboas', pts(L.jerboas))},
${wrap('caracals', pts(L.caracals))},
${wrap('owls', pts(L.owls))},
${wrap('dates', pts(L.dates))}
  }`).join(',\n');

const file = 'games/fennec-run/index.html';
let html = fs.readFileSync(file, 'utf8');
// Replace the array body line by line. Matching on a '\n];\n' literal fails
// silently on a CRLF checkout, which is how this went wrong the first time.
const eol = html.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const lines = html.split(/\r?\n/);
const i0 = lines.findIndex(l => l.startsWith('const LEVELS = ['));
if (i0 < 0) throw new Error('could not find the LEVELS array');
let i1 = -1;
for (let i = i0 + 1; i < lines.length; i++) if (lines[i].trim() === '];'){ i1 = i; break; }
if (i1 < 0) throw new Error('could not find the end of the LEVELS array');
html = lines.slice(0, i0 + 1)
  .concat(src.split('\n'), lines.slice(i1))
  .join(eol);
fs.writeFileSync(file, html);
console.log(`\nwritten into ${file}`);
