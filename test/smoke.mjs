// Rootspire browser smoke test: boots the page, plays a little, saves, reloads.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const ROOT = '/Users/charles/github/idle';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const data = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('nope');
  }
});
await new Promise(r => server.listen(8123, r));

const browser = await chromium.launch();
let page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const ok = (msg) => console.log('ok:', msg);

await page.goto('http://localhost:8123/');
await page.waitForTimeout(600);
if (errors.length) fail('console errors on boot: ' + errors.join(' | '));
else ok('boot clean');

// gather clicks
const gather = page.locator('button.gather:not(.rally)');
for (let i = 0; i < 20; i++) await gather.click();
await page.waitForTimeout(400);
const wood = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('rootspire-save') || '{}')?.res?.wood ?? -1);
// not saved yet necessarily; read from DOM instead
const resText = await page.locator('.res-table').innerText();
if (!/Wood/.test(resText)) fail('no Wood row after clicks: ' + resText);
else ok('gather produces resources: ' + resText.replace(/\s+/g, ' ').slice(0, 80));

// Camp tab should exist after 10 wood
await page.waitForTimeout(200);
const campVisible = await page.locator('button.tab', { hasText: 'Camp' }).isVisible();
if (!campVisible) fail('Camp tab not visible after gathering');
else ok('Camp tab unlocked');

// buy a garden
await page.locator('button.tab', { hasText: 'Camp' }).click();
for (let i = 0; i < 30; i++) await gather.click();
await page.waitForTimeout(300);
const buyBtns = page.locator('.card button.buy:not([disabled])');
if (await buyBtns.count() === 0) fail('no affordable building');
else { await buyBtns.first().click(); ok('bought a building'); }
await page.waitForTimeout(300);

// villagers tab appears after garden
const villTab = page.locator('button.tab', { hasText: 'Villagers' });
if (!await villTab.isVisible()) fail('Villagers tab did not unlock after garden');
else ok('Villagers tab unlocked');

// exercise the other tabs via state injection: give resources, force unlocks
await page.evaluate(() => new Promise(r => setTimeout(r, 100)));

// save via button, reload, verify persistence
await page.locator('.savebtns button', { hasText: '💾' }).first().click();
await page.waitForTimeout(200);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rootspire-save')));
if (!saved || (saved.buildings.garden || 0) < 1) fail('save missing garden: ' + JSON.stringify(saved?.buildings));
else ok('save contains garden');

await page.reload();
await page.waitForTimeout(600);
if (errors.length) fail('console errors after reload: ' + errors.join(' | '));
const resText2 = await page.locator('.res-table').innerText();
if (!/Wood/.test(resText2)) fail('resources lost after reload');
else ok('state persists across reload');

// simulate a mid/late-game save to exercise every panel (spire, foreman, industry)
const lateSave = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('rootspire-save'));
  s.res = Object.fromEntries(Object.keys(s.res).map(k => [k, 1e6]));
  s.lifetime = { ...s.res };
  s.spire.floor = 5;
  s.savedAt = Date.now() - 3600 * 1000;   // exercise the offline path too
  s.unlocked = { buildings: true, villagers: true, tier1: true, market: true,
    spire: true, blessings: true, tier2: true, foreman: true, autoexpedition: true };
  s.converters = { smelter: { count: 3, on: true }, forge: { count: 1, on: true } };
  s.villagers = [{ name: 'Bram' }, { name: 'Isolde' }, { name: 'Fenn' }];
  s.rules = [];
  return JSON.stringify(s);
});
await page.close();   // its unload-save fires now, before the next page boots
page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(save => localStorage.setItem('rootspire-save', save), lateSave);
await page.goto('http://localhost:8123/');
await page.waitForTimeout(800);
// close the offline modal if present
const modal = page.locator('.modal-wrap');
if (await modal.isVisible()) {
  await page.locator('.modal button').first().click();
  ok('offline modal shown & dismissed');
}
for (const tab of ['Camp', 'Villagers', 'Industry', 'Spire', 'Foreman', 'Chronicle']) {
  const t = page.locator('button.tab', { hasText: tab });
  if (!await t.isVisible()) { fail(`tab ${tab} not visible in late-game state`); continue; }
  await t.click();
  await page.waitForTimeout(250);
}
if (errors.length) fail('console errors while touring tabs: ' + errors.join(' | '));
else ok('all tabs render without errors');

// foreman: add a rule
await page.locator('button.tab', { hasText: 'Foreman' }).click();
await page.locator('button', { hasText: '+ Add rule' }).click();
await page.waitForTimeout(300);
const ruleCount = await page.locator('.rule').count();
if (ruleCount !== 1) fail('rule not added');
else ok('foreman rule added');

// spire: launch expedition
await page.locator('button.tab', { hasText: 'Spire' }).click();
const launch = page.locator('button', { hasText: 'Launch expedition' });
if (await launch.isEnabled()) { await launch.click(); ok('expedition launched'); }
else fail('expedition launch disabled with 1e6 resources');
await page.waitForTimeout(300);

// export modal
await page.locator('.savebtns button', { hasText: 'export' }).click();
await page.waitForTimeout(200);
const ta = page.locator('.save-ta');
const blob = await ta.inputValue();
if (!blob || blob.length < 100) fail('export blob too small');
else ok('export produces save blob (' + blob.length + ' chars)');

// hard reset: type RESET, confirm, verify save is actually gone after reload.
// Run in a fresh page: `page` carries an addInitScript that re-plants the
// injected save on every navigation, which would mask the wipe.
await page.close();
page = await browser.newPage();
await page.goto('http://localhost:8123/');
await page.waitForTimeout(400);
await page.locator('.savebtns button.danger').click();
await page.locator('.save-ta').fill('reset');   // case-insensitive accept
await page.locator('.modal button', { hasText: 'Erase everything' }).click();
await page.waitForTimeout(900);                 // reload happens
const afterReset = await page.evaluate(() => {
  const raw = localStorage.getItem('rootspire-save');
  return raw ? JSON.parse(raw) : null;
});
// after reload a fresh game may have autosaved a near-empty state; both null and
// a fresh save (no floors, no buildings) count as a successful wipe
if (afterReset && (afterReset.spire?.floor > 0 || (afterReset.buildings?.garden || 0) > 0)) {
  fail('hard reset did not wipe progress: ' + JSON.stringify({ floor: afterReset.spire?.floor, buildings: afterReset.buildings }));
} else ok('hard reset wipes progress (and stays wiped after reload)');

if (errors.length) fail('total console errors: ' + errors.join(' | '));
console.log(process.exitCode ? '\nSMOKE TEST FAILED' : '\nSMOKE TEST PASSED');
await browser.close();
server.close();
