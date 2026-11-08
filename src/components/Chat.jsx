import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { buildKit, readKit, describeKit } from '../lib/kit.js';
import { readZip } from '../lib/packs.js';
import { readGame } from '../lib/games.js';
import { installPack, installGame } from '../lib/install.js';
import { encodeShortcodes } from '../lib/packs.js';
import { Halo } from './Halo.jsx';
import { Body } from './Body.jsx';
import { TOOLS } from '../tools/index.js';

export function Chat({ name, room, onBack, onForget }) {
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [people, setPeople] = useState([]);
  const [online, setOnline] = useState([]);
  const [showPeople, setShowPeople] = useState(false);
  const [kitBusy, setKitBusy] = useState('');
  const [kitErr, setKitErr] = useState('');
  const kitRef = useRef(null);
  const [packs, setPacks] = useState([]);
  const [emoji, setEmoji] = useState([]);
  // Which tool's sheet is open, by id. Chat does not know what any of them do.
  const [openTool, setOpenTool] = useState(null);
  const [sendErr, setSendErr] = useState('');
  const end = useRef(null);

  // Anyone in the room resolves an emoji id, so a person without the pack
  // still sees the picture rather than a word in colons.
  const byId = useMemo(() => new Map(emoji.map(e => [e.id, e])), [emoji]);
  const byName = useMemo(() => {
    const m = new Map();
    for (const e of emoji) if (!m.has(e.name)) m.set(e.name, e);
    return m;
  }, [emoji]);

  // Clicking a specific picture must send that picture, whatever else shares
  // its name. The picker records the exact id it offered.
  const picked = useRef(new Map());

  // Share sheet on phones, clipboard everywhere else.
  async function invite() {
    const url = `${location.origin}${location.pathname}#${room.join_code}`;
    const text = `Join ${room.name} on Pure Chat`;
    try {
      if (navigator.share) return await navigator.share({ title: text, url });
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* user dismissed the share sheet */ }
  }

  useEffect(() => {
    let live = true;

    const loadPeople = () => supabase.from('members').select('*')
      .eq('room_id', room.id).order('joined_at')
      .then(({ data }) => live && setPeople(data || []));

    const loadPacks = async () => {
      const { data: ps } = await supabase.from('packs').select('*')
        .eq('room_id', room.id).order('created_at');
      if (!live) return;
      setPacks(ps || []);
      const ids = (ps || []).map(p => p.id);
      if (!ids.length) return setEmoji([]);
      const { data: es } = await supabase.from('emoji').select('*').in('pack_id', ids);
      if (live) setEmoji(es || []);
    };
    // Join FIRST, and wait for it.
    //
    // Membership is what every table is now gated on, so nothing in this room
    // is readable until the join lands. Loading packs before it raced: the
    // emoji query came back empty, a message arrived referencing an emoji the
    // client did not have, and the other person saw "[emoji]" instead of the
    // picture. Two runs in four.
    //
    // join_room is idempotent, so for somebody already in the group this is
    // just a heartbeat.
    const joined = supabase.rpc('join_room', { p_code: room.join_code, p_name: name });
    joined.then(() => {
      if (!live) return;
      loadPeople();
      loadPacks();
    });

    // Merge rather than replace, because history and live inserts race.
    const merge = incoming => setMsgs(prev => {
      const seen = new Map(prev.map(m => [m.id, m]));
      for (const m of incoming) seen.set(m.id, m);
      return [...seen.values()].sort((x, y) =>
        x.created_at === y.created_at ? Number(x.id) - Number(y.id)
                                      : x.created_at < y.created_at ? -1 : 1);
    });

    const loadHistory = () => supabase.from('messages').select('*')
      .eq('room_id', room.id).order('created_at').limit(200)
      .then(({ data }) => live && merge(data || []));

    const ch = supabase.channel('room:' + room.id, { config: { presence: { key: name } } })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` },
        ({ new: m }) => merge([m]))
      // Messages used to be write once. A Versus board is one message edited
      // on every turn, so an edit has to travel the same way a new one does.
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` },
        ({ new: m }) => merge([m]))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'members', filter: `room_id=eq.${room.id}` },
        loadPeople)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'packs', filter: `room_id=eq.${room.id}` },
        loadPacks)
      // Also watch emoji rows: adding one to a pack that already exists fires
      // no packs event, so a GIF kept into Saved GIFs reached nobody else.
      // Filtered by room_id, which a trigger keeps in step with the pack. This
      // was unfiltered once, which woke every client in every room on any
      // emoji change anywhere.
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'emoji', filter: `room_id=eq.${room.id}` },
        loadPacks)
      .on('presence', { event: 'sync' },
        () => setOnline(Object.keys(ch.presenceState())))
      .subscribe(status => {
        if (status !== 'SUBSCRIBED') return;
        ch.track({ name, at: Date.now() });
        // Only now is it safe to read history: anything inserted from here on
        // arrives over the socket, so the two cannot miss each other. And only
        // after the join, because history is not readable before membership.
        joined.then(() => live && loadHistory());
      });

    return () => { live = false; supabase.removeChannel(ch); };
  }, [room.id, room.join_code, name]);

  /** Replace one message in place, so a move shows instantly for the player
      who made it rather than after the round trip. */
  const patch = m => setMsgs(prev => prev.map(x => (x.id === m.id ? m : x)));

  /**
   * Save everything this group brought with it: emoji packs, the GIF library
   * and the games, as one file. Messages and members are deliberately not in
   * it. This is a kit, not a backup.
   */
  async function saveKit() {
    setKitErr('');
    setKitBusy('Packing...');
    try {
      const { data: gs } = await supabase.from('games').select('*')
        .eq('room_id', room.id).order('created_at');
      const { blob, manifest } = await buildKit({
        roomName: room.name,
        packs,
        emojiFor: p => emoji.filter(e => e.pack_id === p.id),
        games: gs || [],
      });
      if (!manifest.packs.length && !manifest.games.length) {
        setKitErr('Nothing to save yet: no packs and no games.');
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${room.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-kit.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (ex) {
      setKitErr(ex.message || String(ex));
    } finally {
      setKitBusy('');
    }
  }

  /** Load a kit into this group. Adds, never replaces. */
  async function loadKit(file) {
    setKitErr('');
    setKitBusy('Reading...');
    try {
      const kit = await readKit(file);
      let clashes = 0;
      const taken = emoji.map(e => e.name);

      for (const entry of kit.packs) {
        setKitBusy(`Adding ${entry.name}...`);
        const pack = await readZip(entry.file);
        const r = await installPack({
          roomId: room.id, addedBy: name, pack, takenNames: taken,
        });
        clashes += r.clashes;
        taken.push(...pack.emoji.map(e => e.name));
      }

      for (const entry of kit.games) {
        setKitBusy(`Adding ${entry.name}...`);
        await installGame({ roomId: room.id, addedBy: name, game: await readGame(entry.file) });
      }

      setKitErr(clashes
        ? `Added ${describeKit(kit)}. ${clashes} shortcode${clashes > 1 ? 's were' : ' was'} already in use here and got renamed.`
        : `Added ${describeKit(kit)}.`);
    } catch (ex) {
      setKitErr(ex.message || String(ex));
    } finally {
      setKitBusy('');
    }
  }

  /** Send a message a tool built, rather than something typed. */
  async function sendStructured({ kind = 'text', payload = null, body = '' }) {
    const { error } = await supabase.from('messages')
      .insert({ room_id: room.id, author: name, body, kind, payload });
    if (error) setSendErr(error.message);
  }

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);

  async function send(e) {
    e.preventDefault();
    const resolver = new Map(byName);
    for (const [n, e] of picked.current) resolver.set(n, e);
    const body = encodeShortcodes(draft.trim(), resolver);
    if (!body) return;
    setDraft('');
    const { error } = await supabase.from('messages').insert({ room_id: room.id, author: name, body });
    // Silently losing a message is the worst failure this app can have.
    if (error) { setSendErr(error.message); setDraft(draft); }
    else picked.current.clear();
  }

  return (
    <div className="chat">
      <header>
        <button className="link back" title="All groups" onClick={onBack}>‹</button>
        <div className="title">
          <Halo size={30} className="mark" />
          <strong>{room.name}</strong>
        </div>
        <div className="actions">
          <button className="link refresh" title="Get the latest version"
                  onClick={() => location.replace(`${location.pathname}?v=${Date.now()}`)}>⟳</button>
          <button className="link" onClick={() => setShowPeople(true)}>
            People {people.length > 0 && <span className="pill">{people.length}</span>}
          </button>
          <button className="link" onClick={invite}>{copied ? 'Copied' : 'Invite'}</button>
        </div>
      </header>

      {showPeople && (
        <div className="sheet" onClick={() => setShowPeople(false)}>
          <div className="sheet-card" onClick={e => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{room.name} <span className="code">{room.join_code}</span></strong>
              <button className="link" onClick={() => setShowPeople(false)}>Done</button>
            </div>
            {people.length === 0 && <p className="muted">Nobody yet.</p>}
            {people.map(p => (
              <div key={p.name} className="person">
                <span className={'dot ' + (online.includes(p.name) ? 'on' : '')} />
                <span>{p.name}{p.name === name && <span className="muted"> (you)</span>}</span>
                <span className="muted when">{online.includes(p.name) ? 'online' : 'offline'}</span>
              </div>
            ))}
            <div className="kit">
              <div className="kit-head">Emoji, GIFs and games</div>
              <div className="kit-actions">
                <button className="ghost" disabled={Boolean(kitBusy)} onClick={saveKit}>Save kit</button>
                <button className="ghost" disabled={Boolean(kitBusy)}
                        onClick={() => kitRef.current.click()}>Load kit</button>
              </div>
              {kitBusy && <p className="muted">{kitBusy}</p>}
              {kitErr && <p className="muted">{kitErr}</p>}
              <p className="muted hint">
                One file holding this group's packs, GIFs and games, so a new group can
                start with them. Messages and people are not included.
              </p>
              <input ref={kitRef} type="file" accept=".zip" hidden
                     onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadKit(f); }} />
            </div>

            <button className="leave" onClick={onForget}>Forget this group</button>
            <p className="muted hint">Forgetting removes it from your list on this device. Anyone with the code can still get in, and nothing is deleted for the others.</p>
          </div>
        </div>
      )}

      <main>
        {msgs.length === 0 && <p className="muted empty">No messages yet. Say something.</p>}
        {msgs.map((m, i) => {
          const mine = m.author === name;
          const runOn = i > 0 && msgs[i - 1].author === m.author;
          return (
            <div key={m.id} className={'row ' + (mine ? 'mine' : 'theirs')}>
              <div className="bubble">
                {!mine && !runOn && <div className="who">{m.author}</div>}
                <Body message={m} body={m.body} byId={byId}
                      name={name} onUpdate={patch} onSend={sendStructured} />
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </main>

      {TOOLS.filter(t => t.id === openTool).map(({ id, Sheet }) => (
        <Sheet
          key={id}
          room={room} name={name} packs={packs} emoji={emoji} msgs={msgs}
          people={people} online={online}
          onSendText={text => { setDraft(d => (d ? d + ' ' : '') + text); setOpenTool(null); }}
          onSendEmoji={e => {
            // By identity, not by name: two packs may share a shortcode.
            picked.current.set(e.name, e);
            setDraft(d => (d ? d + ' ' : '') + `:${e.name}:`);
            setOpenTool(null);
          }}
          onSend={msg => { sendStructured(msg); setOpenTool(null); }}
          onClose={() => setOpenTool(null)}
        />
      ))}

      <div className="composer">
        {sendErr && <p className="err send-err">Not sent: {sendErr}</p>}
        {/* The tool bar, built from the registry. Adding a tool is a file
            and a line in src/tools/index.js; nothing here changes. */}
        <div className="tools">
          {TOOLS.map(t => (
            <button key={t.id} type="button" className={`tool tool-${t.id}`}
                    title={t.label} aria-label={t.label}
                    onClick={() => setOpenTool(t.id)}>{t.icon}</button>
          ))}
        </div>
        <form onSubmit={send}>
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Message" />
          <button disabled={!draft.trim()}>Send</button>
        </form>
      </div>
    </div>
  );
}
