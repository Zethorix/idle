// Rootspire — pure simulation engine. No DOM access: the same code drives the
// browser game (src/main.js) and the headless balance simulator (sim/sim.mjs).

import * as D from './data.js';

export const SAVE_VERSION = 1;

// ---------------------------------------------------------------- state
export function newState(nowMs) {
  const s = {
    version: SAVE_VERSION,
    savedAt: nowMs,
    res: {}, lifetime: {},
    buildings: {},                      // id -> count
    converters: {},                     // id -> { count, on }
    villagers: [{ name: D.VILLAGER_NAMES[0] }],
    jobs: {},                           // id -> { assigned, level, xp }
    equip: {},                          // jobId -> tier count
    upgrades: {},                       // id -> tiers bought
    blessings: {},                      // id -> rank
    spire: { floor: 0, progress: 0, exp: null, autoRepeat: false },
    rules: [],                          // foreman rules
    unlocked: {                         // sticky progressive-disclosure flags
      buildings: false, villagers: false, tier1: false, market: false,
      spire: false, blessings: false, tier2: false, foreman: false,
      autoexpedition: false,
    },
    stats: {
      started: nowMs, playTime: 0, clicks: 0, expeditions: 0,
      coinsEarned: 0, essenceEarned: 0,
    },
    log: [],
    settings: { buyQty: 1 },
  };
  for (const r of D.RESOURCES) { s.res[r.id] = 0; s.lifetime[r.id] = 0; }
  for (const j of D.JOBS) s.jobs[j.id] = { assigned: 0, level: 1, xp: 0 };
  addLog(s, 'The caravan halts. Above you, the Rootspire disappears into cloud.');
  return s;
}

export function migrate(s, nowMs) {
  // Fill any fields added after the save was written.
  const fresh = newState(nowMs);
  deepDefault(s, fresh);
  s.version = SAVE_VERSION;
  return s;
}
function deepDefault(target, defaults) {
  for (const k in defaults) {
    if (target[k] === undefined) target[k] = defaults[k];
    else if (isObj(defaults[k]) && isObj(target[k])) deepDefault(target[k], defaults[k]);
  }
}
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

export function addLog(s, msg) {
  s.log.push({ t: s.stats ? s.stats.playTime : 0, msg });
  if (s.log.length > 120) s.log.splice(0, s.log.length - 120);
}

// ---------------------------------------------------------------- multipliers
export function sanctumCount(floor) { return Math.floor(floor / 5); }

export function globalMult(s) {
  return Math.pow(D.FLOOR_MULT, s.spire.floor)
       * Math.pow(D.SANCTUM_MULT, sanctumCount(s.spire.floor))
       * Math.pow(1.25, s.blessings.vigor || 0);
}
export function milestoneMult(count) {
  let m = 1;
  for (const t of D.MILESTONES) if (count >= t) m *= 2;
  return m;
}
export function nextMilestone(count) {
  for (const t of D.MILESTONES) if (count < t) return t;
  return null;
}
export function buildingMult(s) {
  return Math.pow(1.5, s.upgrades.handcarts || 0) * globalMult(s);
}
export function jobYieldMult(s, jobId) {
  const j = s.jobs[jobId];
  return Math.pow(D.JOB_LEVEL_MULT, j.level - 1)
       * Math.pow(D.EQUIP_YIELD_MULT, s.equip[jobId] || 0)
       * Math.pow(1.5, s.upgrades.whetstones || 0)
       * globalMult(s);
}
export function converterSpeedMult(s) {
  return Math.pow(1.5, s.upgrades.bellows || 0)
       * Math.pow(1.2, s.blessings.haste || 0)
       * globalMult(s);
}
export function xpMult(s) { return Math.pow(1.5, s.blessings.insight || 0); }
export function clickYieldMult(s) {
  return Math.pow(2, s.upgrades.sharpKnives || 0) * globalMult(s);
}
export function sellPriceMult(s) { return Math.pow(1.5, s.upgrades.ledgers || 0); }

