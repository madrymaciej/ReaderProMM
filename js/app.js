import {
  rand, pick, shuffle, WORDS, mutate, letterGrid, numberRound, orpIndex,
  tokenize, chunk, delayFor, wpm, adapt, dayKey, streak,
} from './lib.js';
import { TEXTS } from './texts.js';

/** Czas sesji w sekundach. Do testów można go skrócić parametrem ?t=5 */
const DURATION = Math.max(1, Number(new URLSearchParams(location.search).get('t')) || 60);

/* ---------- Narzędzia DOM ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}
const svgEl = (tag, attrs) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const sleep = (ms, signal) => new Promise((res, rej) => {
  if (signal?.aborted) return rej(new DOMException('abort', 'AbortError'));
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('abort', 'AbortError')); }, { once: true });
});
const num = (v) => String(v).replace('.', ',');
const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* iOS nie wspiera */ } };
const shake = (el) => { el.classList.remove('err'); void el.offsetWidth; el.classList.add('err'); };
const flash = (el, good) => {
  el.classList.add(good ? 'flash-ok' : 'flash-bad');
  setTimeout(() => el.classList.remove('flash-ok', 'flash-bad'), 250);
};

/* ---------- Pamięć wyników (lokalnie na urządzeniu) ---------- */
const Store = {
  key: 'readerpromm-v2',
  data: { results: {}, days: [], prefs: {} },
  load() {
    try { Object.assign(this.data, JSON.parse(localStorage.getItem(this.key)) || {}); } catch { /* brak dostępu */ }
    return this;
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch { /* brak dostępu */ } },
  pref(k, def) { return this.data.prefs[k] ?? def; },
  setPref(k, v) { this.data.prefs[k] = v; this.save(); },
  get(id) { return this.data.results[id]; },
  record(id, value, { name, unit }, extra = {}) {
    const r = (this.data.results[id] ||= { history: [], best: null });
    Object.assign(r, { name, unit });
    const prev = r.history.length ? r.history[r.history.length - 1].v : null;
    const isBest = r.best == null || value > r.best;
    if (isBest) r.best = value;
    r.history.push({ t: Date.now(), v: value, ...extra });
    if (r.history.length > 200) r.history.shift();
    const today = dayKey();
    if (!this.data.days.includes(today)) this.data.days.push(today);
    this.save();
    return { isBest: isBest && r.history.length > 1, best: r.best, prev, history: r.history };
  },
  doneToday(prefix) {
    const today = dayKey();
    return Object.entries(this.data.results).some(([id, r]) =>
      (id === prefix || id.startsWith(prefix + '-')) && r.history.some((e) => dayKey(new Date(e.t)) === today));
  },
};

/* ---------- Plan dnia ---------- */
const DEFAULT_PLAN = ['oczy', 'schulte', 'sfera', 'linia', 'rsvp'];
const getPlan = () => Store.pref('plan', DEFAULT_PLAN).filter((id) => EXERCISES.some((e) => e.id === id));
const setPlan = (ids) => Store.setPref('plan', EXERCISES.map((e) => e.id).filter((id) => ids.includes(id)));
let currentEx = null; // id otwartego ćwiczenia (do przycisku „Dalej w planie”)

/* ---------- Wspólne elementy UI ---------- */
function screen(title, ex) {
  const body = h('main', { class: 'screen-body' + (ex ? ' center' : '') });
  const modal = ex?.why ? infoModal(ex) : null;
  const view = h('div', { class: 'screen' },
    h('header', { class: 'bar' },
      h('a', { href: '#/', class: 'back', 'aria-label': 'Wróć' }, '‹'),
      h('h1', {}, title),
      modal ? h('button', { class: 'icon-btn', 'aria-label': 'Jak to działa', onclick: () => modal.open() }, 'i') : h('span'),
    ),
    body, modal);
  // Przy pierwszym wejściu w ćwiczenie pokaż instrukcję automatycznie.
  if (modal && !Store.pref(`seen-${ex.id}`, false)) { Store.setPref(`seen-${ex.id}`, true); modal.open(); }
  return { view, body };
}

function infoModal(ex) {
  const close = () => { modal.hidden = true; };
  const modal = h('div', { class: 'modal', hidden: true, onclick: (e) => { if (e.target === modal) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': ex.name },
      h('div', { class: 'sheet-head' },
        h('h2', {}, ex.name),
        h('button', { class: 'close', 'aria-label': 'Zamknij', onclick: close }, '✕')),
      h('h3', {}, 'Jak ćwiczyć'), h('p', {}, ex.how),
      h('h3', {}, 'Wynik'), h('p', {}, ex.score),
      h('h3', {}, 'Dlaczego to działa'), h('p', {}, ex.why),
      h('button', { class: 'btn primary wide', onclick: close }, 'Rozumiem')));
  modal.open = () => { modal.hidden = false; };
  return modal;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.modal:not([hidden])').forEach((m) => { m.hidden = true; });
});

function chips(options, value, onChange) {
  const wrap = h('div', { class: 'chips' });
  const render = (val) => {
    wrap.replaceChildren(...options.map(([v, label]) => h('button', {
      class: 'chip' + (v === val ? ' on' : ''),
      onclick: () => { render(v); onChange(v); },
    }, label)));
  };
  render(value);
  return wrap;
}

const startBtn = (onclick) => h('button', { class: 'btn primary big', onclick }, `Start · ${DURATION === 60 ? '1 min' : DURATION + ' s'}`);

function lastResult(id) {
  const r = Store.get(id);
  if (!r?.history.length) return h('p', { class: 'muted small center-text' }, 'Brak wcześniejszych wyników.');
  return h('p', { class: 'muted small center-text' }, `Ostatnio: ${num(r.history.at(-1).v)} ${r.unit} · rekord: ${num(r.best)} ${r.unit} · sesji: ${r.history.length}`);
}

async function countdown(el, signal) {
  for (const n of ['3', '2', '1']) {
    el.replaceChildren(h('div', { class: 'countdown' }, n));
    await sleep(500, signal);
  }
  el.replaceChildren();
}

