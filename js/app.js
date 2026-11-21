import {
  rand, pick, shuffle, WORDS, mutate, letterGrid, numberRound, orpIndex,
  tokenize, chunk, delayFor, wpm, adapt, dayKey, streak,
} from './lib.js';
import { TEXTS } from './texts.js';

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
const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('abort', 'AbortError')); });
});
const fmt = (s) => s.toFixed(1).replace('.', ',') + ' s';
const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* iOS nie wspiera */ } };

/* ---------- Pamięć wyników (lokalnie na urządzeniu) ---------- */
const Store = {
  key: 'readerpromm-v1',
  data: { results: {}, days: [], prefs: {} },
  load() {
    try { Object.assign(this.data, JSON.parse(localStorage.getItem(this.key)) || {}); } catch { /* brak dostępu */ }
    return this;
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch { /* brak dostępu */ } },
  pref(k, def) { return this.data.prefs[k] ?? def; },
  setPref(k, v) { this.data.prefs[k] = v; this.save(); },
  /** better: 'lower' | 'higher' | null */
  record(id, value, better, extra = {}) {
    const r = (this.data.results[id] ||= { history: [], best: null });
    const isBest = better && (r.best == null || (better === 'lower' ? value < r.best : value > r.best));
    if (isBest) r.best = value;
    r.history.push({ t: Date.now(), v: value, ...extra });
    if (r.history.length > 60) r.history.shift();
    const today = dayKey();
    if (!this.data.days.includes(today)) this.data.days.push(today);
    this.save();
    return { isBest, best: r.best, prev: r.history.length > 1 ? r.history[r.history.length - 2].v : null };
  },
  doneToday(prefix) {
    const today = dayKey();
    return Object.entries(this.data.results).some(([id, r]) =>
      (id === prefix || id.startsWith(prefix + '-')) && r.history.some((e) => dayKey(new Date(e.t)) === today));
  },
};

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

function resultCard({ title, big, lines = [], rec, unit = '', format = (v) => v, onAgain }) {
  return h('div', { class: 'result' },
    h('div', { class: 'result-title' }, title),
    h('div', { class: 'result-big' }, big),
    rec?.isBest ? h('div', { class: 'badge' }, '🏆 Nowy rekord!') :
      rec?.best != null ? h('div', { class: 'muted' }, `Rekord: ${format(rec.best)}${unit}`) : null,
    ...lines.map((l) => h('div', { class: 'muted' }, l)),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: onAgain }, 'Jeszcze raz'),
      h('a', { class: 'btn', href: '#/' }, 'Menu')),
  );
}

function countdown(el, signal) {
  return (async () => {
    for (const n of ['3', '2', '1']) {
      el.replaceChildren(h('div', { class: 'countdown' }, n));
      await sleep(550, signal);
    }
    el.replaceChildren();
  })();
}

/* ======================================================================
   ĆWICZENIA
   Każde: run(body, signal) — signal przerywa ćwiczenie przy wyjściu.
   ====================================================================== */

const EXERCISES = [];
const ex = (def) => EXERCISES.push(def);

/* ---------- 1. Tablica Schultego ---------- */
ex({
  id: 'schulte', group: 'Pole widzenia', icon: '▦', name: 'Tablica Schultego',
  short: 'Znajdź liczby po kolei, patrząc w środek',
  how: 'Patrz w środek tablicy (kropka). Nie przesuwaj wzroku — wyszukuj kolejne liczby od 1 widzeniem peryferyjnym i stukaj w nie. Zacznij od 3×3 lub 4×4, standardem jest 5×5.',
  why: 'Ostro widzisz tylko mały obszar wokół punktu fiksacji. Tablica zmusza mózg do analizowania obrazu poza nim. Szersze „pole użyteczne” oznacza mniej fiksacji na linijkę, a więc szybsze czytanie.',
  run(body) {
    let size = Store.pref('schulteSize', 5);
    let dot = Store.pref('schulteDot', true);
    let mark = Store.pref('schulteMark', false);
    const setup = () => body.replaceChildren(
      h('p', { class: 'label' }, 'Rozmiar tablicy'),
      chips([[3, '3×3'], [4, '4×4'], [5, '5×5'], [6, '6×6'], [7, '7×7']], size, (v) => { size = v; Store.setPref('schulteSize', v); }),
      h('p', { class: 'label' }, 'Opcje'),
      chips([[true, 'Kropka w środku'], [false, 'Bez kropki']], dot, (v) => { dot = v; Store.setPref('schulteDot', v); }),
      chips([[false, 'Nie zaznaczaj'], [true, 'Zaznaczaj znalezione']], mark, (v) => { mark = v; Store.setPref('schulteMark', v); }),
      h('button', { class: 'btn primary big', onclick: play }, 'Start'),
    );
    const play = () => {
      const n = size * size;
      const nums = shuffle(Array.from({ length: n }, (_, i) => i + 1));
      let next = 1; let errors = 0; const t0 = performance.now();
      const status = h('div', { class: 'status' });
      const timer = h('span', { class: 'mono' });
      const tick = setInterval(() => { timer.textContent = fmt((performance.now() - t0) / 1000); }, 100);
      const updateStatus = () => status.replaceChildren(h('span', {}, 'Szukaj: ', h('b', {}, next)), timer);
      const grid = h('div', { class: 'schulte', style: `--n:${size}` },
        ...nums.map((v) => h('button', {
          class: 'cell', onpointerdown: (e) => {
            const cell = e.currentTarget;
            if (v === next) {
              if (mark) cell.classList.add('found');
              next++; vibrate(5);
              if (next > n) { clearInterval(tick); finish((performance.now() - t0) / 1000, errors); return; }
              updateStatus();
            } else {
              errors++; cell.classList.remove('err'); void cell.offsetWidth; cell.classList.add('err');
            }
          },
        }, v)),
        dot ? h('div', { class: 'focus-dot' }) : null);
      updateStatus();
      body.replaceChildren(status, grid);
      body.addEventListener('abort', () => clearInterval(tick), { once: true });
    };
    const finish = (sec, errors) => {
      const rec = Store.record(`schulte-${size}`, Math.round(sec * 10) / 10, 'lower', { errors });
      body.replaceChildren(resultCard({
        title: `Tablica ${size}×${size}`, big: fmt(sec), rec, format: (v) => fmt(v),
        lines: [`Błędne stuknięcia: ${errors}`], onAgain: play,
      }));
    };
    setup();
  },
});

