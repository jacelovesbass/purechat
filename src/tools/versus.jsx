import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import * as B from '../lib/boom.js';

/**
 * Versus: a game played live in the conversation, between two people here.
 *
 * Deliberately NOT the Games tool. Games means "anyone's HTML file, sealed in
 * a sandbox, play it yourself". Versus means "built in, two of you, on the
 * board sitting in the chat". Keeping them apart is what stops either idea
 * having to compromise for the other.
 *
 * There is no game session table and no second realtime channel. A chat is
 * already an ordered, live, durable list of events, which is exactly what a
 * turn based game needs. The match is ONE message whose payload carries the
 * move list; every phone replays it and arrives at the same board. Close the
 * app mid game and it is still there when you come back.
 */

const GAMES = [{ id: 'boom', name: 'Tic Tak Toe BOOM!', blurb: 'Four in a row. Three bombs each.' }];

/* ---------------- The board, drawn in a message ---------------- */

function Board({ message, name, onUpdate, onSend }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const p = message.payload || {};
  const players = p.players || [];
  const moves = p.moves || [];
  const state = B.replay(moves);

  const seat = players.indexOf(name);          // -1 means watching
  const mine = !state.done && seat === state.turn;
  const them = players[1 - seat];

  async function play(move) {
    if (!mine || busy) return;
    if (!B.legal(state, move)) { setErr('Not a legal move.'); return; }
    setBusy(true);
    setErr('');
    setArmed(false);
    // The move list we send is the one we drew from, so if the other player
    // somehow got in first the write is based on a stale list. Only the player
    // whose turn it is can reach this, which is what keeps that honest.
    const next = { ...p, moves: [...moves, move] };
    const { error } = await supabase.from('messages')
      .update({ payload: next, body: describe(next) })
      .eq('id', message.id);
    if (error) setErr(error.message);
    else onUpdate?.({ ...message, payload: next });
    setBusy(false);
  }

  const colour = i => (i === 0 ? 'vp1' : 'vp2');

  return (
    <div className="versus">
      <div className="versus-head">
        <span className={'vdot ' + colour(0)} />{players[0]}
        <span className="muted"> v </span>
        <span className={'vdot ' + colour(1)} />{players[1]}
      </div>

      <div className={'vboard' + (armed ? ' aiming' : '')}>
        {Array.from({ length: B.ROWS }, (_, i) => B.ROWS - 1 - i).map(r => (
          <div className="vrow" key={r}>
            {Array.from({ length: B.COLS }, (_, c) => {
              const v = state.board[r][c];
              const can = mine && (armed ? v !== B.EMPTY : B.lowestFree(state.board, c) >= 0);
              const won = state.line.some(([lc, lr]) => lc === c && lr === r);
              return (
                <button
                  key={c}
                  className={'vcell' + (v === B.EMPTY ? '' : ' ' + colour(v))
                    + (can ? ' can' : '') + (won ? ' vwin' : '')}
                  disabled={!can || busy}
                  aria-label={`column ${c + 1}`}
                  onClick={() => play(armed ? { b: [c, r] } : { d: c })}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="versus-foot">
        {state.done ? (
          <>
            <strong>{outcome(state, players)}</strong>
            {seat >= 0 && (
              <button className="vboom" onClick={() => onSend?.({
                kind: 'versus',
                // Loser starts, which is the only rematch rule anyone expects.
                payload: { game: 'boom', players: swap(players, state.winner), moves: [] },
                body: `${swap(players, state.winner)[0]} v ${swap(players, state.winner)[1]}, 0 moves in`,
              })}>Rematch</button>
            )}
          </>
        ) : seat < 0 ? (
          <span className="muted">{players[state.turn]} to play</span>
        ) : mine ? (
          <>
            <span>Your turn</span>
            <button
              className={'vboom' + (armed ? ' on' : '')}
              disabled={!state.bombs[seat] || busy}
              onClick={() => setArmed(a => !a)}
            >
              {armed ? 'Pick a token' : `BOOM ${state.bombs[seat]}`}
            </button>
          </>
        ) : (
          <span className="muted">Waiting on {them}</span>
        )}
      </div>

      {err && <p className="err">{err}</p>}
    </div>
  );
}

/** Loser goes first next time. A dead heat or a full board just swaps. */
function swap(players, winner) {
  return winner === 0 ? [players[1], players[0]] : [players[0], players[1]];
}

function outcome(state, players) {
  if (state.winner === -2) return 'Board full, no four.';
  if (state.winner === -1) return `Dead heat, ${state.run} each.`;
  const how = state.reason === 'collapse' ? ' off the collapse' : '';
  return `${players[state.winner]} wins, ${state.run} in a row${how}.`;
}

/** What the message says to anything that cannot draw a board. */
function describe(p) {
  const s = B.replay(p.moves || []);
  const [a, b] = p.players || [];
  if (!s.done) return `${a} v ${b}, ${s.moves ? '' : ''}${(p.moves || []).length} moves in`;
  if (s.winner === -2) return `${a} v ${b}: board full, no four`;
  if (s.winner === -1) return `${a} v ${b}: dead heat`;
  return `${(p.players || [])[s.winner]} beat ${(p.players || [])[1 - s.winner]}, ${s.run} in a row`;
}

/* ---------------- Starting one ---------------- */

function VersusSheet({ name, people, online, onSend, onClose }) {
  const [busy, setBusy] = useState(false);

  // The roster comes from the chat, which already holds it and keeps it live
  // over the socket. An earlier version queried members itself when the sheet
  // opened, and raced the other person's arrival: open it a second too early
  // and they were simply not in the list.
  const others = (people || []).map(p => p.name).filter(n => n !== name);

  async function start(opponent) {
    setBusy(true);
    // Whoever starts it plays first, which is the only rule anybody expects.
    await onSend({
      kind: 'versus',
      payload: { game: 'boom', players: [name, opponent], moves: [] },
      body: `${name} v ${opponent}, 0 moves in`,
    });
    setBusy(false);
    onClose();
  }

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-card" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>Versus</strong>
          <button className="link" onClick={onClose}>Done</button>
        </div>

        <p className="muted">{GAMES[0].name}. {GAMES[0].blurb} The board goes in the chat and you both tap at it.</p>

        {others.length === 0 && (
          <p className="muted">Nobody else has joined this group yet.</p>
        )}
        {others.map(n => (
          <div key={n} className="game-row">
            <button className="game-play" disabled={busy} onClick={() => start(n)}>
              <span className="game-name">Challenge {n}</span>
              <span className="muted">{(online || []).includes(n) ? 'online' : 'offline'}</span>
            </button>
          </div>
        ))}

        <p className="muted hint">
          Turn by turn, in the conversation. Close the app and come back; the board
          is a message, so it keeps.
        </p>
      </div>
    </div>
  );
}

export const versusTool = {
  id: 'versus',
  label: 'Versus',
  icon: '⚔️',
  Sheet: VersusSheet,
  // Live: the board IS the message, rewritten on every turn. It cannot be
  // copied, bumped or quoted, because a copy would be a second board.
  render: { kind: 'versus', Component: Board, live: true },
};
