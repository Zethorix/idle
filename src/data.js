// Rootspire — content definitions. All balance numbers live in this file.

export const RESOURCES = [
  { id: 'food',    name: 'Food',    icon: '🍎', tier: 0 },
  { id: 'wood',    name: 'Wood',    icon: '🪵', tier: 0 },
  { id: 'stone',   name: 'Stone',   icon: '🪨', tier: 0 },
  { id: 'ore',     name: 'Ore',     icon: '⛰️', tier: 1 },
  { id: 'hide',    name: 'Hide',    icon: '🦌', tier: 1 },
  { id: 'herbs',   name: 'Herbs',   icon: '🌿', tier: 1 },
  { id: 'metal',   name: 'Metal',   icon: '🔩', tier: 2 },
  { id: 'leather', name: 'Leather', icon: '🥾', tier: 2 },
  { id: 'tonic',   name: 'Tonic',   icon: '🧪', tier: 2 },
  { id: 'tools',   name: 'Tools',   icon: '🔨', tier: 3 },
  { id: 'gear',    name: 'Gear',    icon: '⚔️', tier: 3 },
  { id: 'coins',   name: 'Coins',   icon: '🪙', tier: 4 },
  { id: 'essence', name: 'Essence', icon: '✨', tier: 5 },
];
export const RES = Object.fromEntries(RESOURCES.map(r => [r.id, r]));

// ---------------------------------------------------------------- Jobs
// Villagers assigned to a job produce `yield` per second per villager,
// scaled by 1.06^(level-1), equipment tier (×2 each) and the global multiplier.
// XP: 1 xp/sec per assigned villager (× insight blessing).
export const JOBS = [
  { id: 'forage',    name: 'Forager',   icon: '🧺', verb: 'foraging',  yield: { food: 0.8 } },
  { id: 'logging',   name: 'Logger',    icon: '🪓', verb: 'logging',   yield: { wood: 0.5 } },
  { id: 'quarry',    name: 'Quarrier',  icon: '⛏️', verb: 'quarrying', yield: { stone: 0.35 },
    unlock: s => (s.buildings.stonePit || 0) > 0 || s.res.stone >= 10 },
  { id: 'hunting',   name: 'Hunter',    icon: '🏹', verb: 'hunting',   yield: { hide: 0.2, food: 0.2 },
    unlock: s => s.unlocked.tier1 },
  { id: 'herbalism', name: 'Herbalist', icon: '🌿', verb: 'gathering herbs', yield: { herbs: 0.25 },
    unlock: s => s.unlocked.tier1 },
  { id: 'mining',    name: 'Miner',     icon: '⛰️', verb: 'mining',    yield: { ore: 0.4 },
    unlock: s => s.unlocked.tier1 },
];
export const JOB = Object.fromEntries(JOBS.map(j => [j.id, j]));

export const JOB_LEVEL_MULT = 1.06;        // yield ×1.06 per level
export const XP_BASE = 40;                 // xp to reach level 2
export function xpToNext(level) {          // xp needed to go from `level` to `level+1`
  return Math.round(XP_BASE * Math.pow(2, (level - 1) / 7));
}

// Equipment tracks: tier t (0-based owned count) costs base × 5^t, doubles job yield.
export const JOB_EQUIP = {
  forage:    { name: 'Foraging baskets', cost: { tools: 4 } },
  logging:   { name: 'Felling axes',     cost: { tools: 5 } },
  quarry:    { name: 'Quarry picks',     cost: { tools: 5 } },
  hunting:   { name: 'Hunting bows',     cost: { tools: 6, gear: 1 } },
  herbalism: { name: 'Herb sickles',     cost: { tools: 5 } },
  mining:    { name: 'Mining drills',    cost: { tools: 6 } },
};
export const EQUIP_COST_MULT = 5;
export const EQUIP_YIELD_MULT = 2;

// ---------------------------------------------------------------- Buildings
// Passive generators. cost scales ×costMult per owned. Milestones double output.
export const MILESTONES = [10, 25, 50, 100, 200, 400, 800];

