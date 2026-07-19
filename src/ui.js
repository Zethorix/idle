// Rootspire — DOM rendering. Build-once static structure + cheap per-frame
// text updates. Icon-first: reading is optional, but tooltips explain
// everything. Costs live inside buy buttons; gains are green chips.

import * as D from './data.js';
import * as E from './engine.js';
import { fmt, fmtRes, fmtRate, fmtTime } from './format.js';

let S;                      // game state (shared reference)
let onAction = () => {};    // callback after any player action (for saving)
const $ = {};               // static element refs
const rows = { res: {}, bld: {}, cvt: {}, job: {}, upg: {}, bls: {}, mkt: {}, ach: {} };
let rulesDirty = true, logLen = -1, rosterKey = '';
let glowEl = null;

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
// Purchase button: label on top, cost inside underneath. Flashes on success.
function buyBtn(labelText, cls, fn) {
  const b = el('button', 'buy ' + (cls || ''));
  b._label = el('span', 'buy-label', labelText);
  b._cost = el('span', 'buy-cost');
  b.append(b._label, b._cost);
  b.addEventListener('click', () => {
    const ok = fn();
    if (ok) {
      b.classList.remove('flash');
      void b.offsetWidth;               // restart animation
      b.classList.add('flash');
    }
    onAction();
  });
  return b;
}
function icon(glyph, cls) { return el('span', 'icon ' + (cls || ''), glyph); }
function avatar(glyph) {
  const plate = el('span', 'avatar');
  plate.appendChild(el('span', 'avatar-glyph', glyph));
  return plate;
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
  b.classList.toggle('live', frac > 0.001 && frac < 0.999);
  if (text !== undefined) b._label.textContent = text;
}
function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}
function show(node, visible) {
  const want = visible ? '' : 'none';
  if (node.style.display !== want) node.style.display = want;
}

// Cost inside a buy button: "🪵250 🪨20", each tinted by its own affordability.
function setCostInline(container, cost) {
  let key = '';
  for (const k in cost) key += `|${k}:${Math.ceil(cost[k])}:${(S.res[k] || 0) >= cost[k] ? 1 : 0}`;
  if (container._key === key) return;
  container._key = key;
  container.textContent = '';
  for (const k in cost) {
    const ok = (S.res[k] || 0) >= cost[k];
    const bit = el('span', 'cost-bit ' + (ok ? 'ok' : 'no'),
      `${D.RES[k].icon}${fmt(Math.ceil(cost[k]))}`);
    bit.title = `${fmt(Math.ceil(cost[k]))} ${D.RES[k].name}`;
    container.appendChild(bit);
  }
}

// Standalone cost chips (used outside buttons).
function setCostChips(container, cost, prefix) {
  let key = prefix || '';
  for (const k in cost) key += `|${k}:${Math.ceil(cost[k])}:${(S.res[k] || 0) >= cost[k] ? 1 : 0}`;
  if (container._key === key) return;
  container._key = key;
  container.textContent = '';
  if (prefix) container.appendChild(el('span', 'chip-label', prefix));
  for (const k in cost) {
    const ok = (S.res[k] || 0) >= cost[k];
    const c = el('span', 'chip-cost ' + (ok ? 'ok' : 'no'),
      `${fmt(Math.ceil(cost[k]))} ${D.RES[k].icon}`);
    c.title = `${fmt(Math.ceil(cost[k]))} ${D.RES[k].name}`;
    container.appendChild(c);
  }
}

// Production chips: +0.4🍎/s
function setProdChips(container, prod, mult, suffix) {
  let key = suffix || '';
  for (const k in prod) key += `|${k}:${(prod[k] * mult).toPrecision(3)}`;
  if (container._key === key) return;
  container._key = key;
  container.textContent = '';
  for (const k in prod) {
    const c = el('span', 'chip-prod', `+${fmt(Math.round(prod[k] * mult * 100) / 100)} ${D.RES[k].icon}/s`);
    c.title = `${D.RES[k].name} per second`;
    container.appendChild(c);
  }
  if (suffix) container.appendChild(el('span', 'chip-label', suffix));
}

function setGlow(target) {
  if (glowEl === target) return;
  if (glowEl) glowEl.classList.remove('glow');
  glowEl = target;
  if (glowEl) glowEl.classList.add('glow');
}

function qtyNum() {
  const q = S.settings.buyQty;
  return q === 'max' ? 'max' : q;
}

// Floating "+N 🍎" feedback at an element. Capped so click-spam stays readable.
function flyOff(fromEl, text) {
  if (document.getElementsByClassName('flyoff').length >= 6) return;
  const rect = fromEl.getBoundingClientRect();
  const f = el('div', 'flyoff', text);
  f.style.left = (rect.left + rect.width / 2 + (Math.random() * 80 - 40)) + 'px';
  f.style.top = (rect.top + 8) + 'px';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 800);
}
const nice = v => fmt(Math.round(v * 10) / 10);

// ---------------------------------------------------------------- tooltips
function initTips() {
  $.tip = el('div', 'tooltip');
  $.tip.style.display = 'none';
  document.body.appendChild($.tip);
}
function attachTip(target, build) {
  target.addEventListener('mouseenter', () => {
    $.tip.textContent = '';
    const content = build();
    if (!content) return;
    $.tip.appendChild(content);
    $.tip.style.display = '';
    const r = target.getBoundingClientRect();
    const tw = $.tip.offsetWidth, th = $.tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2;
    x = Math.max(8, Math.min(x, window.innerWidth - tw - 8));
    let y = r.top - th - 8;
    if (y < 8) y = r.bottom + 8;
    $.tip.style.left = x + 'px';
    $.tip.style.top = y + 'px';
  });
  target.addEventListener('mouseleave', () => { $.tip.style.display = 'none'; });
}
function tipSection(box, text, cls) {
  box.appendChild(el('div', 'tip-row ' + (cls || ''), text));
}
function tipRule(box) { box.appendChild(el('div', 'tip-rule')); }

