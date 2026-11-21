import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDoc, paginate, pageOf, sentenceBack, sentenceForward, paragraphs, formatMinutes } from '../js/textmodel.js';

const T = 'Ala ma kota. Kot ma Alę!\n\nDrugi akapit tutaj. I jeszcze zdanie.';
test('paragraphs: puste linie, a bez nich pojedyncze złamania', () => {
  assert.equal(paragraphs(T).length, 2);
  assert.deepEqual(paragraphs('a\nb\nc'), ['a', 'b', 'c']);
});
test('buildDoc: słowa, akapity, zdania', () => {
  const d = buildDoc(T);
  assert.equal(d.words.length, 12);
  assert.deepEqual(d.paraStart, [0, 6]);
  assert.deepEqual(d.sentStart, [0, 3, 6, 9]);
  assert.equal(d.paraOf[7], 1);
});
test('nawigacja po zdaniach', () => {
  const d = buildDoc(T);
  assert.equal(sentenceBack(d, 4), 3);
  assert.equal(sentenceBack(d, 3), 0);
  assert.equal(sentenceForward(d, 4), 6);
  assert.equal(sentenceForward(d, 10), 12);
});
test('paginate: strony pokrywają cały tekst, cięte na akapitach', () => {
  const text = Array.from({ length: 30 }, (_, i) => `Akapit ${i} ` + 'słowo '.repeat(40).trim() + '.').join('\n\n');
  const d = buildDoc(text); const pages = paginate(d, 200);
  assert.equal(pages[0][0], 0); assert.equal(pages.at(-1)[1], d.words.length);
  for (let i = 1; i < pages.length; i++) assert.equal(pages[i][0], pages[i - 1][1]);
  assert.ok(pages.every(([a]) => d.paraStart.includes(a)));
  assert.equal(pageOf(pages, pages[2][0] + 5), 2);
});
test('formatMinutes', () => {
  assert.equal(formatMinutes(0.4), '< 1 min');
  assert.equal(formatMinutes(75), '1 h 15 min');
});
