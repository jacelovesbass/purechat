/**
 * A bump: an old message put back at the end of the conversation.
 *
 * Something said three days ago is gone, because the only place anyone looks
 * is the bottom. Bumping copies it there.
 *
 * **It is a copy, not a move.** The original stays where it was, so the
 * history stays true, and the copy is openly a copy: it carries both names,
 * the person who said it and the person who brought it back. Reposting
 * somebody's words under your own name, or under theirs as though they had
 * just said them, would both be lies the app told for them.
 *
 * No migration. A bump is `kind: 'bump'` with the original in `payload`,
 * which is the contract migration 009 already added for exactly this. Its
 * `body` is the original's text as well, so anything reading plain rows (a
 * notification, a search, a test) still finds the words.
 */
export const BUMP = 'bump';

/**
 * The original behind a message: itself, or what it is a bump of.
 *
 * Bumping a bump re-bumps the original rather than nesting, because a copy of
 * a copy of a copy says nothing a reader wants and grows the row every time.
 */
export function sourceOf(m) {
  const inner = m.kind === BUMP ? m.payload?.source : null;
  const from = inner || m;
  return {
    id: from.id ?? null,
    author: from.author || '',
    body: from.body || '',
    // A nested bump should be impossible, but reading one as text is a better
    // failure than recursing on it.
    kind: from.kind === BUMP ? 'text' : (from.kind || 'text'),
    payload: from.payload ?? null,
    at: from.at || from.created_at || null,
  };
}

/** The row to insert to bump `m`, as `by`. */
export function bumpOf(m, by) {
  const source = sourceOf(m);
  return { kind: BUMP, body: source.body, payload: { by, source } };
}

/**
 * "Jason bumped Felix's message", read from where the viewer is sitting.
 *
 * Both names can be the viewer's own and they can be each other's, so all
 * four combinations are spelled out rather than patched together at the call
 * site, which is how "Felix bumped your's message" got written once.
 *
 * Names are not unique here (migration 013), so `me` is a name match, the
 * same assumption the bubbles themselves make.
 */
export function bumpLine(by, author, me) {
  const who = by === me ? 'You' : by;
  if (by === author) return `${who} bumped ${by === me ? 'your' : 'their'} own message`;
  return `${who} bumped ${author === me ? 'your' : `${author}'s`} message`;
}

/**
 * How long ago, roughly. A bump exists to resurface something old, so the
 * card has to say how old or it reads as a message sent twice.
 */
export function ago(when, now = Date.now()) {
  const t = when ? new Date(when).getTime() : NaN;
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, (now - t) / 60000);
  if (mins < 2) return 'from just now';
  if (mins < 60) return `from ${Math.round(mins)} min ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `from ${Math.round(hrs)} hr ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `from ${days} day${days === 1 ? '' : 's'} ago`;
  return 'from ' + new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
