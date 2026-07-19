# Rootspire — dev notes

Idle game, static site, **no build step** — plain ES modules, deployed to GitHub Pages
from `main` (root). Do not add bundlers or frameworks.

## Commands

- Local dev: `python3 -m http.server` then open http://localhost:8000
- Syntax check: `for f in src/*.js; do node --check "$f"; done`
- Balance sim: `node sim/sim.mjs 120 --quiet` — greedy bot plays via the real engine;
  prints floor-conquest timeline. Humans run ~1.5–2× slower than the bot.
- Browser smoke test: `node test/smoke.mjs` (needs `npm i playwright` somewhere on
  NODE_PATH, e.g. a scratch dir; boots page, buys, saves, reloads, tours all tabs).

## Architecture rules

- `src/engine.js` must stay DOM-free — it is imported by `sim/sim.mjs` under node.
- All balance numbers live in `src/data.js`. Tune there, then re-run the sim.
- Save shape changes: bump `SAVE_VERSION` in engine.js only if old saves can't be
  fixed by `migrate()`'s deep-default fill; prefer additive fields (migrate fills them).
- Transient state fields start with `_` (stripped on save).
- Design intent (see DESIGN.md): **no prestige resets, ever** — all meta-progression
  (floors, blessings, achievements) is strictly increasing. Don't add reset mechanics.
- Icon-first UI: emojis + colored chips, reading optional. Juice animations (glow, toasts,
  banners, working-bob) are fine; gameplay animations (moving characters) are not. No
  derived "time until affordable" estimates — players do their own math. Keep it cheap
  in background tabs.

## Balance reference (bot times)

Floor 1 ≈ 1¼h · floor 3 (Foreman) ≈ 2h · floor 10 ≈ 4½h · floor 20 ≈ 13h ·
floor 30 ≈ 64h. Late floors are gated by the gear economy (forge chain), not
expedition count — ore/metal production is the late-game tuning knob.