/* ---------- Wykres historii ---------- */
function chart(history, unit) {
  const pts = history.slice(-30);
  const W = 340; const H = 170; const L = 38; const R = 10; const T = 14; const B = 26;
  const vals = pts.map((p) => p.v);
  let min = Math.min(...vals); let max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12; min = Math.max(0, min - pad); max += pad;
  const x = (i) => (pts.length === 1 ? (L + W - R) / 2 : L + (i / (pts.length - 1)) * (W - L - R));
  const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Wykres wyników' });
  const best = Math.max(...vals);
  for (const v of [min, (min + max) / 2, max]) {
    svg.append(svgEl('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }));
    const t = svgEl('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' }); t.textContent = Math.round(v); svg.append(t);
  }
  svg.append(svgEl('line', { x1: L, x2: W - R, y1: y(best), y2: y(best), class: 'bestline' }));
  if (pts.length > 1) svg.append(svgEl('polyline', { points: pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' '), class: 'line' }));
  pts.forEach((p, i) => svg.append(svgEl('circle', { cx: x(i), cy: y(p.v), r: i === pts.length - 1 ? 5.5 : 3, class: i === pts.length - 1 ? 'pt last' : 'pt' })));
  const d = (t) => { const dt = new Date(t); return `${dt.getDate()}.${String(dt.getMonth() + 1).padStart(2, '0')}`; };
  const t1 = svgEl('text', { x: L, y: H - 6, class: 'axis' }); t1.textContent = d(pts[0].t); svg.append(t1);
  if (pts.length > 1) { const t2 = svgEl('text', { x: W - R, y: H - 6, 'text-anchor': 'end', class: 'axis' }); t2.textContent = d(pts.at(-1).t); svg.append(t2); }
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  return h('div', { class: 'chart-box' },
    h('div', { class: 'chart-head' }, h('b', {}, 'Postęp'), h('span', { class: 'muted small' }, `${pts.length} ${pts.length === 1 ? 'sesja' : 'sesji'} · śr. z 5 ost.: ${num(Math.round(avg(vals.slice(-5)) * 10) / 10)}`)),
    svg,
    h('div', { class: 'legend small muted' }, h('span', { class: 'lg-line' }), `wyniki (${unit})`, h('span', { class: 'lg-best' }), 'rekord'),
    pts.length === 1 ? h('p', { class: 'muted small' }, 'Pierwsza sesja — linia trendu pojawi się po kolejnej.') : null);
}

/* ---------- Sesja na czas: Stop / Od nowa / licznik / wynik ---------- */
/**
 * def: { id, name, unit, onSetup, start(stage, api), lines?(extra), onFinish?(extra),
 *        finalize?(stage, extra, reason, signal) => {score, lines, skip} }
 * api: { signal, alive, add(n), extra, end() }
 */
function session(body, parentSignal, def) {
  let run = null;
  const kill = () => { if (run) { run.ended = true; clearInterval(run.iv); run.ctl.abort(); } };
  parentSignal.addEventListener('abort', kill, { once: true });

  const begin = async () => {
    kill();
    const ctl = new AbortController();
    const r = run = { ctl, score: 0, extra: {}, ended: false, t0: 0, iv: null };
    const timeEl = h('span', { class: 'mono time' }, `${DURATION} s`);
    const scoreEl = h('b', { class: 'score mono' }, '0');
    const fill = h('div');
    const stage = h('div', { class: 'stage' });
    const controls = h('div', { class: 'controls' },
      h('div', { class: 'ctl-row' },
        h('button', { class: 'btn ctl', onclick: () => { kill(); body.classList.remove('in-session'); def.onSetup(); } }, '■ Stop'),
        h('div', { class: 'ctl-info' }, timeEl, h('span', { class: 'muted' }, `${def.unit}: `, scoreEl)),
        h('button', { class: 'btn ctl', onclick: begin }, '↻ Od nowa')),
      h('div', { class: 'timebar' }, fill));
    body.classList.add('in-session');
    body.replaceChildren(controls, stage);
    const api = {
      signal: ctl.signal,
      get alive() { return !r.ended && !ctl.signal.aborted; },
      add(n = 1) { if (!api.alive) return; r.score += n; scoreEl.textContent = r.score; },
      extra: r.extra,
      end: () => finish(r, stage, 'end'),
    };
    try { await countdown(stage, ctl.signal); } catch { return; }
    r.t0 = performance.now();
    r.iv = setInterval(() => {
      const left = DURATION - (performance.now() - r.t0) / 1000;
      if (left <= 0) { finish(r, stage, 'time'); return; }
      timeEl.textContent = `${Math.ceil(left)} s`;
      fill.style.width = `${(1 - left / DURATION) * 100}%`;
      timeEl.classList.toggle('warn', left <= 10);
    }, 100);
    Promise.resolve(def.start(stage, api)).catch(() => {});
  };

  const finish = async (r, stage, reason) => {
    if (r.ended) return;
    r.ended = true; clearInterval(r.iv);
    r.extra.seconds = Math.min(DURATION, (performance.now() - r.t0) / 1000);
    let score = r.score; let lines = def.lines ? def.lines(r.extra) : []; let skip = false;
    if (def.finalize) {
      try { ({ score, lines = [], skip = false } = await def.finalize(stage, r.extra, reason, r.ctl.signal)); } catch { return; }
    }
    r.ctl.abort();
    def.onFinish?.(r.extra);
    const { seconds, ...extra } = r.extra;
    const rec = skip ? null : Store.record(def.id, score, def, extra);
    if (run !== r) return;
    body.classList.remove('in-session');
    body.replaceChildren(resultView(def, score, lines, rec, begin));
    window.scrollTo(0, 0);
  };

  begin();
}

function resultView(def, score, lines, rec, again) {
  const delta = rec?.prev != null ? score - rec.prev : null;
  const plan = getPlan();
  const next = plan.includes(currentEx) ? plan.find((id) => id !== currentEx && !Store.doneToday(id)) : null;
  const nextEx = next && EXERCISES.find((e) => e.id === next);
  return h('div', { class: 'result' },
    h('div', { class: 'result-title' }, def.name),
    h('div', { class: 'result-big' }, num(score), h('small', {}, def.unit)),
    rec?.isBest ? h('div', { class: 'badge' }, '🏆 Nowy rekord!') : null,
    delta != null ? h('div', { class: 'delta ' + (delta > 0 ? 'up' : delta < 0 ? 'down' : '') },
      `${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '= '}${num(Math.round(delta * 10) / 10)} vs poprzednia sesja`) : null,
    rec && !rec.isBest ? h('div', { class: 'muted' }, `Rekord: ${num(rec.best)} ${def.unit}`) : null,
    ...lines.filter(Boolean).map((l) => h('div', { class: 'muted' }, l)),
    rec ? chart(rec.history, def.unit) : null,
    nextEx ? h('a', { class: 'btn primary wide', href: `#/ex/${next}` }, `Dalej w planie: ${nextEx.name} →`) : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn' + (nextEx ? '' : ' primary'), onclick: again }, '↻ Jeszcze raz'),
      h('button', { class: 'btn', onclick: () => def.onSetup() }, 'Ustawienia')),
    h('a', { class: 'btn wide', href: '#/' }, 'Menu'),
  );
}

/* ======================================================================
   ĆWICZENIA — każde: run(body, signal) pokazuje ustawienia i startuje session()
   ====================================================================== */

const EXERCISES = [];
const ex = (def) => EXERCISES.push(def);

