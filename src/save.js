// Persistence: localStorage autosave + base64 export/import.

import { migrate, SAVE_VERSION } from './engine.js';

const KEY = 'rootspire-save';

// Multi-tab guard: if another tab has written a newer save than anything this
// tab wrote, stop overwriting and let the UI warn the player.
let lastWrite = 0;

export function save(s) {
  try {
    if (lastWrite) {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const otherAt = JSON.parse(raw).savedAt || 0;
        if (otherAt > lastWrite + 500) {
          if (typeof window !== 'undefined') window.dispatchEvent(new Event('rs-conflict'));
          return false;
        }
      }
    }
    s.savedAt = Date.now();
    localStorage.setItem(KEY, JSON.stringify(strip(s)));
    lastWrite = s.savedAt;
    return true;
  } catch (e) {
    console.error('save failed', e);
    return false;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s.version !== 'number' || s.version > SAVE_VERSION) return null;
    lastWrite = s.savedAt || Date.now();
    return migrate(s, Date.now());
  } catch (e) {
    console.error('load failed', e);
    return null;
  }
}

export function wipe() { localStorage.removeItem(KEY); }

export function exportSave(s) {
  s.savedAt = Date.now();
  return btoa(unescape(encodeURIComponent(JSON.stringify(strip(s)))));
}

export function importSave(text) {
  const s = JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
  if (typeof s.version !== 'number') throw new Error('not a Rootspire save');
  return migrate(s, Date.now());
}

// Drop transient fields (leading underscore) before serializing.
function strip(s) {
  const out = {};
  for (const k in s) if (!k.startsWith('_')) out[k] = s[k];
  return out;
}
