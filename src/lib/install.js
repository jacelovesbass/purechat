// Putting a pack or a game into a room.
//
// One path, used by the emoji sheet, the games sheet and the kit loader. They
// each used to do their own inserts, which is how two importers end up
// disagreeing about what a clashing shortcode does.
import { supabase } from './supabase.js';
import { dedupeNames } from './packs.js';

/**
 * Add a pack. Returns how many shortcodes had to be renamed to avoid clashing
 * with what the room already has, because that is worth telling somebody.
 *
 * The emoji insert is rolled back by hand if it fails: a pack row with no
 * emoji is a ghost in the shelf.
 */
export async function installPack({ roomId, addedBy, pack, takenNames = [] }) {
  const renamed = dedupeNames(pack.emoji, takenNames);
  const clashes = renamed.filter((e, i) => e.name !== pack.emoji[i].name).length;

  const { data: row, error } = await supabase.from('packs')
    .insert({ room_id: roomId, name: pack.name, author: pack.author, added_by: addedBy })
    .select().single();
  if (error) throw error;

  const { error: e2 } = await supabase.from('emoji')
    .insert(renamed.map(e => ({ pack_id: row.id, name: e.name, url: e.url })));
  if (e2) {
    await supabase.from('packs').delete().eq('id', row.id);
    throw e2;
  }

  return { pack: row, added: renamed.length, clashes };
}

/** Add a game. A game carries its html or a url, never both. */
export async function installGame({ roomId, addedBy, game }) {
  const { data, error } = await supabase.from('games').insert({
    room_id: roomId,
    name: game.name,
    author: game.author ?? null,
    added_by: addedBy,
    html: game.html ?? null,
    url: game.url ?? null,
  }).select().single();
  if (error) throw error;
  return data;
}
