# Mechafauna

**This folder holds the built game, not its source.** `index.html` is generated.

The project lives at `C:\Users\Jason\dev\mechafauna` (its own git repo):
`src/game_src.html` plus the art and audio modules, assembled by
`tools/build.py`, with a headless balance simulator in `tools/sim.py`. Edit
there, rebuild, and copy the result here. **Editing this file is how the two
copies drift.**

A 3v3 real-time battler: twelve animals in four groups, four cores, eight
equipment items, a synthesised soundtrack, no type advantages. Mobile-first
portrait.

The two typefaces are inlined as base64 woff2, latin subset. That is not
decoration: the pack builder refuses a game with remote assets, an installed
copy can be frozen into a group, and the title face has no system fallback.

Spear record: `12_Hobby_Projects/HOB_2026_001_Closed_Group_Messaging_Platform/HOB_2026_001_Mechafauna.md`.
