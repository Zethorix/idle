// Rootspire — bootstrap and main loop.

import * as E from './engine.js';
import * as SV from './save.js';
import { initUI, updateUI, showModal, hideModal, offlineReportNode, textAreaNode } from './ui.js';

const TICK_MS = 200;          // logic cadence
const AUTOSAVE_MS = 10_000;
const SUSPEND_THRESHOLD = 120; // >2 min gap => treat as offline time

let S = SV.load();
let fresh = false;
if (!S) { S = E.newState(Date.now()); fresh = true; }

// Offline progress for returning players.
if (!fresh && S.savedAt) {
  const away = (Date.now() - S.savedAt) / 1000;
  if (away > 30) {
    const report = E.runOffline(S, away);
    S._events = [];   // the offline report covers these; don't replay toasts
    initUI(S, onPlayerAction);
    showModal('While you were away', offlineReportNode(report), [['Back to work', hideModal]]);
  } else {
    initUI(S, onPlayerAction);
  }
} else {
  initUI(S, onPlayerAction);
}

function onPlayerAction() { updateUI(); }

// ---------------------------------------------------------------- loop
let last = performance.now();
let sinceSave = 0;

setInterval(() => {
  const now = performance.now();
  let dt = (now - last) / 1000;
  last = now;
  if (dt <= 0) return;

  if (dt > SUSPEND_THRESHOLD) {
    // Tab was suspended for a while — run it as offline time with a report.
    const report = E.runOffline(S, dt);
    S._events = [];
    showModal('While you were away', offlineReportNode(report), [['Back to work', hideModal]]);
  } else {
    // Catch up in ≤1s slices so long throttled gaps stay accurate.
    while (dt > 0) {
      const step = Math.min(1, dt);
      E.tick(S, step);
      dt -= step;
    }
  }
  updateUI();

  sinceSave += TICK_MS;
  if (sinceSave >= AUTOSAVE_MS) {
    sinceSave = 0;
    if (!suppressSave) SV.save(S);
  }
}, TICK_MS);

// Set during hard reset / import so unload handlers can't re-save the old
// state over the wiped/replaced save.
let suppressSave = false;

// Spacebar = gather (unless typing in an input)
document.addEventListener('keydown', e => {
  if (e.code !== 'Space') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  e.preventDefault();
  E.doClick(S);
  updateUI();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && !suppressSave) SV.save(S);
});
window.addEventListener('beforeunload', () => { if (!suppressSave) SV.save(S); });

// ---------------------------------------------------------------- save UI
window.addEventListener('rs-save', () => {
  SV.save(S);
  flashTitle('saved');
});

let conflicted = false;
window.addEventListener('rs-conflict', () => {
  if (conflicted) return;
  conflicted = true;
  const p = document.createElement('p');
  p.textContent = 'Rootspire is running in another tab, which has saved more recently. ' +
    'This tab has stopped saving so it cannot overwrite that progress.';
  showModal('Another tab is playing', p, [
    ['Reload this tab', () => location.reload()],
  ]);
});

window.addEventListener('rs-export', () => {
  const blob = SV.exportSave(S);
  const ta = textAreaNode(blob);
  showModal('Export save', wrap(ta,
    'Copy this text somewhere safe. Import it on any device to continue.'), [
    ['Copy to clipboard', () => {
      ta.select();
      navigator.clipboard?.writeText(ta.value).catch(() => document.execCommand('copy'));
    }],
    ['Close', hideModal, 'small'],
  ]);
  ta.select();
});

window.addEventListener('rs-import', () => {
  const ta = textAreaNode('', 'Paste an exported save here…');
  showModal('Import save', wrap(ta,
    'This replaces your current progress with the imported save.'), [
    ['Import', () => {
      try {
        const imported = SV.importSave(ta.value);
        suppressSave = true;         // unload handlers must not overwrite it
        SV.save(imported);
        location.reload();
      } catch (e) {
        suppressSave = false;
        alert('That did not look like a valid save. (' + e.message + ')');
      }
    }],
    ['Cancel', hideModal, 'small'],
  ]);
});

window.addEventListener('rs-reset', () => {
  const ta = textAreaNode('', 'type RESET to confirm');
  showModal('Hard reset', wrap(ta,
    'This erases ALL progress permanently. Rootspire has no prestige resets — you never need to do this to progress. Type RESET to confirm.'), [
    ['Erase everything', () => {
      if (ta.value.trim().toUpperCase() !== 'RESET') {
        ta.classList.add('shake');
        ta.placeholder = 'you must type RESET first';
        setTimeout(() => ta.classList.remove('shake'), 500);
        return;
      }
      suppressSave = true;           // unload handlers must not re-save old state
      SV.wipe();
      location.reload();
    }, 'danger'],
    ['Cancel', hideModal, 'small'],
  ]);
});

function wrap(node, text) {
  const box = document.createElement('div');
  const p = document.createElement('p');
  p.textContent = text;
  box.append(p, node);
  return box;
}

function flashTitle(msg) {
  const t = document.title;
  document.title = `✓ ${msg} — Rootspire`;
  setTimeout(() => { document.title = t; }, 1200);
}
