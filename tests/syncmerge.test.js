import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeResultRows, allResultRows, resultRow, remoteWins, isSyncedPref, mergeReadDays, outboxKey, docMeta, isSyncedDoc, HISTORY_MAX,
} from '../js/syncmerge.js';

const meta = { name: 'Tablica', unit: 'liczb' };

test('wyniki: sesje z dwóch urządzeń się sumują, duplikaty są pomijane', () => {
  const results = { schulte: { name: 'Tablica', unit: 'liczb', best: 20, history: [{ t: 1000, v: 20 }] } };
  const rows = [resultRow('schulte', { t: 2000, v: 25, size: 5 }, meta), resultRow('schulte', { t: 1000, v: 20 }, meta)];
  const r = mergeResultRows(results, rows);
  assert.equal(r.changed, true);
  assert.deepEqual(results.schulte.history.map((e) => e.t), [1000, 2000]);
  assert.equal(results.schulte.history[1].size, 5);
  assert.equal(results.schulte.best, 25);
  assert.equal(mergeResultRows(results, rows).changed, false, 'ponowne wklejenie nic nie zmienia');
});

test('wyniki: znacznik usunięcia kasuje sesję i przelicza rekord', () => {
  const results = { sfera: { best: 30, history: [{ t: 1, v: 10 }, { t: 2, v: 30 }] } };
  mergeResultRows(results, [resultRow('sfera', { t: 2, v: 30 }, meta, { deleted: true })]);
  assert.deepEqual(results.sfera.history, [{ t: 1, v: 10 }]);
  assert.equal(results.sfera.best, 10);
  mergeResultRows(results, [resultRow('sfera', { t: 1, v: 10 }, meta, { deleted: true })]);
  assert.equal(results.sfera, undefined, 'ćwiczenie bez sesji znika');
});

test('wyniki: nowe ćwiczenie z chmury, historia przycięta do limitu, rekord zachowany', () => {
  const results = {};
  const rows = Array.from({ length: HISTORY_MAX + 5 }, (_, i) => resultRow('rsvp', { t: i + 1, v: i === 0 ? 999 : 5 }, meta));
  const r = mergeResultRows(results, rows);
  assert.equal(results.rsvp.history.length, HISTORY_MAX);
  assert.equal(results.rsvp.name, 'Tablica');
  assert.ok(r.days.length >= 1);
  assert.equal(results.rsvp.best, 5, 'przy pierwszym wklejeniu rekord liczony z zachowanej historii');
  results.rsvp.best = 999;
  mergeResultRows(results, [resultRow('rsvp', { t: 10_000, v: 6 }, meta)]);
  assert.equal(results.rsvp.best, 999, 'rekord sprzed przycięcia nie przepada');
});

test('allResultRows: wszystkie sesje do pierwszej wysyłki', () => {
  const rows = allResultRows({ a: { name: 'A', unit: 'x', history: [{ t: 1, v: 2 }, { t: 3, v: 4, extra: 1 }] } }, 77);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], { cwiczenie: 'a', t: 3, v: 4, extra: { extra: 1 }, nazwa: 'A', jednostka: 'x', usuniety: false, ts: 77 });
});

test('najnowsza wersja wygrywa', () => {
  assert.equal(remoteWins(undefined, 5), true);
  assert.equal(remoteWins(10, 5), false);
  assert.equal(remoteWins(5, 5), false, 'remis = zostaje lokalna (echo własnej zmiany)');
  assert.equal(remoteWins(5, 6), true);
});

test('ustawienia tylko lokalne nie są synchronizowane', () => {
  for (const k of ['homeTab', 'ipCache', 'ipLib', 'infopigulaUrl', 'librarySeeded', 'syncX']) assert.equal(isSyncedPref(k), false, k);
  for (const k of ['plan', 'lvl-sfera', 'reader', 'rsvpWpm', 'ipPos']) assert.equal(isSyncedPref(k), true, k);
});

test('statystyki czytania: suma urządzeń', () => {
  const sum = mergeReadDays({ '2026-11-26': { words: 100, secs: 60 } }, { u2: { '2026-11-26': { words: 50, secs: 30 }, '2026-11-25': { words: 10, secs: 5 } } });
  assert.deepEqual(sum, { '2026-11-26': { words: 150, secs: 90 }, '2026-11-25': { words: 10, secs: 5 } });
});

test('kolejka: ta sama zmiana zastępuje poprzednią', () => {
  assert.equal(outboxKey('stan', { klucz: 'pref:plan' }), 'stan|pref:plan');
  assert.equal(outboxKey('wyniki', { cwiczenie: 'a', t: 1 }), 'wyniki|a|1');
  assert.equal(outboxKey('dokumenty', { id: 'd1' }), 'dokumenty|d1');
});

test('dokumenty: metadane bez tekstu, wbudowane pomijane', () => {
  const m = docMeta({ id: 'x', text: 'długi', title: 'T', pos: 3, bookmarks: [] });
  assert.deepEqual(m, { title: 'T', pos: 3, bookmarks: [] });
  assert.equal(isSyncedDoc({ builtin: true }), false);
  assert.equal(isSyncedDoc({ builtin: false }), true);
});