/* ---------- 1. Tablica Schultego ---------- */
ex({
  id: 'schulte', group: 'Pole widzenia', icon: '▦', name: 'Tablica Schultego',
  short: 'Znajdź liczby po kolei, patrząc w środek',
  how: 'Patrz w środek tablicy (kropka). Nie przesuwaj wzroku — wyszukuj kolejne liczby od 1 widzeniem peryferyjnym i stukaj w nie. Po ukończeniu tablicy od razu pojawia się następna. Zacznij od 3×3 lub 4×4, standardem jest 5×5.',
  score: 'Liczba liczb znalezionych w 1 minutę (osobny rekord dla każdego rozmiaru).',
  why: 'Ostro widzisz tylko mały obszar wokół punktu fiksacji. Tablica zmusza mózg do analizowania obrazu poza nim. Szersze „pole użyteczne” oznacza mniej fiksacji na linijkę, a więc szybsze czytanie.',
  run(body, signal) {
    let size = Store.pref('schulteSize', 5);
    let dot = Store.pref('schulteDot', true);
    let mark = Store.pref('schulteMark', false);
    const setup = () => body.replaceChildren(
      h('p', { class: 'label' }, 'Rozmiar tablicy'),
      chips([[3, '3×3'], [4, '4×4'], [5, '5×5'], [6, '6×6'], [7, '7×7']], size, (v) => { size = v; Store.setPref('schulteSize', v); }),
      h('p', { class: 'label' }, 'Opcje'),
      chips([[true, 'Kropka w środku'], [false, 'Bez kropki']], dot, (v) => { dot = v; Store.setPref('schulteDot', v); }),
      chips([[false, 'Nie zaznaczaj'], [true, 'Zaznaczaj znalezione']], mark, (v) => { mark = v; Store.setPref('schulteMark', v); }),
      startBtn(go), lastResult(`schulte-${size}`));
    const go = () => session(body, signal, {
      id: `schulte-${size}`, name: `Schulte ${size}×${size}`, unit: 'liczb', onSetup: setup,
      lines: (x) => [`Ukończone tablice: ${x.tables}`, `Błędne stuknięcia: ${x.errors}`],
      start(stage, api) {
        Object.assign(api.extra, { tables: 0, errors: 0 });
        const status = h('div', { class: 'status' });
        const table = () => {
          const n = size * size; let next = 1;
          const upd = () => status.replaceChildren(h('span', {}, 'Szukaj: ', h('b', {}, next)), h('span', { class: 'muted' }, `Tablice: ${api.extra.tables}`));
          const grid = h('div', { class: 'schulte', style: `--n:${size}` },
            ...shuffle(Array.from({ length: n }, (_, i) => i + 1)).map((v) => h('button', {
              class: 'cell', onpointerdown: (e) => {
                if (!api.alive) return;
                if (v === next) {
                  if (mark) e.currentTarget.classList.add('found');
                  next++; api.add(); vibrate(5);
                  if (next > n) { api.extra.tables++; table(); } else upd();
                } else { api.extra.errors++; shake(e.currentTarget); }
              },
            }, v)),
            dot ? h('div', { class: 'focus-dot' }) : null);
          upd(); stage.replaceChildren(status, grid);
        };
        table();
      },
    });
    setup();
  },
});

/* ---------- 2. Widzenie sferyczne ---------- */
ex({
  id: 'sfera', group: 'Pole widzenia', icon: '◎', name: 'Widzenie sferyczne',
  short: 'Rozpoznaj znak błyskający na obwodzie',
  how: 'Patrz wyłącznie na krzyżyk w środku koła. Na ułamek sekundy w środku pojawi się cyfra, a gdzieś na okręgu litera. Wybierz, co widziałeś. Czasem pytanie dotyczy cyfry ze środka — to pilnuje, żebyś nie uciekał wzrokiem. Promień rośnie, a czas wyświetlania maleje, gdy trafiasz.',
  score: 'Liczba trafień w 1 minutę. Dodatkowo: najwyższy osiągnięty poziom i skuteczność.',
  why: 'Ćwiczy widzenie peryferyjne we wszystkich kierunkach naraz (stąd „sferyczne”). Bardzo krótki czas ekspozycji (poniżej ok. 200 ms — tyle trwa zaplanowanie i wykonanie ruchu oka) wyklucza przesunięcie wzroku — rozpoznajesz znak wyłącznie peryferyjnie.',
  run(body, signal) {
    const MAX = 14; const LETTERS = 'ABCDEFHKLMNPRSTUWZ';
    let items = Store.pref('sferaItems', 1);
    const setup = () => body.replaceChildren(
      h('p', { class: 'label' }, 'Liczba liter na obwodzie'),
      chips([[1, '1 litera'], [2, '2 litery'], [3, '3 litery']], items, (v) => { items = v; Store.setPref('sferaItems', v); setup(); }),
      h('p', { class: 'muted small' }, `Poziom startowy: ${Store.pref(`sferaStart${items}`, 1)} (dopasowuje się automatycznie).`),
      startBtn(go), lastResult(`sfera-${items}`));
    const go = () => session(body, signal, {
      id: `sfera-${items}`, name: `Widzenie sferyczne · ${items} ${items === 1 ? 'litera' : 'litery'}`, unit: 'trafień', onSetup: setup,
      lines: (x) => [`Najwyższy poziom: ${x.maxLevel}`, `Skuteczność: ${x.trials ? Math.round((x.hits / x.trials) * 100) : 0}% (${x.hits}/${x.trials})`],
      onFinish: (x) => Store.setPref(`sferaStart${items}`, Math.max(1, (x.maxLevel || 1) - 3)),
      async start(stage, api) {
        let st = { level: Store.pref(`sferaStart${items}`, 1), streak: 0, maxLevel: 1 };
        Object.assign(api.extra, { trials: 0, hits: 0, maxLevel: st.level });
        const status = h('div', { class: 'status' });
        const field = h('div', { class: 'field' }, h('div', { class: 'cross' }, '+'));
        const answers = h('div', { class: 'answers' });
        stage.replaceChildren(status, field, answers);
        while (api.alive) {
          const radius = Math.min(0.92, 0.18 + st.level * 0.056);
          const exposure = Math.max(70, 200 - st.level * 10);
          status.replaceChildren(h('span', {}, `Poziom ${st.level}`), h('span', { class: 'muted' }, `${exposure} ms`));
          answers.replaceChildren();
          await sleep(450, api.signal);
          const center = String(rand(1, 9));
          const letters = shuffle([...LETTERS]).slice(0, items);
          const a0 = Math.random() * Math.PI * 2;
          const nodes = letters.map((l, i) => {
            const a = a0 + (i * Math.PI * 2) / items;
            return h('div', { class: 'blip', style: `left:${50 + Math.cos(a) * radius * 50}%;top:${50 + Math.sin(a) * radius * 50}%` }, l);
          });
          const c = h('div', { class: 'blip center' }, center);
          field.append(c, ...nodes);
          await sleep(exposure, api.signal);
          [c, ...nodes].forEach((n) => { n.textContent = '#'; n.classList.add('mask'); });
          await sleep(90, api.signal);
          [c, ...nodes].forEach((n) => n.remove());

          const askCenter = Math.random() < 0.25;
          const correct = askCenter ? center : pick(letters);
          const pool = askCenter ? '123456789' : LETTERS;
          const opts = shuffle([correct, ...shuffle([...pool].filter((x) => !letters.includes(x) && x !== center)).slice(0, 5)]);
          const chosen = await new Promise((res) => answers.replaceChildren(
            h('p', { class: 'q' }, askCenter ? 'Cyfra' : 'Litera'),
            h('div', { class: 'grid3' }, ...opts.map((o) => h('button', { class: 'btn', onclick: () => res(o) }, o)))));
          if (!api.alive) return;
          const good = askCenter ? chosen === center : letters.includes(chosen);
          api.extra.trials++;
          if (good) { api.extra.hits++; api.add(); }
          vibrate(good ? 5 : [30, 40, 30]); flash(field, good);
          st = adapt(st, good, MAX);
          api.extra.maxLevel = Math.max(api.extra.maxLevel, st.level);
        }
      },
    });
    setup();
  },
});

