// A room kit: everything a group brought with it, in one file.
//
// A kit is a zip of zips. Emoji packs and games are ALREADY self-describing
// zips with their own manifests, so a kit adds an index and nothing else: no
// new parsing, no second way to describe an emoji, and a pack pulled out of a
// kit is a pack anyone can import on its own.
//
//   pure-empathy-kit.zip
//   |- kit.json
//   |- packs/faces.zip        <- PACK_FORMAT.md, unchanged
//   \- games/kelp-diver.zip   <- GAME_FORMAT.md, unchanged
//
// Deliberately NOT included: messages and members. This is a kit, not a
// backup. Copying a conversation into another group is a different thing with
// worse implications, and nobody asked for it.
import JSZip from 'jszip';
import { exportPack } from './packs.js';
import { exportGame } from './games.js';

export const KIT_FORMAT = 'purekit/1';

const slug = s => (s || 'untitled').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'untitled';

/** Unique file name within the kit, so two packs called "Faces" both survive. */
function namer() {
  const taken = new Set();
  return (base, ext) => {
    let name = `${slug(base)}${ext}`;
    let n = 1;
    while (taken.has(name)) name = `${slug(base)}-${++n}${ext}`;
    taken.add(name);
    return name;
  };
}

/**
 * Build a kit from what a room currently holds.
 *
 * `emojiFor(pack)` returns that pack's entries; the caller already has them
 * loaded, and this module deliberately does not know about the database.
 */
export async function buildKit({ roomName, packs = [], emojiFor, games = [] }) {
  const zip = new JSZip();
  const name = namer();

  const manifest = {
    format: KIT_FORMAT,
    name: roomName || 'Kit',
    created: new Date().toISOString(),
    packs: [],
    games: [],
  };

  for (const pack of packs) {
    const entries = emojiFor(pack) || [];
    if (!entries.length) continue;                 // an empty pack is noise
    const file = `packs/${name(pack.name, '.zip')}`;
    // Two shapes to be careful of here, both found by running it:
    // exportPack returns { blob, files } while exportGame returns a Blob, and
    // JSZip will not reliably nest a Blob anyway. ArrayBuffer for both.
    const { blob } = await exportPack(pack, entries);
    zip.file(file, await blob.arrayBuffer());
    manifest.packs.push({ file, name: pack.name, count: entries.length });
  }

  for (const game of games) {
    const file = `games/${name(game.name, '.zip')}`;
    zip.file(file, await (await exportGame(game)).arrayBuffer());
    manifest.games.push({ file, name: game.name });
  }

  zip.file('kit.json', JSON.stringify(manifest, null, 2));
  return { blob: await zip.generateAsync({ type: 'blob' }), manifest };
}

/**
 * Open a kit and hand back the inner files, still zipped.
 *
 * They are returned as Files rather than parsed, so the caller feeds them to
 * the same importers a person would drag in by hand. One import path, not two.
 */
export async function readKit(file) {
  const zip = await JSZip.loadAsync(file);

  const manifestFile = zip.file('kit.json');
  if (!manifestFile) throw new Error('no kit.json in that zip, so it is not a kit');

  let manifest;
  try {
    manifest = JSON.parse(await manifestFile.async('string'));
  } catch {
    throw new Error('kit.json is not valid JSON');
  }
  if (manifest.format !== KIT_FORMAT) {
    throw new Error(`unknown kit format "${manifest.format ?? '(missing)'}"`);
  }

  const take = async list => {
    const out = [];
    for (const entry of list || []) {
      const f = zip.file(entry.file);
      if (!f) continue;                            // listed but missing: skip, do not fail the lot
      out.push({
        name: entry.name,
        file: new File([await f.async('blob')], entry.file.split('/').pop(),
          { type: 'application/zip' }),
      });
    }
    return out;
  };

  return {
    name: manifest.name,
    created: manifest.created,
    packs: await take(manifest.packs),
    games: await take(manifest.games),
  };
}

/** What a kit will add, for a sentence before anyone commits to it. */
export function describeKit(kit) {
  const bits = [];
  if (kit.packs.length) bits.push(`${kit.packs.length} pack${kit.packs.length === 1 ? '' : 's'}`);
  if (kit.games.length) bits.push(`${kit.games.length} game${kit.games.length === 1 ? '' : 's'}`);
  return bits.length ? bits.join(' and ') : 'nothing';
}
