# Dev log

What happened and why, in plain English. Not a changelog: `git log` already
lists what changed. This is for the reasoning, the wrong turns, and the things
that would otherwise have to be rediscovered.

**Newest first.** Add an entry when a session ends, not when a commit lands.

---

## 2026-11-12 — A person may own two phones

The MD opened the app and found himself listed as **"Jason (2)"** in his own
group. A bug I introduced on 2026-11-07, reported by the person it happened to,
in production.

**What went wrong.** Migration 011 made identity per browser, and kept the old
rule that a name is unique within a room. Those two things together are a bug.
On iOS the installed home screen app and the Safari tab are **separate
storage**, so the same person routinely arrives as two identities. The second
one found its own name taken and got renamed.

**The rule was guarding against nothing.** It stopped somebody taking your
name, inside a private invite-only group of friends. Nobody has that threat.
And before identities existed, *any* device could use *any* name, so there was
never protection there to lose. It broke the ordinary case to defend an
imaginary one.

**The model was simply wrong, and the fix is the model.** A membership is one
row **per identity**; the name is a label on it. Two rows in a room may carry
the same name, because they are often the same person. The primary key moves
from `(room_id, name)` to a surrogate id, with a partial unique index on
`(room_id, user_id)` giving one seat per device. The roster is collapsed by
name for display, so a person with a phone and a laptop still reads as one
person.

**A trigger nearly took the change down with it.** `ensure_member` upserted
`on conflict (room_id, name)` on every message insert, so dropping that key
would have broken posting. It is also redundant now, and worse than redundant:
a row it invented would have no owner. It is now a `last_seen` touch and
nothing else, because joining is `join_room`'s job.

**I had a passing test asserting the wrong thing.** *"Somebody joining under
your name does not take your membership"* was true, and the behaviour it was
describing was the bug. The requirement that actually mattered, *"my second
phone is still me"*, had no test at all. A green suite is not evidence that the
requirements are right, only that the code matches them.

**And one self-inflicted scare.** The first full run after the migration showed
every browser suite crashing and only the pure-Node one passing, which looks
exactly like a schema change breaking the app. The dev server had stopped. The
shape of the failure (one suite passing, and it being the one that needs no
browser) was the tell.

**138 tests across 19 suites.** The live group was repaired in the migration:
the real "Jason (2)" row is "Jason" again, which is only safe now that two
rows may share a name.

---

## 2026-11-08 — Kits: a group's emoji, GIFs and games in one file

The MD's ask: take everything a chat has collected and load it into a new one
in a single file. **A kit is a zip of zips**, which is the whole design and the
reason it was cheap.

Packs and games were already self-describing zips with their own manifests, so
a kit adds `kit.json` and nothing else. Three things fall out of that for free:

- **No new parsing.** Loading a kit feeds each inner file to the same importer
  a person uses when they drag a pack in by hand.
- **A pack pulled out of a kit is still a pack.** Unzip it, send somebody
  `packs/faces.zip`, and it imports on its own.
- **The link property survives.** A GIF pack whose entries are all URLs is
  still a few hundred bytes inside a kit.

**Messages and members are deliberately not in it.** This is a kit, not a
backup. Copying a conversation into another group is a different feature with
worse implications.

**It lives in the People sheet**, on the MD's call, rather than as a fifth
button on the bar. That sheet is already the group-level surface (join code,
invite, leave), and a kit is not something you reach for mid-sentence.

**The install paths were merged first.** The emoji sheet and the games sheet
each did their own inserts, and the kit loader would have been a third. That is
how two importers end up disagreeing about what a clashing shortcode does, so
there is now one `installPack` and one `installGame` and all three use them.

**Two shapes, both found by running it, neither by reading it.** `exportPack`
returns `{ blob, files }` and `exportGame` returns a Blob, which is an easy
thing to miss when nesting one inside the other. And JSZip will not reliably
nest a Blob at all: it fails with *"Can't read the data of packs/faces.zip. Is
it in a supported JavaScript type"*, which is a confusing way to say "give me
an ArrayBuffer". Both now go in as ArrayBuffers.