/* ---------- 3. Linia wzroku ---------- */
ex({
  id: 'linia', group: 'Pole widzenia', icon: '⇹', name: 'Linia wzroku',
  short: 'Porównaj słowa po obu stronach osi',
  how: 'Patrz na czerwoną pionową linię. Po obu stronach błysną dwa słowa. Oceń, czy są identyczne. Z każdym poziomem słowa pojawiają się dalej od środka i krócej.',
  score: 'Liczba trafnych odpowiedzi w 1 minutę. Dodatkowo: najwyższy poziom.',
  why: 'Poszerza poziome pole widzenia — dokładnie ten kierunek, który wykorzystujesz w linijce tekstu. Jeśli widzisz peryferyjnie początek i koniec krótkiej linii, możesz ją objąć jedną–dwiema fiksacjami.',
  run(body, signal) {
    const MAX = 12;
    const setup = () => body.replaceChildren(
      h('p', { class: 'muted center-text' }, 'Trudność dopasowuje się automatycznie.'), startBtn(go), lastResult('linia'));
    const go = () => session(body, signal, {
      id: 'linia', name: 'Linia wzroku', unit: 'trafień', onSetup: setup,
      lines: (x) => [`Najwyższy poziom: ${x.maxLevel}`, `Skuteczność: ${x.trials ? Math.round((x.hits / x.trials) * 100) : 0}% (${x.hits}/${x.trials})`],
      onFinish: (x) => Store.setPref('liniaStart', Math.max(1, (x.maxLevel || 1) - 3)),
      async start(stage, api) {
        let st = { level: Store.pref('liniaStart', 1), streak: 0, maxLevel: 1 };
        Object.assign(api.extra, { trials: 0, hits: 0, maxLevel: st.level });
        const status = h('div', { class: 'status' });
        const field = h('div', { class: 'field wide' }, h('div', { class: 'axis' }));
        const answers = h('div', { class: 'answers' });
        stage.replaceChildren(status, field, answers);
        while (api.alive) {
          const dist = Math.min(44, 9 + st.level * 3.2);
          const exposure = Math.max(100, 380 - st.level * 25);
          status.replaceChildren(h('span', {}, `Poziom ${st.level}`), h('span', { class: 'muted' }, `${exposure} ms`));
          answers.replaceChildren();
          await sleep(400, api.signal);
          const pool = WORDS.filter((w) => [...w].length <= 4 + Math.ceil(st.level / 3));
          const a = pick(pool); const same = Math.random() < 0.5; const b = same ? a : mutate(a);
          const L = h('div', { class: 'word-l', style: `right:${50 + dist}%` }, a);
          const R = h('div', { class: 'word-r', style: `left:${50 + dist}%` }, b);
          field.append(L, R);
          await sleep(exposure, api.signal);
          L.remove(); R.remove();
          const ans = await new Promise((res) => answers.replaceChildren(h('div', { class: 'row' },
            h('button', { class: 'btn big', onclick: () => res(true) }, '= Takie same'),
            h('button', { class: 'btn big', onclick: () => res(false) }, '≠ Różne'))));
          if (!api.alive) return;
          const good = ans === same;
          api.extra.trials++;
          if (good) { api.extra.hits++; api.add(); }
          vibrate(good ? 5 : [30, 40, 30]); flash(field, good);
          if (!good) { answers.replaceChildren(h('p', { class: 'muted center-text' }, `${a}  |  ${b}`)); await sleep(700, api.signal); }
          st = adapt(st, good, MAX);
          api.extra.maxLevel = Math.max(api.extra.maxLevel, st.level);
        }
      },
    });
    setup();
  },
});

