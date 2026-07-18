// Rootspire — DOM rendering. Build-once static structure + cheap per-frame
// text updates. No animations; progress bars are plain divs.

import * as D from './data.js';
import * as E from './engine.js';
import { fmt, fmtRes, fmtRate, fmtTime, fmtCost } from './format.js';

let S;                      // game state (shared reference)
let onAction = () => {};    // callback after any player action (for saving)
const $ = {};               // static element refs
const rows = { res: {}, bld: {}, cvt: {}, job: {}, upg: {}, bls: {}, mkt: {} };
let rulesDirty = true, logLen = -1, rosterKey = '';

// ---------------------------------------------------------------- helpers
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function btn(label, cls, fn) {
  const b = el('button', cls, label);
  b.addEventListener('click', () => { fn(); onAction(); });
  return b;
}
function bar(cls) {
  const outer = el('div', 'bar ' + (cls || ''));
  const fill = el('div', 'bar-fill');
  outer.appendChild(fill);
  outer._fill = fill;
  const label = el('div', 'bar-label');
  outer.appendChild(label);
  outer._label = label;
  return outer;
}
function setBar(b, frac, text) {
  const pct = Math.max(0, Math.min(100, frac * 100));
  b._fill.style.width = pct.toFixed(1) + '%';
  if (text !== undefined) b._label.textContent = text;
}
function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}
function show(node, visible) {
  const want = visible ? '' : 'none';
  if (node.style.display !== want) node.style.display = want;
}
function costAffordClass(cost) {
  return E.canAfford(S, cost) ? 'cost ok' : 'cost no';
}
// Longest time until every resource in `cost` is affordable at current rates.
function timeToAfford(cost) {
  const rates = S._info?.rates || {};
  let worst = 0;
  for (const k in cost) {
    const deficit = cost[k] - (S.res[k] || 0);
    if (deficit <= 0) continue;
    const r = rates[k] || 0;
    if (r <= 0) return Infinity;
    worst = Math.max(worst, deficit / r);
  }
  return worst;
}

function qtyNum() {
  const q = S.settings.buyQty;
  return q === 'max' ? 'max' : q;
}

// ---------------------------------------------------------------- shell
export function initUI(state, actionCb) {
  S = state;
  if (actionCb) onAction = actionCb;
  document.body.innerHTML = '';

  // Header
  const header = el('header');
  const title = el('div', 'title', 'ROOTSPIRE');
  $.floorChip = el('div', 'chip', '');
  $.multChip = el('div', 'chip', '');
  $.hint = el('div', 'hint', '');
  const spacer = el('div', 'spacer');
  const saveBtns = el('div', 'savebtns');
  saveBtns.append(
    btn('save', 'small', () => window.dispatchEvent(new Event('rs-save'))),
    btn('export', 'small', () => window.dispatchEvent(new Event('rs-export'))),
    btn('import', 'small', () => window.dispatchEvent(new Event('rs-import'))),
    btn('reset', 'small danger', () => window.dispatchEvent(new Event('rs-reset'))),
  );
  header.append(title, $.floorChip, $.multChip, $.hint, spacer, saveBtns);
  document.body.appendChild(header);

  // Layout
  const layout = el('div', 'layout');
  document.body.appendChild(layout);

  // Sidebar
  const side = el('aside');
  $.gather = btn('Gather (+1 food, +1 wood)', 'gather', () => E.doClick(S));
  side.appendChild($.gather);
  $.rally = btn('Rally the camp', 'gather rally', () => E.activateRally(S));
  side.appendChild($.rally);
  $.rallyBar = bar('rally');
  side.appendChild($.rallyBar);
  $.resTable = el('table', 'res-table');
  side.appendChild($.resTable);
  $.villSummary = el('div', 'vill-summary', '');
  side.appendChild($.villSummary);
  layout.appendChild(side);

  // Main: tabs + panels
  const main = el('main');
  $.tabbar = el('nav', 'tabs');
  main.appendChild($.tabbar);
  $.panels = el('div', 'panels');
  main.appendChild($.panels);
  layout.appendChild(main);

  makeTabs();
  buildCampPanel();
  buildJobsPanel();
  buildIndustryPanel();
  buildSpirePanel();
  buildForemanPanel();
  buildChroniclePanel();

  // Modal
  $.modal = el('div', 'modal-wrap');
  $.modal.style.display = 'none';
  $.modalBox = el('div', 'modal');
  $.modal.appendChild($.modalBox);
  $.modal.addEventListener('click', e => { if (e.target === $.modal) hideModal(); });
  document.body.appendChild($.modal);

  selectTab(S._tab || 'camp');
  updateUI();
}