**The test is the round trip**, not the file listing. It builds a group with a
pack and a game, saves the kit, makes a second group, loads it, and then checks
the emoji are all there, the game kept its proper name rather than its
filename, **and that the game still runs**. A test that asserted the zip
contained the right entries would have passed every one of the versions that
did not work.

**135 tests across 19 suites, all passing.**

---

## 2026-11-07 — The database is closed

The open item from 2026-11-06, standing through four sessions. Every table said
`for all to anon using (true)`, so the publishable key that ships in the
browser bundle could read every group, every join code and every message. It
was demonstrated twice, with one command and no login, against the real
database holding four people's real conversations.

**What changed.** Every device signs in anonymously: a uuid, no email, no
password, no login screen, nothing anyone notices. Membership is a row carrying
that uuid, and every table is gated on it. Rooms are created, found and joined
through security definer functions, so **the join code is now the capability
rather than a label**.

The same attack now returns `permission denied for table rooms`, and null for
everything else. **It is not encryption**: the server can still read
everything. What changed is that strangers cannot.

**This is also the prerequisite for everything else.** You cannot block a
malicious user when there are no accounts, so the app store moderation
requirements were unreachable without it, as was any ability to honour an
eSafety takedown notice. One piece of work, three obligations. The legal
research behind that is in the vault note, not here.

### I broke the live chat, for about two minutes

The change was deliberately split into two migrations so there would be no
window where the app was broken. Then `npm run migrate` applied **both**,
because of course it applies everything pending, and the door shut while
anonymous sign-in was still disabled. Nobody could get in, including the app.

Rolled back inside two minutes and verified against the real database rather
than assumed: 72 messages, both games, four members, reads and writes working.
No data was at risk, because policies do not touch rows.

**The fix is in the tool, not in my resolve.** A migration may now be named
`*.gated.sql`, which `npm run migrate` holds back and announces:

    held back (gated): 012_lock_down_access.gated.sql
    run with --gate <prefix> when the precondition is actually met

A gated migration is one that depends on something **outside** the database
being true: a deploy having landed, a setting switched on, a person saying go.
"Apply everything pending" is the right default right up until it is
catastrophically wrong.

### Three real bugs, and the one that matters most was caught by A/B

1. **The app called the database before sign-in landed.** It rendered its gate
   immediately, so "Create group" fired with no session and came back `not
   signed in`. It now waits for a session before rendering anything, which is
   correct: the database answers nothing without one.

2. **Chat loaded packs before the join granted membership.** A message could
   then arrive referencing an emoji the other client had not loaded, and the
   other person saw `[emoji]` instead of the picture. Two runs in four.
   **I found out whether I had caused it by stashing the work and running the
   old code four times: 4/4 pass before, 2/4 after.** That took two minutes and
   turned "flaky test" into "regression I introduced", which are not the same
   thing and do not get the same fix.

3. **A wrong join code returned a room.** PostgREST renders a NULL composite as
   a row of NULL columns, so `find_room('AAAAA')` came back as
   `{id: null, name: null, ...}`, which is an object, which is truthy. A bad
   code walked into a room with no id. Caught by the lockdown suite, which
   checks a wrong code returns *nothing* rather than checking a right one
   works.

### And one bad piece of test infrastructure I wrote

The suite was failing on the anonymous sign-in rate limit, because every
browser context signed in from scratch: about fifty sign-ins a run against a
default of thirty an hour. So identities are now pooled on disk and seeded
straight into localStorage, and expired ones are **refreshed** rather than
re-minted, which costs nothing against the limit.

The first version of that pool hashed names into eight slots. Two different
people in a test could therefore collide onto **one identity**: "the other
person" silently became the same person. It was behind every intermittent
crash, and the giveaway was the lockdown suite reporting that its
member-of-nothing stranger could read five rooms. Keyed by name now. **A pool
that quietly conflates two identities is worse than no pool**, because the
tests keep running and stop meaning anything.