export const BUILDINGS = [
  { id: 'garden',     name: 'Garden',        icon: '🌻', desc: 'A tended plot at the camp edge.',
    prod: { food: 0.4 },  cost: { wood: 15 },                    costMult: 1.15 },
  { id: 'lumberCamp', name: 'Lumber camp',   icon: '🪚', desc: 'Saw pits and drying racks.',
    prod: { wood: 0.25 }, cost: { food: 25 },                    costMult: 1.15,
    unlock: s => (s.buildings.garden || 0) >= 1 },
  { id: 'stonePit',   name: 'Stone pit',     icon: '🧱', desc: 'An open quarry face.',
    prod: { stone: 0.2 }, cost: { wood: 60, food: 30 },          costMult: 1.15,
    unlock: s => (s.buildings.lumberCamp || 0) >= 1 },
  { id: 'cabin',      name: 'Cabin',         icon: '🏠', desc: 'Room for two more villagers.',
    prod: {}, housing: 2, cost: { wood: 100, stone: 20 },        costMult: 1.35,
    unlock: s => (s.buildings.stonePit || 0) >= 1 || s.res.stone >= 20 },
  { id: 'trapline',   name: 'Trap line',     icon: '🪤', desc: 'Snares along the game trails.',
    prod: { hide: 0.12 }, cost: { wood: 250, stone: 100 },       costMult: 1.15,
    unlock: s => s.unlocked.tier1 },
  { id: 'herbPatch',  name: 'Herb patch',    icon: '🌿', desc: 'Shade cloth over wild growth.',
    prod: { herbs: 0.15 }, cost: { wood: 300, stone: 120 },      costMult: 1.15,
    unlock: s => s.unlocked.tier1 },
  { id: 'mineShaft',  name: 'Mine shaft',    icon: '🕳️', desc: 'Timbered tunnel into the roots.',
    prod: { ore: 0.3 },   cost: { wood: 500, stone: 250 },       costMult: 1.15,
    unlock: s => s.unlocked.tier1 },
  // Tier 2 generators — unlocked by Spire floor 2. ~12× cost class, ~8-10× output.
  { id: 'orchard',    name: 'Orchard',       icon: '🍏', desc: 'Grafted rootstock, heavy boughs.',
    prod: { food: 4 },    cost: { wood: 9000, tools: 15 },       costMult: 1.15,
    unlock: s => s.spire.floor >= 2 },
  { id: 'sawmill',    name: 'Sawmill',       icon: '🏭', desc: 'Water-driven blades.',
    prod: { wood: 2.5 },  cost: { stone: 9000, metal: 40 },      costMult: 1.15,
    unlock: s => s.spire.floor >= 2 },
  { id: 'deepQuarry', name: 'Deep quarry',   icon: '🏔️', desc: 'Terraced galleries of cut stone.',
    prod: { stone: 2 },   cost: { wood: 14000, tools: 25 },      costMult: 1.15,
    unlock: s => s.spire.floor >= 2 },
  { id: 'deepMine',   name: 'Deep mine',     icon: '💎', desc: 'Veins that glitter oddly.',
    prod: { ore: 3.5 },   cost: { stone: 20000, tools: 40 },     costMult: 1.15,
    unlock: s => s.spire.floor >= 2 },
  { id: 'ranch',      name: 'Ranch',         icon: '🐄', desc: 'Penned herds, steady hides.',
    prod: { hide: 1.2, food: 2 }, cost: { wood: 30000, gear: 10 }, costMult: 1.15,
    unlock: s => s.spire.floor >= 3 },
  { id: 'greenhouse', name: 'Greenhouse',    icon: '🪴', desc: 'Glass panes fog with green breath.',
    prod: { herbs: 1.5 }, cost: { stone: 30000, metal: 150 },    costMult: 1.15,
    unlock: s => s.spire.floor >= 3 },
];
export const BUILDING = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));

