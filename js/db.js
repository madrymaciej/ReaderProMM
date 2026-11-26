// Biblioteka dokumentów w IndexedDB (książki mogą mieć kilka MB — localStorage na to za mały).

const DB_NAME = 'readerpromm-library'; // nazwa wewnętrzna — nie zmieniać (zmiana skasowałaby bibliotekę)
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

// Synchronizacja podpina się tu (js/sync.js): każda zmiana dokumentu trafia do kolejki wysyłki.
// Zapisy z chmury idą z { silent: true }, żeby nie wracały do kolejki.
let onChange = null;
const notify = (doc, how, opts) => { if (!opts?.silent && doc) try { onChange?.(doc, how); } catch { /* ignoruj */ } };

export const Library = {
  setOnChange(fn) { onChange = fn; },
  /** Lista dokumentów bez pełnego tekstu (lżejsza do wyświetlenia). Pomija dokumenty, których tekst jeszcze się pobiera. */
  async list() {
    const all = await tx('readonly', (s) => wrap(s.getAll()));
    return (all || []).filter((d) => !d.needsText).map(({ text, ...meta }) => meta).sort((a, b) => (b.opened || b.added) - (a.opened || a.added));
  },
  get(id) { return tx('readonly', (s) => wrap(s.get(id))); },
  async put(doc, opts) {
    if (!opts?.silent) doc = { ...doc, ts: Date.now() };
    await tx('readwrite', (s) => wrap(s.put(doc)));
    notify(doc, 'put', opts);
  },
  async update(id, patch, opts) {
    const doc = await tx('readwrite', async (s) => {
      const d = await wrap(s.get(id));
      if (!d) return null;
      const next = { ...d, ...patch, ts: Date.now() };
      await wrap(s.put(next));
      return next;
    });
    notify(doc, 'update', opts);
    return doc;
  },
  async remove(id, opts) {
    const doc = await this.get(id);
    await tx('readwrite', (s) => wrap(s.delete(id)));
    if (doc) notify({ ...doc, ts: Date.now() }, 'remove', opts);
  },
  /** Wszystkie dokumenty z pełnym tekstem (kopia zapasowa). */
  async all() { return ((await tx('readonly', (s) => wrap(s.getAll()))) || []).filter((d) => !d.needsText); },
  /** `id` podajesz, gdy ten sam dokument może powstać na dwóch urządzeniach (np. wydanie Infopiguły). */
  async add({ title, text, source = 'Tekst', builtin = false, url = '', id = '' }) {
    const words = text.split(/\s+/).filter(Boolean).length;
    const doc = {
      id: id || `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      title: (title || 'Bez tytułu').slice(0, 160), text, words, source, builtin, url,
      added: Date.now(), opened: 0, pos: 0, bookmarks: [], finished: false,
    };
    await this.put(doc);
    return doc;
  },
};