const TABS = [
  { id: 'camp',      name: 'Camp',      when: s => s.unlocked.buildings },
  { id: 'jobs',      name: 'Villagers', when: s => s.unlocked.villagers },
  { id: 'industry',  name: 'Industry',  when: s => s.unlocked.tier1 },
  { id: 'spire',     name: 'Spire',     when: s => s.unlocked.spire },
  { id: 'foreman',   name: 'Foreman',   when: s => s.unlocked.foreman },
  { id: 'chronicle', name: 'Chronicle', when: () => true },
];

function makeTabs() {
  $.tabs = {};
  for (const t of TABS) {
    const b = el('button', 'tab', t.name);
    b.addEventListener('click', () => selectTab(t.id));
    $.tabbar.appendChild(b);
    $.tabs[t.id] = b;
  }
}
function selectTab(id) {
  S._tab = id;
  for (const t of TABS) {
    $.tabs[t.id].classList.toggle('active', t.id === id);
    show($.panelEls[t.id], t.id === id);
  }
}

// ---------------------------------------------------------------- panels
$.panelEls = {};
function panel(id) {
  const p = el('section', 'panel');
  $.panelEls[id] = p;
  // panels object may not exist yet during initUI ordering; append later
  return p;
}

function section(parent, titleText, hintText) {
  const s = el('div', 'section');
  const h = el('h2', null, titleText);
  s.appendChild(h);
  if (hintText) s.appendChild(el('div', 'section-hint', hintText));
  parent.appendChild(s);
  return s;
}

// ----- Camp
function buildCampPanel() {
  const p = panel('camp');
  $.panels.appendChild(p);

  // Buy-quantity selector
  const qtyRow = el('div', 'qty-row');
  qtyRow.appendChild(el('span', 'qty-label', 'Buy'));
  $.qtyBtns = {};
  for (const q of [1, 10, 25, 'max']) {
    const b = el('button', 'qty', q === 'max' ? 'Max' : '×' + q);
    b.addEventListener('click', () => { S.settings.buyQty = q; });
    qtyRow.appendChild(b);
    $.qtyBtns[q] = b;
  }
  p.appendChild(qtyRow);

  $.bldSection = section(p, 'Buildings');
  $.upgSection = section(p, 'Upgrades');

  for (const b of D.BUILDINGS) {
    const r = buildingRow(b);
    $.bldSection.appendChild(r.root);
    rows.bld[b.id] = r;
  }
  for (const u of D.UPGRADES) {
    const r = upgradeRow(u);
    $.upgSection.appendChild(r.root);
    rows.upg[u.id] = r;
  }
}

function buildingRow(b) {
  const root = el('div', 'card');
  const top = el('div', 'card-top');
  const name = el('span', 'card-name', b.name);
  const owned = el('span', 'owned', '');
  const buy = btn('Buy', 'buy', () => E.buyBuilding(S, b.id, qtyNum()));
  top.append(name, owned, el('span', 'spacer'), buy);
  root.appendChild(top);
  const desc = el('div', 'card-desc', b.desc);
  root.appendChild(desc);
  const prod = el('div', 'card-info', '');
  root.appendChild(prod);
  const cost = el('div', 'card-info', '');
  root.appendChild(cost);
  return { root, owned, buy, prod, cost, def: b };
}

function updateBuildingRow(r) {
  const b = r.def;
  const visible = (!b.unlock || b.unlock(S) || (S.buildings[b.id] || 0) > 0);
  show(r.root, visible);
  if (!visible) return;
  const count = S.buildings[b.id] || 0;
  setText(r.owned, count ? `× ${count}` : '');

  const parts = [];
  if (Object.keys(b.prod).length) {
    const bm = E.buildingMult(S) * E.milestoneMult(count);
    const per = Object.entries(b.prod)
      .map(([k, v]) => `${fmtRate(v * bm)} ${D.RES[k].name}`).join(', ');
    parts.push(`each: ${per}`);
    const nm = E.nextMilestone(count);
    if (nm) parts.push(`×2 at ${nm} owned`);
  }
  if (b.housing) parts.push(`+${b.housing} housing each`);
  setText(r.prod, parts.join(' · '));

  const q = qtyNum();
  const n = q === 'max' ? Math.max(1, E.maxAffordable(S, b.cost, b.costMult, count)) : q;
  const cost = E.bulkCost(b.cost, b.costMult, count, n);
  const afford = E.canAfford(S, cost);
  let costText = `cost ×${n}: ${fmtCost(cost, D.RES)}`;
  if (!afford) {
    const t = timeToAfford(cost);
    costText += isFinite(t) ? ` — ready in ${fmtTime(t)}` : '';
  }
  setText(r.cost, costText);
  r.cost.className = afford ? 'card-info cost-ok' : 'card-info cost-no';
  r.buy.disabled = !afford;
  setText(r.buy, q === 'max' ? `Buy ${n}` : `Buy ${n}`);
}