export function housingCap(s) {
  return D.BASE_HOUSING + (s.buildings.cabin || 0) * 2;
}
export function offlineCapSecs(s) {
  let hours = D.OFFLINE_BASE_CAP_HOURS;
  if (s.spire.floor >= 4) hours = 12;
  if (s.spire.floor >= 7) hours = 24;
  hours += 4 * (s.blessings.patience || 0);
  return hours * 3600;
}
export function ruleSlots(s) {
  return D.BASE_RULE_SLOTS + (s.blessings.foresight || 0);
}
export function idleVillagers(s) {
  let assigned = 0;
  for (const j of D.JOBS) assigned += s.jobs[j.id].assigned;
  return s.villagers.length - assigned;
}

// ---------------------------------------------------------------- costs
export function canAfford(s, cost) {
  for (const k in cost) if ((s.res[k] || 0) < cost[k]) return false;
  return true;
}
export function pay(s, cost) {
  for (const k in cost) s.res[k] -= cost[k];
}
export function gain(s, resId, amount) {
  s.res[resId] += amount;
  s.lifetime[resId] += amount;
  if (resId === 'coins') s.stats.coinsEarned += amount;
  if (resId === 'essence') s.stats.essenceEarned += amount;
}

// Bulk cost of buying n units of something priced base×mult^owned.
export function bulkCost(baseCost, mult, owned, n) {
  const factor = Math.pow(mult, owned) * (Math.pow(mult, n) - 1) / (mult - 1);
  const out = {};
  for (const k in baseCost) out[k] = Math.ceil(baseCost[k] * factor);
  return out;
}
// Max units affordable given owned count and current resources.
export function maxAffordable(s, baseCost, mult, owned) {
  let best = Infinity;
  for (const k in baseCost) {
    const b = baseCost[k] * Math.pow(mult, owned);
    const c = s.res[k] || 0;
    const n = Math.floor(Math.log(1 + (c * (mult - 1)) / b) / Math.log(mult));
    best = Math.min(best, n);
  }
  if (!isFinite(best)) return 0;
  // Ceil-per-resource rounding in bulkCost can make the closed form off by one.
  while (best > 0 && !canAfford(s, bulkCost(baseCost, mult, owned, best))) best--;
  return Math.max(0, best);
}

// ---------------------------------------------------------------- actions
export function doClick(s) {
  const m = clickYieldMult(s);
  for (const k in D.CLICK_YIELD) gain(s, k, D.CLICK_YIELD[k] * m);
  s.stats.clicks++;
}

export function buyBuilding(s, id, qty) {
  const b = D.BUILDING[id];
  if (!b) return false;
  const owned = s.buildings[id] || 0;
  const n = qty === 'max' ? maxAffordable(s, b.cost, b.costMult, owned)
                          : Math.max(1, qty | 0);
  if (n < 1) return false;
  const cost = bulkCost(b.cost, b.costMult, owned, n);
  if (!canAfford(s, cost)) return false;
  pay(s, cost);
  s.buildings[id] = owned + n;
  return true;
}

export function buyConverter(s, id, qty) {
  const c = D.CONVERTER[id];
  if (!c) return false;
  const cur = s.converters[id] || { count: 0, on: true };
  const n = qty === 'max' ? maxAffordable(s, c.cost, c.costMult, cur.count)
                          : Math.max(1, qty | 0);
  if (n < 1) return false;
  const cost = bulkCost(c.cost, c.costMult, cur.count, n);
  if (!canAfford(s, cost)) return false;
  pay(s, cost);
  cur.count += n;
  s.converters[id] = cur;
  return true;
}

export function recruit(s) {
  if (s.villagers.length >= housingCap(s)) return false;
  const cost = D.recruitCost(s.villagers.length);
  if (!canAfford(s, cost)) return false;
  pay(s, cost);
  const name = D.VILLAGER_NAMES[(s.villagers.length * 17 + 5) % D.VILLAGER_NAMES.length];
  s.villagers.push({ name });
  addLog(s, `${name} joins the camp.`);
  return true;
}

