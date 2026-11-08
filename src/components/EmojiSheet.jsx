import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { readZip, readLooseImages, exportPack } from '../lib/packs.js';
import { installPack } from '../lib/install.js';

export function EmojiSheet({ room, name, packs, emoji, onSendEmoji, onClose }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const zipRef = useRef(null);
  const imgRef = useRef(null);

  async function install(read) {
    setErr('');
    try {
      const pack = await read();
      setBusy(`Adding ${pack.emoji.length} emoji...`);
      const { clashes } = await installPack({
        roomId: room.id, addedBy: name, pack, takenNames: emoji.map(e => e.name),
      });
      if (clashes) setErr(`${clashes} name${clashes > 1 ? 's' : ''} already in use here, renamed so nothing is ambiguous.`);
    } catch (ex) {
      setErr(ex.message || String(ex));
    } finally {
      setBusy('');
    }
  }

  async function removePack(id) {
    await supabase.from('packs').delete().eq('id', id);
  }

  /** Hand the pack back as a zip, so it can go to another group or another app. */
  async function download(pack, entries) {
    setErr('');
    try {
      const { blob } = await exportPack(pack, entries);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = pack.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (ex) {
      setErr(ex.message || String(ex));
    }
  }

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-card" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>Emoji</strong>
          <button className="link" onClick={onClose}>Done</button>
        </div>

        {emoji.length === 0 && !busy && (
          <p className="muted">No packs yet. Add a .zip pack, or just pick some images.</p>
        )}

        {packs.map(p => {
          const mine = emoji.filter(e => e.pack_id === p.id);
          return (
            <div key={p.id} className="pack">
              <div className="pack-head">
                <span>{p.name} <span className="muted">{mine.length}</span></span>
                <span>
                  <button className="link" onClick={() => download(p, mine)}>Export</button>
                  <button className="link" onClick={() => removePack(p.id)}>Remove</button>
                </span>
              </div>
              <div className="grid">
                {mine.map(e => (
                  <button key={e.id} className="cell" title={':' + e.name + ':'} onClick={() => onSendEmoji(e)}>
                    <img src={e.url} alt={e.name} />
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {busy && <p className="muted">{busy}</p>}
        {err && <p className="err">{err}</p>}

        <div className="pack-actions">
          <button className="ghost" onClick={() => zipRef.current.click()}>Add pack (.zip)</button>
          <button className="ghost" onClick={() => imgRef.current.click()}>Add images</button>
        </div>

        <input ref={zipRef} type="file" accept=".zip" hidden
               onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) install(() => readZip(f)); }} />
        <input ref={imgRef} type="file" accept="image/*" multiple hidden
               onChange={e => { const fs = [...e.target.files]; e.target.value = '';
                                if (fs.length) install(() => readLooseImages(fs, 'My pack')); }} />
      </div>
    </div>
  );
}