// ---------------------------------------------------------------- Converters
// Continuous conversion: each unit performs count/cycle cycles per second,
// throttled by input availability (utilization shown in UI).
export const CONVERTERS = [
  { id: 'smelter',  name: 'Smelter',  icon: '🔥', desc: 'Ore in, metal out.',
    cycle: 10, input: { ore: 6, wood: 4 },   output: { metal: 1 },
    cost: { stone: 400, wood: 200 },  costMult: 1.2,
    unlock: s => s.unlocked.tier1 },
  { id: 'tannery',  name: 'Tannery',  icon: '👝', desc: 'Hides cure on long racks.',
    cycle: 8,  input: { hide: 5 },           output: { leather: 1 },
    cost: { wood: 350, stone: 150 },  costMult: 1.2,
    unlock: s => s.unlocked.tier1 },
  { id: 'still',    name: 'Still',    icon: '⚗️', desc: 'Herbs boil down to fortifying tonic.',
    cycle: 8,  input: { herbs: 6, food: 4 }, output: { tonic: 1 },
    cost: { wood: 350, stone: 150 },  costMult: 1.2,
    unlock: s => s.unlocked.tier1 },
  { id: 'workshop', name: 'Workshop', icon: '🛠️', desc: 'Handles, hafts, and honed edges.',
    cycle: 15, input: { metal: 2, wood: 20 }, output: { tools: 1 },
    cost: { stone: 900, metal: 10 },  costMult: 1.25,
    unlock: s => (s.converters.smelter?.count || 0) >= 1 },
  { id: 'forge',    name: 'Forge',    icon: '⚒️', desc: 'Expedition gear: plated, strapped, tested.',
    cycle: 20, input: { metal: 3, leather: 2 }, output: { gear: 1 },
    cost: { stone: 1500, metal: 25 }, costMult: 1.25,
    unlock: s => (s.converters.workshop?.count || 0) >= 1 },
];
export const CONVERTER = Object.fromEntries(CONVERTERS.map(c => [c.id, c]));

// ---------------------------------------------------------------- Market
// Sell price in coins per unit. Buying costs 4× the sell price.
export const SELL_PRICE = {
  food: 0.5, wood: 0.8, stone: 1, ore: 2, hide: 3, herbs: 3,
  metal: 12, leather: 15, tonic: 15, tools: 40, gear: 60,
};
export const BUY_MARKUP = 4;

// ---------------------------------------------------------------- Villagers
export const BASE_HOUSING = 2;
export function recruitCost(current) {     // cost of villager number current+1
  const n = current;                        // 1st villager is free (starting)
  const cost = { food: Math.round(100 * Math.pow(1.5, n - 1)) };
  if (n >= 4) cost.coins = Math.round(40 * Math.pow(1.5, n - 4));
  return cost;
}

export const VILLAGER_NAMES = [
  'Bram', 'Isolde', 'Fenn', 'Maera', 'Oswin', 'Tilda', 'Corvin', 'Ysra',
  'Dagny', 'Halvar', 'Petra', 'Roan', 'Sable', 'Ulf', 'Verena', 'Wren',
  'Aldous', 'Briar', 'Cassia', 'Doran', 'Edda', 'Falk', 'Greta', 'Hakon',
  'Ines', 'Jorun', 'Kelda', 'Leif', 'Mirren', 'Nils', 'Odile', 'Piet',
  'Quenna', 'Rurik', 'Signe', 'Tamsin', 'Uwe', 'Vika', 'Wulf', 'Yrsa',
];

