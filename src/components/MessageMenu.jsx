import { sourceOf } from '../lib/bump.js';
import { Body } from './Body.jsx';

/**
 * What you can do with a message you held down.
 *
 * A bottom sheet, like People and every tool, so the gesture lands somewhere
 * the app has already taught people to read. One action today; it is a menu
 * rather than a single button because per-message actions are a category, and
 * the next one should cost a line.
 */
export function MessageMenu({ message, byId, name, onBump, onClose }) {
  const src = sourceOf(message);
  const whose = src.author === name ? 'you' : src.author;

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-card" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{src.author === name ? 'Your message' : src.author}</strong>
          <button className="link" onClick={onClose}>Cancel</button>
        </div>

        {/* The message itself, so there is no doubt which one was held. */}
        <div className="menu-preview">
          <Body message={{ ...src, payload: src.payload }} body={src.body}
                byId={byId} name={name} />
        </div>

        <button className="wide" onClick={onBump}>↑  Bump to the bottom</button>
        <p className="muted hint">
          Puts a copy at the end of the conversation for everyone, credited to {whose}.
          The original stays where it is.
        </p>
      </div>
    </div>
  );
}
