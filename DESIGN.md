# Rootspire — Design Document

An idle/incremental game. Static site, no build step, no animations (progress bars only).
Live design doc — updated as the game grows.

## Fantasy

Your caravan halts at the roots of the Rootspire, a tower with no visible top. You build a
camp, put villagers to work, industrialize the foothills, and mount expeditions up the Spire.
Every floor conquered permanently empowers the camp below. The Spire never takes anything back.

## Core loop

1. **Gather** (manual click) → bootstrap food/wood.
2. **Buildings** — passive generators (garden, lumber camp, stone pit, ...). Exponential costs
   (×1.15 per purchase), ownership milestones at 10/25/50/100/200/400 double their output
   (the classic sawtooth that keeps purchases meaningful).
3. **Villagers** — named characters assigned to jobs (forage, logging, quarry, mining, hunting,
   herbalism). Jobs earn XP on a RuneScape-style curve (XP-to-level doubles every ~7 levels);
   each job level compounds yield ×1.06. Equipment tiers (bought with tools/gear) double yield.
4. **Converters** — smelter (ore+wood→metal), tannery (hide→leather), still (herbs+food→tonic),
   workshop (metal+wood→tools), forge (metal+leather→gear). Continuous conversion with
   utilization display; they throttle gracefully when inputs run short (no deadlocks; manual
   gather always exists as a bootstrap).
5. **Market** — sell any resource for coins, buy at a markup. Coins pay for recruits and select
   upgrades.
6. **The Spire** — expeditions consume gear + tonics + food, run on a timer, and add progress
   to the current floor. Completing a floor grants:
   - a **permanent global ×1.25 production multiplier** (×2 extra on every 5th floor),
   - **essence**, spent in a permanent Blessings shop,
   - feature unlocks (see cadence below).
   **This is the prestige layer and it never resets anything.** Strictly increasing, by design.
7. **Foreman (automation)** — unlocked via the Spire, once its decisions have become rote:
   per-building autobuy first, then a rule builder (WHEN resource ⋛ X DO buy/recruit/sell
   surplus/launch expedition). Rule slots expand via blessings.

## Pacing targets (from genre research: Pecorella GDC talks, Kongregate math series)

- First purchase < 30 s; a purchase or unlock every 15–60 s in the first 10 minutes.
- New mechanic roughly every session early (buildings → villagers → converters → market →
  spire), then gated behind floors.
- Floor 1 ≈ 1–2 h in. Automation ≈ floor 3. From there, floor cadence stretches from
  ~1 h to ~10+ h; the curve is tuned by headless simulation (`sim/`), targeting 100+ hours
  of charted progression to floor 30 ("the Summit" — which is not the end).
- Active play should beat idle by ~2–5×, never orders of magnitude.
- Offline progress: full rate for 2 h, then 85%, capped at 8 h base — extended by blessings
  and floor rewards up to 24 h+. Itemized "While you were away" report on return.

## UX rules

- Icon-first: emojis carry the information; reading is optional. Costs and yields are
  colored chips (green = affordable, red = not, per resource). Recipes read `6⛰️ + 4🪵 ➜ 1🔩`.
- "Juice" animations are welcome — hover lifts, glow pulses, working-bob loops, toasts,
  floor-conquest banners. Gameplay animation (moving characters, combat) is out of scope.
  `prefers-reduced-motion` disables all of it.
- Guidance is explicit: a hint bar (`👉 do this next`) with a glow on the exact button it
  refers to, until the first expedition; newly unlocked tabs pulse until visited; every
  unlock fires a toast, floor conquests get a banner.
- No derived time estimates ("affordable in 2m") — players do their own math. Timers on
  running processes (expedition countdowns, cycle lengths) are fine.
- Every resource shows net per-second rate; negatives shown in red before they hurt.
- Buy ×1/×10/×25/Max with closed-form bulk costs (no loops).
- Autosave every 10 s to localStorage; export/import save as base64 text.
- Progressive disclosure: tabs and panels appear only when relevant; once seen, never hidden.

## Structure

- `index.html`, `style.css` — flat, dark, monospace aesthetic.
- `src/data.js` — all content definitions (resources, jobs, buildings, converters, upgrades,
  floors, blessings). Balance lives here.
- `src/engine.js` — pure simulation (no DOM). Used by both the page and the node simulator.
- `src/ui.js`, `src/main.js` — rendering & loop. `src/save.js`, `src/format.js` — persistence,
  formatting.
- `sim/sim.mjs` — headless greedy-bot playthrough for balance verification (node sim/sim.mjs).

## Roadmap (post-v1 ideas, roughly in order)

- Expedition loadouts & second expedition slot; named floor events with choices.
- Deeper automation: scriptable DSL (sandboxed) once rules feel rote — automation of automation.
- Villager traits (individual bonuses), renaming, keepsakes.
- Tier-3 industry (glass, runes), Spire-side economy above floor 10.
- Achievements/Chronicle milestones; statistics graphs (text-based sparklines).
- Multiple camps ("Waystations") at higher floors, each with its own economy.
