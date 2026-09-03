/**
 * The fallback store: a single serialised SQLite image, kept in IndexedDB.
 *
 * Used only when OPFS is unavailable (older iOS Safari, a locked-down WebView,
 * a browser with site data restricted). It is strictly worse than OPFS — the
 * whole database is rewritten after every write transaction — but it is real
 * durability, and the alternative is losing the shop's book on a tab close.
 */

const DB_NAME = 'dukaan-fallback';
const STORE = 'files';
const KEY = 'dukaan.sqlite3';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

export async function loadImage(): Promise<Uint8Array | null> {
  const db = await openIdb();
  try {
    return await new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () => {
        const value = request.result as ArrayBuffer | Uint8Array | undefined;
        if (!value) return resolve(null);
        resolve(value instanceof Uint8Array ? value : new Uint8Array(value));
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
    });
  } finally {
    db.close();
  }
}

export async function saveImage(bytes: Uint8Array): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      // Copy into a fresh buffer: the source is a view over WASM memory, which
      // the engine will happily reuse before the structured clone completes.
      tx.objectStore(STORE).put(bytes.slice(), KEY);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    });
  } finally {
    db.close();
  }
}

export async function clearImage(): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
    });
  } finally {
    db.close();
  }
}