// ---------------------------------------------------------------- shell
export function initUI(state, actionCb) {
  S = state;
  if (actionCb) onAction = actionCb;
  document.body.innerHTML = '';

  // Header
  const header = el('header');
  const title = el('div', 'title');
  title.append(el('span', 'title-icon', '🗼'), el('span', null, 'ROOTSPIRE'));
  $.floorChip = el('div', 'chip', '');
  $.multChip = el('div', 'chip', '');
  const spacer = el('div', 'spacer');
  const saveBtns = el('div', 'savebtns');
  saveBtns.append(
    btn('💾', 'small iconbtn', () => window.dispatchEvent(new Event('rs-save'))),
    btn('📤 export', 'small', () => window.dispatchEvent(new Event('rs-export'))),
    btn('📥 import', 'small', () => window.dispatchEvent(new Event('rs-import'))),
    btn('🗑', 'small danger iconbtn', () => window.dispatchEvent(new Event('rs-reset'))),
  );
  saveBtns.children[0].title = 'Save now';
  saveBtns.children[3].title = 'Hard reset (never required)';
  header.append(title, $.floorChip, $.multChip, spacer, saveBtns);
  document.body.appendChild(header);

  // Hint banner (tutorial guidance)
  $.hint = el('div', 'hintbar');
  $.hintIcon = el('span', 'hint-icon', '👉');
  $.hintText = el('span', 'hint-text', '');
  $.hint.append($.hintIcon, $.hintText);
  document.body.appendChild($.hint);

  // Layout
  const layout = el('div', 'layout');
  document.body.appendChild(layout);

  // Sidebar
  const side = el('aside');
  $.gather = btn('', 'gather', () => {
    E.doClick(S);
    const m = E.clickYieldMult(S);
    flyOff($.gather, `+${nice(D.CLICK_YIELD.food * m)}🍎 +${nice(D.CLICK_YIELD.wood * m)}🪵`);
  });
  side.appendChild($.gather);
  $.rally = btn('', 'gather rally', () => E.activateRally(S));
  side.appendChild($.rally);
  $.rallyBar = bar('rally thin');
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

  // Toasts + tooltip
  $.toasts = el('div', 'toasts');
  document.body.appendChild($.toasts);
  initTips();

  // Modal
  $.modal = el('div', 'modal-wrap');
  $.modal.style.display = 'none';
  $.modalBox = el('div', 'modal');
  $.modal.appendChild($.modalBox);
  $.modal.addEventListener('click', e => { if (e.target === $.modal) hideModal(); });
  document.body.appendChild($.modal);

  selectTab(firstVisibleTab());
  updateUI();
}

const TABS = [
  { id: 'camp',      name: 'Camp',      icon: '⛺', when: s => s.unlocked.buildings },
  { id: 'jobs',      name: 'Villagers', icon: '👥', when: s => s.unlocked.villagers },
  { id: 'industry',  name: 'Industry',  icon: '🏭', when: s => s.unlocked.tier1 },
  { id: 'spire',     name: 'Spire',     icon: '🗼', when: s => s.unlocked.spire },
  { id: 'foreman',   name: 'Foreman',   icon: '📜', when: s => s.unlocked.foreman },
  { id: 'chronicle', name: 'Chronicle', icon: '📖', when: () => true },
];

function firstVisibleTab() {
  for (const t of TABS) if (t.when(S)) return t.id;
  return 'chronicle';
}

function makeTabs() {
  $.tabs = {};
  for (const t of TABS) {
    const b = el('button', 'tab');
    b.append(icon(t.icon), el('span', 'tab-name', t.name));
    b.addEventListener('click', () => selectTab(t.id));
    $.tabbar.appendChild(b);
    $.tabs[t.id] = b;
  }
}
function selectTab(id) {
  S._tab = id;
  S.seenTabs[id] = true;
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

  $.bldSection = section(p, '⛺ Buildings', 'Buildings produce on their own, forever. Every owned copy adds up.');
  $.upgSection = section(p, '⭐ Upgrades', 'One-time boosts. Hover anything to see exactly what it does.');
  $.upgGrid = el('div', 'tile-grid');
  $.upgSection.appendChild($.upgGrid);

  for (const b of D.BUILDINGS) {
    const r = buildingRow(b);
    $.bldSection.appendChild(r.root);
    rows.bld[b.id] = r;
  }
  for (const u of D.UPGRADES) {
    const r = upgradeTile(u);
    $.upgGrid.appendChild(r.root);
    rows.upg[u.id] = r;
  }
}

function buildingRow(b) {
  const root = el('div', 'card');
  const av = avatar(b.icon);
  const body = el('div', 'card-body');
  const top = el('div', 'card-top');
  const name = el('span', 'card-name', b.name);
  const owned = el('span', 'owned', '');
  top.append(name, owned);
  const prod = el('div', 'chips');
  body.append(top, prod);
  const buy = buyBtn('Buy', 'stack', () => E.buyBuilding(S, b.id, qtyNum()));
  root.append(av, body, buy);
  attachTip(root, () => buildingTip(b));
  return { root, av, owned, buy, prod, def: b };
}