/* ---------- 2. Widzenie sferyczne ---------- */
ex({
  id: 'sfera', group: 'Pole widzenia', icon: '◎', name: 'Widzenie sferyczne',
  short: 'Rozpoznaj znak błyskający na obwodzie',
  how: 'Patrz wyłącznie na krzyżyk w środku. Na ułamek sekundy w środku pojawi się cyfra, a gdzieś na okręgu litera. Odpowiedz, co widziałeś. Czasem padnie pytanie o cyfrę ze środka — to pilnuje, żebyś nie uciekał wzrokiem. Promień i tempo rosną, gdy trafiasz.',
  why: 'Ćwiczy widzenie peryferyjne we wszystkich kierunkach naraz (stąd „sferyczne”). Bardzo krótki czas ekspozycji (poniżej ok. 200 ms — tyle trwa zaplanowanie i wykonanie ruchu oka) wyklucza przesunięcie wzroku — rozpoznajesz znak wyłącznie peryferyjnie.',
  async run(body, signal) {
    const TRIALS = 20; const MAX = 14;
    const LETTERS = 'ABCDEFHKLMNPRSTUWZ';
    let items = Store.pref('sferaItems', 1);
    const setup = () => body.replaceChildren(
      h('p', { class: 'label' }, 'Liczba znaków na obwodzie'),
      chips([[1, '1 litera'], [2, '2 litery'], [3, '3 litery']], items, (v) => { items = v; Store.setPref('sferaItems', v); }),
      h('p', { class: 'muted' }, `${TRIALS} prób. Trudność dopasowuje się automatycznie.`),
      h('button', { class: 'btn primary big', onclick: () => play().catch(() => {}) }, 'Start'),
    );
    const play = async () => {
      let st = { level: Store.pref('sferaStart', 1), streak: 0, maxLevel: 1 };
      let ok = 0;
      const field = h('div', { class: 'field' }, h('div', { class: 'cross' }, '+'));
      const status = h('div', { class: 'status' });
      const answers = h('div', { class: 'answers' });
      body.replaceChildren(status, field, answers);
      await countdown(answers, signal);
      for (let t = 1; t <= TRIALS; t++) {
        const radius = Math.min(0.94, 0.18 + st.level * 0.058);
        const exposure = Math.max(70, 200 - st.level * 10);
        status.replaceChildren(h('span', {}, `Próba ${t}/${TRIALS}`), h('span', {}, `Poziom ${st.level}`));
        answers.replaceChildren();
        await sleep(600, signal);
        const center = String(rand(1, 9));
        const letters = shuffle([...LETTERS]).slice(0, items);
        const start = Math.random() * Math.PI * 2;
        const nodes = letters.map((l, i) => {
          const a = start + (i * Math.PI * 2) / items;
          return h('div', { class: 'blip', style: `left:${50 + Math.cos(a) * radius * 50}%;top:${50 + Math.sin(a) * radius * 50}%` }, l);
        });
        const c = h('div', { class: 'blip center' }, center);
        field.append(c, ...nodes);
        await sleep(exposure, signal);
        [c, ...nodes].forEach((n) => { n.textContent = '#'; n.classList.add('mask'); });
        await sleep(90, signal);
        [c, ...nodes].forEach((n) => n.remove());

        const askCenter = Math.random() < 0.25;
        const correct = askCenter ? center : pick(letters);
        const pool = askCenter ? '123456789' : LETTERS;
        const opts = shuffle([correct, ...shuffle([...pool].filter((x) => !letters.includes(x) && x !== center)).slice(0, 5)]);
        const chosen = await new Promise((res) => {
          answers.replaceChildren(
            h('p', { class: 'q' }, askCenter ? 'Jaka cyfra była w środku?' : items > 1 ? 'Która z tych liter była na obwodzie?' : 'Jaka litera była na obwodzie?'),
            h('div', { class: 'grid3' }, ...opts.map((o) => h('button', { class: 'btn', onclick: () => res(o) }, o))),
          );
        });
        const good = askCenter ? chosen === center : letters.includes(chosen);
        if (good) ok++;
        vibrate(good ? 5 : [30, 40, 30]);
        field.classList.add(good ? 'flash-ok' : 'flash-bad');
        setTimeout(() => field.classList.remove('flash-ok', 'flash-bad'), 250);
        st = adapt(st, good, MAX);
      }
      Store.setPref('sferaStart', Math.max(1, st.maxLevel - 3));
      const rec = Store.record(`sfera-${items}`, st.maxLevel, 'higher', { acc: ok / TRIALS });
      body.replaceChildren(resultCard({
        title: 'Widzenie sferyczne', big: `Poziom ${st.maxLevel}`, rec, format: (v) => `poziom ${v}`,
        lines: [`Trafienia: ${ok}/${TRIALS} (${Math.round((ok / TRIALS) * 100)}%)`, `Najdalszy promień: ${Math.round(Math.min(0.94, 0.18 + st.maxLevel * 0.058) * 100)}% pola`],
        onAgain: () => play().catch(() => {}),
      }));
    };
    setup();
  },
});

