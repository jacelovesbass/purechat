# Start here

A handover for whoever opens this next, including a future session that has
forgotten everything. Read this, then `docs/PROPOSAL.md` for the reasoning.

## Where it is up to

Pure Chat is live at https://jacelovesbass.github.io/purechat/ and in daily use
by a group of four. Emoji packs, GIF library, single-player games, a Versus
board and message bumping all work. **155 checks across 20 suites pass**, and
they can be pointed at the deployed site with `TEST_URL`.

**Holding a message opens a menu** (`src/lib/press.js`, `MessageRow.jsx`,
`MessageMenu.jsx`). One action today, Bump, which puts a credited copy at the
end of the conversation. The reasoning is decision 12; the thing to know
before touching it is that the hold gesture cost text selection inside
bubbles, so **Copy is the first action to add** when anyone asks why they
cannot copy a message.

## If you are here to build games

**The contract already exists and has been used in anger.** Read
`src/tools/README.md` and `GAME_FORMAT.md` first; between them they are the
whole surface.

A game is one HTML file, in an iframe with `sandbox="allow-scripts"` and
**never** `allow-same-origin`. It talks to the chat with three messages:
`ready`, `score`, `close`. `src/tools/games.jsx` is the tool; `src/lib/games.js`
reads and writes packs.

**Proven, not assumed:** Kelp Diver, a 1200-line canvas game written elsewhere,
runs unmodified with no console errors, and a second member of the group sees
it in their list without installing anything.

### The next real decision: multiplayer

Single-player works. Two people on the same board does not, and it is the
fork in the road.

- **Cheap and probably enough:** keep games single-player, and let the *chat*
  be the multiplayer. Scores post, people compare, somebody tries to beat them.
  That already works today and costs nothing.
- **Expensive and a different project:** shared state. A `game_sessions` row, a
  realtime channel under `setState`/`onState`, an answer for two players
  disagreeing, and an answer for someone closing the tab mid-game. Days, not
  hours, and it adds a hostile-input surface to a sandbox that is currently
  three messages wide.

**Recommendation: do not build shared state until somebody has played the same
single-player game twice.** The evidence for whether anyone wants this does not
exist yet, and the group has had games for less than a day.

### If you do add to the host API

Every message added is something a hostile game can try to use. The sandbox is
the only thing between an AI-written file and the conversation. Add to it
deliberately, and add a test that proves the frame is still opaque, the way
`test/test-games.mjs` does.

## What to do before anything else

1. **Decide the data exposure, or write down that you are not deciding it.**
   Every group, join code and message is readable by anyone holding the key
   that is published in the browser bundle. Proven with one command on
   2026-11-06. Two fixes costed: stop enumeration (about an hour), or anonymous
   sign-in plus membership rules (about half a day, and the foundation for
   accounts). **Nothing has been done and games add more of other people's data
   to the same open database.**
2. **Rotate the Postgres password.** It was pasted into a chat on 2026-11-05.

## Still outstanding from the proposal

Measured, not guessed. None of it urgent.

| Item | Why | Size |
|---|---|---|
| Split `src/lib/packs.js` (224 lines) | Four concerns: zip, image processing, URL parsing, shortcode encoding | 1 hr |
| Split `src/styles.css` (396 lines) | One file, no sectioning | 30 min |
| Message paging | Hard `limit(200)`, so a group that sticks loses its history from view | few hrs |
| Emoji images out of database rows | ~10.5 KB each as `data:` URLs, no CDN, no browser cache | half day |
| Code splitting | 560 KB bundle, 161 KB gzipped, one chunk. JSZip loads for everyone | 2 hrs |

## Things that will bite you if nobody says them

- **`npm test` needs the dev server running**, or `TEST_URL` pointed at a
  deployed copy. It cleans up the rooms it creates; keep it that way.
- **A green local run says nothing about the deploy.** Two deploys failed
  silently on 2026-11-06 while the live site sat on an old build. Check the URL,
  not the terminal.
- **Every defect of consequence in this project was found by a person opening
  the app**, never by a suite. Use the tests to stop regressions and a human to
  find out whether the thing makes sense.
- **Never name a test fixture something real might be called.** A test group
  called "Pure" was one typo from deleting the real group of that name.