function buildingTip(b) {
  const box = el('div');
  const count = S.buildings[b.id] || 0;
  tipSection(box, `${b.icon} ${b.name}` + (count ? `  ×${count}` : ''), 'tip-title');
  tipSection(box, b.desc, 'tip-flavor');
  tipRule(box);
  if (Object.keys(b.prod).length) {
    const mm = E.milestoneMult(count);
    const bm = E.buildingMult(S);
    for (const k in b.prod) {
      tipSection(box, `each: +${fmt(b.prod[k] * mm * bm)} ${D.RES[k].name}/s`, 'tip-good');
      if (count) tipSection(box, `all ${count}: +${fmt(b.prod[k] * mm * bm * count)} ${D.RES[k].name}/s`, 'tip-good');
    }
    tipRule(box);
    tipSection(box, `base ${Object.values(b.prod).map(v => fmt(v)).join('/')} × milestones ×${fmt(mm)} × camp ×${fmt(bm)}`, 'tip-dim');
    const nm = E.nextMilestone(count);
    if (nm) tipSection(box, `⬆ output ×2 at ${nm} owned (${nm - count} to go)`, 'tip-accent');
  }
  if (b.housing) tipSection(box, `+${b.housing} villager housing each`, 'tip-good');
  return box;
}

function updateBuildingRow(r) {
  const b = r.def;
  const count = S.buildings[b.id] || 0;
  const visible = count > 0 || !b.unlock || b.unlock(S);
  show(r.root, visible);
  if (!visible) return;
  setText(r.owned, count ? `×${count}` : '');
  r.av.firstChild.classList.toggle('working', count > 0 && Object.keys(b.prod).length > 0);

  if (Object.keys(b.prod).length) {
    const bm = E.buildingMult(S) * E.milestoneMult(count);
    const nm = E.nextMilestone(count);
    setProdChips(r.prod, b.prod, bm, nm ? `each · ⬆×2 at ${nm}` : 'each');
  } else if (b.housing) {
    setProdChips(r.prod, {}, 1, `+${b.housing} 🏠 housing each`);
  }

  const q = qtyNum();
  const n = q === 'max' ? Math.max(1, E.maxAffordable(S, b.cost, b.costMult, count)) : q;
  const cost = E.bulkCost(b.cost, b.costMult, count, n);
  r.buy.disabled = !E.canAfford(S, cost);
  setText(r.buy._label, `Buy ${n}`);
  setCostInline(r.buy._cost, cost);
}

function upgradeTile(u) {
  const root = el('div', 'tile');
  const av = avatar(u.icon);
  const name = el('div', 'tile-name', u.name);
  const tier = el('div', 'owned', '');
  const desc = el('div', 'tile-desc', u.desc);
  const buy = buyBtn('Buy', 'wide', () => E.buyUpgrade(S, u.id));
  root.append(av, name, tier, desc, buy);
  return { root, tier, buy, def: u };
}

function updateUpgradeTile(r) {
  const u = r.def;
  const bought = S.upgrades[u.id] || 0;
  const visible = bought > 0 || !u.unlock || u.unlock(S);
  show(r.root, visible);
  if (!visible) return;
  setText(r.tier, u.tiers > 1 ? `${bought} / ${u.tiers}` : (bought ? 'owned' : ''));
  r.root.classList.toggle('maxed', bought >= u.tiers);
  if (bought >= u.tiers) {
    r.buy.disabled = true;
    setText(r.buy._label, '✓ Complete');
    r.buy._cost.textContent = '';
    r.buy._cost._key = 'done';
    return;
  }
  const cost = u.cost(bought);
  r.buy.disabled = !E.canAfford(S, cost);
  setText(r.buy._label, 'Buy');
  setCostInline(r.buy._cost, cost);
}

// ----- Villagers / Jobs
function buildJobsPanel() {
  const p = panel('jobs');
  $.panels.appendChild(p);

  const recSec = section(p, '👥 Camp roster', 'Villagers work jobs. More cabins → more villagers.');
  const recRow = el('div', 'card');
  const av = avatar('🏕️');
  const body = el('div', 'card-body');
  const top = el('div', 'card-top');
  $.villCount = el('span', 'card-name', '');
  top.append($.villCount);
  $.recruitNote = el('div', 'chips');
  body.append(top, $.recruitNote);
  $.recruitBtn = buyBtn('➕ Recruit', 'stack', () => E.recruit(S));
  recRow.append(av, body, $.recruitBtn);
  recSec.appendChild(recRow);
  $.roster = el('div', 'roster', '');
  recSec.appendChild($.roster);

  const jobSec = section(p, '🛠 Jobs',
    'Use + / − to assign villagers. Working a job levels it up: each level is ×1.06 yield, forever.');
  for (const j of D.JOBS) {
    const r = jobRow(j);
    jobSec.appendChild(r.root);
    rows.job[j.id] = r;
  }
}