### State

**125 tests across 18 suites, all passing**, counted from a run rather than by
adding to a remembered number. The lockdown suite is 16 of those and is written
as the attack: take the key out of the public bundle, ask for everything,
assert nothing comes back. A suite phrased as "a member can read their room"
would pass just as happily with the door wide open.

**Nobody has to do anything.** Each device stores its groups with their join
codes, so on next load it re-joins and claims the membership row it already
had. That path is tested on a planted unowned row rather than on the real
group, because it is the one path that cannot be retried if it is wrong.

---

## 2026-11-07 — Versus: a game played in the conversation

The MD's idea, and a better one than the multiplayer that was on the table.
Rather than two phones sharing game state, the board **is a message**. One row,
whose payload carries the move list, edited on every turn.

**Almost no new machinery, because a chat already is the hard part.** An
ordered, live, durable list of events is exactly what a turn based game needs.
No session table, no second realtime channel, no answer required for "what if
someone closes the app mid game" - the board is still sitting there. Every
phone replays the move list and arrives at the same board, so nobody is in
charge.

**One change to the chat itself:** messages used to be write once, and the
client only listened for INSERT. A Versus board is one message edited
repeatedly, so it now listens for UPDATE too.

**A separate button, on the MD's call, and it was the right one.** Games means
"anyone's HTML file, sealed in a sandbox, play it yourself". Versus means
"built in, two of you, live in the chat". A sandboxed game cannot draw into a
bubble and must not be trusted with the state, so one button would have forced
both ideas to compromise. Two buttons, and neither has to.

**The cost, named rather than hidden: BOOM's rules now exist twice.** Once
sealed inside `public/tic-tak-toe-boom.html`, which cannot import anything by
definition, and once in `src/lib/boom.js`. `test/test-versus.mjs` runs the same
move lists through both engines and compares the board, the bombs, the longest
runs and whether the game is over. Four scenarios including the collapse case.
**That test is the only thing standing between here and two games with the same
name and different rules.**

**The contract grew, slightly.** A renderer used to receive only `{ message }`.
An interactive one needs to know who is looking and how to write back, so it
now gets `name`, `onUpdate` and `onSend`. Sheets also now receive `people` and
`online` from the chat, which already holds the roster live.

**Found by a flaky test, and it was a real bug.** The Versus sheet queried
`members` itself when it opened, and raced the other person's arrival: open it
a second too early and they were simply not in the list. The chat already had
the roster over the socket. Passing it down removed both the race and a
duplicate query.

**Found by looking, not by a test:** the board rendered inside the sender's own
message bubble, which is the same blue as player one's tokens. Unreadable for
whoever started the game, fine for everyone else. The board now paints its own
panel over the bubble's padding.

---

## 2026-11-07 — A computer to play against

Tic Tak Toe BOOM! gets a second mode. The start screen now offers **Play a
friend** or **Play the computer**; the computer takes the amber seat, so the
human always goes first, and it gets three bombs like anyone else.

**The work was not the opponent, it was separating the rules from the screen.**
The live grid holds token objects that each carry their own DOM element, and
`collapse()` rearranges the board and animates it in the same loop. Anything
that thinks ahead has to try a move, look, and put it back without drawing it.
So there is now a parallel set of pure functions (`simDrop`, `simBomb`,
`simCollapse`, `simLongest`) working on a plain array of numbers, with
`snapshot()` to make one. About 90 lines, and it is the piece a stronger
opponent would build on later.

**One level, and it reasons in this order:** take a win; take a bomb that wins
outright; block a single threat; if there are two threats, bomb, because a
token cannot cover both; otherwise score every drop and every bomb on the same
scale and play the best.

**The rule the opponent exists to respect.** A four made by the rubble counts
for whoever it belongs to, so a bomb can hand the human the game. Every bomb
is therefore collapsed in private first and judged exactly as `judge()` would,
including the longest-line tiebreak. A bot that skipped this would lose in ways
that look idiotic.

