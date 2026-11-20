import { useLongPress } from '../lib/press.js';
import { canBump } from '../tools/index.js';
import { Body } from './Body.jsx';

/**
 * One message in the conversation, and the gesture that acts on it.
 *
 * A component per row rather than one handler on the list, because the press
 * logic belongs to the thing being pressed; the alternative is reading the
 * message back out of the DOM at the moment it fires.
 */
export function MessageRow({ m, mine, runOn, byId, name, onUpdate, onSend, onHold }) {
  // One action in the menu today, so "can this be held" and "can this be
  // bumped" are the same question. The moment a second action exists they
  // stop being, and this is where that shows up.
  const holdable = canBump(m);
  const press = useLongPress(() => onHold(m), holdable);

  return (
    <div className={'row ' + (mine ? 'mine' : 'theirs')}>
      <div className={'bubble' + (holdable ? ' holdable' : '')} {...press}>
        {!mine && !runOn && <div className="who">{m.author}</div>}
        <Body message={m} body={m.body} byId={byId}
              name={name} onUpdate={onUpdate} onSend={onSend} />
      </div>
    </div>
  );
}