function jobRow(j) {
  const root = el('div', 'card');
  const av = avatar(j.icon);
  const body = el('div', 'card-body');
  const top = el('div', 'card-top');
  const name = el('span', 'card-name', j.name);
  const lvl = el('span', 'owned', '');
  const spacerEl = el('span', 'spacer');
  const minus = btn('−', 'adj', () => E.assignJob(S, j.id, -1));
  const count = el('span', 'assign-count', '0');
  const plus = btn('+', 'adj', () => E.assignJob(S, j.id, +1));
  const plus5 = btn('+5', 'adj', () => E.assignJob(S, j.id, +5));
  top.append(name, lvl, spacerEl, minus, count, plus, plus5);
  const info = el('div', 'chips');
  const xpBar = bar('xp thin');
  const equipRow = el('div', 'equip-row');
  const equipName = el('span', 'chip-label', '');
  const equipBtn = buyBtn('⚒ ×2 yield', 'stack small', () => E.buyEquip(S, j.id));
  equipRow.append(equipName, el('span', 'spacer'), equipBtn);
  body.append(top, info, xpBar, equipRow);
  root.append(av, body);
  attachTip(root, () => jobTip(j));
  return { root, av, lvl, count, info, xpBar, equipName, equipBtn, minus, plus, plus5, def: j };
}

function jobTip(j) {
  const js = S.jobs[j.id];
  const box = el('div');
  tipSection(box, `${j.icon} ${j.name} — level ${js.level}`, 'tip-title');
  tipRule(box);
  const ym = E.jobYieldMult(S, j.id);
  for (const k in j.yield) {
    tipSection(box, `each villager: +${fmt(j.yield[k] * ym)} ${D.RES[k].name}/s`, 'tip-good');
    if (js.assigned) tipSection(box, `all ${js.assigned}: +${fmt(j.yield[k] * ym * js.assigned)} ${D.RES[k].name}/s`, 'tip-good');
  }
  tipRule(box);
  const eq = S.equip[j.id] || 0;
  tipSection(box,
    `base × level ×${fmt(Math.pow(D.JOB_LEVEL_MULT, js.level - 1))}` +
    ` × equipment ×${fmt(Math.pow(D.EQUIP_YIELD_MULT, eq))}` +
    ` × camp ×${fmt(Math.pow(1.5, S.upgrades.whetstones || 0) * E.globalMult(S))}`, 'tip-dim');
  tipSection(box, `XP: +${fmt(js.assigned * E.xpMult(S))}/s while working`, 'tip-dim');
  return box;
}

function updateJobRow(r) {
  const j = r.def;
  const js = S.jobs[j.id];
  const visible = !j.unlock || j.unlock(S) || js.assigned > 0;
  show(r.root, visible);
  if (!visible) return;
  setText(r.lvl, `Lv ${js.level}`);
  setText(r.count, String(js.assigned));
  r.av.firstChild.classList.toggle('working', js.assigned > 0);
  const ym = E.jobYieldMult(S, j.id);
  setProdChips(r.info, j.yield, ym, 'each');
  const need = D.xpToNext(js.level);
  setBar(r.xpBar, js.xp / need, `XP ${fmt(Math.floor(js.xp))} / ${fmt(need)}`);
  const idle = E.idleVillagers(S);
  r.plus.disabled = idle < 1;
  r.plus5.disabled = idle < 1;
  r.minus.disabled = js.assigned < 1;

  const tier = S.equip[j.id] || 0;
  const cost = E.equipCost(S, j.id);
  setText(r.equipName, `${D.JOB_EQUIP[j.id].name} · tier ${tier}`);
  setCostInline(r.equipBtn._cost, cost);
  r.equipBtn.disabled = !E.canAfford(S, cost);
}

function updateRoster() {
  const names = S.villagers.map(v => v.name);
  const entries = [];
  let i = 0;
  for (const j of D.JOBS) {
    for (let k = 0; k < S.jobs[j.id].assigned && i < names.length; k++, i++) {
      entries.push([j.icon, names[i], true]);
    }
  }
  for (; i < names.length; i++) entries.push(['💤', names[i], false]);
  const key = entries.map(e => e[0] + e[1]).join('|');
  if (key === rosterKey) return;
  rosterKey = key;
  $.roster.textContent = '';
  for (const [ic, name, working] of entries) {
    const row = el('div', 'roster-row');
    row.append(icon(ic, working ? 'working' : ''), el('span', null, ' ' + name));
    $.roster.appendChild(row);
  }
}

// ----- Industry
function buildIndustryPanel() {
  const p = panel('industry');
  $.panels.appendChild(p);
  $.cvtSection = section(p, '⚙️ Converters',
    'Converters turn resources into better ones, continuously. The bar shows how well they are fed.');
  for (const c of D.CONVERTERS) {
    const r = converterRow(c);
    $.cvtSection.appendChild(r.root);
    rows.cvt[c.id] = r;
  }
  $.mktSection = section(p, '🏪 Market', 'Traders buy anything for 🪙 — and sell at 4× the price.');
  $.mktTable = el('table', 'mkt-table');
  $.mktSection.appendChild($.mktTable);
  for (const r of D.RESOURCES) {
    if (!D.SELL_PRICE[r.id]) continue;
    const row = marketRow(r);
    $.mktTable.appendChild(row.root);
    rows.mkt[r.id] = row;
  }
}

function recipeNode(c) {
  const box = el('span', 'recipe');
  let first = true;
  for (const k in c.input) {
    if (!first) box.appendChild(el('span', 'recipe-plus', '+'));
    first = false;
    const chip = el('span', 'chip-cost neutral', `${fmt(c.input[k])} ${D.RES[k].icon}`);
    chip.title = D.RES[k].name;
    box.appendChild(chip);
  }
  box.appendChild(el('span', 'recipe-arrow', '➜'));
  for (const k in c.output) {
    const chip = el('span', 'chip-prod', `${fmt(c.output[k])} ${D.RES[k].icon}`);
    chip.title = D.RES[k].name;
    box.appendChild(chip);
  }
  return box;
}