function upgradeRow(u) {
  const root = el('div', 'card');
  const top = el('div', 'card-top');
  const name = el('span', 'card-name', u.name);
  const tier = el('span', 'owned', '');
  const buy = btn('Buy', 'buy', () => E.buyUpgrade(S, u.id));
  top.append(name, tier, el('span', 'spacer'), buy);
  root.appendChild(top);
  root.appendChild(el('div', 'card-desc', u.desc));
  const cost = el('div', 'card-info', '');
  root.appendChild(cost);
  return { root, tier, buy, cost, def: u };
}

function updateUpgradeRow(r) {
  const u = r.def;
  const bought = S.upgrades[u.id] || 0;
  const visible = bought > 0 || !u.unlock || u.unlock(S);
  show(r.root, visible);
  if (!visible) return;
  setText(r.tier, u.tiers > 1 ? `${bought}/${u.tiers}` : (bought ? 'owned' : ''));
  if (bought >= u.tiers) {
    setText(r.cost, 'complete');
    r.cost.className = 'card-info cost-done';
    r.buy.disabled = true;
    setText(r.buy, 'Max');
    return;
  }
  const cost = u.cost(bought);
  const afford = E.canAfford(S, cost);
  setText(r.cost, `cost: ${fmtCost(cost, D.RES)}`);
  r.cost.className = afford ? 'card-info cost-ok' : 'card-info cost-no';
  r.buy.disabled = !afford;
  setText(r.buy, 'Buy');
}

// ----- Villagers / Jobs
function buildJobsPanel() {
  const p = panel('jobs');
  $.panels.appendChild(p);

  const recSec = section(p, 'Camp roster');
  const recRow = el('div', 'card');
  const top = el('div', 'card-top');
  $.villCount = el('span', 'card-name', '');
  $.recruitBtn = btn('Recruit', 'buy', () => E.recruit(S));
  top.append($.villCount, el('span', 'spacer'), $.recruitBtn);
  recRow.appendChild(top);
  $.recruitCost = el('div', 'card-info', '');
  recRow.appendChild($.recruitCost);
  recSec.appendChild(recRow);
  $.roster = el('div', 'roster', '');
  recSec.appendChild($.roster);

  const jobSec = section(p, 'Jobs',
    'Assign villagers to work. Jobs level up with time worked; each level compounds yield ×1.06.');
  for (const j of D.JOBS) {
    const r = jobRow(j);
    jobSec.appendChild(r.root);
    rows.job[j.id] = r;
  }
}

function jobRow(j) {
  const root = el('div', 'card');
  const top = el('div', 'card-top');
  const name = el('span', 'card-name', j.name);
  const lvl = el('span', 'owned', '');
  const minus = btn('−', 'adj', () => E.assignJob(S, j.id, -1));
  const count = el('span', 'assign-count', '0');
  const plus = btn('+', 'adj', () => E.assignJob(S, j.id, +1));
  const plus5 = btn('+5', 'adj', () => E.assignJob(S, j.id, +5));
  top.append(name, lvl, el('span', 'spacer'), minus, count, plus, plus5);
  root.appendChild(top);
  const info = el('div', 'card-info', '');
  root.appendChild(info);
  const xpBar = bar('xp');
  root.appendChild(xpBar);
  const equipRow = el('div', 'card-top');
  const equipInfo = el('div', 'card-info', '');
  const equipBtn = btn('Upgrade', 'buy small', () => E.buyEquip(S, j.id));
  equipRow.append(equipInfo, el('span', 'spacer'), equipBtn);
  root.appendChild(equipRow);
  return { root, lvl, count, info, xpBar, equipInfo, equipBtn, minus, plus, plus5, def: j };
}

function updateJobRow(r) {
  const j = r.def;
  const js = S.jobs[j.id];
  const visible = !j.unlock || j.unlock(S) || js.assigned > 0;
  show(r.root, visible);
  if (!visible) return;
  setText(r.lvl, `Lv ${js.level}`);
  setText(r.count, String(js.assigned));
  const ym = E.jobYieldMult(S, j.id);
  const per = Object.entries(j.yield)
    .map(([k, v]) => `${fmtRate(v * ym)} ${D.RES[k].name}`).join(', ');
  setText(r.info, `each villager: ${per}`);
  const need = D.xpToNext(js.level);
  setBar(r.xpBar, js.xp / need, `XP ${fmt(Math.floor(js.xp))} / ${fmt(need)}`);
  const idle = E.idleVillagers(S);
  r.plus.disabled = idle < 1;
  r.plus5.disabled = idle < 1;
  r.minus.disabled = js.assigned < 1;

  const eq = D.JOB_EQUIP[j.id];
  const tier = S.equip[j.id] || 0;
  const cost = E.equipCost(S, j.id);
  const afford = E.canAfford(S, cost);
  setText(r.equipInfo, `${eq.name} tier ${tier} — next: ×2 yield, ${fmtCost(cost, D.RES)}`);
  r.equipInfo.className = afford ? 'card-info cost-ok' : 'card-info cost-no';
  r.equipBtn.disabled = !afford;
}

