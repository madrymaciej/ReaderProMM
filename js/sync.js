// Synchronizacja przez Supabase: logowanie e-mail + hasło, kolejka wysyłki (offline), pobieranie zmian, Realtime.
// Dane zapisują się najpierw lokalnie (jak dotąd); ten moduł tylko dosyła je do chmury i wkleja zmiany z innych urządzeń.
// Biblioteka supabase-js (vendor/supabase) ładuje się dopiero, gdy jesteś zalogowany lub się logujesz.
import { SUPABASE } from './config.js';
import {
  isSyncedPref, prefKey, readKey, resultRow, allResultRows, mergeResultRows,
  remoteWins, docMeta, isSyncedDoc, outboxKey,
} from './syncmerge.js';

const STATE_KEY = 'readerpromm-sync';
const AUTH_KEY = 'sc-supabase-auth';
const LIB_SRC = './vendor/supabase/supabase.min.js';
const TABLES = { wyniki: 'user_id,cwiczenie,t', stan: 'user_id,klucz', dokumenty: 'user_id,id', teksty: 'user_id,id' };
const PULL_PAGE = 1000;
const OVERLAP_MS = 60_000;          // zakładka kursora: zmiany zapisane „równolegle” nie przepadną (łączenie jest idempotentne)
const MAX_TEXT = 8 * 1024 * 1024;   // dłuższych tekstów nie wysyłamy (książka zostaje tylko na tym urządzeniu)

