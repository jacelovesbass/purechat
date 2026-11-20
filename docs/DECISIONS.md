# Decisions

Choices that would otherwise get silently reversed, each with the reason that
made it, so a later change can argue with the reason rather than the result.

Newest last. One entry per decision, short.

---

## 1. A web app, not an App Store app
**2026-11-05.** The Apple Developer Program is US$99/year with no free tier and
no TestFlight without it. A web app costs nothing, is shared by sending a link,
and installs to the home screen. Android would have been US$25 once.

## 2. Supabase over Firebase, Convex, Appwrite, Cloudflare D1, PocketBase
**2026-11-05.** The MD chose it directly. Postgres, realtime and auth in one
free tier, and direct SQL access for migrations. Known drawback: the free tier
pauses a project after about a week of inactivity.

## 3. The repo is public
**2026-11-05.** GitHub Pages will not serve a private repo on a free plan. The
publishable key ships in the browser bundle either way, so a public repo adds
no exposure that did not already exist. It does make the project easier to find.

## 4. Link to media, do not store it
**2026-11-05, MD direction.** Images and GIFs stay wherever they already live
and the app holds a URL. No storage bill, no custody of anyone's photos, and
the feature becomes link unfurling rather than uploads.

**Exception, 2026-11-06.** Copying a *link* to a GIF on an iPhone is awkward:
long-pressing offers Copy Image or Save to Photos, rarely a link. "Choose from
Photos" stores the picture, capped at 1 MB, as a library entry that messages
reference. The rule stands; this is a named exception where holding it would
have meant an unusable feature.

## 5. A pack is an ordinary zip, and an entry may be a file or a URL
**2026-11-06.** Every other chat app has pack *concepts* locked inside the app.
Making it a zip you can email means the library is genuinely yours. The
file-or-URL choice is what lets the same format cover bundled images,
bring-your-own-storage, and v1's `data:` URLs with no special cases.

## 6. No GIPHY API
**2026-11-06.** Their developer signup kept failing; oEmbed returns 406 for
everyone; the site refuses non-browser requests regardless of user agent. The
link-only route needs no key, no rate limit, no attribution requirement and no
dependency that can be withdrawn. The cost is that tags can only be read from
*page* links, whose slug carries the words.

## 7. The GIF picker fills itself from the conversation
**2026-11-06.** It originally showed only GIFs someone had explicitly kept,
which meant it was empty for a person who had been sending GIFs all day.
Requiring a deliberate save to build a library of what you already use is the
wrong way round.

## 8. Migrations are files, applied once, recorded
**2026-11-07.** Schema changes were previously applied by hand-editing a
script, with no record of what had run. Now `migrations/` is ordered and
`schema_migrations` records what has been applied, so a fresh machine is one
command and re-running is safe. The existing database was baselined rather
than rebuilt.

## 9. Test cleanup is centralised and deliberately narrow
**2026-11-07.** Suites abandoned every room they created, which put 125 junk
rooms in a live database. `scripts/test-all.mjs` now removes them, but only if
the name is one the suites use, the room is under two hours old, and it is not
on the keep list. Deleting a real conversation is far worse than leaving a test
room behind.

## 10. A game is one HTML file, run in an opaque sandbox
**2026-11-07.** Single-file HTML is what an AI can produce in one go and what a
person can pass around. It runs in an iframe with `sandbox="allow-scripts"` and
**never** `allow-same-origin`, which puts it in an opaque origin: no cookies,
no storage, no DOM access to the page, no Supabase client, no route to the
database or a single message.

These games are written by language models and handed between friends, so the
correct assumption is that the HTML is hostile and the sandbox is the only
thing protecting the conversation. The host API is three messages wide for the
same reason: everything added to it is something a hostile game can try to use.

## 11. Storing a game is not the same as storing media
**2026-11-07.** Decision 4 says link, do not store. A game is text, compresses,
is installed deliberately by the group rather than being somebody's personal
photo, and loads once per group rather than per message. So a game may carry
its HTML. The manifest still supports `url`, so a hosted game costs nothing and
the app cannot tell the difference.

---

## 12. A bump is a credited copy, and the chat does not decide which kinds allow it
**2026-11-20.** Holding a message and bumping it puts a **copy** at the end of
the conversation, never a move: the original stays where it was, so the
history cannot be rewritten by resurfacing something. The copy carries **both
names**, the person who said it and the person who brought it back, because
the two simpler options both have the app assert something untrue about who
said what. Bumping a bump re-bumps the original rather than nesting.

It needed no migration: `kind` plus `payload` from migration 009 is the
contract for exactly this, and `body` still carries the plain text so anything
reading rows finds the words.

**What cannot be bumped is declared by the tool, not listed in the chat.** A
renderer that writes back to its own row is a live board, not a record; a copy
of one would be a second board claiming to be the first. Such a tool sets
`render: { live: true }`. The alternative, a list of kind names inside
`Chat.jsx`, gives the wrong answer for the first tool nobody here wrote, which
is the case the whole tool contract exists to serve.

**Known cost, accepted on that occasion.** A custom hold means the browser's
own text selection has to go, so text cannot be selected out of a bubble. The
MD was told and chose Bump alone; Copy belongs in the menu the first time
anyone asks for it.

---

## Open, and deliberately not decided

### The database is readable by anyone
Proven on 2026-11-06 with one command using only the key published in the
bundle: every group, every join code, every message, no login. Two fixes were
costed:

- **Stop enumeration**, about an hour. Turns "read everything" into "read a
  group whose code you already hold".
- **Anonymous sign-in plus membership rules**, about half a day. The real
  answer, and the foundation for ever having accounts.

**The MD deferred and nothing has been done.** Recorded here so it cannot be
quietly forgotten.

### No end-to-end encryption
Raised inside the group by a member, deferred by the MD. The realistic option
for an app with no accounts is a shared group passphrase: the browser encrypts
message bodies before they are sent, and the database holds gibberish. The
cost is that anyone with the passphrase gets everything, there is no way to
remove a person without changing it, and losing it loses the history.