function updateRoster() {
  // Assign villagers to jobs in roster order for display flavor.
  const names = S.villagers.map(v => v.name);
  const assignment = [];
  let i = 0;
  for (const j of D.JOBS) {
    for (let k = 0; k < S.jobs[j.id].assigned && i < names.length; k++, i++) {
      assignment.push(`${names[i]} — ${j.verb}`);
    }
  }
  for (; i < names.length; i++) assignment.push(`${names[i]} — idle`);
  const key = assignment.join('|');
  if (key === rosterKey) return;
  rosterKey = key;
  $.roster.textContent = '';
  for (const a of assignment) $.roster.appendChild(el('div', 'roster-row', a));
}

// ----- Industry
function buildIndustryPanel() {
  const p = panel('industry');
  $.panels.appendChild(p);
  $.cvtSection = section(p, 'Converters',
    'Converters run continuously while inputs last. The bar shows utilization.');
  for (const c of D.CONVERTERS) {
    const r = converterRow(c);
    $.cvtSection.appendChild(r.root);
    rows.cvt[c.id] = r;
  }
  $.mktSection = section(p, 'Market', 'Traders buy anything. They sell at 4× the price.');
  $.mktTable = el('table', 'mkt-table');
  $.mktSection.appendChild($.mktTable);
  for (const r of D.RESOURCES) {
    if (!D.SELL_PRICE[r.id]) continue;
    const row = marketRow(r);
    $.mktTable.appendChild(row.root);
    rows.mkt[r.id] = row;
  }
}

function converterRow(c) {
  const root = el('div', 'card');
  const top = el('div', 'card-top');
  const name = el('span', 'card-name', c.name);
  const owned = el('span', 'owned', '');
  const toggle = btn('on', 'toggle', () => {
    const cv = S.converters[c.id];
    if (cv) cv.on = !cv.on;
  });
  const buy = btn('Buy', 'buy', () => E.buyConverter(S, c.id, qtyNum()));
  top.append(name, owned, toggle, el('span', 'spacer'), buy);
  root.appendChild(top);
  root.appendChild(el('div', 'card-desc', c.desc));
  const io = el('div', 'card-info', '');
  root.appendChild(io);
  const util = bar('util');
  root.appendChild(util);
  const cost = el('div', 'card-info', '');
  root.appendChild(cost);
  return { root, owned, toggle, buy, io, util, cost, def: c };
}

function updateConverterRow(r) {
  const c = r.def;
  const cv = S.converters[c.id];
  const count = cv?.count || 0;
  const visible = count > 0 || !c.unlock || c.unlock(S);
  show(r.root, visible);
  if (!visible) return;
  setText(r.owned, count ? `× ${count}` : '');
  show(r.toggle, count > 0);
  if (count) {
    setText(r.toggle, cv.on ? 'on' : 'off');
    r.toggle.classList.toggle('off', !cv.on);
  }
  const speed = E.converterSpeedMult(S);
  const inS = Object.entries(c.input).map(([k, v]) => `${fmt(v)} ${D.RES[k].name}`).join(' + ');
  const outS = Object.entries(c.output).map(([k, v]) => `${fmt(v)} ${D.RES[k].name}`).join(' + ');
  setText(r.io, `${inS} → ${outS} every ${fmtTime(c.cycle / speed)} (each)`);
  const u = S._info?.util?.[c.id] ?? 0;
  show(r.util, count > 0);
  if (count) setBar(r.util, u, cv.on ? `${Math.round(u * 100)}% utilization` : 'off');

  const q = qtyNum();
  const n = q === 'max' ? Math.max(1, E.maxAffordable(S, c.cost, c.costMult, count)) : q;
  const cost = E.bulkCost(c.cost, c.costMult, count, n);
  const afford = E.canAfford(S, cost);
  setText(r.cost, `cost ×${n}: ${fmtCost(cost, D.RES)}`);
  r.cost.className = afford ? 'card-info cost-ok' : 'card-info cost-no';
  r.buy.disabled = !afford;
  setText(r.buy, `Buy ${n}`);
}