/* ---------- 3. Linia wzroku ---------- */
ex({
  id: 'linia', group: 'Pole widzenia', icon: '⇹', name: 'Linia wzroku',
  short: 'Porównaj słowa po obu stronach osi',
  how: 'Patrz na pionową linię w środku. Po obu stronach błysną dwa słowa. Oceń, czy są identyczne. Z każdym poziomem słowa pojawiają się dalej od środka i krócej.',
  why: 'Poszerza poziome pole widzenia — dokładnie ten kierunek, który wykorzystujesz w linijce tekstu. Jeśli widzisz peryferyjnie początek i koniec krótkiej linii, możesz ją objąć jedną–dwiema fiksacjami.',
  async run(body, signal) {
    const TRIALS = 20; const MAX = 12;
    const play = async () => {
      let st = { level: Store.pref('liniaStart', 1), streak: 0, maxLevel: 1 }; let ok = 0;
      const field = h('div', { class: 'field wide' }, h('div', { class: 'axis' }));
      const status = h('div', { class: 'status' });
      const answers = h('div', { class: 'answers' });
      body.replaceChildren(status, field, answers);
      await countdown(answers, signal);
      for (let t = 1; t <= TRIALS; t++) {
        const dist = Math.min(44, 9 + st.level * 3.2);
        const exposure = Math.max(100, 380 - st.level * 25);
        status.replaceChildren(h('span', {}, `Próba ${t}/${TRIALS}`), h('span', {}, `Poziom ${st.level}`));
        answers.replaceChildren();
        await sleep(500, signal);
        const pool = WORDS.filter((w) => [...w].length <= 4 + Math.ceil(st.level / 3));
        const a = pick(pool); const same = Math.random() < 0.5; const b = same ? a : mutate(a);
        const L = h('div', { class: 'word-l', style: `right:${50 + dist}%` }, a);
        const R = h('div', { class: 'word-r', style: `left:${50 + dist}%` }, b);
        field.append(L, R);
        await sleep(exposure, signal);
        L.remove(); R.remove();
        const ans = await new Promise((res) => answers.replaceChildren(h('div', { class: 'row' },
          h('button', { class: 'btn big', onclick: () => res(true) }, '= Takie same'),
          h('button', { class: 'btn big', onclick: () => res(false) }, '≠ Różne'))));
        const good = ans === same; if (good) ok++;
        vibrate(good ? 5 : [30, 40, 30]);
        field.classList.add(good ? 'flash-ok' : 'flash-bad');
        setTimeout(() => field.classList.remove('flash-ok', 'flash-bad'), 250);
        if (!good) answers.replaceChildren(h('p', { class: 'muted' }, `${a}  |  ${b}`)), await sleep(900, signal);
        st = adapt(st, good, MAX);
      }
      Store.setPref('liniaStart', Math.max(1, st.maxLevel - 3));
      const rec = Store.record('linia', st.maxLevel, 'higher', { acc: ok / TRIALS });
      body.replaceChildren(resultCard({
        title: 'Linia wzroku', big: `Poziom ${st.maxLevel}`, rec, format: (v) => `poziom ${v}`,
        lines: [`Trafienia: ${ok}/${TRIALS}`], onAgain: () => play().catch(() => {}),
      }));
    };
    body.replaceChildren(
      h('p', { class: 'muted' }, `${TRIALS} prób. Trudność dopasowuje się automatycznie.`),
      h('button', { class: 'btn primary big', onclick: () => play().catch(() => {}) }, 'Start'));
  },
});