**Bombs needed a price before it would use them.** The first version only
bombed to win or to defuse a double threat, and the measurement said it
finished a game with **all three unused**, which makes the signature mechanic
decoration. Drops and bombs are now scored on one scale with a `BOMB_COST` of
10, so a bomb has to be clearly better than a token rather than merely equal.
Measured after: bombs used in **5 of 8 games**, and spent around moves 8 to 12,
which is when threats actually form rather than scattered through the opening.

**It beat a scripted human 8 times out of 8.** That number means the logic is
not broken; it does not mean the opponent is too strong, because the scripted
human never blocks and never tries to win. Only a person can answer that.

**Two test bugs cost more than the feature did**, and both were the test
lying rather than the code failing.

1. `newGame()` only reset the board when the game had **ended**. Three
   scenarios stacked on a dirty board and failed for reasons that had nothing
   to do with the computer. It now resets unconditionally and asserts the
   board is empty before going on.
2. The full-game loop waited for "the turn is back to zero", which is **still
   true the instant a drop returns**, because the turn only flips 330 ms later.
   The scripted human fired forty moves before the computer got one, and the
   failure read as "the computer never moves". It now waits for the move count
   to advance by two.

**A passing timing check that proved nothing.** The first version reported
"decides in 0.0 ms", which a `__choose` that did nothing at all would also
report. It now runs 200 decisions, prints microseconds (7), and separately
asserts all 200 were legal moves.

---

## 2026-11-07 — Tic Tak Toe BOOM! (later the same day)

The first game written for this app rather than imported into it. Four in a
row on a seven by six board with gravity, two players sharing one phone, and
three bombs each.

**The bomb is the whole game.** Tap BOOM, tap any token, and that token plus
the four touching it edge on are destroyed, your own included. It costs your
whole turn, and everything above the hole falls into it.

**It started as a three by three block and the MD cut it to a plus**, on the
grounds that nine of forty two cells is too much board to take in one turn.
The shape turns out to be load bearing rather than cosmetic: a plus cannot
reach a token sandwiched between two you want to keep, so blowing a single
token out of a stack now means aiming at the column beside it and aiming one
arm in. The test scenario had to be rebuilt around that, which is the clearest
evidence the change altered the game rather than the numbers.

**The rule that took the thought, and the MD set it.** A four made by the
collapse counts, whoever it belongs to. So a bomb can hand your opponent the
game. If the dust settles and both players hold four, the **longer line wins**,
and an equal longest is a dead heat. That is why `longest()` returns a length
rather than a boolean: a win test would have been enough for a plain drop, and
useless for arbitrating a double.

**The test is the part worth keeping.** `test/test-boom.mjs` builds a real
board by dropping eleven tokens, has **player two** bomb it, and asserts the
collapse gives **player one a four in a row**. It also counts the tokens taken,
so a blast quietly growing back to a block would fail rather than pass. Driving the real entry points move by move is what makes it
evidence. A forced end state would have proved only that the overlay renders.
It also checks gravity still holds afterwards, because a board with a token
floating above a hole is lying about itself.

**Found by reading the host, not by guessing.** `games.jsx` closes the player
the instant a score is posted. So the result cannot post itself: the win screen
comes first, offering Rematch or Post, and the test asserts nothing reaches the
chat until somebody asks. The board also lifts and shrinks when the game ends
so the winning line stays visible behind the sheet, which only came up because
the first screenshot had the overlay sitting squarely on top of the five in a
row that had just been made.

**Four defects the screenshots caught and the suite did not**, which is the
project's usual pattern: a player name truncated to "Jas...", a bomb pip that
did not burn down until the turn handed over, the end sheet covering the
winning line, and a heavy dim exactly where a four usually sits. All four were
visible in a picture and invisible to an assertion.

---

## 2026-11-07 — Tidying up

Nothing new for a user. A day of making the next change cheaper than the last.