function marketRow(res) {
  const root = el('tr');
  const name = el('td', 'mkt-name', res.name);
  const price = el('td', 'mkt-price', '');
  const cells = el('td', 'mkt-btns');
  const mk = (label, fn) => cells.appendChild(btn(label, 'small', fn));
  mk('sell 100', () => E.sellRes(S, res.id, 100));
  mk('sell half', () => E.sellRes(S, res.id, Math.floor((S.res[res.id] || 0) / 2)));
  mk('sell all', () => E.sellRes(S, res.id, S.res[res.id] || 0));
  mk('buy 100', () => E.buyRes(S, res.id, 100));
  root.append(name, price, cells);
  return { root, price, def: res };
}

function updateMarketRow(r) {
  const visible = S.lifetime[r.def.id] > 0;
  show(r.root, visible);
  if (!visible) return;
  const p = D.SELL_PRICE[r.def.id] * E.sellPriceMult(S);
  setText(r.price, `${fmt(p)}c / buy ${fmt(D.SELL_PRICE[r.def.id] * D.BUY_MARKUP)}c`);
}

// ----- Spire
function buildSpirePanel() {
  const p = panel('spire');
  $.panels.appendChild(p);

  const climb = section(p, 'The Climb');
  $.floorTitle = el('div', 'floor-title', '');
  climb.appendChild($.floorTitle);
  $.floorText = el('div', 'card-desc', '');
  climb.appendChild($.floorText);
  $.floorBar = bar('floor');
  climb.appendChild($.floorBar);
  $.floorReward = el('div', 'card-info', '');
  climb.appendChild($.floorReward);

  const exp = section(p, 'Expedition');
  $.expInfo = el('div', 'card-info', '');
  exp.appendChild($.expInfo);
  $.expBar = bar('exp');
  exp.appendChild($.expBar);
  const row = el('div', 'card-top');
  $.expBtn = btn('Launch expedition', 'buy big', () => E.launchExpedition(S));
  $.expAuto = el('label', 'auto-label');
  $.expAutoBox = el('input');
  $.expAutoBox.type = 'checkbox';
  $.expAutoBox.addEventListener('change', () => { S.spire.autoRepeat = $.expAutoBox.checked; });
  $.expAuto.append($.expAutoBox, document.createTextNode(' auto-repeat'));
  row.append($.expBtn, $.expAuto);
  exp.appendChild(row);

  $.blsSection = section(p, 'Blessings',
    'Permanent. Essence spent here is never lost to a reset — there are no resets.');
  for (const b of D.BLESSINGS) {
    const r = blessingRow(b);
    $.blsSection.appendChild(r.root);
    rows.bls[b.id] = r;
  }
}

function blessingRow(b) {
  const root = el('div', 'card');
  const top = el('div', 'card-top');
  const name = el('span', 'card-name', b.name);
  const rank = el('span', 'owned', '');
  const buy = btn('Buy', 'buy', () => E.buyBlessing(S, b.id));
  top.append(name, rank, el('span', 'spacer'), buy);
  root.appendChild(top);
  root.appendChild(el('div', 'card-desc', b.desc));
  const cost = el('div', 'card-info', '');
  root.appendChild(cost);
  return { root, rank, buy, cost, def: b };
}

function updateBlessingRow(r) {
  const b = r.def;
  const rank = S.blessings[b.id] || 0;
  setText(r.rank, `rank ${rank}${b.max ? '/' + b.max : ''}`);
  if (b.max && rank >= b.max) {
    setText(r.cost, 'complete');
    r.cost.className = 'card-info cost-done';
    r.buy.disabled = true;
    return;
  }
  const cost = D.blessingCost(b, rank);
  const afford = (S.res.essence || 0) >= cost;
  setText(r.cost, `cost: ${fmt(cost)} Essence`);
  r.cost.className = afford ? 'card-info cost-ok' : 'card-info cost-no';
  r.buy.disabled = !afford;
}