function converterRow(c) {
  const root = el('div', 'card');
  const av = avatar(c.icon);
  const body = el('div', 'card-body');
  const top = el('div', 'card-top');
  const name = el('span', 'card-name', c.name);
  const owned = el('span', 'owned', '');
  const toggle = btn('⏻ on', 'toggle', () => {
    const cv = S.converters[c.id];
    if (cv) cv.on = !cv.on;
  });
  top.append(name, owned, toggle);
  const io = el('div', 'chips');
  io.appendChild(recipeNode(c));
  const cycle = el('span', 'chip-label', '');
  io.appendChild(cycle);
  const util = bar('util thin');
  body.append(top, io, util);
  const buy = buyBtn('Buy', 'stack', () => E.buyConverter(S, c.id, qtyNum()));
  root.append(av, body, buy);
  attachTip(root, () => converterTip(c));
  return { root, av, owned, toggle, buy, cycle, util, def: c };
}

function converterTip(c) {
  const box = el('div');
  const cv = S.converters[c.id];
  const count = cv?.count || 0;
  tipSection(box, `${c.icon} ${c.name}` + (count ? `  ×${count}` : ''), 'tip-title');
  tipSection(box, c.desc, 'tip-flavor');
  tipRule(box);
  const speed = E.converterSpeedMult(S);
  const cyc = c.cycle / speed;
  const inS = Object.entries(c.input).map(([k, v]) => `${fmt(v)} ${D.RES[k].name}`).join(' + ');
  const outS = Object.entries(c.output).map(([k, v]) => `${fmt(v)} ${D.RES[k].name}`).join(' + ');
  tipSection(box, `${inS} ➜ ${outS}`, 'tip-good');
  tipSection(box, `every ${cyc < 1 ? 'less than a second' : fmtTime(cyc)} per copy`, 'tip-dim');
  if (count && cv.on) {
    const u = S._info?.util?.[c.id] ?? 0;
    tipSection(box, u >= 0.99 ? 'fully fed — running at 100%' :
      `running at ${Math.round(u * 100)}% — inputs are running short`, u >= 0.99 ? 'tip-good' : 'tip-warn');
  }
  return box;
}

function updateConverterRow(r) {
  const c = r.def;
  const cv = S.converters[c.id];
  const count = cv?.count || 0;
  const visible = count > 0 || !c.unlock || c.unlock(S);
  show(r.root, visible);
  if (!visible) return;
  setText(r.owned, count ? `×${count}` : '');
  show(r.toggle, count > 0);
  const u = S._info?.util?.[c.id] ?? 0;
  r.av.firstChild.classList.toggle('working', count > 0 && !!cv?.on && u > 0.01);
  if (count) {
    setText(r.toggle, cv.on ? '⏻ on' : '⏻ off');
    r.toggle.classList.toggle('off', !cv.on);
  }
  const speed = E.converterSpeedMult(S);
  const cyc = c.cycle / speed;
  setText(r.cycle, `⏱ ${cyc < 1 ? '<1s' : fmtTime(cyc)}`);
  show(r.util, count > 0);
  if (count) setBar(r.util, cv.on ? u : 0, cv.on ? `${Math.round(u * 100)}% fed` : 'off');

  const q = qtyNum();
  const n = q === 'max' ? Math.max(1, E.maxAffordable(S, c.cost, c.costMult, count)) : q;
  const cost = E.bulkCost(c.cost, c.costMult, count, n);
  r.buy.disabled = !E.canAfford(S, cost);
  setText(r.buy._label, `Buy ${n}`);
  setCostInline(r.buy._cost, cost);
}

function marketRow(res) {
  const root = el('tr');
  const name = el('td', 'mkt-name');
  name.append(icon(res.icon), el('span', null, ' ' + res.name));
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
  setText(r.price, `${fmt(p)} 🪙 · buy ${fmt(D.SELL_PRICE[r.def.id] * D.BUY_MARKUP)} 🪙`);
}

// ----- Spire
function buildSpirePanel() {
  const p = panel('spire');
  $.panels.appendChild(p);

  const climb = section(p, '🗼 The Climb');
  $.floorTitle = el('div', 'floor-title', '');
  climb.appendChild($.floorTitle);
  $.floorText = el('div', 'card-desc', '');
  climb.appendChild($.floorText);
  $.floorBar = bar('floor');
  climb.appendChild($.floorBar);
  $.floorReward = el('div', 'chips');
  climb.appendChild($.floorReward);

  const exp = section(p, '🧭 Expedition',
    'Expeditions spend supplies, march for a while, and return with ⚑ floor progress and ✨ essence.');
  $.expInfo = el('div', 'chips');
  exp.appendChild($.expInfo);
  $.expBar = bar('exp');
  exp.appendChild($.expBar);
  const row = el('div', 'card-top');
  $.expBtn = buyBtn('🧭 Launch expedition', 'stack primary', () => E.launchExpedition(S));
  $.expAuto = el('label', 'auto-label');
  $.expAutoBox = el('input');
  $.expAutoBox.type = 'checkbox';
  $.expAutoBox.addEventListener('change', () => { S.spire.autoRepeat = $.expAutoBox.checked; });
  $.expAuto.append($.expAutoBox, document.createTextNode(' 🔁 auto-repeat'));
  row.append($.expBtn, $.expAuto);
  exp.appendChild(row);

  $.blsSection = section(p, '✨ Blessings',
    'Permanent ranks bought with essence. There are no resets in Rootspire — nothing here is ever lost.');
  $.blsGrid = el('div', 'tile-grid');
  $.blsSection.appendChild($.blsGrid);
  for (const b of D.BLESSINGS) {
    const r = blessingTile(b);
    $.blsGrid.appendChild(r.root);
    rows.bls[b.id] = r;
  }
}

