# Tools

A tool is a button on the composer bar and the sheet it opens. Emoji, GIF,
Games and Versus are tools. Anything somebody brings later is a tool.

**Games and Versus are deliberately separate buttons.** Games means "anyone's
HTML file, sealed in a sandbox, play it yourself". Versus means "built in, two
of you, on a board that lives in the conversation". One button for both would
have forced each idea to compromise for the other.

**The built-ins go through this same contract on purpose.** If they used a
private path, the public one would rot before anyone outside ever touched it.

## The contract

```js
export const myTool = {
  id:    'games',          // stable, unique, used for per-user bar config
  label: 'Games',          // accessible name and tooltip
  icon:  '🎲',             // short text or an element; keep it one glyph wide
  Sheet,                   // component rendered when the button is tapped
  render: undefined,       // optional: how to draw messages of a given kind
};
```

### `Sheet`

Rendered inside the chat when the button is tapped. It receives:

| Prop | What it is |
|---|---|
| `room`, `name` | The group, and who you are |
| `packs`, `emoji` | The group's packs and emoji, already loaded |
| `msgs` | The conversation, for a tool that works from what is already there |
| `people`, `online` | The roster and who is connected, already loaded and kept live. **Use these rather than querying `members`**, or you race the other person's arrival |
| `onSendText(text)` | Put text in the message box |
| `onSendEmoji(emoji)` | Put a specific emoji in the box, by identity not name |
| `onSend({kind, payload, body})` | Send a structured message |
| `onClose()` | Close the sheet |

A sheet should put something in the box rather than sending it outright, unless
sending is unambiguously the point. People expect to be able to change their
mind before it leaves.

### `render`

Optional. `{ kind, Component }`, where `Component` draws messages whose
`messages.kind` matches. Text messages are handled by the app; a tool only
needs this if it invents a new kind.

`Component` receives:

| Prop | What it is |
|---|---|
| `message` | The row |
| `name` | Who is looking, so an interactive message knows whose turn it is |
| `onUpdate(message)` | Replace it locally, so your own move shows before the round trip |
| `onSend({kind, payload, body})` | Send a new message, for something like Rematch |

**A message can be edited, not just drawn.** Versus is one message whose payload
carries the move list, updated on every turn; the chat subscribes to UPDATE as
well as INSERT so the other phone sees it. If you write a renderer that edits
its own row, that is the path.

**If it does, say so: `render: { kind, Component, live: true }`.** `live` means
the message IS the thing, rewritten as it goes, rather than a record of
something that happened. The chat needs this to know what it may copy: holding
a message offers Bump, and a copy of a live board would be a second board
claiming to be the first. Anything that makes a second thing out of a message,
now or later, asks the same question. A score card is not live; a board is.

## Adding one

1. Write `src/tools/<id>.jsx` exporting the object above.
2. Add it to the array in `src/tools/index.js`.

That is the whole procedure. Nothing in `Chat.jsx` changes.

## Later: tools nobody here wrote

The shape is deliberately the same. A third-party tool's `Sheet` would be an
iframe pointing at their page, with the same props delivered over
`postMessage` and the result coming back the same way. **Never evaluate
somebody else's code in the page**; the iframe sandbox is the whole safety
story, and it is why the contract is small.