function updateSpirePanel() {
  const f = S.spire.floor;
  const fl = D.FLOORS[f + 1];
  setText($.floorTitle, `Floor ${f + 1}${fl ? ' — ' + fl.name : ''}`);
  setText($.floorText, f === 0
    ? 'The first door stands open. Progress is permanent: each floor conquered empowers everything, forever.'
    : `Conquered floors: ${f}. Every floor multiplies all production ×${D.FLOOR_MULT}, every 5th ×${D.SANCTUM_MULT} more.`);
  const need = D.floorNeed(f);
  setBar($.floorBar, S.spire.progress / need,
    `progress ${fmt(Math.floor(S.spire.progress))} / ${fmt(need)}`);
  setText($.floorReward,
    `on completion: all production ×${D.FLOOR_MULT}` +
    ((f + 1) % 5 === 0 ? ` ×${D.SANCTUM_MULT} (Sanctum)` : '') +
    `, +${fmt(D.floorEssence(f))} Essence` +
    (D.FLOORS[f + 1]?.grant ? ', new capability' : ''));

  const exp = S.spire.exp;
  if (exp) {
    setBar($.expBar, 1 - exp.remaining / exp.duration,
      `returning in ${fmtTime(exp.remaining)}`);
    setText($.expInfo, `Expedition on floor ${exp.floor + 1} — will add ${fmt(exp.progress)} progress, +${fmt(D.expeditionEssence(exp.floor))} Essence.`);
    $.expBtn.disabled = true;
    setText($.expBtn, 'Expedition underway…');
  } else {
    const cost = D.expeditionCost(f, S);
    const afford = E.canAfford(S, cost);
    setBar($.expBar, 0, 'no expedition underway');
    setText($.expInfo,
      `Next expedition: ${fmtCost(cost, D.RES)} · ${fmtTime(D.expeditionDuration(f))} · ` +
      `+${fmt(D.expeditionProgress(f, S))} progress · +${fmt(D.expeditionEssence(f))} Essence`);
    $.expBtn.disabled = !afford;
    setText($.expBtn, 'Launch expedition');
  }
  show($.expAuto, S.unlocked.autoexpedition);
  $.expAutoBox.checked = !!S.spire.autoRepeat;

  show($.blsSection, S.unlocked.blessings);
  if (S.unlocked.blessings) {
    for (const id in rows.bls) updateBlessingRow(rows.bls[id]);
  }
}

// ----- Foreman
function buildForemanPanel() {
  const p = panel('foreman');
  $.panels.appendChild(p);
  const sec = section(p, 'The Foreman',
    'Rules run once per second, top to bottom. Each rule acts at most once per second.');
  $.ruleSlots = el('div', 'card-info', '');
  sec.appendChild($.ruleSlots);
  $.rulesBox = el('div', 'rules');
  sec.appendChild($.rulesBox);
  $.addRule = btn('+ Add rule', 'buy', () => {
    S.rules.push({
      enabled: true,
      when: { res: 'always', cmp: '>=', val: 0 },
      action: { type: 'buyBuilding', target: 'garden', keep: 0 },
    });
    rulesDirty = true;
  });
  sec.appendChild($.addRule);
}

function sel(options, value, onChange) {
  const s = el('select');
  for (const [v, label] of options) {
    const o = el('option', null, label);
    o.value = v;
    s.appendChild(o);
  }
  s.value = value;
  s.addEventListener('change', () => { onChange(s.value); onAction(); });
  return s;
}
function numInput(value, onChange) {
  const i = el('input', 'num');
  i.type = 'number';
  i.value = value;
  i.addEventListener('change', () => { onChange(parseFloat(i.value) || 0); onAction(); });
  return i;
}

function rebuildRules() {
  rulesDirty = false;
  $.rulesBox.textContent = '';
  const resOpts = [['always', 'always'], ...D.RESOURCES.map(r => [r.id, r.name])];
  const actOpts = D.RULE_ACTIONS.map(a => [a.id, a.name]);
  S.rules.forEach((r, i) => {
    const row = el('div', 'rule');
    const en = el('input');
    en.type = 'checkbox';
    en.checked = r.enabled;
    en.addEventListener('change', () => { r.enabled = en.checked; onAction(); });
    row.appendChild(en);

    row.appendChild(el('span', 'rule-kw', 'when'));
    row.appendChild(sel(resOpts, r.when.res, v => { r.when.res = v; rulesDirty = true; }));
    if (r.when.res !== 'always') {
      row.appendChild(sel([['>=', '≥'], ['<=', '≤']], r.when.cmp, v => { r.when.cmp = v; }));
      row.appendChild(numInput(r.when.val, v => { r.when.val = v; }));
    }
    row.appendChild(el('span', 'rule-kw', 'do'));
    row.appendChild(sel(actOpts, r.action.type, v => { r.action.type = v; rulesDirty = true; }));

    const t = r.action.type;
    if (t === 'buyBuilding') {
      const opts = D.BUILDINGS.map(b => [b.id, b.name]);
      if (!D.BUILDING[r.action.target]) r.action.target = 'garden';
      row.appendChild(sel(opts, r.action.target, v => { r.action.target = v; }));
    } else if (t === 'buyConverter') {
      const opts = D.CONVERTERS.map(c => [c.id, c.name]);
      if (!D.CONVERTER[r.action.target]) r.action.target = 'smelter';
      row.appendChild(sel(opts, r.action.target, v => { r.action.target = v; }));
    } else if (t === 'sellSurplus') {
      const opts = D.RESOURCES.filter(x => D.SELL_PRICE[x.id]).map(x => [x.id, x.name]);
      if (!D.SELL_PRICE[r.action.target]) r.action.target = 'wood';
      row.appendChild(sel(opts, r.action.target, v => { r.action.target = v; }));
      row.appendChild(el('span', 'rule-kw', 'keep'));
      row.appendChild(numInput(r.action.keep || 0, v => { r.action.keep = v; }));
    }
    row.appendChild(el('span', 'spacer'));
    row.appendChild(btn('✕', 'small danger', () => {
      S.rules.splice(i, 1);
      rulesDirty = true;
    }));
    $.rulesBox.appendChild(row);
  });
}