function blessingTile(b) {
  const root = el('div', 'tile');
  const av = avatar(b.icon);
  const name = el('div', 'tile-name', b.name.replace('Blessing of ', ''));
  const rank = el('div', 'owned', '');
  const desc = el('div', 'tile-desc', b.desc);
  const buy = buyBtn('Buy rank', 'wide', () => E.buyBlessing(S, b.id));
  root.append(av, name, rank, desc, buy);
  return { root, rank, buy, def: b };
}

function updateBlessingTile(r) {
  const b = r.def;
  const rank = S.blessings[b.id] || 0;
  setText(r.rank, `rank ${rank}${b.max ? ' / ' + b.max : ''}`);
  r.root.classList.toggle('maxed', !!b.max && rank >= b.max);
  if (b.max && rank >= b.max) {
    r.buy.disabled = true;
    setText(r.buy._label, '✓ Complete');
    r.buy._cost.textContent = '';
    r.buy._cost._key = 'done';
    return;
  }
  const cost = { essence: D.blessingCost(b, rank) };
  r.buy.disabled = (S.res.essence || 0) < cost.essence;
  setText(r.buy._label, 'Buy rank');
  setCostInline(r.buy._cost, cost);
}

function updateSpirePanel() {
  const f = S.spire.floor;
  const fl = D.FLOORS[f + 1];
  setText($.floorTitle, `Floor ${f + 1}${fl ? ' — ' + fl.name : ''}`);
  setText($.floorText, f === 0
    ? 'The first door stands open. Progress is permanent: each floor conquered empowers everything, forever.'
    : `Conquered floors: ${f}. Every floor ×${D.FLOOR_MULT} to everything, every 5th ×${D.SANCTUM_MULT} more.`);
  const need = D.floorNeed(f);
  setBar($.floorBar, S.spire.progress / need,
    `⚑ ${fmt(Math.floor(S.spire.progress))} / ${fmt(need)}`);

  let rkey = `f${f}`;
  if ($.floorReward._key !== rkey) {
    $.floorReward._key = rkey;
    $.floorReward.textContent = '';
    $.floorReward.appendChild(el('span', 'chip-label', 'conquering this floor gives:'));
    $.floorReward.appendChild(el('span', 'chip-prod', `📈 ×${D.FLOOR_MULT} all production`));
    if ((f + 1) % 5 === 0) $.floorReward.appendChild(el('span', 'chip-prod', `🌟 ×${D.SANCTUM_MULT} Sanctum bonus`));
    $.floorReward.appendChild(el('span', 'chip-prod', `+${fmt(D.floorEssence(f))} ✨`));
    if (D.FLOORS[f + 1]?.grant) $.floorReward.appendChild(el('span', 'chip-prod', '🎁 new capability'));
  }

  const exp = S.spire.exp;
  if (exp) {
    setBar($.expBar, 1 - exp.remaining / exp.duration, `🥾 returning in ${fmtTime(exp.remaining)}`);
    setCostChips($.expInfo, {}, `expedition underway — brings back ⚑ ${fmt(exp.progress)} + ${fmt(D.expeditionEssence(exp.floor))} ✨`);
    $.expBtn.disabled = true;
    setText($.expBtn._label, '🧭 Underway…');
    $.expBtn._cost.textContent = '';
    $.expBtn._cost._key = 'underway';
  } else {
    const cost = D.expeditionCost(f, S);
    setBar($.expBar, 0, 'no expedition underway');
    setCostChips($.expInfo, {},
      `brings back: ⚑ ${fmt(D.expeditionProgress(f, S))} progress + ${fmt(D.expeditionEssence(f))} ✨ · takes ${fmtTime(D.expeditionDuration(f))}`);
    $.expBtn.disabled = !E.canAfford(S, cost);
    setText($.expBtn._label, '🧭 Launch expedition');
    setCostInline($.expBtn._cost, cost);
  }
  show($.expAuto, S.unlocked.autoexpedition);
  $.expAutoBox.checked = !!S.spire.autoRepeat;

  show($.blsSection, S.unlocked.blessings);
  if (S.unlocked.blessings) {
    for (const id in rows.bls) updateBlessingTile(rows.bls[id]);
  }
}

// ----- Foreman
function buildForemanPanel() {
  const p = panel('foreman');
  $.panels.appendChild(p);
  const sec = section(p, '📜 The Foreman',
    'Rules run once per second, top to bottom. Each rule acts at most once per second.');
  $.ruleSlots = el('div', 'card-desc', '');
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
  const resOpts = [['always', '∞ always'], ...D.RESOURCES.map(r => [r.id, `${r.icon} ${r.name}`])];
  const actOpts = D.RULE_ACTIONS.map(a => [a.id, `${a.icon} ${a.name}`]);
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
      const opts = D.BUILDINGS.map(b => [b.id, `${b.icon} ${b.name}`]);
      if (!D.BUILDING[r.action.target]) r.action.target = 'garden';
      row.appendChild(sel(opts, r.action.target, v => { r.action.target = v; }));
    } else if (t === 'buyConverter') {
      const opts = D.CONVERTERS.map(c => [c.id, `${c.icon} ${c.name}`]);
      if (!D.CONVERTER[r.action.target]) r.action.target = 'smelter';
      row.appendChild(sel(opts, r.action.target, v => { r.action.target = v; }));
    } else if (t === 'sellSurplus') {
      const opts = D.RESOURCES.filter(x => D.SELL_PRICE[x.id]).map(x => [x.id, `${x.icon} ${x.name}`]);
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
  setText($.ruleSlots, `${S.rules.length} / ${slots} rule slots (more via 👁️ Blessing of Foresight)`);
  $.addRule.disabled = S.rules.length >= slots;
  if (rulesDirty) rebuildRules();
}