/* ---------- 4. Biegające słowa (RSVP) ---------- */
ex({
  id: 'rsvp', group: 'Tempo', icon: '▶', name: 'Biegające słowa',
  short: 'Czytaj słowo po słowie w zadanym tempie',
  how: 'Patrz na czerwoną literę — słowa będą się zmieniać w tym samym miejscu. Zacznij od tempa, przy którym rozumiesz tekst, i co sesję podnoś je o 25–50 słów/min. Możesz wkleić własny tekst (np. artykuł).',
  why: 'Słowa podawane w jednym punkcie eliminują sakkady i regresje (powroty wzroku), a stałe tempo uczy, że nie trzeba „cofać się” po każde słowo. To trening tempa i skupienia — sprawdzaj zrozumienie testem czytania, bo przy zbyt wysokim tempie ono spada.',
  run(body) {
    let wpmVal = Store.pref('rsvpWpm', 300);
    let size = Store.pref('rsvpChunk', 1);
    let textId = Store.pref('rsvpText', TEXTS[0].id);
    let custom = Store.pref('rsvpCustom', '');
    const getText = () => (textId === 'custom' ? custom : TEXTS.find((t) => t.id === textId)?.body || '');
    const wpmLabel = h('b', {}, wpmVal);
    const area = h('textarea', { class: 'custom', placeholder: 'Wklej tutaj własny tekst…', rows: 5 });
    area.value = custom;
    area.addEventListener('input', () => { custom = area.value; Store.setPref('rsvpCustom', custom); });
    area.hidden = textId !== 'custom';
    const setup = () => body.replaceChildren(
      h('p', { class: 'label' }, 'Tekst'),
      chips([...TEXTS.map((t) => [t.id, t.title]), ['custom', 'Własny tekst']], textId, (v) => { textId = v; area.hidden = v !== 'custom'; Store.setPref('rsvpText', v); }),
      area,
      h('p', { class: 'label' }, 'Tempo: ', wpmLabel, ' słów/min'),
      h('input', { type: 'range', min: 100, max: 1000, step: 25, value: wpmVal, oninput: (e) => { wpmVal = +e.target.value; wpmLabel.textContent = wpmVal; Store.setPref('rsvpWpm', wpmVal); } }),
      h('p', { class: 'label' }, 'Słów naraz'),
      chips([[1, '1'], [2, '2'], [3, '3']], size, (v) => { size = v; Store.setPref('rsvpChunk', v); }),
      h('button', { class: 'btn primary big', onclick: play }, 'Start'),
    );
    let timer = null;
    const play = () => {
      const words = tokenize(getText());
      if (words.length < 5) { alert('Tekst jest za krótki.'); return; }
      const parts = chunk(words, size);
      let i = 0; let running = true; const t0 = performance.now(); let paused = 0; let pauseAt = 0;
      const stage = h('div', { class: 'rsvp' });
      const bar = h('div', { class: 'progress' }, h('div'));
      const pauseBtn = h('button', { class: 'btn', onclick: () => toggle() }, 'Pauza');
      const show = (frag) => {
        if (size === 1) {
          const chars = [...frag]; const k = orpIndex(frag);
          stage.replaceChildren(h('div', { class: 'orp' },
            h('span', { class: 'pre' }, chars.slice(0, k).join('')),
            h('span', { class: 'pivot' }, chars[k]),
            h('span', { class: 'post' }, chars.slice(k + 1).join(''))));
        } else stage.replaceChildren(h('div', { class: 'phrase' }, frag));
        bar.firstChild.style.width = `${(i / parts.length) * 100}%`;
      };
      const step = () => {
        if (!running) return;
        if (i >= parts.length) return done();
        const frag = parts[i]; show(frag); i++;
        timer = setTimeout(step, delayFor(frag, wpmVal));
      };
      const toggle = () => {
        running = !running; pauseBtn.textContent = running ? 'Pauza' : 'Wznów';
        if (running) { paused += performance.now() - pauseAt; step(); } else { clearTimeout(timer); pauseAt = performance.now(); }
      };
      const done = () => {
        const sec = (performance.now() - t0 - paused) / 1000;
        const real = wpm(words.length, sec);
        const rec = Store.record('rsvp', wpmVal, 'higher', { real });
        body.replaceChildren(resultCard({
          title: 'Tekst ukończony', big: `${wpmVal} sł/min`, rec, format: (v) => `${v} sł/min`,
          lines: [`${words.length} słów w ${fmt(sec)} (z pauzami interpunkcyjnymi: ${real} sł/min)`, 'Wskazówka: następnym razem spróbuj +25 sł/min.'],
          onAgain: setup,
        }));
      };
      body.replaceChildren(
        h('div', { class: 'status' }, h('span', {}, `${wpmVal} sł/min`), h('span', {}, `${words.length} słów`)),
        stage, bar,
        h('div', { class: 'row' }, pauseBtn,
          h('button', { class: 'btn', onclick: () => { wpmVal = Math.max(100, wpmVal - 25); } }, '− 25'),
          h('button', { class: 'btn', onclick: () => { wpmVal = Math.min(1000, wpmVal + 25); } }, '+ 25')));
      stage.addEventListener('click', toggle);
      step();
    };
    body.addEventListener('abort', () => clearTimeout(timer), { once: true });
    setup();
  },
});

