import { splitBody } from '../lib/packs.js';
import { RENDERERS } from '../tools/index.js';
import { BUMP, sourceOf, bumpLine, ago } from '../lib/bump.js';

/** A message body: text with [[e:id]] tokens swapped for pictures. */
export function Body({ message, body, byId, name, onUpdate, onSend }) {
  // A bump is drawn here rather than by a tool, because it is a thing the
  // chat itself does to a message of ANY kind, including kinds that do not
  // exist yet. It renders the original through this same component, one level
  // down and with no way to write back: the copy must not be able to edit the
  // row it was copied from.
  if (message?.kind === BUMP) {
    const src = sourceOf(message);
    const by = message.payload?.by || 'Someone';
    return (
      <div className="bumped">
        <div className="bump-head">
          <span className="bump-mark">↑</span>
          {bumpLine(by, src.author, name)}
        </div>
        <div className="bump-body">
          <Body message={src} body={src.body} byId={byId} name={name} />
        </div>
        <div className="bump-when">{ago(src.at)}</div>
      </div>
    );
  }

  // A tool that invented its own kind draws its own messages.
  const Custom = message && RENDERERS[message.kind];
  // A renderer that is interactive needs to know who is looking and how to
  // write back. A score card ignores both.
  if (Custom) return <Custom message={message} name={name} onUpdate={onUpdate} onSend={onSend} />;

  return splitBody(body).map((part, i) => {
    if (part.text !== undefined) return <span key={i}>{part.text}</span>;
    if (part.media) return <img key={i} className="media" src={part.media} alt="" loading="lazy" />;
    const e = byId.get(part.emojiId);
    return e
      ? <img key={i} className="emoji" src={e.url} alt={':' + e.name + ':'} title={':' + e.name + ':'} />
      : <span key={i} className="muted">[emoji]</span>;
  });
}
