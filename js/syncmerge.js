// Czysta logika synchronizacji (bez sieci i DOM) — testowana w tests/syncmerge.test.js.
// Zasady łączenia:
//   • wyniki ćwiczeń — suma sesji z obu urządzeń (klucz: ćwiczenie + czas sesji), usunięcie = znacznik `usuniety`,
//   • ustawienia, poziomy, plan, dokumenty — najnowsza wersja wygrywa (porównanie `ts` z urządzenia),
//   • statystyki czytania — każde urządzenie ma własny licznik, wyświetlana jest suma.
import { dayKey } from './lib.js';

export const HISTORY_MAX = 200;

/** Ustawienia tylko dla tego urządzenia — nie trafiają do chmury. */
const LOCAL_PREFS = new Set([
  'homeTab', 'openPlanEdit', 'librarySeeded',
  'ipCache', 'ipLib',          // pamięć podręczna wydania (tekst i tak jest w bibliotece)
  'infopigulaUrl',             // adres skryptu zawiera prywatny token — zostaje na urządzeniu
]);
export const isSyncedPref = (k) => !LOCAL_PREFS.has(k) && !k.startsWith('sync');

export const prefKey = (k) => `pref:${k}`;
export const readKey = (device) => `read@${device}`;

/* ---------- Wyniki ---------- */

export function resultRow(cwiczenie, entry, { name, unit }, { deleted = false, ts = Date.now() } = {}) {
  const { t, v, ...extra } = entry;
  return { cwiczenie, t, v: Number(v) || 0, extra, nazwa: name ?? null, jednostka: unit ?? null, usuniety: deleted, ts };
}

/** Wiersze wszystkich wyników z pamięci lokalnej (pierwsze wysłanie danych z urządzenia). */
export function allResultRows(results, ts = Date.now()) {
  const rows = [];
  for (const [id, r] of Object.entries(results || {})) {
    for (const e of r.history || []) rows.push(resultRow(id, e, r, { ts }));
  }
  return rows;
}

/**
 * Wkleja wiersze z chmury do `results` (mutuje). Zwraca dni treningu, które się pojawiły.
 * @returns {{changed: boolean, days: string[]}}
 */
export function mergeResultRows(results, rows) {
  let changed = false; const days = new Set(); const touched = new Set(); const removed = new Set();
  for (const row of rows) {
    const id = row.cwiczenie;
    const r = results[id];
    if (row.usuniety) {
      if (!r) continue;
      const before = r.history.length;
      r.history = r.history.filter((e) => e.t !== row.t);
      if (r.history.length !== before) { changed = true; touched.add(id); removed.add(id); }
      continue;
    }
    const target = (results[id] ||= { history: [], best: null });
    if (row.nazwa && !target.name) target.name = row.nazwa;
    if (row.jednostka && !target.unit) target.unit = row.jednostka;
    if (target.history.some((e) => e.t === row.t)) continue;
    target.history.push({ t: row.t, v: row.v, ...(row.extra || {}) });
    days.add(dayKey(new Date(row.t)));
    changed = true; touched.add(id);
  }
  for (const id of touched) {
    const r = results[id];
    r.history.sort((a, b) => a.t - b.t);
    if (r.history.length > HISTORY_MAX) r.history.splice(0, r.history.length - HISTORY_MAX);
    if (!r.history.length) { delete results[id]; continue; }
    const top = Math.max(...r.history.map((e) => e.v));
    // po usunięciu sesji rekord liczymy od nowa; inaczej zachowujemy rekord sprzed obcięcia historii do 200
    r.best = removed.has(id) || r.best == null ? top : Math.max(r.best, top);
  }
  return { changed, days: [...days] };
}

/* ---------- Najnowsza wersja wygrywa ---------- */

/** Czy wiersz z chmury jest nowszy niż lokalna wersja (ts lokalny brak = 0)? */
export const remoteWins = (localTs, remoteTs) => Number(remoteTs) > (Number(localTs) || 0);

/* ---------- Dokumenty ---------- */

const DOC_META = ['title', 'words', 'source', 'url', 'added', 'opened', 'pos', 'bookmarks', 'finished'];
export const docMeta = (doc) => Object.fromEntries(DOC_META.filter((k) => k in doc).map((k) => [k, doc[k]]));
/** Dokumenty wbudowane każde urządzenie ma własne — nie synchronizujemy ich. */
export const isSyncedDoc = (doc) => !!doc && !doc.builtin;

/* ---------- Statystyki czytania ---------- */

/** Suma dni czytania: to urządzenie + pozostałe urządzenia z chmury. */
export function mergeReadDays(local = {}, remotes = {}) {
  const out = {};
  for (const days of [local, ...Object.values(remotes).map((r) => r || {})]) {
    for (const [d, v] of Object.entries(days)) {
      const o = (out[d] ||= { words: 0, secs: 0 });
      o.words += v?.words || 0; o.secs += v?.secs || 0;
    }
  }
  return out;
}

/* ---------- Kolejka wysyłki ---------- */

/** Klucz pozycji w kolejce — kolejna zmiana tego samego wiersza zastępuje poprzednią. */
export function outboxKey(table, row) {
  if (table === 'wyniki') return `wyniki|${row.cwiczenie}|${row.t}`;
  if (table === 'stan') return `stan|${row.klucz}`;
  return `${table}|${row.id}`;
}
