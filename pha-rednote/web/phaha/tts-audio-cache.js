// Successful, trimmed audio only. IndexedDB survives reload; memory fallback works in private mode.
const memory = new Map();
let database;
async function open() {
  if (!globalThis.indexedDB) return null;
  if (!database) database = new Promise(resolve => {
    let finished = false;
    const timer = setTimeout(() => finish(null), 2000);
    const finish = db => { if (finished) { db?.close(); return; } finished = true; clearTimeout(timer); resolve(db); };
    try {
      const req = indexedDB.open('phaha-tts-audio-v1', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('audio', {keyPath: 'id'});
      req.onsuccess = () => { const db = req.result; db.onversionchange = () => { db.close(); database = null; }; finish(db); };
      req.onerror = req.onblocked = () => finish(null);
    } catch { finish(null); }
  });
  return database;
}
export async function audioCacheId(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
}
async function transaction(id, value) {
  const db = await open(); if (!db) return null;
  return new Promise(resolve => {
    let tx, result = null, done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(timer); resolve(result); } };
    const timer = setTimeout(() => { try { tx?.abort(); } catch {} finish(); }, 2000);
    try {
      tx = db.transaction('audio', value ? 'readwrite' : 'readonly');
      const store = tx.objectStore('audio'), req = value ? store.put({...value, id}) : store.get(id);
      req.onsuccess = () => { if (!value) result = req.result || null; };
      tx.oncomplete = finish; tx.onerror = tx.onabort = finish;
    } catch { finish(); }
  });
}
export async function readAudio(id) {
  const cached = memory.get(id) || await transaction(id);
  if (!cached || !(cached.mau instanceof Float32Array) || !cached.mau.length) return null;
  memory.set(id, cached); return cached;
}
export async function saveAudio(id, value) {
  if (!(value?.mau instanceof Float32Array) || !value.mau.length) return;
  memory.set(id, value); await transaction(id, value);
}