/* ---------- 4. Biegające słowa (RSVP) ---------- */
ex({
  id: 'rsvp', group: 'Tempo', icon: '▶', name: 'Biegające słowa',
  short: 'Czytaj słowo po słowie w zadanym tempie',
  how: 'Patrz na czerwoną literę — słowa zmieniają się w tym samym miejscu. Zacznij od tempa, przy którym rozumiesz tekst, i co sesję podnoś je o 25–50 słów/min (przyciski − / + działają w trakcie). Możesz wkleić własny tekst, np. artykuł.',
  score: 'Liczba słów przeczytanych w 1 minutę, czyli Twoje realne tempo (z krótkimi pauzami na interpunkcji).',
  why: 'Słowa podawane w jednym punkcie eliminują sakkady i regresje (powroty wzroku), a stałe tempo uczy, że nie trzeba „cofać się” po każde słowo. To trening tempa i skupienia — sprawdzaj zrozumienie testem czytania, bo przy zbyt wysokim tempie ono spada.',
  run(body, signal) {
    let wpmVal = Store.pref('rsvpWpm', 300);
    let size = Store.pref('rsvpChunk', 1);
    let textId = Store.pref('rsvpText', TEXTS[0].id);
    const area = h('textarea', { class: 'custom', placeholder: 'Wklej tutaj własny tekst…', rows: 5 });
    area.value = Store.pref('rsvpCustom', '');
    area.addEventListener('input', () => Store.setPref('rsvpCustom', area.value));
    const getText = () => (textId === 'custom' ? area.value : TEXTS.find((t) => t.id === textId)?.body || '');
    const setup = () => {
      const wpmLabel = h('b', {}, wpmVal);
      area.hidden = textId !== 'custom';
      body.replaceChildren(
        h('p', { class: 'label' }, 'Tekst'),
        chips([...TEXTS.map((t) => [t.id, t.title]), ['custom', 'Własny tekst']], textId, (v) => { textId = v; area.hidden = v !== 'custom'; Store.setPref('rsvpText', v); }),
        area,
        h('p', { class: 'label' }, 'Tempo: ', wpmLabel, ' słów/min'),
        h('input', { type: 'range', min: 100, max: 1000, step: 25, value: wpmVal, oninput: (e) => { wpmVal = +e.target.value; wpmLabel.textContent = wpmVal; Store.setPref('rsvpWpm', wpmVal); } }),
        h('p', { class: 'label' }, 'Słów naraz'),
        chips([[1, '1'], [2, '2'], [3, '3']], size, (v) => { size = v; Store.setPref('rsvpChunk', v); }),
        startBtn(go), lastResult('rsvp'));
    };
    const go = () => {
      const words = tokenize(getText());
      if (words.length < 5) { alert('Tekst jest za krótki.'); return; }
      session(body, signal, {
        id: 'rsvp', name: 'Biegające słowa', unit: 'słów', onSetup: setup,
        lines: (x) => [`Ustawione tempo: ${x.wpm} sł/min${x.wpmStart !== x.wpm ? ` (start: ${x.wpmStart})` : ''}`],
        start(stage, api) {
          Object.assign(api.extra, { wpm: wpmVal, wpmStart: wpmVal });
          const parts = chunk(words, size); let i = 0; let timer = null;
          const display = h('div', { class: 'rsvp' });
          const bar = h('div', { class: 'progress' }, h('div'));
          const speed = h('b', {}, wpmVal);
          const setWpm = (d) => { wpmVal = Math.min(1000, Math.max(100, wpmVal + d)); Store.setPref('rsvpWpm', wpmVal); speed.textContent = wpmVal; api.extra.wpm = wpmVal; };
          stage.replaceChildren(display, bar, h('div', { class: 'row tempo' },
            h('button', { class: 'btn', onclick: () => setWpm(-25) }, '− 25'),
            h('span', { class: 'center-text' }, speed, h('small', {}, 'sł/min')),
            h('button', { class: 'btn', onclick: () => setWpm(25) }, '+ 25')));
          const step = () => {
            if (!api.alive) return;
            if (i >= parts.length) i = 0;
            const frag = parts[i++];
            if (size === 1) {
              const chars = [...frag]; const k = orpIndex(frag);
              display.replaceChildren(h('div', { class: 'orp' },
                h('span', { class: 'pre' }, chars.slice(0, k).join('')),
                h('span', { class: 'pivot' }, chars[k]),
                h('span', { class: 'post' }, chars.slice(k + 1).join(''))));
            } else display.replaceChildren(h('div', { class: 'phrase' }, frag));
            bar.firstChild.style.width = `${(i / parts.length) * 100}%`;
            api.add(frag.split(' ').length);
            timer = setTimeout(step, delayFor(frag, wpmVal));
          };
          api.signal.addEventListener('abort', () => clearTimeout(timer));
          step();
        },
      });
    };
    setup();
  },
});

/* ---------- 5. Ruch oczu ---------- */
ex({
  id: 'oczy', group: 'Tempo', icon: '⋯', name: 'Ruch oczu',
  short: 'Podążaj wzrokiem za skaczącym punktem',
  how: 'Trzymaj głowę nieruchomo i śledź punkt samymi oczami. Wybierz wzór i tempo. To dobra rozgrzewka przed pozostałymi ćwiczeniami.',
  score: 'Liczba skoków wykonanych w 1 minutę — rośnie, gdy zwiększasz tempo.',
  why: 'Czytanie to seria precyzyjnych skoków oczu (sakkad). Ćwiczenie uczy szybkiego, celnego przenoszenia wzroku i skraca czas „lądowania” na kolejnej fiksacji — szczególnie przy przejściu na początek następnej linijki.',
  run(body, signal) {
    let mode = Store.pref('eyeMode', 'h'); let bpm = Store.pref('eyeBpm', 90);
    const setup = () => {
      const lbl = h('b', {}, bpm);
      body.replaceChildren(
        h('p', { class: 'label' }, 'Wzór'),
        chips([['h', 'Poziomo'], ['v', 'Pionowo'], ['d', 'Przekątne'], ['z', 'Linijki (Z)'], ['r', 'Losowo']], mode, (v) => { mode = v; Store.setPref('eyeMode', v); }),
        h('p', { class: 'label' }, 'Tempo: ', lbl, ' skoków/min'),
        h('input', { type: 'range', min: 40, max: 240, step: 10, value: bpm, oninput: (e) => { bpm = +e.target.value; lbl.textContent = bpm; Store.setPref('eyeBpm', bpm); } }),
        startBtn(go), lastResult('oczy'));
    };
    const go = () => session(body, signal, {
      id: 'oczy', name: 'Ruch oczu', unit: 'skoków', onSetup: setup,
      lines: (x) => [`Tempo: ${x.bpm} skoków/min`],
      start(stage, api) {
        api.extra.bpm = bpm;
        const field = h('div', { class: 'field tall' }); const dot = h('div', { class: 'dot' }); field.append(dot);
        stage.replaceChildren(field);
        let k = 0;
        const pos = () => {
          const s = k % 2;
          switch (mode) {
            case 'h': return [s ? 92 : 8, 50];
            case 'v': return [50, s ? 92 : 8];
            case 'd': return [[8, 8], [92, 92], [92, 8], [8, 92]][k % 4];
            case 'z': { const line = Math.floor(k / 2) % 8; return [s ? 92 : 8, 8 + line * 12]; }
            default: return [rand(6, 94), rand(6, 94)];
          }
        };
        const tick = () => {
          if (!api.alive) return;
          const [x, y] = pos(); dot.style.left = x + '%'; dot.style.top = y + '%'; k++;
          if (k > 1) api.add();
        };
        tick();
        const iv = setInterval(tick, 60000 / bpm);
        api.signal.addEventListener('abort', () => clearInterval(iv));
      },
    });
    setup();
  },
});