function updateForemanPanel() {
  const slots = E.ruleSlots(S);
  setText($.ruleSlots, `${S.rules.length} / ${slots} rule slots (more via Blessing of Foresight)`);
  $.addRule.disabled = S.rules.length >= slots;
  if (rulesDirty) rebuildRules();
}

// ----- Chronicle
function buildChroniclePanel() {
  const p = panel('chronicle');
  $.panels.appendChild(p);
  $.statsSection = section(p, 'Statistics');
  $.statsBox = el('div', 'stats');
  $.statsSection.appendChild($.statsBox);
  const logSec = section(p, 'Chronicle');
  $.logBox = el('div', 'log');
  logSec.appendChild($.logBox);
}

function updateChronicle() {
  if (S.log.length !== logLen) {
    logLen = S.log.length;
    $.logBox.textContent = '';
    for (let i = S.log.length - 1; i >= 0; i--) {
      const e = S.log[i];
      const row = el('div', 'log-row');
      row.appendChild(el('span', 'log-t', fmtTime(e.t)));
      row.appendChild(el('span', 'log-msg', e.msg));
      $.logBox.appendChild(row);
    }
  }
  const st = S.stats;
  $.statsBox.textContent =
    `play time ${fmtTime(st.playTime)} · clicks ${fmt(st.clicks)} · ` +
    `expeditions ${fmt(st.expeditions)} · floors ${S.spire.floor} · ` +
    `coins earned ${fmt(st.coinsEarned)} · essence earned ${fmt(st.essenceEarned)} · ` +
    `offline cap ${fmtTime(E.offlineCapSecs(S))}`;
}

// ---------------------------------------------------------------- hint
function currentHint() {
  const u = S.unlocked;
  if (!u.buildings) return 'Gather wood.';
  if (!(S.buildings.garden > 0)) return 'Build a Garden.';
  if (!u.villagers) return 'Build a Garden to attract villagers.';
  if (S.villagers.length < 2 && E.housingCap(S) >= 2) return 'Recruit a villager (Villagers tab).';
  if (!u.tier1) return 'Quarry stone to survey the surroundings.';
  if (u.tier1 && !anyCvt()) return 'Build a converter (Industry tab).';
  if (!u.spire) return 'Craft Gear at a Forge (Workshop → Forge) to approach the Spire.';
  if (u.spire && S.spire.floor === 0 && !S.spire.exp) return 'Launch an expedition into the Spire.';
  return '';
}
function anyCvt() {
  for (const k in S.converters) if (S.converters[k].count > 0) return true;
  return false;
}

