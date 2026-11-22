// Biblioteka dokumentów w IndexedDB (książki mogą mieć kilka MB — localStorage na to za mały).

const DB_NAME = 'readerpromm-library';
const STORE = 'docs';
let dbp = null;

function open() {
  dbp ||= new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => { dbp = null; rej(req.error); };
  });
  return dbp;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; });
    t.oncomplete = () => res(result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const Library = {
  /** Lista dokumentów bez pełnego tekstu (lżejsza do wyświetlenia). */
  async list() {
    const all = await tx('readonly', (s) => wrap(s.getAll()));
    return (all || []).map(({ text, ...meta }) => meta).sort((a, b) => (b.opened || b.added) - (a.opened || a.added));
  },
  get(id) { return tx('readonly', (s) => wrap(s.get(id))); },
  put(doc) { return tx('readwrite', (s) => wrap(s.put(doc))); },
  async update(id, patch) {
    return tx('readwrite', async (s) => {
      const doc = await wrap(s.get(id));
      if (doc) await wrap(s.put({ ...doc, ...patch }));
      return doc;
    });
  },
  remove(id) { return tx('readwrite', (s) => wrap(s.delete(id))); },
  /** Wszystkie dokumenty z pełnym tekstem (kopia zapasowa). */
  async all() { return (await tx('readonly', (s) => wrap(s.getAll()))) || []; },
  async add({ title, text, source = 'Tekst', builtin = false, url = '' }) {
    const words = text.split(/\s+/).filter(Boolean).length;
    const doc = {
      id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      title: (title || 'Bez tytułu').slice(0, 160), text, words, source, builtin, url,
      added: Date.now(), opened: 0, pos: 0, bookmarks: [], finished: false,
    };
    await this.put(doc);
    return doc;
  },
};