/* ---------- 6. Szukanie liter ---------- */
ex({
  id: 'litery', group: 'Uwaga i pamięć', icon: 'Aa', name: 'Szukanie liter',
  short: 'Znajdź wszystkie wskazane litery wśród podobnych',
  how: 'Znajdź i stuknij wszystkie wystąpienia litery docelowej. Litery wokół są do niej celowo podobne (b/d/p/q). Po znalezieniu wszystkich pojawia się nowa plansza. Przeszukuj rzędami, jak przy czytaniu.',
  score: 'Liczba znalezionych liter w 1 minutę. Pomyłki są pokazane osobno.',
  why: 'Uczy szybkiego rozróżniania kształtów liter i utrzymania koncentracji podczas skanowania. To ta sama praca wzrokowa, którą wykonujesz przy rozpoznawaniu słów — tylko wyizolowana.',
  run(body, signal) {
    const setup = () => body.replaceChildren(startBtn(go), lastResult('litery'));
    const go = () => session(body, signal, {
      id: 'litery', name: 'Szukanie liter', unit: 'liter', onSetup: setup,
      lines: (x) => [`Ukończone plansze: ${x.boards}`, `Pomyłki: ${x.errors}`],
      start(stage, api) {
        Object.assign(api.extra, { boards: 0, errors: 0 });
        const board = () => {
          const { target, cells } = letterGrid(64, rand(6, 9));
          const total = cells.filter((c) => c === target).length; let found = 0;
          const status = h('div', { class: 'status' });
          const upd = () => status.replaceChildren(h('span', {}, 'Szukaj: ', h('b', { class: 'target' }, target)), h('span', { class: 'muted' }, `${found}/${total}`));
          const grid = h('div', { class: 'letters' }, ...cells.map((c) => h('button', {
            class: 'cell small', onpointerdown: (e) => {
              const el = e.currentTarget; if (!api.alive || el.classList.contains('found')) return;
              if (c === target) {
                el.classList.add('found'); found++; api.add(); vibrate(5); upd();
                if (found === total) { api.extra.boards++; setTimeout(() => api.alive && board(), 200); }
              } else { api.extra.errors++; shake(el); }
            },
          }, c)));
          upd(); stage.replaceChildren(status, grid);
        };
        board();
      },
    });
    setup();
  },
});

/* ---------- 7. Szukanie liczb ---------- */
ex({
  id: 'liczby', group: 'Uwaga i pamięć', icon: '#', name: 'Szukanie liczb',
  short: 'Znajdź liczbę wśród bardzo podobnych',
  how: 'Na górze widzisz liczbę. Znajdź ją w siatce wśród liczb różniących się jedną cyfrą lub kolejnością. Co 4 znalezione liczby stają się o cyfrę dłuższe.',
  score: 'Liczba znalezionych liczb w 1 minutę.',
  why: 'Trenuje precyzyjne postrzeganie całych ciągów znaków jednym spojrzeniem, zamiast znak po znaku. Przydatne wprost przy czytaniu tabel, faktur i raportów.',
  run(body, signal) {
    const setup = () => body.replaceChildren(startBtn(go), lastResult('liczby'));
    const go = () => session(body, signal, {
      id: 'liczby', name: 'Szukanie liczb', unit: 'liczb', onSetup: setup,
      lines: (x) => [`Najdłuższa liczba: ${x.digits} cyfr`, `Pomyłki: ${x.errors}`],
      start(stage, api) {
        Object.assign(api.extra, { errors: 0, digits: 4 });
        let found = 0;
        const round = () => {
          const digits = Math.min(7, 4 + Math.floor(found / 4)); api.extra.digits = digits;
          const { target, cells } = numberRound(digits, 20);
          stage.replaceChildren(
            h('div', { class: 'status' }, h('span', {}, 'Znajdź: ', h('b', { class: 'target mono' }, target)), h('span', { class: 'muted' }, `${digits} cyfr`)),
            h('div', { class: 'numbers' }, ...cells.map((c) => h('button', {
              class: 'cell mono', onpointerdown: (e) => {
                if (!api.alive) return;
                if (c === target) { found++; api.add(); vibrate(5); round(); } else { api.extra.errors++; shake(e.currentTarget); }
              },
            }, c))));
        };
        round();
      },
    });
    setup();
  },
});

/* ---------- 8. Zapamiętaj liczbę ---------- */
ex({
  id: 'pamiec', group: 'Uwaga i pamięć', icon: '7̲', name: 'Zapamiętaj liczbę',
  short: 'Liczba błyska na chwilę — wpisz ją',
  how: 'Liczba pojawi się na ułamek sekundy. Wpisz ją z pamięci. Poprawna odpowiedź wydłuża kolejną liczbę o jedną cyfrę, błędna — skraca.',
  score: 'Liczba poprawnie zapamiętanych liczb w 1 minutę. Dodatkowo: najdłuższa zapamiętana liczba.',
  why: 'Ćwiczy „chwytanie” całej grupy znaków w jednej fiksacji i utrzymanie jej w pamięci roboczej. Przy czytaniu pozwala to obejmować wzrokiem kilka słów naraz zamiast jednego.',
  run(body, signal) {
    const setup = () => body.replaceChildren(startBtn(go), lastResult('pamiec'));
    const go = () => session(body, signal, {
      id: 'pamiec', name: 'Zapamiętaj liczbę', unit: 'liczb', onSetup: setup,
      lines: (x) => [`Najdłuższa zapamiętana: ${x.maxLen || 0} cyfr`, `Próby: ${x.trials}`],
      onFinish: (x) => Store.setPref('pamiecStart', Math.max(3, (x.maxLen || 3) - 1)),
      async start(stage, api) {
        let len = Store.pref('pamiecStart', 3);
        Object.assign(api.extra, { maxLen: 0, trials: 0 });
        const status = h('div', { class: 'status' }); const show = h('div', { class: 'flash' }); const pad = h('div');
        stage.replaceChildren(status, show, pad);
        while (api.alive) {
          status.replaceChildren(h('span', {}, `Cyfr: ${len}`));
          pad.replaceChildren();
          show.textContent = '+'; await sleep(600, api.signal);
          let n = String(rand(1, 9));
          while (n.length < len) n += rand(0, 9);
          show.textContent = n.replace(/(\d{3})(?=\d)/g, '$1 ');
          await sleep(Math.min(1200, 300 + len * 70), api.signal);
          show.textContent = '#'.repeat(Math.min(len, 9)); await sleep(100, api.signal);
          show.textContent = '';
          const answer = await new Promise((res) => {
            let val = '';
            const out = h('div', { class: 'typed mono' }, '…');
            const press = (k) => {
              if (k === '⌫') val = val.slice(0, -1); else if (k === 'OK') return res(val); else if (val.length < len + 2) val += k;
              out.textContent = val || '…';
            };
            pad.replaceChildren(out, h('div', { class: 'keypad' },
              ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k) => h('button', { class: 'btn' + (k === 'OK' ? ' primary' : ''), onclick: () => press(k) }, k))));
          });
          if (!api.alive) return;
          api.extra.trials++;
          const good = answer === n;
          if (good) { api.add(); api.extra.maxLen = Math.max(api.extra.maxLen, len); len++; show.textContent = '✓'; } else { len = Math.max(3, len - 1); show.replaceChildren(h('span', { class: 'bad' }, n)); }
          vibrate(good ? 5 : [30, 40, 30]); flash(show, good);
          await sleep(good ? 350 : 900, api.signal);
        }
      },
    });
    setup();
  },
});