export function assignJob(s, jobId, delta) {
  const j = s.jobs[jobId];
  if (!j) return false;
  if (delta > 0) delta = Math.min(delta, idleVillagers(s));
  if (delta < 0) delta = Math.max(delta, -j.assigned);
  if (delta === 0) return false;
  j.assigned += delta;
  return true;
}

export function buyUpgrade(s, id) {
  const u = D.UPGRADE[id];
  if (!u) return false;
  const tier = s.upgrades[id] || 0;
  if (tier >= u.tiers) return false;
  const cost = u.cost(tier);
  if (!canAfford(s, cost)) return false;
  pay(s, cost);
  s.upgrades[id] = tier + 1;
  return true;
}

export function buyEquip(s, jobId) {
  const e = D.JOB_EQUIP[jobId];
  if (!e) return false;
  const tier = s.equip[jobId] || 0;
  const cost = {};
  for (const k in e.cost) cost[k] = Math.ceil(e.cost[k] * Math.pow(D.EQUIP_COST_MULT, tier));
  if (!canAfford(s, cost)) return false;
  pay(s, cost);
  s.equip[jobId] = tier + 1;
  return true;
}

export function equipCost(s, jobId) {
  const e = D.JOB_EQUIP[jobId];
  const tier = s.equip[jobId] || 0;
  const cost = {};
  for (const k in e.cost) cost[k] = Math.ceil(e.cost[k] * Math.pow(D.EQUIP_COST_MULT, tier));
  return cost;
}

export function buyBlessing(s, id) {
  const b = D.BLESSING[id];
  if (!b) return false;
  const rank = s.blessings[id] || 0;
  if (b.max && rank >= b.max) return false;
  const cost = D.blessingCost(b, rank);
  if ((s.res.essence || 0) < cost) return false;
  s.res.essence -= cost;
  s.blessings[id] = rank + 1;
  return true;
}

export function sellRes(s, resId, amount) {
  const price = D.SELL_PRICE[resId];
  if (!price) return false;
  amount = Math.min(amount, s.res[resId] || 0);
  if (amount <= 0) return false;
  s.res[resId] -= amount;
  gain(s, 'coins', amount * price * sellPriceMult(s));
  return true;
}

export function buyRes(s, resId, amount) {
  const price = D.SELL_PRICE[resId];
  if (!price || amount <= 0) return false;
  const cost = amount * price * D.BUY_MARKUP;
  if ((s.res.coins || 0) < cost) return false;
  s.res.coins -= cost;
  gain(s, resId, amount);
  return true;
}

export function launchExpedition(s) {
  if (s.spire.exp) return false;
  if (!s.unlocked.spire) return false;
  const f = s.spire.floor;
  const cost = D.expeditionCost(f, s);
  if (!canAfford(s, cost)) return false;
  pay(s, cost);
  s.spire.exp = {
    floor: f,
    remaining: D.expeditionDuration(f),
    duration: D.expeditionDuration(f),
    progress: D.expeditionProgress(f, s),
  };
  return true;
}

