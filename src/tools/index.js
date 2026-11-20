// The composer bar is built from this list. Order is the order on screen.
//
// Adding a tool means adding a file and a line here. Nothing in Chat.jsx
// changes, which is the point: the bar is the product, so it needs a contract
// rather than a growing switch statement.
import { emojiTool } from './emoji.jsx';
import { gifTool } from './gif.jsx';
import { gamesTool } from './games.jsx';
import { versusTool } from './versus.jsx';

export const TOOLS = [emojiTool, gifTool, gamesTool, versusTool];

/** Renderers contributed by tools, keyed by messages.kind. */
export const RENDERERS = Object.fromEntries(
  TOOLS.filter(t => t.render).map(t => [t.render.kind, t.render.Component])
);

/**
 * Kinds whose renderer writes back to its own message row: a live board, not
 * a record of something that happened.
 *
 * The chat has to know this much, because a copy of a live board would be a
 * second board claiming to be the first. A tool declares it with
 * `render: { live: true }` rather than the chat keeping a list of names, so a
 * tool nobody here has seen still gets the right answer.
 */
export const LIVE_KINDS = new Set(
  TOOLS.filter(t => t.render?.live).map(t => t.render.kind)
);

/**
 * Whether a message can be bumped (or quoted, or copied: anything that makes
 * a second thing out of it).
 *
 * A live board cannot, because the copy would be a second board claiming to
 * be the first one.
 */
export const canBump = m => Boolean(m) && !LIVE_KINDS.has(m.kind);