/* ---------- 9. Pary słów ---------- */
ex({
  id: 'pary', group: 'Uwaga i pamięć', icon: '≠', name: 'Pary słów',
  short: 'Oceń jak najszybciej: takie same czy różne?',
  how: 'Pojawia się para słów. Oceń jak najszybciej, czy są identyczne. Różnice są drobne: jedna litera albo zamiana kolejności.',
  score: 'Liczba trafnych odpowiedzi w 1 minutę.',
  why: 'Uczy dokładnego postrzegania całego słowa na raz przy wysokim tempie. Mózg zwykle „domyśla się” słowa po kształcie — tu musisz zauważyć drobną różnicę, co wzmacnia precyzję rozpoznawania.',
  run(body, signal) {
    const setup = () => body.replaceChildren(startBtn(go), lastResult('pary'));
    const go = () => session(body, signal, {
      id: 'pary', name: 'Pary słów', unit: 'trafień', onSetup: setup,
      lines: (x) => [`Skuteczność: ${x.trials ? Math.round((x.hits / x.trials) * 100) : 0}% (${x.hits}/${x.trials})`],
      async start(stage, api) {
        Object.assign(api.extra, { trials: 0, hits: 0 });
        const card = h('div', { class: 'paircard' }); const btns = h('div', { class: 'row' });
        stage.replaceChildren(card, btns);
        while (api.alive) {
          const a = pick(WORDS); const same = Math.random() < 0.5; const b = same ? a : mutate(a);
          card.replaceChildren(h('span', {}, a), h('span', {}, b));
          const ans = await new Promise((res) => btns.replaceChildren(
            h('button', { class: 'btn big', onclick: () => res(true) }, '= Takie same'),
            h('button', { class: 'btn big', onclick: () => res(false) }, '≠ Różne')));
          if (!api.alive) return;
          const good = ans === same;
          api.extra.trials++;
          if (good) { api.extra.hits++; api.add(); }
          vibrate(good ? 5 : [30, 40, 30]); flash(card, good);
          if (!good) await sleep(500, api.signal);
        }
      },
    });
    setup();
  },
});

/* ---------- 10. Test czytania ---------- */
ex({
  id: 'test', group: 'Pomiar', icon: '⏱', name: 'Test prędkości czytania',
  short: 'Minuta czytania + pytania o zrozumienie',
  how: 'Czytaj normalnie, ze zrozumieniem, przez 1 minutę. Gdy czas minie, stuknij słowo, na którym skończyłeś (jeśli skończysz wcześniej — stuknij „Skończyłem”). Potem odpowiedz na pytania dotyczące przeczytanych akapitów.',
  score: 'Efektywne tempo = tempo (słowa/min) × zrozumienie. To ono mówi o realnych postępach.',
  why: 'Ćwiczenia mają sens tylko wtedy, gdy rośnie tempo przy zachowanym rozumieniu. Regularny pomiar (np. raz w tygodniu) pokazuje, czy trening przenosi się na prawdziwe czytanie.',
  run(body, signal) {
    let textId = Store.pref('testText', TEXTS[0].id);
    const setup = () => body.replaceChildren(
      h('p', { class: 'label' }, 'Tekst'),
      chips(TEXTS.map((t) => [t.id, `${t.title} · ${tokenize(t.body).length} sł.`]), textId, (v) => { textId = v; Store.setPref('testText', v); }),
      startBtn(go), lastResult('test'));
    const go = () => {
      const t = TEXTS.find((x) => x.id === textId);
      const paras = t.body.split('\n\n').map(tokenize);
      const ends = paras.reduce((acc, p) => [...acc, (acc.at(-1) || 0) + p.length], []); // liczba słów do końca każdego akapitu
      let spans = [];
      session(body, signal, {
        id: 'test', name: 'Test czytania', unit: 'sł/min', onSetup: setup,
        start(stage, api) {
          let idx = 0;
          spans = [];
          const art = h('article', { class: 'reading' }, h('h2', {}, t.title),
            ...paras.map((p) => h('p', {}, ...p.flatMap((w) => { const s = h('span', { 'data-i': idx++ }, w); spans.push(s); return [s, ' ']; }))));
          stage.replaceChildren(art, h('button', { class: 'btn primary big sticky', onclick: () => api.end() }, 'Skończyłem'));
        },
        async finalize(stage, extra, reason, sig) {
          const aborted = () => new DOMException('abort', 'AbortError');
          let read = spans.length; let sec = extra.seconds;
          if (reason === 'time') {
            sec = DURATION;
            stage.querySelector('.sticky')?.remove();
            const art = stage.querySelector('.reading');
            art.classList.add('picking');
            stage.prepend(h('div', { class: 'banner' }, 'Czas! Stuknij słowo, na którym skończyłeś'));
            read = await new Promise((res, rej) => {
              sig.addEventListener('abort', () => rej(aborted()), { once: true });
              art.addEventListener('click', (e) => { const i = e.target.dataset?.i; if (i != null) res(Number(i) + 1); });
            });
          }
          const speed = wpm(read, sec);
          const qs = t.questions.filter((q) => ends[q.p] <= read);
          let ok = 0;
          for (let qi = 0; qi < qs.length; qi++) {
            const q = qs[qi];
            const choice = await new Promise((res, rej) => {
              sig.addEventListener('abort', () => rej(aborted()), { once: true });
              stage.replaceChildren(h('p', { class: 'muted' }, `Pytanie ${qi + 1}/${qs.length}`), h('p', { class: 'q' }, q.q),
                ...q.a.map((a, i) => h('button', { class: 'btn wide', onclick: () => res(i) }, a)));
              window.scrollTo(0, 0);
            });
            if (choice === q.ok) ok++;
          }
          const comp = qs.length ? ok / qs.length : null;
          const eff = comp == null ? speed : Math.round(speed * comp);
          const skip = speed > 1200;
          Object.assign(extra, { speed, comp });
          return {
            score: eff, skip,
            lines: [`Przeczytane: ${read} słów w ${num(Math.round(sec * 10) / 10)} s → ${speed} sł/min`,
              comp == null ? 'Za mało przeczytanego tekstu, by zadać pytania — wynik bez korekty o zrozumienie.' : `Zrozumienie: ${ok}/${qs.length}`,
              skip ? 'Ponad 1200 sł/min to raczej przeglądanie niż czytanie — wynik nie został zapisany.' : '',
              'Orientacyjnie: przeciętny dorosły czyta tekst popularny w tempie ok. 200–300 sł/min.'],
          };
        },
      });
    };
    setup();
  },
});

/* ======================================================================
   EKRANY
   ====================================================================== */