/* ---------- 5. Ruch oczu ---------- */
ex({
  id: 'oczy', group: 'Tempo', icon: '⋯', name: 'Ruch oczu',
  short: 'Podążaj wzrokiem za skaczącym punktem',
  how: 'Trzymaj głowę nieruchomo i śledź punkt samymi oczami. Wybierz wzór i tempo. Sesja trwa 60 sekund — to dobra rozgrzewka przed pozostałymi ćwiczeniami.',
  why: 'Czytanie to seria precyzyjnych skoków oczu (sakkad). Ćwiczenie uczy szybkiego, celnego przenoszenia wzroku i skraca czas „lądowania” na kolejnej fiksacji — szczególnie przy przejściu na początek następnej linijki.',
  run(body) {
    let mode = Store.pref('eyeMode', 'h'); let bpm = Store.pref('eyeBpm', 90);
    const lbl = h('b', {}, bpm);
    let iv = null;
    const setup = () => body.replaceChildren(
      h('p', { class: 'label' }, 'Wzór'),
      chips([['h', 'Poziomo'], ['v', 'Pionowo'], ['d', 'Przekątne'], ['z', 'Linijki (Z)'], ['r', 'Losowo']], mode, (v) => { mode = v; Store.setPref('eyeMode', v); }),
      h('p', { class: 'label' }, 'Tempo: ', lbl, ' skoków/min'),
      h('input', { type: 'range', min: 40, max: 200, step: 10, value: bpm, oninput: (e) => { bpm = +e.target.value; lbl.textContent = bpm; Store.setPref('eyeBpm', bpm); } }),
      h('button', { class: 'btn primary big', onclick: play }, 'Start (60 s)'));
    const play = () => {
      const field = h('div', { class: 'field tall' }); const dot = h('div', { class: 'dot' }); field.append(dot);
      const status = h('div', { class: 'status' });
      body.replaceChildren(status, field);
      let k = 0; const t0 = performance.now();
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
        const left = 60 - (performance.now() - t0) / 1000;
        if (left <= 0) {
          clearInterval(iv);
          const rec = Store.record('oczy', k, null, { mode, bpm });
          body.replaceChildren(resultCard({ title: 'Rozgrzewka zakończona', big: `${k} skoków`, rec, onAgain: setup }));
          return;
        }
        const [x, y] = pos(); dot.style.left = x + '%'; dot.style.top = y + '%'; k++;
        status.replaceChildren(h('span', {}, `${bpm} skoków/min`), h('span', { class: 'mono' }, `${Math.ceil(left)} s`));
      };
      tick(); iv = setInterval(tick, 60000 / bpm);
    };
    body.addEventListener('abort', () => clearInterval(iv), { once: true });
    setup();
  },
});

/* ---------- 6. Szukanie liter ---------- */
ex({
  id: 'litery', group: 'Uwaga i pamięć', icon: 'Aa', name: 'Szukanie liter',
  short: 'Znajdź wszystkie wskazane litery wśród podobnych',
  how: 'Znajdź i stuknij wszystkie wystąpienia litery docelowej. Litery wokół są do niej celowo podobne (b/d/p/q). Przeszukuj rzędami, jak przy czytaniu.',
  why: 'Uczy szybkiego rozróżniania kształtów liter i utrzymania koncentracji podczas skanowania. To ta sama praca wzrokowa, którą wykonujesz przy rozpoznawaniu słów — tylko wyizolowana.',
  run(body) {
    const play = () => {
      const { target, cells } = letterGrid(80, rand(7, 11));
      const total = cells.filter((c) => c === target).length;
      let found = 0; let errors = 0; const t0 = performance.now();
      const status = h('div', { class: 'status' });
      const upd = () => status.replaceChildren(h('span', {}, 'Szukaj: ', h('b', { class: 'target' }, target)), h('span', {}, `${found}/${total}`));
      const grid = h('div', { class: 'letters' }, ...cells.map((c) => h('button', {
        class: 'cell small', onpointerdown: (e) => {
          const el = e.currentTarget; if (el.classList.contains('found')) return;
          if (c === target) {
            el.classList.add('found'); found++; vibrate(5); upd();
            if (found === total) {
              const sec = (performance.now() - t0) / 1000;
              const rec = Store.record('litery', Math.round(sec * 10) / 10, 'lower', { errors });
              setTimeout(() => body.replaceChildren(resultCard({ title: 'Wszystkie znalezione', big: fmt(sec), rec, format: fmt, lines: [`Pomyłki: ${errors}`], onAgain: play })), 250);
            }
          } else { errors++; el.classList.remove('err'); void el.offsetWidth; el.classList.add('err'); }
        },
      }, c)));
      upd(); body.replaceChildren(status, grid);
    };
    play();
  },
});