**What the mess actually was.** The repo root held 45 loose scripts, 20 of them
one-off debug files written to answer a single question and never deleted.
`App.jsx` had grown to 707 lines holding nine components. Schema changes were
applied by editing a setup script by hand, so nothing recorded what had
actually been run against the database. The tests created rooms and abandoned
them, which is how a live database ended up with **127 rooms, 125 of them junk**.

**What changed.** Components split into one file each, with shared logic in
`src/lib`. Migrations ordered in files and recorded in a `schema_migrations`
table. Scripts and tests moved out of the root. ESLint added with the React
hooks rules, which found six real problems including a `setState` inside an
effect and a sparse array used as a default.

**Two things worth remembering from it.**

A test group was called **"Pure"** — the same name as the real group. Nothing
went wrong, but the cleanup routine deletes by name, so that was one typo away
from destroying a real conversation. Test fixtures should never be named
something a real thing might be called.

The refactor touched almost every file and was safe only because 37 browser
tests existed to say so. They ran green before and after. That is the entire
argument for having written them.


## 2026-11-07 — Tidy up, a tool contract, and games

Three things, in that order, because the second depended on the first and the
third proved the second.

**Cleared 125 junk rooms** from a live database, left by tests that never tidied
up. The rooms were the symptom; the missing teardown was the defect, and
`scripts/test-all.mjs` now removes what each run creates. Narrowly: name must
match, room must be under two hours old, keep list respected. A test group was
called **"Pure"**, the same as the real group, which was one typo from deleting
a real conversation.

**Then the tidy-up.** 45 loose scripts in the root, 20 of them one-off debug
files; schema applied by hand-editing a script with no record of what had run;
`App.jsx` at 707 lines holding nine components; no linting. Now: ordered
migrations in a `schema_migrations` table, `scripts/` and `test/`, components
one per file, ESLint with the hooks rules enforced in CI. Six real lint
findings, all fixed rather than silenced.

**My own ESLint install broke the deploy**, and this is the bit worth
remembering. `--legacy-peer-deps` locally hid a genuine conflict that CI's
strict `npm ci` would not tolerate, so two deploys failed and the live site sat
on the pre-refactor build. Nobody noticed because the local run was green.
**A green terminal says nothing about production.** Lint now runs in CI and the
habit now is to check the URL.

**The tool contract.** The stated product is a bar where people bring their own
tools, and a tool was hardcoded into `Chat.jsx`. Those cannot both be true. A
tool is now `{id, label, icon, Sheet, render?}` in `src/tools/`, the bar maps
over the registry, and `Chat` knows tools exist and nothing else. Emoji and GIF
were moved onto the same contract a third party would use, because a private
path for the built-ins rots the public one.

**A dice tool proved the contract and was then deleted**, which was the right
life for it. The MD was blunt about it not being the point, and he was right:
it was scaffolding, not a game.

**Games.** One HTML file, run in an iframe with `sandbox="allow-scripts"` and
never `allow-same-origin`, so the game sits in an opaque origin with no
cookies, no storage, no DOM access and no route to the database. The host API
is three messages wide on purpose: everything added is something a hostile game
can try. Written entirely through the tool contract, which is the contract
paying for itself the first time it was used in anger.

**Kelp Diver is the evidence.** A 1200-line canvas game written in another
session, 45 KB, installed unmodified and ran with zero console errors. A second
member of the group saw it in their list without installing anything. That is
much stronger than a fixture I wrote to pass my own test. The only change was
nine lines posting the dive total to the chat, guarded so it is inert outside
Pure Chat, and flagged rather than slipped in.

**Also found and fixed: an unfiltered realtime subscription I introduced**
earlier in the week. Every client in every room reloaded its packs on any emoji
change anywhere. Invisible at four people, an outage at a thousand rooms.
`emoji` rows now carry `room_id`, kept true by a trigger. The test checks both
that another room does not wake you *and* that your own still does, so the
assertion cannot pass by the subscription being broken entirely.

**State:** 61 tests, 10 migrations, 14 suites, 560 KB bundle, A$0 spent.

---

## 2026-11-06 — Emoji packs, GIFs, and working out what the product is