// ----- Chronicle
function buildChroniclePanel() {
  const p = panel('chronicle');
  $.panels.appendChild(p);
  $.statsSection = section(p, '📊 Statistics');
  $.statsBox = el('div', 'stats');
  $.statsSection.appendChild($.statsBox);

  $.achSection = section(p, '🏆 Achievements', 'Each achievement: +2% all production, forever.');
  $.achCount = el('div', 'card-desc', '');
  $.achSection.appendChild($.achCount);
  const grid = el('div', 'ach-grid');
  $.achSection.appendChild(grid);
  for (const a of D.ACHIEVEMENTS) {
    const cell = el('div', 'ach');
    const nameRow = el('div', 'ach-name');
    nameRow.append(el('span', 'ach-badge', '🏆'), el('span', null, ' ' + a.name));
    cell.appendChild(nameRow);
    cell.appendChild(el('div', 'ach-desc', a.desc));
    cell.title = a.desc;
    grid.appendChild(cell);
    rows.ach[a.id] = cell;
  }

  const logSec = section(p, '📖 Chronicle');
  $.logBox = el('div', 'log');
  logSec.appendChild($.logBox);

  const foot = el('div', 'footer');
  const a = el('a', null, 'Rootspire v1 — source & issues on GitHub');
  a.href = 'https://github.com/Zethorix/idle';
  a.target = '_blank';
  foot.appendChild(a);
  p.appendChild(foot);
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
  const achieved = E.achievementCount(S);
  setText($.achCount,
    `${achieved} / ${D.ACHIEVEMENTS.length} earned — production ×${fmt(Math.pow(D.ACHIEVEMENT_MULT, achieved))}`);
  for (const a of D.ACHIEVEMENTS) {
    rows.ach[a.id].classList.toggle('done', !!S.achievements[a.id]);
  }

  const st = S.stats;
  $.statsBox.textContent =
    `⏱ ${fmtTime(st.playTime)} · 👐 ${fmt(st.clicks)} gathers · ` +
    `🧭 ${fmt(st.expeditions)} expeditions · 🗼 floor ${S.spire.floor} · ` +
    `🪙 ${fmt(st.coinsEarned)} earned · ✨ ${fmt(st.essenceEarned)} earned · ` +
    `😴 offline cap ${fmtTime(E.offlineCapSecs(S))}`;
}

// ---------------------------------------------------------------- hint / tutorial
function currentHint() {
  const u = S.unlocked;
  if (!u.buildings) return { text: 'Gather wood!', el: $.gather };
  if (!S.seenTabs.camp) return { text: 'The Camp is open — take a look!', el: $.tabs.camp };
  if (!(S.buildings.garden > 0)) {
    return S._tab === 'camp'
      ? { text: 'Build a Garden.', el: rows.bld.garden.buy }
      : { text: 'Build a Garden in the Camp.', el: $.tabs.camp };
  }
  if (u.villagers && !S.seenTabs.jobs) return { text: 'Wanderers approach — meet your Villagers!', el: $.tabs.jobs };
  if (S.villagers.length < 2) {
    return S._tab === 'jobs'
      ? { text: 'Recruit a villager.', el: $.recruitBtn }
      : { text: 'Recruit a villager in the Villagers tab.', el: $.tabs.jobs };
  }
  if (!u.tier1) return { text: 'Quarry stone to survey the wider world.', el: S._tab === 'jobs' ? rows.job.quarry?.plus : $.tabs.jobs };
  if (!S.seenTabs.industry && u.tier1) return { text: 'Industry unlocked — build converters!', el: $.tabs.industry };
  if (!anyCvt()) return { text: 'Build a Smelter.', el: S._tab === 'industry' ? rows.cvt.smelter?.buy : $.tabs.industry };
  if (!u.spire) return { text: 'Craft ⚔️ Gear: Smelter → Workshop → Forge.', el: S._tab === 'industry' ? null : $.tabs.industry };
  if (!S.seenTabs.spire) return { text: 'The Spire door stands open…', el: $.tabs.spire };
  if (S.spire.floor === 0 && !S.spire.exp) {
    return S._tab === 'spire'
      ? { text: 'Launch an expedition!', el: $.expBtn.disabled ? null : $.expBtn }
      : { text: 'Launch an expedition into the Spire.', el: $.tabs.spire };
  }
  return null;
}
function anyCvt() {
  for (const k in S.converters) if (S.converters[k].count > 0) return true;
  return false;
}

// ---------------------------------------------------------------- toasts & banner
function drainEvents() {
  const evs = S._events;
  if (!evs || !evs.length) return;
  S._events = [];
  for (const ev of evs) {
    if (ev.big) showBanner(ev.icon, ev.msg);
    toast(ev.icon, ev.msg);
  }
}

