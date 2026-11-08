# Kit format, v1

**A kit is everything a group brought with it, in one file**: its emoji packs,
its GIF library and its games. Save one from a group, load it into a new group,
and start with the same material instead of rebuilding it.

```
pure-empathy-kit.zip
├── kit.json
├── packs/faces.zip        <- PACK_FORMAT.md, unchanged
├── packs/gifs.zip
└── games/kelp-diver.zip   <- GAME_FORMAT.md, unchanged
```

## kit.json

```json
{
  "format": "purekit/1",
  "name": "Pure Empathy",
  "created": "2026-11-08T01:30:00.000Z",
  "packs": [{ "file": "packs/faces.zip", "name": "Faces", "count": 24 }],
  "games": [{ "file": "games/kelp-diver.zip", "name": "Kelp Diver" }]
}
```

## Why it is a zip of zips

Packs and games are **already** self-describing zips with their own manifests.
Nesting them means a kit adds an index and nothing else:

- **No new parsing.** Loading a kit feeds each inner file to the same importer
  a person uses when they drag a pack in by hand. One import path, not two that
  can disagree about what a clashing shortcode does.
- **A pack pulled out of a kit is still a pack.** Unzip a kit, email somebody
  `packs/faces.zip`, and it imports on its own. Nothing in it is kit-only.
- **The link property survives.** A GIF pack whose entries are all URLs is still
  a few hundred bytes inside a kit, because the inner format is untouched.

## What is not in it

**Messages and members.** This is a kit, not a backup. Copying a conversation
into another group is a different feature with worse implications, and nobody
asked for it.

## Loading

**Adds, never replaces.** Shortcodes that clash with what the room already has
are renamed, the same way a single pack import does, and the app says how many.

A listed file that is missing from the zip is skipped rather than failing the
whole load, so a half-corrupt kit still gives you what it can.

## Limits

- Stored emoji travel as real image files; a pack of 24 stored images is around
  250 KB. Link-only entries cost nothing.
- Games are capped at 512 KB each by `GAME_FORMAT.md`, and a kit does not raise
  that.
