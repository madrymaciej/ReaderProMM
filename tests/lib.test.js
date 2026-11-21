import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mutate, WORDS, letterGrid, numberRound, orpIndex, chunk, tokenize, delayFor, adapt, streak, dayKey, shuffle } from '../js/lib.js';
import { TEXTS } from '../js/texts.js';

test('mutate zawsze zwraca inne słowo', () => {
  for (const w of WORDS) for (let i = 0; i < 20; i++) assert.notEqual(mutate(w), w);
});
test('shuffle zachowuje elementy', () => {
  const a = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(shuffle(a).sort(), a);
});
test('letterGrid ma dokładnie zadaną liczbę celów', () => {
  const { target, cells } = letterGrid(80, 9);
  assert.equal(cells.length, 80);
  assert.equal(cells.filter((c) => c === target).length, 9);
});
test('numberRound: unikalne liczby, cel w środku, ta sama długość', () => {
  for (let i = 0; i < 50; i++) {
    const { target, cells } = numberRound(5, 20);
    assert.equal(new Set(cells).size, cells.length);
    assert.ok(cells.includes(target));
    assert.ok(cells.every((c) => c.length === 5));
  }
});
test('orpIndex i chunk', () => {
  assert.equal(orpIndex('a'), 0);
  assert.equal(orpIndex('dom'), 1);
  assert.equal(orpIndex('książka'), 2);
  assert.deepEqual(chunk(tokenize(' a  b c\nd '), 3), ['a b c', 'd']);
});
test('delayFor: 300 WPM = 200 ms, dłużej na kropce', () => {
  assert.equal(delayFor('dom', 300), 200);
  assert.ok(delayFor('dom.', 300) > 200);
});
test('adapt podnosi poziom po 2 trafieniach i obniża po błędzie', () => {
  let s = { level: 1, streak: 0, maxLevel: 1 };
  s = adapt(s, true, 10); s = adapt(s, true, 10);
  assert.equal(s.level, 2);
  s = adapt(s, false, 10);
  assert.equal(s.level, 1); assert.equal(s.maxLevel, 2);
});
test('streak liczy kolejne dni', () => {
  const t = new Date(2026, 10, 21);
  const d = (n) => { const x = new Date(t); x.setDate(x.getDate() - n); return dayKey(x); };
  assert.equal(streak([d(0), d(1), d(2), d(4)], t), 3);
  assert.equal(streak([d(1), d(2)], t), 2);
  assert.equal(streak([d(3)], t), 0);
});
test('teksty mają poprawne pytania', () => {
  for (const t of TEXTS) for (const q of t.questions) assert.ok(q.ok >= 0 && q.ok < q.a.length);
});