// ---------------------------------------------------------------- Upgrades
// One-off purchases (some multi-tier). effect keys are read by the engine.
export const UPGRADES = [
  { id: 'sharpKnives', name: 'Sharp knives', icon: '🔪', tiers: 4,
    desc: 'Manual gathering yields ×2.',
    cost: t => scaleCost({ food: 50, wood: 50 }, 8, t),
    unlock: s => s.stats.clicks >= 15 },
  { id: 'handcarts', name: 'Handcarts', icon: '🛒', tiers: 3,
    desc: 'All buildings produce +50%.',
    cost: t => scaleCost({ wood: 400, stone: 150 }, 12, t),
    unlock: s => totalBuildings(s) >= 10 },
  { id: 'whetstones', name: 'Whetstones', icon: '🗡️', tiers: 3,
    desc: 'All villager jobs yield +50%.',
    cost: t => scaleCost({ stone: 300, coins: 100 }, 12, t),
    unlock: s => s.villagers.length >= 3 },
  { id: 'bellows', name: 'Twin bellows', icon: '💨', tiers: 3,
    desc: 'Converters run +50% faster.',
    cost: t => scaleCost({ metal: 30, coins: 300 }, 10, t),
    unlock: s => (s.converters.smelter?.count || 0) >= 1 },
  { id: 'ledgers', name: 'Trade ledgers', icon: '📒', tiers: 2,
    desc: 'Market sell prices +50%.',
    cost: t => scaleCost({ coins: 500 }, 20, t),
    unlock: s => s.stats.coinsEarned >= 200 },
  { id: 'packMules', name: 'Pack mules', icon: '🫏', tiers: 2,
    desc: 'Expeditions need 25% less food.',
    cost: t => scaleCost({ food: 5000, coins: 400 }, 15, t),
    unlock: s => s.unlocked.spire },
  { id: 'spireMaps', name: 'Spire maps', icon: '🗺️', tiers: 5,
    desc: 'Expedition progress +40%.',
    cost: t => scaleCost({ coins: 800, tonic: 20 }, 8, t),
    unlock: s => s.spire.floor >= 1 },
];
export const UPGRADE = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

function scaleCost(base, mult, tier) {
  const out = {};
  for (const k in base) out[k] = Math.round(base[k] * Math.pow(mult, tier));
  return out;
}
function totalBuildings(s) {
  let n = 0;
  for (const k in s.buildings) n += s.buildings[k];
  return n;
}

// ---------------------------------------------------------------- The Spire
// Expeditions add progress to the current floor. floor is 0-based internally;
// shown 1-based. Completing floor index f grants ×FLOOR_MULT global production
// (SANCTUM_MULT extra on every 5th shown floor), essence, and unlocks.
export const FLOOR_MULT = 1.25;
export const SANCTUM_MULT = 2;

export function expeditionCost(f, s) {
  const foodMult = Math.pow(0.75, (s?.upgrades.packMules || 0));
  return {
    gear: Math.ceil(2 * Math.pow(1.3, f)),
    tonic: Math.ceil(3 * Math.pow(1.25, f)),
    food: Math.round(150 * Math.pow(1.3, f) * foodMult),
  };
}
export function expeditionDuration(f) { return Math.round(150 * Math.pow(1.09, f)); }
export function expeditionProgress(f, s) {
  const maps = 1 + 0.4 * (s?.upgrades.spireMaps || 0);
  const valor = Math.pow(1.25, s?.blessings.valor || 0);
  return 25 * maps * valor;
}
export function floorNeed(f) { return Math.round(400 * Math.pow(1.15, f)); }
export function expeditionEssence(f) { return 2 * (f + 1); }
export function floorEssence(f) { return 10 * (f + 1) * (f + 1); }

// Flavor + feature unlocks per completed floor (1-based shown floor).
export const FLOORS = {
  1:  { name: 'The Gatehouse',      grant: 'blessings',
        text: 'The doors were never locked. Essence pools in the threshold stones.' },
  2:  { name: 'The Root Cellars',   grant: 'tier2',
        text: 'Provision vaults older than any kingdom. Their designs are yours now.' },
  3:  { name: 'The Winding Stair',  grant: 'foreman',
        text: 'A brass ledger-engine sits abandoned. Your foreman claims it.' },
  4:  { name: 'The Undercroft',     grant: 'offline12',
        text: 'The camp learns to run itself while you sleep.' },
  5:  { name: 'The First Sanctum',  grant: 'autoexpedition',
        text: 'A resonance settles over the camp. Everything moves twice as sure.' },
  6:  { name: 'The Hanging Yards',  grant: null,
        text: 'Gardens grow sideways from the wall, indifferent to gravity.' },
  7:  { name: 'The Bell Gallery',   grant: 'offline24',
        text: 'Bells with no ringers. They sound when you leave and when you return.' },
  8:  { name: 'The Cartographers',  grant: null,
        text: 'Maps of floors you have not reached. Some are maps of years.' },
  10: { name: 'The Second Sanctum', grant: null,
        text: 'The Spire notices you. Production hums at a new pitch.' },
  15: { name: 'The Third Sanctum',  grant: null,
        text: 'Below, the camp glitters like a hearth. Above, the dark is warm.' },
  20: { name: 'The Fourth Sanctum', grant: null,
        text: 'Clouds pass beneath the windows now.' },
  25: { name: 'The Fifth Sanctum',  grant: null,
        text: 'The stairs no longer creak. They chime.' },
  30: { name: 'The Summit Gate',    grant: null,
        text: 'A gate of pale wood, ajar. Beyond it — more stairs. Of course there are.' },
};