// ---------------------------------------------------------------- tick
// Advances the simulation by dt seconds. Returns a transient info object
// (rates, utilization) for the UI; also cached on s._info.
export function tick(s, dt) {
  const info = { rates: {}, util: {}, levelUps: [] };
  for (const r of D.RESOURCES) info.rates[r.id] = 0;
  const gm = globalMult(s);

  // Buildings
  const bm = buildingMult(s);
  for (const b of D.BUILDINGS) {
    const count = s.buildings[b.id] || 0;
    if (!count || !b.prod) continue;
    const mm = milestoneMult(count);
    for (const k in b.prod) {
      const rate = b.prod[k] * count * mm * bm;
      gain(s, k, rate * dt);
      info.rates[k] += rate;
    }
  }

  // Jobs
  const xm = xpMult(s);
  for (const jd of D.JOBS) {
    const j = s.jobs[jd.id];
    if (!j.assigned) continue;
    const ym = jobYieldMult(s, jd.id);
    for (const k in jd.yield) {
      const rate = jd.yield[k] * j.assigned * ym;
      gain(s, k, rate * dt);
      info.rates[k] += rate;
    }
    j.xp += j.assigned * xm * dt;
    let need = D.xpToNext(j.level);
    while (j.xp >= need) {
      j.xp -= need;
      j.level++;
      info.levelUps.push(jd.id);
      need = D.xpToNext(j.level);
    }
  }

  // Converters (continuous, throttled by input availability)
  const cm = converterSpeedMult(s);
  for (const cd of D.CONVERTERS) {
    const c = s.converters[cd.id];
    if (!c || !c.count || !c.on) { info.util[cd.id] = 0; continue; }
    const cycles = (c.count * cm / cd.cycle) * dt;   // desired cycles this tick
    let ratio = 1;
    for (const k in cd.input) {
      const need = cd.input[k] * cycles;
      if (need > 0) ratio = Math.min(ratio, (s.res[k] || 0) / need);
    }
    ratio = Math.max(0, Math.min(1, ratio));
    const actual = cycles * ratio;
    if (actual > 0) {
      for (const k in cd.input) {
        s.res[k] -= cd.input[k] * actual;
        info.rates[k] -= cd.input[k] * actual / dt;
      }
      for (const k in cd.output) {
        gain(s, k, cd.output[k] * actual);
        info.rates[k] += cd.output[k] * actual / dt;
      }
    }
    info.util[cd.id] = ratio;
  }

  // Expedition
  if (s.spire.exp) {
    s.spire.exp.remaining -= dt;
    if (s.spire.exp.remaining <= 0) {
      const exp = s.spire.exp;
      s.spire.exp = null;
      s.stats.expeditions++;
      gain(s, 'essence', D.expeditionEssence(exp.floor));
      // Progress only counts toward the floor it was launched at (which is
      // always the current floor — floors can't regress).
      s.spire.progress += exp.progress;
      checkFloor(s);
      if (s.spire.autoRepeat && s.unlocked.autoexpedition) launchExpedition(s);
    }
  }

  // Foreman rules — evaluated at most once per second of game time.
  if (s.unlocked.foreman && s.rules.length) {
    s._ruleAccum = (s._ruleAccum || 0) + dt;
    if (s._ruleAccum >= 1) {
      const steps = Math.min(60, Math.floor(s._ruleAccum)); // catch up, bounded
      s._ruleAccum -= Math.floor(s._ruleAccum);
      for (let i = 0; i < steps; i++) runRules(s);
    }
  }

  s.stats.playTime += dt;
  checkUnlocks(s);
  s._info = info;
  return info;
}

function checkFloor(s) {
  let need = D.floorNeed(s.spire.floor);
  while (s.spire.progress >= need) {
    s.spire.progress -= need;
    s.spire.floor++;
    gain(s, 'essence', D.floorEssence(s.spire.floor - 1));
    const fl = D.FLOORS[s.spire.floor];
    const name = fl ? `${fl.name}` : `Floor ${s.spire.floor}`;
    addLog(s, `Floor ${s.spire.floor} conquered — ${name}. ${fl ? fl.text : ''} ` +
              `(All production ×${D.FLOOR_MULT}${s.spire.floor % 5 === 0 ? `, Sanctum ×${D.SANCTUM_MULT}` : ''})`);
    need = D.floorNeed(s.spire.floor);
  }
}