function planSection() {
  const wrap = h('section', { class: 'plan' });
  const view = () => {
    const plan = getPlan();
    const done = plan.filter((id) => Store.doneToday(id)).length;
    const next = plan.find((id) => !Store.doneToday(id));
    wrap.replaceChildren(
      h('div', { class: 'plan-head' },
        h('h2', {}, 'Plan dnia'),
        h('span', { class: 'muted' }, `${done}/${plan.length} · ${plan.length} min`),
        h('button', { class: 'link', onclick: edit }, 'Edytuj')),
      plan.length ? h('div', { class: 'plan-list' }, ...plan.map((id, i) => {
        const e = EXERCISES.find((x) => x.id === id); const d = Store.doneToday(id);
        return h('a', { class: 'plan-item' + (d ? ' done' : ''), href: `#/ex/${id}` }, h('span', { class: 'n' }, d ? '✓' : i + 1), e.name);
      })) : h('p', { class: 'muted small' }, 'Plan jest pusty — stuknij „Edytuj” i wybierz ćwiczenia.'),
      next ? h('a', { class: 'btn primary wide', href: `#/ex/${next}` }, done ? 'Kontynuuj plan →' : 'Zacznij plan →')
        : plan.length ? h('p', { class: 'plan-done' }, '🎉 Plan na dziś wykonany') : null);
  };
  const edit = () => {
    const sel = new Set(getPlan());
    const list = h('div', { class: 'plan-edit' }, ...EXERCISES.map((e) => {
      const row = h('button', {
        class: 'pick' + (sel.has(e.id) ? ' on' : ''), onclick: () => {
          if (sel.has(e.id)) sel.delete(e.id); else sel.add(e.id);
          row.classList.toggle('on', sel.has(e.id));
          count.textContent = `${sel.size} × 1 min`;
        },
      }, h('span', { class: 'box' }), h('span', { class: 'ico' }, e.icon), h('span', {}, e.name));
      return row;
    }));
    const count = h('span', { class: 'muted' }, `${sel.size} × 1 min`);
    wrap.replaceChildren(
      h('div', { class: 'plan-head' }, h('h2', {}, 'Wybierz ćwiczenia na dziś'), count),
      list,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { setPlan(DEFAULT_PLAN); view(); } }, 'Domyślny'),
        h('button', { class: 'btn primary', onclick: () => { setPlan([...sel]); view(); } }, 'Zapisz')));
  };
  view();
  return wrap;
}

function home() {
  const s = streak(Store.data.days);
  const groups = [...new Set(EXERCISES.map((e) => e.group))];
  return h('div', { class: 'screen' },
    h('header', { class: 'hero' },
      h('div', {}, h('h1', {}, 'ReaderProMM'), h('p', { class: 'muted' }, 'Trening szybkiego czytania')),
      h('a', { class: 'streak', href: '#/stats', 'aria-label': 'Statystyki' }, h('b', {}, s), h('span', {}, s === 1 ? 'dzień' : 'dni'))),
    h('main', { class: 'screen-body' },
      planSection(),
      h('h2', { class: 'group big' }, 'Wszystkie ćwiczenia'),
      ...groups.map((g) => h('section', {},
        h('h2', { class: 'group' }, g),
        h('div', { class: 'cards' }, ...EXERCISES.filter((e) => e.group === g).map((e) => {
          const r = Object.entries(Store.data.results).filter(([id]) => id === e.id || id.startsWith(e.id + '-')).map(([, v]) => v);
          const sessions = r.reduce((a, v) => a + v.history.length, 0);
          return h('a', { class: 'card', href: `#/ex/${e.id}` },
            h('span', { class: 'ico' }, e.icon),
            h('span', { class: 'txt' }, h('b', {}, e.name), h('small', {}, e.short)),
            Store.doneToday(e.id) ? h('span', { class: 'tick', title: 'Zrobione dziś' }, '✓') : sessions ? h('span', { class: 'cnt muted' }, sessions) : null);
        })))),
      h('a', { class: 'btn wide', href: '#/stats' }, 'Statystyki i postęp'),
      h('p', { class: 'foot muted' }, 'Wyniki są zapisywane tylko na tym urządzeniu.'),
    ));
}

function sparkline(values) {
  if (values.length < 2) return h('span', { class: 'spark' });
  const w = 110; const hh = 28; const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1;
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${hh}`, class: 'spark' });
  svg.append(svgEl('polyline', { points: values.map((v, i) => `${(i / (values.length - 1)) * w},${hh - 3 - ((v - min) / span) * (hh - 6)}`).join(' '), fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  return svg;
}

function stats() {
  const { view, body } = screen('Statystyki');
  const res = Store.data.results;
  const ids = Object.keys(res).filter((id) => res[id]?.history.length).sort((a, b) => res[a].name.localeCompare(res[b].name, 'pl'));
  body.append(
    h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('b', {}, streak(Store.data.days)), h('small', {}, 'dni z rzędu')),
      h('div', { class: 'tile' }, h('b', {}, Store.data.days.length), h('small', {}, 'dni treningu')),
      h('div', { class: 'tile' }, h('b', {}, Object.values(res).reduce((a, r) => a + r.history.length, 0)), h('small', {}, 'sesji'))),
    ids.length ? h('div', { class: 'table' }, ...ids.map((id) => {
      const r = res[id];
      const detail = h('div', { class: 'detail', hidden: true });
      const row = h('button', {
        class: 'trow', onclick: () => {
          detail.hidden = !detail.hidden;
          if (!detail.hidden && !detail.firstChild) detail.append(chart(r.history, r.unit));
        },
      },
      h('div', {}, h('b', {}, r.name), h('small', { class: 'muted' }, `${r.history.length} sesji · ostatnio ${num(r.history.at(-1).v)} ${r.unit}`)),
      sparkline(r.history.slice(-20).map((e) => e.v)),
      h('div', { class: 'best' }, num(r.best), h('small', {}, 'rekord')));
      return h('div', {}, row, detail);
    })) : h('p', { class: 'muted' }, 'Brak wyników — zacznij od planu dnia.'),
    ids.length ? h('p', { class: 'muted small center-text' }, 'Stuknij ćwiczenie, aby zobaczyć wykres.') : null,
    h('button', { class: 'btn danger wide', onclick: () => { if (confirm('Usunąć wszystkie wyniki z tego urządzenia?')) { Store.data = { results: {}, days: [], prefs: {} }; Store.save(); route(); } } }, 'Wyczyść wyniki'),
  );
  return view;
}

/* ---------- Router ---------- */
const app = $('#app');
let current = null;
function route() {
  current?.abort();
  current = new AbortController();
  const [, kind, id] = (location.hash || '#/').split('/');
  currentEx = null;
  let view;
  if (kind === 'ex') {
    const e = EXERCISES.find((x) => x.id === id);
    if (!e) { location.hash = '#/'; return; }
    currentEx = e.id;
    const s = screen(e.name, e);
    e.run(s.body, current.signal);
    view = s.view;
  } else if (kind === 'stats') view = stats();
  else view = home();
  app.replaceChildren(view);
  window.scrollTo(0, 0);
}

Store.load();
addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