// ---------------------------------------------------------------- Blessings
// Permanent, repeatable essence purchases. Never reset.
export const BLESSINGS = [
  { id: 'vigor',    name: 'Blessing of Vigor',    icon: '💪',
    desc: '+25% all production per rank.',
    base: 10, mult: 1.7 },
  { id: 'haste',    name: 'Blessing of Haste',    icon: '⚡',
    desc: '+20% converter speed per rank.',
    base: 15, mult: 1.7 },
  { id: 'insight',  name: 'Blessing of Insight',  icon: '🧠',
    desc: '+50% job XP per rank.',
    base: 10, mult: 1.7 },
  { id: 'valor',    name: 'Blessing of Valor',    icon: '🛡️',
    desc: '+25% expedition progress per rank.',
    base: 20, mult: 1.7 },
  { id: 'patience', name: 'Blessing of Patience', icon: '⏳',
    desc: '+4 hours offline cap per rank.',
    base: 25, mult: 2.0, max: 8 },
  { id: 'foresight', name: 'Blessing of Foresight', icon: '👁️',
    desc: '+1 Foreman rule slot per rank.',
    base: 30, mult: 2.5, max: 9 },
];
export const BLESSING = Object.fromEntries(BLESSINGS.map(b => [b.id, b]));
export function blessingCost(b, rank) { return Math.round(b.base * Math.pow(b.mult, rank)); }

// ---------------------------------------------------------------- Offline
export const OFFLINE_FULL_RATE_SECS = 2 * 3600;   // full speed for first 2h
export const OFFLINE_DECAY_RATE = 0.85;           // then 85%
export const OFFLINE_BASE_CAP_HOURS = 8;          // extended by floor 4 (12), floor 7 (24), patience

// ---------------------------------------------------------------- Foreman
export const BASE_RULE_SLOTS = 4;
export const RULE_ACTIONS = [
  { id: 'buyBuilding',  name: 'Buy building',   icon: '🏗️' },
  { id: 'buyConverter', name: 'Buy converter',  icon: '⚙️' },
  { id: 'recruit',      name: 'Recruit villager', icon: '👤' },
  { id: 'sellSurplus',  name: 'Sell surplus of resource (down to threshold)', icon: '💰' },
  { id: 'expedition',   name: 'Launch expedition', icon: '🧭' },
];