function checkUnlocks(s) {
  const u = s.unlocked;
  if (!u.buildings && s.lifetime.wood >= 10) {
    u.buildings = true;
    addLog(s, 'Enough wood to build with. The camp can grow.');
  }
  if (!u.villagers && (s.buildings.garden || 0) >= 1) {
    u.villagers = true;
    addLog(s, 'A worked field draws wanderers. You can recruit villagers.');
  }
  if (!u.tier1 && s.lifetime.stone >= D.TIER1_UNLOCK_STONE) {
    u.tier1 = true;
    addLog(s, 'Cut stone reveals ore seams, game trails, and herb hollows. New jobs and buildings available.');
  }
  if (!u.market && anyConverter(s)) {
    u.market = true;
    addLog(s, 'Traders arrive to barter. The Market is open.');
  }
  if (!u.spire && (s.lifetime.gear || 0) >= 1) {
    u.spire = true;
    addLog(s, 'With proper gear, the Spire door can be approached. Expeditions available.');
  }
  if (!u.blessings && s.spire.floor >= 1) { u.blessings = true; addLog(s, 'Essence can be shaped into permanent Blessings.'); }
  if (!u.tier2 && s.spire.floor >= 2) { u.tier2 = true; addLog(s, 'Vault schematics recovered: advanced buildings unlocked.'); }
  if (!u.foreman && s.spire.floor >= 3) { u.foreman = true; addLog(s, 'The ledger-engine hums to life. The Foreman can automate the camp.'); }
  if (!u.autoexpedition && s.spire.floor >= 5) { u.autoexpedition = true; addLog(s, 'Expeditions can now resupply and relaunch themselves.'); }
}
function anyConverter(s) {
  for (const k in s.converters) if (s.converters[k].count > 0) return true;
  return false;
}

// ---------------------------------------------------------------- foreman
function runRules(s) {
  const slots = ruleSlots(s);
  for (let i = 0; i < Math.min(s.rules.length, slots); i++) {
    const r = s.rules[i];
    if (!r.enabled) continue;
    if (!ruleCondition(s, r)) continue;
    ruleAction(s, r);
  }
}
function ruleCondition(s, r) {
  if (!r.when || r.when.res === 'always') return true;
  const v = s.res[r.when.res] || 0;
  return r.when.cmp === '>=' ? v >= r.when.val : v <= r.when.val;
}
function ruleAction(s, r) {
  const a = r.action;
  switch (a.type) {
    case 'buyBuilding': return buyBuilding(s, a.target, 1);
    case 'buyConverter': return buyConverter(s, a.target, 1);
    case 'recruit': return recruit(s);
    case 'sellSurplus': {
      const keep = a.keep || 0;
      const excess = (s.res[a.target] || 0) - keep;
      if (excess > 0) return sellRes(s, a.target, excess);
      return false;
    }
    case 'expedition': return launchExpedition(s);
  }
  return false;
}

// ---------------------------------------------------------------- offline
// Simulate elapsed wall-clock seconds of absence. Returns a report object.
export function runOffline(s, elapsed) {
  const cap = offlineCapSecs(s);
  const counted = Math.min(elapsed, cap);
  let effective = counted <= D.OFFLINE_FULL_RATE_SECS
    ? counted
    : D.OFFLINE_FULL_RATE_SECS + (counted - D.OFFLINE_FULL_RATE_SECS) * D.OFFLINE_DECAY_RATE;

  const before = {
    res: { ...s.res },
    levels: Object.fromEntries(D.JOBS.map(j => [j.id, s.jobs[j.id].level])),
    floor: s.spire.floor,
    expeditions: s.stats.expeditions,
  };

  let remaining = effective;
  const CHUNK = 30;
  while (remaining > 0) {
    const dt = Math.min(CHUNK, remaining);
    tick(s, dt);
    remaining -= dt;
  }

  const gains = {};
  for (const r of D.RESOURCES) {
    const d = s.res[r.id] - before.res[r.id];
    if (Math.abs(d) >= 0.5) gains[r.id] = d;
  }
  const levels = {};
  for (const j of D.JOBS) {
    const d = s.jobs[j.id].level - before.levels[j.id];
    if (d > 0) levels[j.id] = d;
  }
  return {
    elapsed, counted, effective,
    gains, levels,
    floors: s.spire.floor - before.floor,
    expeditions: s.stats.expeditions - before.expeditions,
  };
}
