// Headless balance simulator: a greedy bot plays Rootspire via the real engine.
// Usage: node sim/sim.mjs [hours] [--quiet]
// Prints a milestone timeline + periodic snapshots so pacing can be tuned.

import * as D from '../src/data.js';
import * as E from '../src/engine.js';

const hours = parseFloat(process.argv[2]) || 120;
const quiet = process.argv.includes('--quiet');
const S = E.newState(Date.now());

const seen = new Set();
const t = () => S.stats.playTime;
function hms(secs) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return `${String(h).padStart(3)}h${String(m).padStart(2, '0')}m`;
}
function mark(key, msg) {
  if (seen.has(key)) return;
  seen.add(key);
  console.log(`${hms(t())}  ${msg}`);
}

// ---- bot policy ------------------------------------------------------
const JOB_WEIGHT = { forage: 2, logging: 2, quarry: 1.5, mining: 2, hunting: 1.5, herbalism: 1.5 };

function assignIdle() {
  // send idle villagers to the unlocked job whose assigned/weight is lowest
  while (E.idleVillagers(S) > 0) {
    let best = null, bestScore = Infinity;
    for (const j of D.JOBS) {
      if (j.unlock && !j.unlock(S)) continue;
      const score = S.jobs[j.id].assigned / (JOB_WEIGHT[j.id] || 1);
      if (score < bestScore) { bestScore = score; best = j.id; }
    }
    if (!best) break;
    E.assignJob(S, best, 1);
  }
}

function decide() {
  // clicks: active play for the first 15 minutes
  if (t() < 900) for (let i = 0; i < 10; i++) E.doClick(S);

  // recruit + housing
  while (E.recruit(S)) {}
  if (S.villagers.length >= E.housingCap(S)) E.buyBuilding(S, 'cabin', 1);
  assignIdle();

  // converters: keep a modest ladder going
  const wantCvt = { smelter: 40, tannery: 25, still: 25, workshop: 20, forge: 20 };
  for (const c of D.CONVERTERS) {
    if (c.unlock && !c.unlock(S)) continue;
    const cur = S.converters[c.id]?.count || 0;
    if (cur < wantCvt[c.id]) E.buyConverter(S, c.id, 1);
  }

  // buildings: buy any affordable, cheapest first (skip cabin, handled above)
  const buyable = D.BUILDINGS
    .filter(b => b.id !== 'cabin' && (!b.unlock || b.unlock(S)))
    .sort((a, b) => costScore(a) - costScore(b));
  for (const b of buyable) E.buyBuilding(S, b.id, 1);

  // upgrades & equipment
  for (const u of D.UPGRADES) {
    if (u.unlock && !u.unlock(S)) continue;
    E.buyUpgrade(S, u.id);
  }
  for (const j of D.JOBS) {
    if (S.jobs[j.id].assigned > 0) E.buyEquip(S, j.id);
  }

  // market: keep enough coins for the next recruit + upgrades
  const coinTarget = 2 * (D.recruitCost(S.villagers.length).coins || 0) + 3000;
  if ((S.res.coins || 0) < coinTarget && S.unlocked.market) {
    let big = null, bigVal = 0;
    for (const id of ['food', 'wood', 'stone', 'ore', 'hide', 'herbs']) {
      if (S.res[id] > bigVal) { bigVal = S.res[id]; big = id; }
    }
    if (big && bigVal > 5000) E.sellRes(S, big, bigVal * 0.25);
  }

  // spire
  if (E.rallyReady(S)) E.activateRally(S);
  E.launchExpedition(S);
  if (S.unlocked.autoexpedition) S.spire.autoRepeat = true;

  // blessings: round-robin the cheap ones
  for (const id of ['vigor', 'valor', 'haste', 'insight']) {
    const b = D.BLESSING[id];
    const cost = D.blessingCost(b, S.blessings[id] || 0);
    if ((S.res.essence || 0) >= cost * 1.5) E.buyBlessing(S, id);
  }
}

function costScore(b) {
  const owned = S.buildings[b.id] || 0;
  const cost = E.bulkCost(b.cost, b.costMult, owned, 1);
  let sum = 0;
  for (const k in cost) sum += cost[k] * (1 / (D.SELL_PRICE[k] ? 1 / D.SELL_PRICE[k] : 1));
  return sum;
}

// ---- run -------------------------------------------------------------
const total = hours * 3600;
let lastSnap = 0, lastFloor = 0;
console.log(`# Rootspire sim — ${hours}h, greedy bot`);
for (let elapsed = 0; elapsed < total; elapsed += 1) {
  E.tick(S, 1);
  if (elapsed % 5 === 0) decide();

  // milestones
  if (S.buildings.garden && !seen.has('garden')) mark('garden', 'first Garden');
  if (S.villagers.length >= 2) mark('vill2', 'second villager');
  if (S.unlocked.tier1) mark('tier1', 'tier-1 world unlocked (ore/hide/herbs)');
  if (S.converters.smelter?.count) mark('smelter', 'first Smelter');
  if (S.converters.workshop?.count) mark('workshop', 'first Workshop');
  if (S.converters.forge?.count) mark('forge', 'first Forge');
  if (S.unlocked.spire) mark('spire', 'Spire unlocked (first gear)');
  if (S.stats.expeditions >= 1) mark('exp1', 'first expedition returned');
  if (S.spire.floor > lastFloor) {
    lastFloor = S.spire.floor;
    console.log(`${hms(t())}  ★ FLOOR ${S.spire.floor} conquered  (global ×${E.globalMult(S).toFixed(1)}, villagers ${S.villagers.length}, essence earned ${Math.round(S.stats.essenceEarned)})`);
  }

  if (!quiet && t() - lastSnap >= 4 * 3600) {
    lastSnap = t();
    const r = S.res;
    console.log(`${hms(t())}  · snapshot floor=${S.spire.floor} gm=${E.globalMult(S).toFixed(1)} ` +
      `food=${fmtN(r.food)} wood=${fmtN(r.wood)} stone=${fmtN(r.stone)} metal=${fmtN(r.metal)} ` +
      `tools=${fmtN(r.tools)} gear=${fmtN(r.gear)} coins=${fmtN(r.coins)} essence=${fmtN(r.essence)} ` +
      `vill=${S.villagers.length} exp=${S.stats.expeditions}`);
  }
}

console.log(`\n# done: floor ${S.spire.floor}, ${S.stats.expeditions} expeditions, ` +
  `global ×${E.globalMult(S).toFixed(1)}, ${S.villagers.length} villagers`);
console.log('# job levels: ' + D.JOBS.map(j => `${j.id}=${S.jobs[j.id].level}`).join(' '));

function fmtN(n) {
  n = n || 0;
  if (n < 1e3) return String(Math.floor(n));
  if (n < 1e6) return (n / 1e3).toFixed(1) + 'K';
  if (n < 1e9) return (n / 1e6).toFixed(1) + 'M';
  return (n / 1e9).toFixed(1) + 'B';
}
