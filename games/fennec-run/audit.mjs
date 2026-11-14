import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--disable-background-timer-throttling'] });
const p = await (await b.newContext({viewport:{width:820,height:460}})).newPage();
const errs=[]; p.on('pageerror', e=>errs.push(String(e)));
await p.goto('file:///C:/Users/Jason/dev/HOB_2026_001/games/fennec-run/index.html');
await p.waitForTimeout(300);
const r = await p.evaluate(() => ({ env: __g.envelope(),
  levels: __g.levels.map(L => __g.audit(L)) }));
console.log('ENVELOPE  ' + Object.entries(r.env).map(([k,v])=>k+'='+v).join('  '));
let total = 0;
for (const a of r.levels){
  console.log('\n=== ' + a.level + ' === ' + a.plainReached + '/' + a.surfaces +
              ' reachable by plain jump, ' + a.reached + ' with glide');
  for (const d of a.detail)
    if (d.how !== "jump" && d.how !== "spawn")
      console.log("   " + d.how.toUpperCase().padEnd(12) + d.what + ' x=' + d.x0 + '..' + d.x1 + ' y=' + d.y + (d.effort ? '  (' + d.effort + '% of a max jump)' : ''));
  a.problems.filter(x => x.indexOf('date') === 0 || x.indexOf('pit') === 0 || x.indexOf('den') === 0)
            .forEach(x => console.log('   ' + x));
  total += a.problems.length;
}
console.log('\ntotal problems:', total);
console.log(errs.length ? 'ERRORS: '+errs.join('\n') : 'no page errors');
await b.close();