// ---------------------------------------------------------------- Achievements
// Each earned achievement grants a permanent +2% global production.
export const ACHIEVEMENT_MULT = 1.02;
export const ACHIEVEMENTS = [
  { id: 'click1',    name: 'First handful',     desc: 'Gather once.',                     check: s => s.stats.clicks >= 1 },
  { id: 'click100',  name: 'Calloused hands',   desc: 'Gather 100 times.',                check: s => s.stats.clicks >= 100 },
  { id: 'click2500', name: 'Stubborn as roots', desc: 'Gather 2,500 times.',              check: s => s.stats.clicks >= 2500 },
  { id: 'bld1',      name: 'Groundbreaking',    desc: 'Construct a building.',            check: s => countBuildings(s) >= 1 },
  { id: 'bld50',     name: 'A proper town',     desc: 'Own 50 buildings.',                check: s => countBuildings(s) >= 50 },
  { id: 'bld250',    name: 'Sprawl',            desc: 'Own 250 buildings.',               check: s => countBuildings(s) >= 250 },
  { id: 'bld1000',   name: 'City at the roots', desc: 'Own 1,000 buildings.',             check: s => countBuildings(s) >= 1000 },
  { id: 'vill5',     name: 'Company',           desc: 'House 5 villagers.',               check: s => s.villagers.length >= 5 },
  { id: 'vill15',    name: 'A crowd',           desc: 'House 15 villagers.',              check: s => s.villagers.length >= 15 },
  { id: 'vill30',    name: 'A village',         desc: 'House 30 villagers.',              check: s => s.villagers.length >= 30 },
  { id: 'vill60',    name: 'A people',          desc: 'House 60 villagers.',              check: s => s.villagers.length >= 60 },
  { id: 'lvl10',     name: 'Apprentice',        desc: 'Reach job level 10.',              check: s => maxJobLevel(s) >= 10 },
  { id: 'lvl25',     name: 'Journeyman',        desc: 'Reach job level 25.',              check: s => maxJobLevel(s) >= 25 },
  { id: 'lvl50',     name: 'Master',            desc: 'Reach job level 50.',              check: s => maxJobLevel(s) >= 50 },
  { id: 'lvl100',    name: 'Beyond mastery',    desc: 'Reach job level 100.',             check: s => maxJobLevel(s) >= 100 },
  { id: 'metal1',    name: 'First ingot',       desc: 'Smelt metal.',                     check: s => s.lifetime.metal >= 1 },
  { id: 'tools1',    name: 'Tooled up',         desc: 'Craft tools.',                     check: s => s.lifetime.tools >= 1 },
  { id: 'gear1',     name: 'Outfitted',         desc: 'Forge expedition gear.',           check: s => s.lifetime.gear >= 1 },
  { id: 'coins1m',   name: 'Merchant prince',   desc: 'Earn 1M coins.',                   check: s => s.stats.coinsEarned >= 1e6 },
  { id: 'ess10k',    name: 'Steeped in essence', desc: 'Earn 10K essence.',               check: s => s.stats.essenceEarned >= 1e4 },
  { id: 'exp10',     name: 'Trailblazer',       desc: 'Complete 10 expeditions.',         check: s => s.stats.expeditions >= 10 },
  { id: 'exp50',     name: 'Spirefarer',        desc: 'Complete 50 expeditions.',         check: s => s.stats.expeditions >= 50 },
  { id: 'exp200',    name: 'The stairs know you', desc: 'Complete 200 expeditions.',      check: s => s.stats.expeditions >= 200 },
  { id: 'floor5',    name: 'First Sanctum',     desc: 'Conquer floor 5.',                 check: s => s.spire.floor >= 5 },
  { id: 'floor10',   name: 'Above the clouds',  desc: 'Conquer floor 10.',                check: s => s.spire.floor >= 10 },
  { id: 'floor20',   name: 'Thin air',          desc: 'Conquer floor 20.',                check: s => s.spire.floor >= 20 },
  { id: 'floor30',   name: 'The Summit Gate',   desc: 'Conquer floor 30.',                check: s => s.spire.floor >= 30 },
  { id: 'rally10',   name: 'Voice of the horn', desc: 'Rally the camp 10 times.',         check: s => (s.stats.rallies || 0) >= 10 },
];
function countBuildings(s) { let n = 0; for (const k in s.buildings) n += s.buildings[k]; return n; }
function maxJobLevel(s) { let m = 0; for (const k in s.jobs) m = Math.max(m, s.jobs[k].level); return m; }

// ---------------------------------------------------------------- Rally
// Active-play burst: ×RALLY_MULT all production for RALLY_SECS, then cooldown.
export const RALLY_MULT = 3;
export const RALLY_SECS = 90;
export const RALLY_COOLDOWN = 900;         // 15 min between uses (including active time)

// ---------------------------------------------------------------- Misc
export const CLICK_YIELD = { food: 1, wood: 1 };
export const TIER1_UNLOCK_STONE = 40;      // seeing this much stone reveals the wider world