/* ---------- 7. Szukanie liczb ---------- */
ex({
  id: 'liczby', group: 'Uwaga i pamięć', icon: '#', name: 'Szukanie liczb',
  short: 'Znajdź liczbę wśród bardzo podobnych',
  how: 'Na górze widzisz liczbę. Znajdź ją w siatce wśród liczb różniących się jedną cyfrą lub kolejnością. 10 rund, z każdą rundą liczby są dłuższe.',
  why: 'Trenuje precyzyjne postrzeganie całych ciągów znaków jednym spojrzeniem, zamiast znak po znaku. Przydatne wprost przy czytaniu tabel, faktur i raportów.',
  run(body) {
    const ROUNDS = 10;
    const play = () => {
      let r = 0; let errors = 0; const t0 = performance.now();
      const status = h('div', { class: 'status' }); const wrap = h('div');
      body.replaceChildren(status, wrap);
      const round = () => {
        if (r >= ROUNDS) {
          const sec = (performance.now() - t0) / 1000;
          const rec = Store.record('liczby', Math.round(sec * 10) / 10, 'lower', { errors });
          body.replaceChildren(resultCard({ title: `${ROUNDS} rund`, big: fmt(sec), rec, format: fmt, lines: [`Pomyłki: ${errors}`], onAgain: play }));
          return;
        }
        const digits = r < 3 ? 4 : r < 7 ? 5 : 6;
        const { target, cells } = numberRound(digits, 20);
        r++;
        status.replaceChildren(h('span', {}, 'Znajdź: ', h('b', { class: 'target mono' }, target)), h('span', {}, `${r}/${ROUNDS}`));
        wrap.replaceChildren(h('div', { class: 'numbers' }, ...cells.map((c) => h('button', {
          class: 'cell mono', onpointerdown: (e) => {
            if (c === target) { vibrate(5); round(); } else { errors++; const el = e.currentTarget; el.classList.remove('err'); void el.offsetWidth; el.classList.add('err'); }
          },
        }, c))));
      };
      round();
    };
    play();
  },
});

/* ---------- 8. Zapamiętaj liczbę ---------- */
ex({
  id: 'pamiec', group: 'Uwaga i pamięć', icon: '7̲', name: 'Zapamiętaj liczbę',
  short: 'Liczba błyska na chwilę — wpisz ją',
  how: 'Liczba pojawi się na ułamek sekundy. Wpisz ją z pamięci. Każda poprawna odpowiedź wydłuża liczbę o jedną cyfrę. Masz 3 życia.',
  why: 'Ćwiczy „chwytanie” całej grupy znaków w jednej fiksacji i utrzymanie jej w pamięci roboczej. Przy czytaniu pozwala to obejmować wzrokiem kilka słów naraz zamiast jednego.',
  async run(body, signal) {
    const play = async () => {
      let len = 3; let lives = 3; let best = 0;
      const status = h('div', { class: 'status' }); const stage = h('div', { class: 'flash' }); const pad = h('div');
      body.replaceChildren(status, stage, pad);
      while (lives > 0) {
        status.replaceChildren(h('span', {}, `Cyfr: ${len}`), h('span', {}, '❤️'.repeat(lives) + '🤍'.repeat(3 - lives)));
        pad.replaceChildren();
        stage.textContent = '+'; await sleep(700, signal);
        let num = String(rand(1, 9));
        while (num.length < len) num += rand(0, 9);
        stage.textContent = num.replace(/(\d{3})(?=\d)/g, '$1 ');
        await sleep(Math.min(1200, 300 + len * 70), signal);
        stage.textContent = '#'.repeat(Math.min(len, 9)); await sleep(100, signal);
        stage.textContent = '';
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
        if (answer === num) { best = len; len++; vibrate(5); stage.textContent = '✓'; } else { lives--; vibrate([30, 40, 30]); stage.innerHTML = `<span class="bad">${num}</span>`; }
        await sleep(700, signal);
      }
      const rec = Store.record('pamiec', best, 'higher');
      body.replaceChildren(resultCard({ title: 'Koniec gry', big: `${best} cyfr`, rec, format: (v) => `${v} cyfr`, onAgain: () => play().catch(() => {}) }));
    };
    body.replaceChildren(h('button', { class: 'btn primary big', onclick: () => play().catch(() => {}) }, 'Start'));
  },
});

