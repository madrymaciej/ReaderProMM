// Czysta logika ćwiczeń (bez DOM) — testowana w tests/lib.test.js

export const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const WORDS = [
  'dom', 'kot', 'las', 'mapa', 'okno', 'rzeka', 'droga', 'miasto', 'książka', 'zegar',
  'papier', 'kamień', 'ogród', 'morze', 'góra', 'chmura', 'słońce', 'księżyc', 'gwiazda', 'deszcz',
  'wiatr', 'ogień', 'woda', 'ziemia', 'liść', 'drzewo', 'kwiat', 'trawa', 'owoc', 'jabłko',
  'gruszka', 'śliwka', 'chleb', 'masło', 'mleko', 'kawa', 'herbata', 'cukier', 'talerz', 'kubek',
  'stół', 'krzesło', 'szafa', 'lampa', 'obraz', 'lustro', 'dywan', 'ściana', 'dach', 'piwnica',
  'rower', 'pociąg', 'statek', 'samolot', 'most', 'ulica', 'plac', 'rynek', 'sklep', 'bank',
  'szkoła', 'teatr', 'kino', 'muzeum', 'biuro', 'umowa', 'cena', 'rachunek', 'kredyt', 'budżet',
  'aktywa', 'zysk', 'koszt', 'wartość', 'kapitał', 'udział', 'spółka', 'faktura', 'podatek', 'raport',
  'projekt', 'plan', 'cel', 'zadanie', 'termin', 'wynik', 'liczba', 'tabela', 'wykres', 'model',
  'silnik', 'koło', 'śruba', 'kabel', 'prąd', 'bateria', 'ekran', 'klawisz', 'serwer', 'sygnał',
  'pamięć', 'uwaga', 'myśl', 'słowo', 'zdanie', 'tekst', 'strona', 'rozdział', 'autor', 'czytelnik',
  'wzrok', 'oko', 'ręka', 'głowa', 'serce', 'krok', 'tempo', 'rytm', 'czas', 'chwila',
  'poranek', 'wieczór', 'tydzień', 'miesiąc', 'zima', 'wiosna', 'lato', 'jesień', 'podróż', 'mosty',
  'kolor', 'zieleń', 'błękit', 'czerwień', 'biel', 'czerń', 'srebro', 'złoto', 'miedź', 'stal',
];

const SIMILAR = {
  a: 'oe', e: 'ca', o: 'aec', i: 'lj', l: 'it', n: 'mu', m: 'nw', u: 'nv', r: 'n', b: 'dp',
  d: 'b', p: 'qb', s: 'z', z: 's', k: 'h', t: 'fl', c: 'eo', y: 'j', w: 'mv', h: 'k',
  g: 'q', f: 't', j: 'i', ą: 'a', ę: 'e', ó: 'o', ł: 'l', ś: 's', ć: 'c', ń: 'n', ż: 'z', ź: 'z',
};

/** Zwraca słowo różniące się od oryginału jednym, trudnym do zauważenia szczegółem. */
export function mutate(word) {
  const letters = [...word];
  for (let attempt = 0; attempt < 20; attempt++) {
    const out = letters.slice();
    const i = rand(0, out.length - 1);
    if (Math.random() < 0.35 && out.length > 2 && i < out.length - 1 && out[i] !== out[i + 1]) {
      [out[i], out[i + 1]] = [out[i + 1], out[i]];
    } else {
      const options = SIMILAR[out[i]];
      if (!options) continue;
      out[i] = pick([...options]);
    }
    const res = out.join('');
    if (res !== word) return res;
  }
  return word + 'a';
}

export const LETTER_GROUPS = [
  ['b', 'd', 'p', 'q', 'h'],
  ['m', 'n', 'u', 'w', 'v'],
  ['c', 'e', 'o', 'a', 's'],
  ['i', 'l', 'j', 't', 'f'],
  ['s', 'z', 'x', 'k', 'ż'],
  ['E', 'F', 'P', 'B', 'R'],
];

/** Siatka liter z ukrytą literą docelową. */
export function letterGrid(cells, targetCount) {
  const group = pick(LETTER_GROUPS);
  const target = pick(group);
  const others = group.filter((l) => l !== target);
  const arr = Array.from({ length: cells }, (_, i) => (i < targetCount ? target : pick(others)));
  return { target, cells: shuffle(arr) };
}

/** Runda szukania liczby: jedna liczba docelowa + podobne „zmyłki”. */
export function numberRound(digits, count) {
  const target = String(rand(10 ** (digits - 1), 10 ** digits - 1));
  const set = new Set([target]);
  let guard = 0;
  while (set.size < count && guard++ < 1000) {
    const d = [...target];
    if (Math.random() < 0.5) {
      const i = rand(0, d.length - 2);
      [d[i], d[i + 1]] = [d[i + 1], d[i]];
    } else {
      const i = rand(0, d.length - 1);
      d[i] = String((Number(d[i]) + pick([1, 2, 3, 7, 8, 9])) % 10);
    }
    const s = d.join('');
    if (s[0] !== '0') set.add(s);
  }
  return { target, cells: shuffle([...set]) };
}

/** Optymalny punkt rozpoznania słowa (ORP) — litera, na którą pada wzrok. */
export function orpIndex(word) {
  const n = [...word].length;
  if (n <= 1) return 0;
  if (n <= 5) return 1;
  if (n <= 9) return 2;
  if (n <= 13) return 3;
  return 4;
}

export function tokenize(text) {
  return text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}

export function chunk(words, size) {
  const out = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(' '));
  return out;
}

/** Czas wyświetlania fragmentu (ms) przy danym tempie WPM, z pauzą na interpunkcji. */
export function delayFor(fragment, wpm) {
  const words = fragment.split(' ').length;
  let ms = (60000 / wpm) * words;
  if (/[.!?…]$/.test(fragment)) ms *= 1.8;
  else if (/[,;:—–-]$/.test(fragment)) ms *= 1.3;
  if ([...fragment].length > 12 && words === 1) ms *= 1.2;
  return Math.round(ms);
}

export function wpm(wordCount, seconds) {
  return seconds > 0 ? Math.round((wordCount / seconds) * 60) : 0;
}

/**
 * Adaptacyjny poziom trudności — schodki „3 w górę / 1 w dół” (transformed up-down, Levitt 1971):
 * 3 poprawne odpowiedzi z rzędu = poziom +1, każda błędna = poziom −1.
 * Taka reguła utrzymuje skuteczność ok. 79% (0,5^(1/3)), blisko optimum uczenia ~85% (Wilson i in. 2019).
 */
export const UP_AFTER = 3;
export function adapt(state, correct, maxLevel, upAfter = UP_AFTER) {
  const s = { ...state };
  if (correct) {
    s.streak += 1;
    if (s.streak >= upAfter) { s.level = Math.min(maxLevel, s.level + 1); s.streak = 0; }
  } else {
    s.streak = 0;
    s.level = Math.max(1, s.level - 1);
  }
  s.maxLevel = Math.max(s.maxLevel || 1, s.level);
  return s;
}

export function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Liczba kolejnych dni treningu kończąca się dziś lub wczoraj. */
export function streak(days, today = new Date()) {
  const set = new Set(days);
  const d = new Date(today);
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
