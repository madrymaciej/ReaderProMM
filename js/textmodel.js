// Model dokumentu dla czytnika: słowa, akapity, zdania, strony. Bez DOM — testowany w tests/textmodel.test.js.

/** Dzieli tekst na akapity. Pojedyncze złamania linii traktuje jako akapity tylko, gdy w tekście brak pustych linii. */
export function paragraphs(text) {
  const t = text.replace(/\r\n?/g, '\n').trim();
  let paras = t.split(/\n\s*\n/);
  if (paras.length === 1 && t.includes('\n')) paras = t.split('\n');
  return paras.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const SENT_END = /[.!?…]["”»’)\]]*$/;

/**
 * @returns {{ words: string[], paraStart: number[], sentStart: number[], paraOf: Int32Array }}
 * paraStart — indeksy słów rozpoczynających akapity; sentStart — początki zdań (zawsze zawiera początki akapitów).
 */
export function buildDoc(text) {
  const words = []; const paraStart = []; const sentStart = [];
  for (const p of paragraphs(text)) {
    paraStart.push(words.length);
    sentStart.push(words.length);
    const ws = p.split(' ');
    ws.forEach((w, i) => {
      words.push(w);
      if (SENT_END.test(w) && i < ws.length - 1) sentStart.push(words.length);
    });
  }
  const paraOf = new Int32Array(words.length);
  for (let k = 0; k < paraStart.length; k++) paraOf.fill(k, paraStart[k], paraStart[k + 1] ?? words.length);
  return { words, paraStart, sentStart, paraOf };
}

/** Największy element tablicy posortowanej ≤ x (indeks), albo -1. */
export function floorIndex(arr, x) {
  let lo = 0; let hi = arr.length - 1; let ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= x) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

/** Cofnij: na początek bieżącego zdania, a jeśli już tam jesteśmy — na początek poprzedniego. */
export function sentenceBack(doc, pos) {
  const i = floorIndex(doc.sentStart, pos);
  if (i < 0) return 0;
  return doc.sentStart[i] === pos ? doc.sentStart[Math.max(0, i - 1)] : doc.sentStart[i];
}
export function sentenceForward(doc, pos) {
  const i = floorIndex(doc.sentStart, pos);
  return doc.sentStart[i + 1] ?? doc.words.length;
}
export function sentenceEnd(doc, pos) { return sentenceForward(doc, pos); }

/**
 * Strony: zakresy [start, end) słów o długości ok. maxWords, cięte na granicach akapitów
 * (bardzo długie akapity są dzielone na granicach zdań).
 */
export function paginate(doc, maxWords = 320) {
  const pages = []; const n = doc.words.length;
  let start = 0;
  while (start < n) {
    let end = Math.min(n, start + maxWords);
    if (end < n) {
      const pi = floorIndex(doc.paraStart, end);
      const pBreak = doc.paraStart[pi];
      if (pBreak > start + maxWords * 0.4) end = pBreak;
      else {
        const si = floorIndex(doc.sentStart, end);
        if (doc.sentStart[si] > start + maxWords * 0.4) end = doc.sentStart[si];
      }
    }
    pages.push([start, end]);
    start = end;
  }
  return pages.length ? pages : [[0, 0]];
}
export function pageOf(pages, pos) {
  let lo = 0; let hi = pages.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pages[mid][0] <= pos) lo = mid; else hi = mid - 1; }
  return lo;
}

/** Pozostały czas czytania w minutach przy danym tempie. */
export function minutesLeft(doc, pos, wpm) {
  return Math.max(0, doc.words.length - pos) / Math.max(1, wpm);
}
export function formatMinutes(min) {
  if (min < 1) return '< 1 min';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60); const m = Math.round(min % 60);
  return `${h} h ${m} min`;
}
