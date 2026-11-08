import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { readGame, exportGame } from '../lib/games.js';
import { installGame } from '../lib/install.js';

/**
 * Games: single-file HTML the group brings with it, run in a sandbox.
 *
 * Written entirely through the tool contract. Nothing in Chat.jsx knows games
 * exist, which was the point of the contract.
 */

/**
 * The sandbox.
 *
 * `allow-scripts` without `allow-same-origin` puts the game in an opaque
 * origin: no cookies, no storage, no DOM access to this page, no Supabase
 * client, no route to the database or a single message. These games are
 * written by language models and passed between friends, so the correct
 * assumption is that the HTML is hostile and this attribute is the only thing
 * protecting the conversation. Do not add to it.
 */
function Player({ game, name, onScore, onClose }) {
  const frame = useRef(null);

  useEffect(() => {
    const onMessage = e => {
      // Only listen to our own frame, and only to the shapes we document.
      if (e.source !== frame.current?.contentWindow) return;
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'ready') {
        frame.current.contentWindow.postMessage({ type: 'host', name }, '*');
      } else if (msg.type === 'score' && Number.isFinite(Number(msg.score))) {
        onScore(Number(msg.score), typeof msg.detail === 'string' ? msg.detail.slice(0, 80) : null);
      } else if (msg.type === 'close') {
        onClose();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [name, onScore, onClose]);

  return (
    <div className="player" onClick={onClose}>
      <div className="player-card" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{game.name}</strong>
          <button className="link" onClick={onClose}>Close</button>
        </div>
        <iframe
          ref={frame}
          className="game-frame"
          title={game.name}
          sandbox="allow-scripts"
          {...(game.html ? { srcDoc: game.html } : { src: game.url })}
        />
      </div>
    </div>
  );
}

function GamesSheet({ room, name, onSend, onClose }) {
  const [games, setGames] = useState([]);
  const [playing, setPlaying] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(() => supabase.from('games').select('*')
    .eq('room_id', room.id).order('created_at')
    .then(({ data }) => setGames(data || [])), [room.id]);

  useEffect(() => { load(); }, [load]);

  async function add(file) {
    setBusy('Reading...');
    setErr('');
    try {
      const g = await readGame(file);
      await installGame({ roomId: room.id, addedBy: name, game: g });
      await load();
    } catch (ex) {
      setErr(ex.message || String(ex));
    } finally {
      setBusy('');
    }
  }

  async function remove(id) {
    await supabase.from('games').delete().eq('id', id);
    await load();
  }

  async function download(game) {
    const blob = await exportGame(game);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = game.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  if (playing) {
    return (
      <Player
        game={playing}
        name={name}
        onScore={(score, detail) => {
          setPlaying(null);
          onSend({
            kind: 'score',
            body: `scored ${score} on ${playing.name}`,
            payload: { game: playing.name, score, detail, by: name },
          });
        }}
        onClose={() => setPlaying(null)}
      />
    );
  }

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-card" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>Games</strong>
          <button className="link" onClick={onClose}>Done</button>
        </div>

        {games.length === 0 && !busy && (
          <p className="muted">No games yet. Add an <code>.html</code> file or a game pack.</p>
        )}

        {games.map(g => (
          <div key={g.id} className="game-row">
            <button className="game-play" onClick={() => setPlaying(g)}>
              <span className="game-name">{g.name}</span>
              <span className="muted">{g.author ? `by ${g.author}` : `added by ${g.added_by}`}</span>
            </button>
            <span className="game-actions">
              <button className="link" onClick={() => download(g)}>Save</button>
              <button className="link" onClick={() => remove(g.id)}>Remove</button>
            </span>
          </div>
        ))}

        {busy && <p className="muted">{busy}</p>}
        {err && <p className="err">{err}</p>}

        <div className="pack-actions">
          <button onClick={() => fileRef.current.click()}>Add a game</button>
        </div>
        <p className="muted hint">
          A game is one HTML file. Ask an AI for a single-file HTML game, save it,
          and drop it in. It runs in a sandbox with no access to the chat.
        </p>
        <input ref={fileRef} type="file" accept=".html,.htm,.zip" hidden
               onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) add(f); }} />
      </div>
    </div>
  );
}

/** How a score message is drawn. */
function ScoreMessage({ message }) {
  const { game, score, detail } = message.payload ?? {};
  return (
    <span className="score-card">
      <span className="score-value">{score}</span>
      <span className="score-game">{game}{detail ? ` · ${detail}` : ''}</span>
    </span>
  );
}

export const gamesTool = {
  id: 'games',
  label: 'Games',
  icon: '🎮',
  Sheet: GamesSheet,
  render: { kind: 'score', Component: ScoreMessage },
};