export function createSync({ Store, Library }) {
  const configured = !!(SUPABASE.url && SUPABASE.key);
  const state = load();
  let client = null; let uid = null; let email = ''; let channel = null;
  let flushTimer = null; let busy = null; let lastError = '';
  const listeners = { status: new Set(), remote: new Set(), signedOut: new Set() };

  function load() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STATE_KEY)) || {}; } catch { /* brak dostępu */ }
    s.device ||= `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    s.outbox ||= {}; s.cursor ||= {}; s.seq ||= 0; s.needText ||= [];
    return s;
  }
  const save = () => { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* brak dostępu */ } };
  const emit = (kind) => listeners[kind].forEach((fn) => { try { fn(status()); } catch { /* ignoruj */ } });

  function status() {
    return {
      configured, signedIn: !!uid, email, online: navigator.onLine !== false,
      pending: Object.keys(state.outbox).length, last: state.last || 0, error: lastError,
    };
  }

  /* ---------- Kolejka wysyłki ---------- */

  function queue(table, row) {
    if (!configured || !state.uid) return;     // przed pierwszym logowaniem: wszystko wyślemy przy logowaniu
    state.outbox[outboxKey(table, row)] = { table, row, q: ++state.seq };
    save(); emit('status'); scheduleFlush();
  }
  function scheduleFlush(ms = 1500) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { flush().catch(() => {}); }, ms);
  }

  async function flush() {
    if (!client || !uid || navigator.onLine === false) return;
    if (busy) return busy;
    busy = (async () => {
      const entries = Object.entries(state.outbox).sort((a, b) => a[1].q - b[1].q);
      const groups = {};
      for (const [k, e] of entries) (groups[e.table] ||= []).push([k, e]);
      try {
        for (const table of ['stan', 'wyniki', 'dokumenty']) {
          const list = groups[table] || [];
          for (let i = 0; i < list.length; i += 200) {
            const part = list.slice(i, i + 200);
            const { error } = await client.from(table)
              .upsert(part.map(([, e]) => ({ ...e.row, user_id: uid })), { onConflict: TABLES[table] });
            if (error) throw error;
            done(part);
          }
        }
        for (const item of groups.teksty || []) {
          const doc = await Library.get(item[1].row.id);
          if (doc?.text && doc.text.length <= MAX_TEXT) {
            const { error } = await client.from('teksty')
              .upsert({ user_id: uid, id: doc.id, tekst: doc.text }, { onConflict: TABLES.teksty });
            if (error) throw error;
          }
          done([item]);
        }
        lastError = '';
      } catch (err) {
        lastError = describe(err);
      } finally {
        save(); emit('status');
      }
    })();
    try { await busy; } finally { busy = null; }
  }
  /** Usuń z kolejki tylko te pozycje, które nie zmieniły się w trakcie wysyłki. */
  function done(part) {
    for (const [k, e] of part) if (state.outbox[k]?.q === e.q) delete state.outbox[k];
  }

  /* ---------- Pobieranie zmian ---------- */

  async function pull() {
    if (!client || !uid || navigator.onLine === false) return;
    let changed = false;
    try {
      for (const table of ['stan', 'wyniki', 'dokumenty']) {
        let since = state.cursor[table] ? new Date(isoMs(state.cursor[table]) - OVERLAP_MS).toISOString() : null;
        for (;;) {
          let q = client.from(table).select('*').order('zmieniono', { ascending: true }).limit(PULL_PAGE);
          if (since) q = q.gt('zmieniono', since);
          const { data, error } = await q;
          if (error) throw error;
          if (data.length) {
            changed = (await apply(table, data)) || changed;
            since = data[data.length - 1].zmieniono;
            if (!state.cursor[table] || isoMs(since) > isoMs(state.cursor[table])) state.cursor[table] = since;
          }
          if (data.length < PULL_PAGE) break;
        }
      }
      changed = (await fetchTexts()) || changed;
      state.last = Date.now(); lastError = '';
    } catch (err) {
      lastError = describe(err);
    }
    save(); emit('status');
    if (changed) emit('remote');
  }

  /** Wkleja wiersze z chmury do danych lokalnych. Nic stąd nie wraca do kolejki wysyłki. */
  async function apply(table, rows) {
    let changed = false;
    if (table === 'wyniki') {
      const r = mergeResultRows(Store.data.results, rows);
      changed = r.changed;
      for (const d of r.days) if (!Store.data.days.includes(d)) Store.data.days.push(d);
    } else if (table === 'stan') {
      const ts = (Store.data.prefTs ||= {});
      for (const row of rows) {
        if (row.klucz.startsWith('pref:')) {
          const k = row.klucz.slice(5);
          if (!isSyncedPref(k) || !remoteWins(ts[k], row.ts)) continue;
          if (row.usuniety) delete Store.data.prefs[k]; else Store.data.prefs[k] = row.wartosc;
          ts[k] = row.ts; changed = true;
        } else if (row.klucz.startsWith('read@')) {
          const dev = row.klucz.slice(5);
          if (dev === state.device) continue;
          (Store.data.readRemote ||= {})[dev] = row.wartosc || {};
          for (const [d, v] of Object.entries(row.wartosc || {})) {
            if (v?.words > 0 && !Store.data.days.includes(d)) Store.data.days.push(d);
          }
          changed = true;
        }
      }
    } else if (table === 'dokumenty') {
      for (const row of rows) {
        const local = await Library.get(row.id);
        if (local && !remoteWins(local.ts, row.ts)) continue;
        if (row.usuniety) {
          if (local) { await Library.remove(row.id, { silent: true }); changed = true; }
          continue;
        }
        if (local) {
          await Library.put({ ...local, ...row.meta, ts: row.ts }, { silent: true });
        } else {
          // Tekst dociągamy osobno; do tego czasu dokument jest ukryty na liście biblioteki.
          await Library.put({ bookmarks: [], ...row.meta, id: row.id, text: '', needsText: true, ts: row.ts }, { silent: true });
          if (!state.needText.includes(row.id)) state.needText.push(row.id);
        }
        changed = true;
      }
    }
    if (changed) Store.save();
    return changed;
  }

  async function fetchTexts() {
    let changed = false;
    for (const id of [...state.needText]) {
      const { data, error } = await client.from('teksty').select('tekst').eq('id', id).maybeSingle();
      if (error) throw error;
      const doc = await Library.get(id);
      if (doc && data?.tekst != null) {
        const { needsText, ...rest } = doc;
        await Library.put({ ...rest, text: data.tekst }, { silent: true });
        changed = true;
      }
      if (!doc || data) state.needText = state.needText.filter((x) => x !== id);
    }
    return changed;
  }

  /* ---------- Realtime ---------- */

  function subscribe() {
    if (channel || !client || !uid) return;
    channel = client.channel(`sc-${state.device}`);
    for (const table of ['wyniki', 'stan', 'dokumenty']) {
      channel.on('postgres_changes', { event: '*', schema: SUPABASE.schema, table, filter: `user_id=eq.${uid}` }, async (p) => {
        if (!p.new || !Object.keys(p.new).length) return;
        const changed = await apply(table, [p.new]);
        if (table === 'dokumenty') await fetchTexts().catch(() => {});
        if (changed) emit('remote');
      });
    }
    // Po każdym (ponownym) połączeniu dociągamy to, co mogło umknąć podczas przerwy.
    channel.subscribe((st) => { if (st === 'SUBSCRIBED') pull(); });
  }
  async function unsubscribe() {
    if (channel) { try { await client.removeChannel(channel); } catch { /* ignoruj */ } }
    channel = null;
  }

  /* ---------- Pierwsze wysłanie wszystkich danych z urządzenia ---------- */

  async function queueAll() {
    const now = Date.now();
    const ts = (Store.data.prefTs ||= {});
    for (const row of allResultRows(Store.data.results, now)) queue('wyniki', row);
    for (const [k, v] of Object.entries(Store.data.prefs)) {
      if (isSyncedPref(k)) queue('stan', { klucz: prefKey(k), wartosc: v, usuniety: false, ts: (ts[k] ||= now) });
    }
    queueRead();
    for (const d of await Library.list()) {
      if (isSyncedDoc(d) && !d.needsText) { queueDoc(d); queue('teksty', { id: d.id }); }
    }
    Store.save();
  }

  /* ---------- Haki wywoływane przez Store i Library ---------- */

  function queuePref(k, v, deleted = false) {
    if (!isSyncedPref(k)) return;
    const ts = Date.now();
    (Store.data.prefTs ||= {})[k] = ts;
    queue('stan', { klucz: prefKey(k), wartosc: deleted ? null : v, usuniety: deleted, ts });
  }
  function queueResult(id, entry, meta, deleted = false) {
    queue('wyniki', resultRow(id, entry, meta, { deleted }));
  }
  function queueRead() {
    queue('stan', { klucz: readKey(state.device), wartosc: Store.data.read?.days || {}, usuniety: false, ts: Date.now() });
  }
  function queueDoc(doc, { deleted = false, text = false } = {}) {
    if (!isSyncedDoc(doc) || doc.needsText) return;
    queue('dokumenty', { id: doc.id, meta: deleted ? {} : docMeta(doc), usuniety: deleted, ts: doc.ts || Date.now() });
    if (text && !deleted) queue('teksty', { id: doc.id });
  }

  /** „Wyczyść wyniki i ustawienia” — usuwa także z chmury (inne urządzenia też je usuną). */
  async function wipeAll() {
    for (const [id, r] of Object.entries(Store.data.results)) for (const e of r.history) queueResult(id, e, r, true);
    for (const k of Object.keys(Store.data.prefs)) queuePref(k, null, true);
    if (client && uid) {
      const ts = Date.now();
      await client.from('wyniki').update({ usuniety: true, ts }).eq('usuniety', false);
      await client.from('stan').update({ usuniety: true, wartosc: null, ts }).like('klucz', 'pref:%').eq('usuniety', false);
    }
  }

  /* ---------- Logowanie ---------- */

  function loadLib() {
    if (window.supabase?.createClient) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = LIB_SRC; s.onload = res; s.onerror = () => rej(new Error('Nie udało się wczytać biblioteki Supabase.'));
      document.head.append(s);
    });
  }
  async function ensureClient() {
    if (client) return client;
    await loadLib();
    client = window.supabase.createClient(SUPABASE.url, SUPABASE.key, {
      db: { schema: SUPABASE.schema },
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_KEY },
    });
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { uid = null; email = ''; unsubscribe(); emit('status'); emit('signedOut'); }
      else if (session?.user) { uid = session.user.id; email = session.user.email || ''; }
    });
    return client;
  }

  async function start() {
    const { data } = await client.auth.getSession();
    const user = data.session?.user;
    if (!user) { uid = null; emit('status'); return; }
    uid = user.id; email = user.email || '';
    if (state.uid !== uid) {
      // Pierwsze logowanie na tym urządzeniu (lub inne konto): najpierw pobierz chmurę — dla ustawień, które już tam są,
      // wygrywa wersja z chmury (lokalne nie mają jeszcze czasu zmiany) — potem wyślij wszystko, czego w chmurze brak.
      state.uid = uid; state.cursor = {}; state.outbox = {}; save();
      await pull();
      await queueAll();
    }
    emit('status');
    await flush();
    await pull();
    subscribe();
  }

  async function signIn(mail, password) {
    if (!configured) throw new Error('Synchronizacja nie jest skonfigurowana (js/config.js).');
    await ensureClient();
    const { error } = await client.auth.signInWithPassword({ email: mail.trim(), password });
    if (error) throw new Error(describe(error));
    await start();
  }
  async function signOut() {
    await flush().catch(() => {});
    await unsubscribe();
    if (client) await client.auth.signOut({ scope: 'local' });
    uid = null; email = ''; emit('status'); emit('signedOut');
  }
  async function syncNow() { await flush(); await pull(); }

  /** Czy na urządzeniu jest zapisana sesja (bez sieci) — podstawa ekranu logowania przy starcie. */
  function hasSession() {
    try { return !!localStorage.getItem(AUTH_KEY); } catch { return false; }
  }

  async function init() {
    if (!configured || !hasSession()) return;
    try { await ensureClient(); await start(); } catch (err) { lastError = describe(err); emit('status'); }
  }

  addEventListener('online', () => { flush().then(pull); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flush().then(pull);
    else flush();                                  // przed uśpieniem aplikacji spróbuj dosłać kolejkę
  });

  return {
    configured, init, signIn, signOut, syncNow, wipeAll, queueAll, status, hasSession,
    queuePref, queueResult, queueRead, queueDoc,
    onStatus: (fn) => listeners.status.add(fn),
    onRemote: (fn) => listeners.remote.add(fn),
    onSignedOut: (fn) => listeners.signedOut.add(fn),
    get device() { return state.device; },
  };
}

/** Czas z Postgresa (mikrosekundy) → ms; Safari nie zawsze parsuje więcej niż 3 cyfry ułamka. */
const isoMs = (s) => Date.parse(String(s).replace(/(\.\d{3})\d+/, '$1'));

function describe(err) {
  const m = String(err?.message || err || 'Nieznany błąd');
  if (/invalid login credentials/i.test(m)) return 'Nieprawidłowy e-mail lub hasło.';
  if (/failed to fetch|network|load failed/i.test(m)) return 'Brak połączenia — zmiany czekają w kolejce.';
  if (/jwt|token/i.test(m)) return 'Sesja wygasła — zaloguj się ponownie.';
  return m;
}
