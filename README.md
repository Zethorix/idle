# Rootspire

An idle/incremental game about a camp at the roots of a tower with no visible top.

**Play:** https://zethorix.github.io/idle/ (GitHub Pages, deployed from `main`, root folder)

- Assign named villagers to jobs; jobs level up RuneScape-style and never stop mattering.
- Buildings generate passively; converters chain resources (ore → metal → tools → gear).
- Mount expeditions up the Spire. Every floor conquered is a **permanent** global
  production multiplier — there is no prestige reset in this game, ever. Progress only goes up.
- Essence from the Spire buys permanent Blessings; floor milestones unlock new systems,
  including the Foreman: a rule-based automation engine you configure yourself.
- No animations. Numbers, text, and progress bars.
- Saves in localStorage (autosave every 10 s) + base64 export/import. Offline progress
  with a "while you were away" report (cap grows from 8 h to 24 h+ as you climb).

## Development

No build step. Any static file server works:

```sh
python3 -m http.server        # then open http://localhost:8000
```

- `src/data.js` — all content & balance numbers
- `src/engine.js` — pure simulation (no DOM), shared with the simulator
- `src/ui.js`, `src/main.js`, `src/save.js`, `src/format.js` — browser layer
- `sim/sim.mjs` — headless greedy-bot playthrough: `node sim/sim.mjs 120 --quiet`
  prints a milestone timeline for balance tuning
- `DESIGN.md` — design doc & roadmap

## Balance snapshot (greedy 24/7 bot; humans run ~1.5–2× slower)

| Milestone | Bot time |
|---|---|
| Spire unlocked | ~35 min |
| Floor 1 (Blessings) | ~1¼ h |
| Floor 3 (Foreman automation) | ~2 h |
| Floor 5 (auto-expeditions, first Sanctum) | ~2½ h |
| Floor 10 | ~4½ h |
| Floor 20 | ~13 h |
| Floor 25 | ~28 h |
| Floor 30 (Summit Gate) | ~64 h |