export function toast(glyph, msg) {
  const t = el('div', 'toast');
  t.append(el('span', 'toast-icon', glyph), el('span', 'toast-msg', msg));
  $.toasts.appendChild(t);
  while ($.toasts.children.length > 5) $.toasts.firstChild.remove();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 400);
  }, 4500);
}

function showBanner(glyph, msg) {
  const b = el('div', 'banner');
  b.append(el('div', 'banner-icon', glyph), el('div', 'banner-msg', msg));
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 3400);
}

// ---------------------------------------------------------------- update
export function updateUI() {
  const info = S._info || { rates: {}, util: {} };
  drainEvents();

  // header
  setText($.floorChip, `🗼 Floor ${S.spire.floor}`);
  show($.floorChip, S.spire.floor > 0 || S.unlocked.spire);
  const gm = E.globalMult(S);
  setText($.multChip, `📈 ×${fmt(gm)}`);
  $.multChip.title = 'Global production multiplier (floors × sanctums × blessings × achievements)';
  show($.multChip, gm > 1.001);

  // hint + tutorial glow
  const hint = currentHint();
  show($.hint, !!hint);
  if (hint) {
    setText($.hintText, hint.text);
    setGlow(hint.el || null);
  } else {
    setGlow(null);
  }

  // gather button
  const cm = E.clickYieldMult(S);
  setText($.gather, `👐 Gather  +${nice(D.CLICK_YIELD.food * cm)} 🍎 +${nice(D.CLICK_YIELD.wood * cm)} 🪵`);

  // rally
  show($.rally, S.unlocked.rally);
  show($.rallyBar, S.unlocked.rally);
  if (S.unlocked.rally) {
    const t = S.stats.playTime;
    if (E.rallyActive(S)) {
      $.rally.disabled = true;
      setText($.rally, `📯 Rallying! ×${D.RALLY_MULT}`);
      setBar($.rallyBar, (S.rally.activeUntil - t) / D.RALLY_SECS, fmtTime(S.rally.activeUntil - t) + ' left');
    } else if (!E.rallyReady(S)) {
      $.rally.disabled = true;
      setText($.rally, '📯 Rally the camp');
      setBar($.rallyBar, 1 - (S.rally.readyAt - t) / D.RALLY_COOLDOWN, 'ready in ' + fmtTime(S.rally.readyAt - t));
    } else {
      $.rally.disabled = false;
      setText($.rally, `📯 Rally the camp  ×${D.RALLY_MULT}`);
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
      const ic = el('td', 'res-icon');
      ic.appendChild(icon(r.icon));
      ic.title = r.name;
      const name = el('td', 'res-name', r.name);
      const amt = el('td', 'res-amt', '');
      const rate = el('td', 'res-rate', '');
      tr.append(ic, name, amt, rate);
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
    `👥 ${S.villagers.length}/${E.housingCap(S)}` + (idle ? ` · 💤 ${idle} idle` : ''));

  // tabs: visibility + attention pulse on unlocked-but-unvisited
  for (const t of TABS) {
    show($.tabs[t.id], t.when(S));
    $.tabs[t.id].classList.toggle('pulse', t.when(S) && !S.seenTabs[t.id]);
  }
  if (!TABS.find(t => t.id === S._tab)?.when(S)) selectTab(firstVisibleTab());

  // qty buttons
  for (const q of [1, 10, 25, 'max']) {
    $.qtyBtns[q].classList.toggle('active', S.settings.buyQty === q);
  }

  // active panel only
  switch (S._tab) {
    case 'camp':
      for (const id in rows.bld) updateBuildingRow(rows.bld[id]);
      for (const id in rows.upg) updateUpgradeTile(rows.upg[id]);
      break;
    case 'jobs': {
      setText($.villCount, `Villagers: ${S.villagers.length} / ${E.housingCap(S)}`);
      const cost = D.recruitCost(S.villagers.length);
      const full = S.villagers.length >= E.housingCap(S);
      if (full) {
        $.recruitNote.textContent = '';
        $.recruitNote._key = 'full';
        $.recruitNote.appendChild(el('span', 'chip-cost no', '🏠 housing full — build Cabins in the Camp'));
        $.recruitBtn.disabled = true;
        setText($.recruitBtn._label, '➕ Recruit');
        $.recruitBtn._cost.textContent = '';
        $.recruitBtn._cost._key = 'full';
      } else {
        $.recruitNote.textContent = '';
        $.recruitNote._key = '';
        $.recruitBtn.disabled = !E.canAfford(S, cost);
        setText($.recruitBtn._label, '➕ Recruit');
        setCostInline($.recruitBtn._cost, cost);
      }
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
      `${D.RES[k].icon} ${v >= 0 ? '+' : ''}${fmt(Math.round(v))} ${D.RES[k].name}`));
  }
  for (const [k, v] of Object.entries(report.levels)) {
    ul.appendChild(el('div', 'pos', `${D.JOB[k].icon} ${D.JOB[k].name} +${v} level${v > 1 ? 's' : ''}`));
  }
  if (report.expeditions) ul.appendChild(el('div', 'pos', `🧭 ${report.expeditions} expeditions returned`));
  if (report.floors) ul.appendChild(el('div', 'pos', `🗼 ${report.floors} floor${report.floors > 1 ? 's' : ''} conquered!`));
  box.appendChild(ul);
  return box;
}

export function textAreaNode(value, placeholder) {
  const ta = el('textarea', 'save-ta');
  if (value) ta.value = value;
  if (placeholder) ta.placeholder = placeholder;
  return ta;
}