/* ---------- 9. Pary słów ---------- */
ex({
  id: 'pary', group: 'Uwaga i pamięć', icon: '≠', name: 'Pary słów',
  short: 'Wyłap pary, które się różnią',
  how: 'Przejrzyj listę par jak najszybciej i zaznacz te, w których słowa się różnią (jedna litera lub zamiana kolejności). Potem stuknij „Sprawdź”. Każdy błąd to +3 s kary.',
  why: 'Uczy dokładnego postrzegania całego słowa na raz przy wysokim tempie. Mózg zwykle „domyśla się” słowa po kształcie — tu musisz zauważyć drobną różnicę, co wzmacnia precyzję rozpoznawania.',
  run(body) {
    const N = 15;
    const play = () => {
      const pairs = shuffle(WORDS).slice(0, N).map((w) => { const diff = Math.random() < 0.4; return { a: w, b: diff ? mutate(w) : w, diff, sel: false }; });
      const t0 = performance.now();
      const list = h('div', { class: 'pairs' }, ...pairs.map((p) => h('button', {
        class: 'pair', onclick: (e) => { p.sel = !p.sel; e.currentTarget.classList.toggle('sel', p.sel); },
      }, h('span', {}, p.a), h('span', {}, p.b))));
      const check = () => {
        const sec = (performance.now() - t0) / 1000;
        const mistakes = pairs.filter((p) => p.sel !== p.diff).length;
        [...list.children].forEach((el, i) => el.classList.add(pairs[i].sel === pairs[i].diff ? 'good' : 'wrong'));
        const score = Math.round((sec + mistakes * 3) * 10) / 10;
        const rec = Store.record('pary', score, 'lower', { mistakes });
        body.replaceChildren(resultCard({ title: 'Wynik (czas + kary)', big: fmt(score), rec, format: fmt, lines: [`Czas: ${fmt(sec)}, błędy: ${mistakes}`], onAgain: play }), list);
      };
      body.replaceChildren(h('p', { class: 'muted' }, 'Zaznacz pary, które się RÓŻNIĄ.'), list, h('button', { class: 'btn primary big', onclick: check }, 'Sprawdź'));
    };
    play();
  },
});

/* ---------- 10. Test czytania ---------- */
ex({
  id: 'test', group: 'Pomiar', icon: '⏱', name: 'Test prędkości czytania',
  short: 'Zmierz tempo i zrozumienie',
  how: 'Czytaj normalnie, ze zrozumieniem. Stuknij „Skończyłem”, potem odpowiedz na 3 pytania. Wynik efektywny = tempo × zrozumienie — to on mówi o realnych postępach.',
  why: 'Ćwiczenia mają sens tylko wtedy, gdy rośnie tempo przy zachowanym rozumieniu. Regularny pomiar (np. raz w tygodniu) pokazuje, czy trening przenosi się na prawdziwe czytanie.',
  run(body) {
    const setup = () => body.replaceChildren(
      h('p', { class: 'label' }, 'Wybierz tekst'),
      ...TEXTS.map((t) => h('button', { class: 'btn wide', onclick: () => read(t) }, `${t.title} · ${tokenize(t.body).length} słów`)));
    const read = (t) => {
      const t0 = performance.now();
      body.replaceChildren(h('article', { class: 'reading' }, h('h2', {}, t.title), ...t.body.split('\n\n').map((p) => h('p', {}, p))),
        h('button', { class: 'btn primary big sticky', onclick: () => quiz(t, (performance.now() - t0) / 1000) }, 'Skończyłem'));
      window.scrollTo(0, 0);
    };
    const quiz = (t, sec) => {
      let qi = 0; let ok = 0;
      const next = () => {
        if (qi >= t.questions.length) {
          const speed = wpm(tokenize(t.body).length, sec);
          const comp = ok / t.questions.length;
          const eff = Math.round(speed * comp);
          const plausible = speed <= 1200;
          const rec = plausible ? Store.record('test', eff, 'higher', { speed, comp }) : null;
          body.replaceChildren(resultCard({
            title: 'Efektywne tempo', big: `${eff} sł/min`, rec, format: (v) => `${v} sł/min`,
            lines: [`Tempo: ${speed} sł/min · czas ${fmt(sec)}`, `Zrozumienie: ${ok}/${t.questions.length}`,
              plausible ? '' : 'Ponad 1200 sł/min to raczej przeglądanie niż czytanie — wynik nie został zapisany.',
              'Orientacyjnie: przeciętny dorosły czyta tekst popularny w tempie ok. 200–300 sł/min.'],
            onAgain: setup,
          }));
          window.scrollTo(0, 0);
          return;
        }
        const q = t.questions[qi];
        body.replaceChildren(h('p', { class: 'muted' }, `Pytanie ${qi + 1}/${t.questions.length}`), h('p', { class: 'q' }, q.q),
          ...q.a.map((a, i) => h('button', { class: 'btn wide', onclick: () => { if (i === q.ok) ok++; qi++; next(); } }, a)));
        window.scrollTo(0, 0);
      };
      next();
    };
    setup();
  },
});

/* ======================================================================
   EKRANY
   ====================================================================== */