The day the project stopped being "a chat app" and became something with an
argument behind it.

**The argument, which is the MD's and took a while to surface.** Messenger's
toolbar already exists and is full of things nobody wants: bad games, worse GIF
search, embarrassing avatars. The gap is not features, it is that **the
catalogue belongs to somebody else**. A group reuses about twenty GIFs, and
searching a library of millions to find one of them is a tax you pay for not
owning it. Twenty needs no search at all.

So the product is: your own emoji, your own GIFs, eventually your own tools.
The incumbents cannot copy it, because their business model is keeping you
inside their catalogue.

**The pack format came out of that and is the piece most likely to outlive the
app.** A pack is an ordinary zip with a manifest, and an entry carries either a
bundled file *or* a URL. That one either/or is why a GIF pack exports at about
500 bytes carrying no pictures, and why bring-your-own-storage needs no new
code. Nobody else has a pack *file* — Telegram, Signal and WhatsApp all lock
the concept inside the app; Discord and Slack make you re-upload emoji one at
a time.

**A useful question that picked the architecture.** "How would this cost almost
nothing if everyone on earth used it?" Only a few designs survive it:
content-addressed URLs, dedupe, zero-egress storage, re-encode in the browser,
never let the origin touch the bytes. The MD then pushed past it to actual
zero, which produced the better answer: the pictures live in the user's own
cloud and the app holds a URL.

**Three defects, all found by a person, none by a test.**

1. Picking one emoji sent a different one. Both packs contained `:shocked:` and
   the lookup kept whichever loaded last. A member reported it inside the chat.
2. The GIF picker was empty after a day of sending GIFs, because it only showed
   things someone had explicitly saved.
3. No way back out of a chat. The only exit was "Leave group", which sounded
   destructive and only ever cleared which group you were in.

**This is now a pattern rather than a coincidence.** Across two days, every
defect of consequence was found by someone opening the app. The suites were
green throughout. A test written from the inside knows which box to fill in, so
it cannot notice that a person would not.

**Tests still earned their place, in the other direction.** Two real bugs
surfaced only because a test failed for a reason I did not expect and I looked
instead of retrying: messages lost between loading history and the socket going
live, and a realtime event that never fires for a row added to an existing
parent.

**Ruling GIPHY out properly took longer than building the alternative.** Their
signup kept failing on mobile; oEmbed returns 406 for everyone; the site
refuses non-browser requests whatever user agent you send. So there is no
key-free way to turn a GIF link into search terms, even server-side.

**Drawing takes iterations and the loop is short.** The capybaras took three
attempts to stop looking like teddy bears — the fix was a loaf-shaped head,
tiny flat ears and a broad snout. The unicorn horn took four to read as gold
rather than a dark smudge; the problem was that a thick outline on a narrow
cone swallows the fill. Each cycle was render, look, adjust, about ninety
seconds.

---

## 2026-11-05 — Built and deployed in one evening

Opened as a question and shipped the same night, for nothing.

**The plan written that morning was wrong, and the way it was wrong is the
lesson.** It specified a 30-day pilot on off-the-shelf software *before*
writing any code, reasoning that the build was the expensive half. The build
took one session and cost A$0: Vite, React, Supabase, GitHub Pages, all free
tiers. **When a build is genuinely free, building it is the cheap test**, and a
staged de-risking plan can cost more than the risk it manages.

**Giving the session eyes changed how it worked.** Playwright plus a screenshot
helper, so the running app could be looked at and its console errors read,
rather than relayed. Two of that day's three defects were found by looking.

**Hard-won specifics.** GitHub Pages will not serve a private repo on a free
plan. An installed iOS web app draws under the status bar, so the header needs
the safe-area inset or the clock lands on top of it. On a desktop, chat bubbles
pinned to opposite edges of a 1440px window read as unrelated messages; the fix
is a narrow centred column.

**And the one that was nobody's bug but mine:** the app folder started inside
the OneDrive-synced vault, which would have had OneDrive syncing `node_modules`
forever. Moved out before the first install finished.