// ---------------------------------------------------------------- update
export function updateUI() {
  const info = S._info || { rates: {}, util: {} };

  // header
  setText($.floorChip, `Floor ${S.spire.floor}`);
  show($.floorChip, S.spire.floor > 0 || S.unlocked.spire);
  const gm = E.globalMult(S);
  setText($.multChip, `all production ×${fmt(gm)}`);
  show($.multChip, gm > 1.001);
  setText($.hint, currentHint());

  // gather button
  const cm = E.clickYieldMult(S);
  setText($.gather, `Gather  (+${fmt(D.CLICK_YIELD.food * cm)} food, +${fmt(D.CLICK_YIELD.wood * cm)} wood)`);

  // rally
  show($.rally, S.unlocked.rally);
  show($.rallyBar, S.unlocked.rally);
  if (S.unlocked.rally) {
    const t = S.stats.playTime;
    if (E.rallyActive(S)) {
      $.rally.disabled = true;
      setText($.rally, `Rallying! all production ×${D.RALLY_MULT}`);
      setBar($.rallyBar, (S.rally.activeUntil - t) / D.RALLY_SECS, fmtTime(S.rally.activeUntil - t) + ' left');
    } else if (!E.rallyReady(S)) {
      $.rally.disabled = true;
      setText($.rally, 'Rally the camp');
      setBar($.rallyBar, 1 - (S.rally.readyAt - t) / D.RALLY_COOLDOWN, 'ready in ' + fmtTime(S.rally.readyAt - t));
    } else {
      $.rally.disabled = false;
      setText($.rally, `Rally the camp (×${D.RALLY_MULT} for ${fmtTime(D.RALLY_SECS)})`);
      setBar($.rallyBar, 1, 'ready');
    }
  }

  // resources
  for (const r of D.RESOURCES) {
    let row = rows.res[r.id];
    const seen = S.lifetime[r.id] > 0;
    if (!row) {
      if (!seen) continue;
      const tr = el('tr');
      const name = el('td', 'res-name', r.name);
      const amt = el('td', 'res-amt', '');
      const rate = el('td', 'res-rate', '');
      tr.append(name, amt, rate);
      $.resTable.appendChild(tr);
      row = rows.res[r.id] = { tr, amt, rate };
    }
    setText(row.amt, fmtRes(S.res[r.id]));
    const rt = info.rates[r.id] || 0;
    setText(row.rate, fmtRate(rt));
    row.rate.className = 'res-rate ' + (rt > 0.004 ? 'pos' : rt < -0.004 ? 'neg' : '');
  }

  // villager summary
  const idle = E.idleVillagers(S);
  show($.villSummary, S.unlocked.villagers);
  setText($.villSummary,
    `villagers ${S.villagers.length}/${E.housingCap(S)}` + (idle ? ` · ${idle} idle` : ''));

  // tabs
  for (const t of TABS) show($.tabs[t.id], t.when(S));
  if (!TABS.find(t => t.id === S._tab)?.when(S)) selectTab('chronicle');

  // qty buttons
  for (const q of [1, 10, 25, 'max']) {
    $.qtyBtns[q].classList.toggle('active', S.settings.buyQty === q);
  }

  // active panel only
  switch (S._tab) {
    case 'camp':
      for (const id in rows.bld) updateBuildingRow(rows.bld[id]);
      for (const id in rows.upg) updateUpgradeRow(rows.upg[id]);
      break;
    case 'jobs': {
      setText($.villCount, `Villagers: ${S.villagers.length} / ${E.housingCap(S)}`);
      const cost = D.recruitCost(S.villagers.length);
      const full = S.villagers.length >= E.housingCap(S);
      const afford = !full && E.canAfford(S, cost);
      setText($.recruitCost, full
        ? 'housing full — build Cabins in the Camp'
        : `next recruit: ${fmtCost(cost, D.RES)}`);
      $.recruitCost.className = afford ? 'card-info cost-ok' : 'card-info cost-no';
      $.recruitBtn.disabled = !afford;
      for (const id in rows.job) updateJobRow(rows.job[id]);
      updateRoster();
      break;
    }
    case 'industry':
      for (const id in rows.cvt) updateConverterRow(rows.cvt[id]);
      show($.mktSection, S.unlocked.market);
      if (S.unlocked.market) for (const id in rows.mkt) updateMarketRow(rows.mkt[id]);
      break;
    case 'spire': updateSpirePanel(); break;
    case 'foreman': updateForemanPanel(); break;
    case 'chronicle': updateChronicle(); break;
  }
}

// ---------------------------------------------------------------- modal
export function showModal(titleText, bodyNode, buttons) {
  $.modalBox.textContent = '';
  $.modalBox.appendChild(el('h2', null, titleText));
  $.modalBox.appendChild(bodyNode);
  const btns = el('div', 'modal-btns');
  for (const [label, fn, cls] of buttons || [['Close', hideModal]]) {
    btns.appendChild(btn(label, cls || 'buy', fn));
  }
  $.modalBox.appendChild(btns);
  $.modal.style.display = '';
}
export function hideModal() { $.modal.style.display = 'none'; }

export function offlineReportNode(report) {
  const box = el('div');
  box.appendChild(el('p', null,
    `You were away ${fmtTime(report.elapsed)}. ` +
    `The camp worked for ${fmtTime(Math.round(report.effective))}` +
    (report.counted < report.elapsed ? ` (offline cap ${fmtTime(report.counted)} reached)` : '') + '.'));
  const ul = el('div', 'offline-gains');
  const entries = Object.entries(report.gains);
  if (entries.length === 0) ul.appendChild(el('div', null, 'Nothing much happened.'));
  for (const [k, v] of entries) {
    ul.appendChild(el('div', v >= 0 ? 'pos' : 'neg',
      `${v >= 0 ? '+' : ''}${fmt(Math.round(v))} ${D.RES[k].name}`));
  }
  for (const [k, v] of Object.entries(report.levels)) {
    ul.appendChild(el('div', 'pos', `${D.JOB[k].name} +${v} level${v > 1 ? 's' : ''}`));
  }
  if (report.expeditions) ul.appendChild(el('div', 'pos', `${report.expeditions} expeditions returned`));
  if (report.floors) ul.appendChild(el('div', 'pos', `${report.floors} floor${report.floors > 1 ? 's' : ''} conquered!`));
  box.appendChild(ul);
  return box;
}

export function textAreaNode(value, placeholder) {
  const ta = el('textarea', 'save-ta');
  if (value) ta.value = value;
  if (placeholder) ta.placeholder = placeholder;
  return ta;
}