const PLAN = ['oczy', 'schulte', 'sfera', 'linia', 'rsvp'];

function home() {
  const s = streak(Store.data.days);
  const groups = [...new Set(EXERCISES.map((e) => e.group))];
  const planDone = PLAN.filter((id) => Store.doneToday(id)).length;
  return h('div', { class: 'screen' },
    h('header', { class: 'hero' },
      h('div', {}, h('h1', {}, 'ReaderProMM'), h('p', { class: 'muted' }, 'Trening szybkiego czytania')),
      h('a', { class: 'streak', href: '#/stats', 'aria-label': 'Statystyki' }, h('b', {}, s), h('span', {}, s === 1 ? 'dzień' : 'dni'))),
    h('main', { class: 'screen-body' },
      h('section', { class: 'plan' },
        h('div', { class: 'plan-head' }, h('h2', {}, 'Plan dnia (~10 min)'), h('span', { class: 'muted' }, `${planDone}/${PLAN.length}`)),
        h('div', { class: 'plan-list' }, ...PLAN.map((id, i) => {
          const e = EXERCISES.find((x) => x.id === id); const done = Store.doneToday(id);
          return h('a', { class: 'plan-item' + (done ? ' done' : ''), href: `#/ex/${id}` }, h('span', { class: 'n' }, done ? '✓' : i + 1), e.name);
        }))),
      ...groups.map((g) => h('section', {},
        h('h2', { class: 'group' }, g),
        h('div', { class: 'cards' }, ...EXERCISES.filter((e) => e.group === g).map((e) => h('a', { class: 'card', href: `#/ex/${e.id}` },
          h('span', { class: 'ico' }, e.icon),
          h('span', { class: 'txt' }, h('b', {}, e.name), h('small', {}, e.short)))))),
      ),
      h('a', { class: 'btn wide', href: '#/stats' }, 'Statystyki i rekordy'),
      h('p', { class: 'foot muted' }, 'Wyniki są zapisywane tylko na tym urządzeniu.'),
    ));
}

const LABELS = {
  'schulte-3': ['Schulte 3×3', fmt], 'schulte-4': ['Schulte 4×4', fmt], 'schulte-5': ['Schulte 5×5', fmt],
  'schulte-6': ['Schulte 6×6', fmt], 'schulte-7': ['Schulte 7×7', fmt],
  'sfera-1': ['Sferyczne (1 litera)', (v) => `poz. ${v}`], 'sfera-2': ['Sferyczne (2 litery)', (v) => `poz. ${v}`], 'sfera-3': ['Sferyczne (3 litery)', (v) => `poz. ${v}`],
  linia: ['Linia wzroku', (v) => `poz. ${v}`], rsvp: ['Biegające słowa', (v) => `${v} sł/min`], oczy: ['Ruch oczu', (v) => `${v} skoków`],
  litery: ['Szukanie liter', fmt], liczby: ['Szukanie liczb', fmt], pamiec: ['Zapamiętaj liczbę', (v) => `${v} cyfr`],
  pary: ['Pary słów', fmt], test: ['Test czytania (efektywne)', (v) => `${v} sł/min`],
};

function sparkline(values) {
  if (values.length < 2) return h('span');
  const w = 110; const hh = 28; const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${hh - 3 - ((v - min) / span) * (hh - 6)}`).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hh}`); svg.setAttribute('class', 'spark');
  svg.innerHTML = `<polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  return svg;
}

function stats() {
  const { view, body } = screen('Statystyki');
  const res = Store.data.results;
  const ids = Object.keys(LABELS).filter((id) => res[id]?.history.length);
  body.append(
    h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('b', {}, streak(Store.data.days)), h('small', {}, 'dni z rzędu')),
      h('div', { class: 'tile' }, h('b', {}, Store.data.days.length), h('small', {}, 'dni treningu')),
      h('div', { class: 'tile' }, h('b', {}, Object.values(res).reduce((a, r) => a + r.history.length, 0)), h('small', {}, 'sesji'))),
    ids.length ? h('div', { class: 'table' }, ...ids.map((id) => {
      const [name, f] = LABELS[id]; const r = res[id];
      return h('div', { class: 'trow' },
        h('div', {}, h('b', {}, name), h('small', { class: 'muted' }, `${r.history.length} sesji · ostatnio ${f(r.history.at(-1).v)}`)),
        sparkline(r.history.slice(-20).map((e) => e.v)),
        h('div', { class: 'best' }, r.best != null ? f(r.best) : '—'));
    })) : h('p', { class: 'muted' }, 'Brak wyników — zacznij od planu dnia.'),
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
  let view;
  if (kind === 'ex') {
    const e = EXERCISES.find((x) => x.id === id);
    if (!e) { location.hash = '#/'; return; }
    const s = screen(e.name, e);
    const ac = current;
    ac.signal.addEventListener('abort', () => s.body.dispatchEvent(new Event('abort')));
    Promise.resolve(e.run(s.body, ac.signal)).catch(() => {});
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
