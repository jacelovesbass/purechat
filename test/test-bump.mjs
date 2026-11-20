// Holding a message, and bumping an old one back to the bottom.
//
// Two halves, for the two things that can be wrong.
//
// The first is the gesture, which is the part a suite is bad at: a hold has
// to fire on a real press and NOT fire on a tap or a scroll, and getting the
// second half wrong is how a chat becomes unusable while every test passes.
// So the near misses are tested too.
//
// The second is that a bump is a copy credited to both people, seen by the
// other person, with the original left where it was.
import { launch, open, joinCode, until, BASE as URL } from './helpers.mjs';

const browser = await launch();
let bad = 0;
const check = (ok, why) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + why); if (!ok) bad++; };

/**
 * Press and hold something, the way a finger does.
 *
 * Scrolled into view FIRST: boundingBox reports where an off-screen message
 * would be, which for a buried one is a negative y, and the press then lands
 * on the header instead of the message. That cost half an hour.
 */
async function hold(page, locator, ms = 700) {
  const el = locator.first();
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** How far a client is from the end of the conversation, in pixels. */
const gapToEnd = page => page.evaluate(() => {
  const el = document.querySelector('.chat main');
  return el.scrollHeight - el.scrollTop - el.clientHeight;
});

const a = await open(browser, 'Jason');
await a.getByPlaceholder('Group name').fill('Bump Test');
await a.getByRole('button', { name: 'Create group' }).click();
await a.waitForSelector('.chat header');
const code = await joinCode(a);

const b = await open(browser, 'Sam', `${URL}#${code}`);
await b.waitForSelector('.chat header');
// Every table is gated on membership, so a message sent in the same instant
// as arriving races the join and is refused. Wait for the join to show.
await until(async () => {
  await a.getByRole('button', { name: /^People/ }).click();
  const seen = await a.locator('.person', { hasText: 'Sam' }).count();
  await a.locator('.sheet').click({ position: { x: 8, y: 8 } });
  return seen > 0;
});

// Sam says something, then the conversation buries it.
await b.getByPlaceholder('Message').fill('the thing nobody answered');
await b.getByRole('button', { name: 'Send' }).click();
check(await until(async () =>
        await a.locator('.row', { hasText: 'the thing nobody answered' }).count() > 0),
      'setup: the message to be bumped arrived on the other client');
for (let i = 1; i <= 25; i++) {
  await a.getByPlaceholder('Message').fill(`filler ${i}`);
  await a.getByRole('button', { name: 'Send' }).click();
}
await until(async () => await a.locator('.row').count() >= 26);

/* ---------------- Half one: the gesture ---------------- */

// A tap must do nothing at all.
await a.locator('.bubble', { hasText: 'the thing nobody answered' }).first().click();
await a.waitForTimeout(300);
check(await a.locator('.sheet').count() === 0, 'a tap does not open the menu');

// Nor must a scroll that happens to start on a message.
const box = await a.locator('.bubble', { hasText: 'filler 3' }).first().boundingBox();
await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await a.mouse.down();
for (let y = 0; y < 120; y += 20) await a.mouse.move(box.x + box.width / 2, box.y + y);
await a.waitForTimeout(600);
await a.mouse.up();
check(await a.locator('.sheet').count() === 0, 'a drag that starts on a message does not open the menu');

// A real hold does.
await hold(a, a.locator('.bubble', { hasText: 'the thing nobody answered' }));
await a.waitForSelector('.sheet-card', { timeout: 3000 });
check(await a.locator('.menu-preview').innerText()
        .then(t => t.includes('the thing nobody answered')),
      'the menu shows the message that was held');

/* ---------------- Half two: the bump ---------------- */

await a.screenshot({ path: 'shot-bump-1-menu.png' });
await a.getByRole('button', { name: /Bump to the bottom/ }).click();
await until(async () => await a.locator('.bumped').count() > 0);

// A condition rather than a snapshot: this scroll is the animated one, so
// measuring the instant the card appears measures it mid-flight.
check(await until(async () => await gapToEnd(a) < 60, { timeout: 5000, every: 200 }),
      'bumping from up in the history takes you back down to see it land');

const card = a.locator('.bumped').first();
const head = await card.locator('.bump-head').innerText();
check(head.includes('You bumped') && head.includes("Sam's"),
      `the bumper sees both names: "${head.trim()}"`);
check(await card.locator('.bump-body').innerText()
        .then(t => t.includes('the thing nobody answered')),
      'the copy carries the original words');
check(await card.locator('.bump-when').innerText().then(t => /from/.test(t)),
      'the copy says how old the original is');

// Last in the conversation, which is the whole point.
const rows = await a.locator('.row').count();
check(await a.locator('.row').nth(rows - 1).locator('.bumped').count() === 1,
      'the copy is the last message');

// And the original is still where it was.
check(await a.locator('.row', { hasText: 'the thing nobody answered' }).count() === 2,
      'the original stays in place: two now, not one moved');

// Sam sees it, authored by Jason, crediting Sam.
check(await until(async () => await b.locator('.bumped').count() > 0),
      "the other person's client shows the bump");
const theirs = await b.locator('.bumped .bump-head').first().innerText();
check(theirs.includes('Jason bumped your message'),
      `the person who said it reads it as theirs: "${theirs.trim()}"`);
check(await b.locator('.row.theirs .bumped').count() === 1,
      'the copy is attributed to the person who bumped it, not the author');

// Bumping a bump re-bumps the original rather than nesting a copy in a copy.
await hold(b, b.locator('.row:has(.bumped) .bubble'));
await b.waitForSelector('.sheet-card');
await b.getByRole('button', { name: /Bump to the bottom/ }).click();
await until(async () => await b.locator('.bumped').count() > 1);
const second = await b.locator('.bumped').last().innerText();
check(second.includes('You bumped your own message')
      && (second.match(/bumped/g) || []).length === 1,
      `a bump of a bump is flat: "${second.replace(/\s+/g, " ").trim()}"`);

/* ---------------- Opening a group lands on the newest message ---------------- */

// Sam reloads into a conversation 29 messages long. The last one must be on
// screen without touching anything, and not after an animated trip down.
await b.reload();
await b.waitForSelector('.chat main');
await until(async () => await b.locator('.row').count() > 20);
await b.waitForTimeout(600);
const gap = await gapToEnd(b);
const height = await b.evaluate(() => document.querySelector('.chat main').scrollHeight);
check(gap < 60, `opening the group lands at the newest message (${Math.round(gap)}px from the end of ${height}px)`);

const lastSeen = await b.locator('.row').last().boundingBox();
const view = await b.locator('.chat main').boundingBox();
check(lastSeen.y + lastSeen.height <= view.y + view.height + 2,
      'the newest message is inside the window, not below it');

await b.screenshot({ path: 'shot-bump-2-landed.png' });

// A live board is not bumpable: a copy of it would be a second board.
await b.getByRole('button', { name: 'Versus' }).click();
await b.waitForSelector('.sheet-card');
const canPlay = await b.locator('.sheet-card').getByRole('button', { name: /Jason/ }).count();
if (canPlay) {
  await b.locator('.sheet-card').getByRole('button', { name: /Jason/ }).first().click();
  await until(async () => await b.locator('.versus').count() > 0);
  check(await b.locator('.row:has(.versus) .bubble.holdable').count() === 0,
        'a live Versus board cannot be held');
} else {
  console.log('SKIP: no opponent offered, so the live-board case was not reached');
}

await browser.close();
process.exit(bad ? 1 : 0);
