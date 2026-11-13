# Game pack format, v1

**A game is one HTML file.** That is the whole idea: it is what an AI can
produce in a single go, what a person can read, and what can be passed between
people without anybody hosting anything.

A game pack is an ordinary zip, the same shape as an emoji pack.

```
dave-the-dover.zip
├── game.json
└── index.html
```

## game.json

```json
{
  "format": "puregame/1",
  "name": "Dave the Dover",
  "author": "Jason",
  "description": "One line shown under the title.",
  "file": "index.html"
}
```

An entry may carry `url` instead of `file`, pointing at a game hosted
anywhere. The app treats both the same, exactly as the emoji format does.

**A bare `.html` file also works.** Dropping one in makes a game named after
the filename. The zip exists for the case where you want a name, an author and
a description to travel with it.

## How a game runs, and the part that matters

A game runs in an iframe with:

```html
<iframe sandbox="allow-scripts" srcdoc="...">
```

**`allow-same-origin` is never set, and must never be set.** Without it the
game is in an opaque origin: no access to the page, no cookies, no
localStorage, no Supabase client, no way to reach the database or read a single
message. It gets a blank rectangle and one message channel.

This is not belt and braces. These games are written by language models and
passed between friends; assume the HTML is hostile and the sandbox is the only
thing standing between it and the conversation.

## The host API

The game talks to the chat with `postMessage`, and nothing else.

| Message from the game | What it does |
|---|---|
| `{ type: 'ready' }` | Tells the host it has loaded. Optional |
| `{ type: 'score', score, detail? }` | Posts a result into the chat |
| `{ type: 'close' }` | Asks the host to close the game |

| Message to the game | When |
|---|---|
| `{ type: 'host', name }` | Once, on load, so the game can greet the player |

That is the complete surface in v1. It is small deliberately: everything added
here is something a hostile game can try to use.

## Writing one

Any single-file HTML game works with no changes at all, and simply will not
post a score. To post one:

```js
parent.postMessage({ type: 'score', score: 42 }, '*');
```

## Installing takes a copy

**A game is snapshotted into the group when it is added.** Editing the source
afterwards does not reach a copy that is already installed, which is correct
(a group's game should not change under it without warning) and surprising the
first time it bites.

To push an update: remove and re-add, or update the row. There is deliberately
no auto-update, because that would mean a game somebody is playing could be
swapped for different code mid-session.

## Limits

- **512 KB** of HTML. Beyond that, host it and use `url`.
- **No network.** The sandbox allows scripts and nothing else, so a game cannot
  fetch anything. Everything it needs must be in the file.
- **No saving.** No localStorage in an opaque origin. Scores go to the chat,
  which is a better place for them anyway.

## Deliberately not in v1

- **Multiplayer and shared state.** The next thing, and a much bigger one: it
  needs a session row, realtime, and a story for two people disagreeing.
- **Signing.** A game is as trustworthy as the person who handed it to you,
  which is why the sandbox does the work instead.
