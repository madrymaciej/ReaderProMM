import {
  rand, pick, shuffle, WORDS, mutate, letterGrid, numberRound, orpIndex,
  tokenize, chunk, delayFor, wpm, adapt, dayKey, streak, UP_AFTER,
} from './lib.js';
import { TEXTS } from './texts.js';
import { createReader } from './reader.js';
import { Library } from './db.js';
import { normalizeText } from './importers.js';
import { articleFromHtml } from './article.js';
import { parseInfopigula } from './infopigula.js';
import { makeDemo } from './demos.js';
import { openTutorial } from './tutorials.js';
import { BUILD, CHANNEL } from './version.js';

/** Most do natywnej aplikacji iOS (WKWebView). W przeglądarce/PWA — brak. */
const nativeBridge = () => window.webkit?.messageHandlers?.native || null;
const toNative = (msg) => { try { nativeBridge()?.postMessage(msg); } catch { /* brak */ } };

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
  key: 'readerpromm-v2', // nazwa wewnętrzna — nie zmieniać (zmiana skasowałaby zapisane dane)
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
    const t = Date.now();
    r.history.push({ t, v: value, ...extra });
    if (r.history.length > 200) r.history.shift();
    const today = dayKey();
    if (!this.data.days.includes(today)) this.data.days.push(today);
    this.save();
    return { t, isBest: isBest && r.history.length > 1, best: r.best, prev, history: r.history };
  },
  /** Cofa zapis jednej sesji (przycisk „Zakończ i nie zapisuj wyniku”). */
  unrecord(id, t) {
    const r = this.data.results[id];
    if (!r) return;
    r.history = r.history.filter((e) => e.t !== t);
    if (!r.history.length) delete this.data.results[id];
    else r.best = Math.max(...r.history.map((e) => e.v));
    // dzień treningu usuwamy tylko, jeśli dziś nie było innej aktywności
    const today = dayKey();
    const other = Object.values(this.data.results).some((x) => x.history.some((e) => dayKey(new Date(e.t)) === today))
      || (this.data.read?.days?.[today]?.words > 0);
    if (!other) this.data.days = this.data.days.filter((d) => d !== today);
    this.save();
  },
  doneToday(prefix) {
    const today = dayKey();
    return Object.entries(this.data.results).some(([id, r]) =>
      (id === prefix || id.startsWith(prefix + '-')) && r.history.some((e) => dayKey(new Date(e.t)) === today));
  },
};

/* ---------- Poziomy (zapamiętywane między sesjami) ---------- */
const getLevel = (key) => Store.pref(`lvl-${key}`, 1);
const setLevel = (key, v) => Store.setPref(`lvl-${key}`, v);
/**
 * Wybór poziomu na ekranie ustawień ćwiczenia: −/+ i suwak. Zapisuje od razu;
 * w trakcie gry poziom dalej zmienia się automatycznie (3 dobrze ▲ / błąd ▼) i jest zapamiętywany.
 */
function levelInfo(key, max, rerender, describe) {
  let lv = getLevel(key);
  const val = h('b', { class: 'lvl-num mono' }, lv);
  const desc = h('small', { class: 'muted lvl-desc' }, describe ? describe(lv) : '');
  const range = h('input', { type: 'range', min: 1, max, step: 1, value: lv, 'aria-label': 'Poziom startowy' });
  const minus = h('button', { class: 'btn lvl-btn', 'aria-label': 'Poziom niżej' }, '−');
  const plus = h('button', { class: 'btn lvl-btn', 'aria-label': 'Poziom wyżej' }, '+');
  const set = (v) => {
    lv = Math.min(max, Math.max(1, v)); setLevel(key, lv);
    val.textContent = lv; range.value = lv; desc.textContent = describe ? describe(lv) : '';
    minus.disabled = lv <= 1; plus.disabled = lv >= max;
  };
  minus.addEventListener('click', () => set(lv - 1));
  plus.addEventListener('click', () => set(lv + 1));
  range.addEventListener('input', () => set(+range.value));
  set(lv);
  return h('div', { class: 'lvl-pick' },
    h('div', { class: 'lvl-pick-row' },
      h('span', { class: 'label' }, 'Poziom startowy'),
      minus, h('span', { class: 'lvl-val' }, val, h('span', { class: 'muted' }, ` / ${max}`)), plus),
    range, desc,
    h('small', { class: 'muted' }, 'Potem poziom zmienia się sam: 3 trafienia z rzędu ▲, błąd ▼ — i jest zapamiętywany na następny raz.'));
}

/* ---------- Infopiguła z Gmaila (przez Twój skrypt Apps Script) ---------- */
const Infopigula = {
  url: () => Store.pref('infopigulaUrl', ''),
  cached: () => Store.pref('ipCache', null),
  /** Najnowsze wydanie (raz dziennie z sieci, potem z pamięci). Dodaje je też do Biblioteki. */
  async latest(force = false) {
    const url = Infopigula.url();
    if (!url) throw new Error('Nie podłączono Infopiguły (Ustawienia → Infopiguła).');
    const c = Infopigula.cached();
    if (!force && c && c.day === dayKey()) return c;
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'n=1', { redirect: 'follow' });
    if (!res.ok) throw new Error(`Błąd połączenia (${res.status}).`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const it = data.issues?.[0];
    if (!it) throw new Error('Brak wydania z ostatnich 10 dni.');
    const parsed = parseInfopigula(it.html);
    if (!parsed.text) throw new Error('Nie udało się odczytać treści wydania (zmienił się format newslettera?).');
    const out = { day: dayKey(), id: it.id, issue: parsed.issue || it.date, title: parsed.title, text: parsed.text, count: parsed.count };
    Store.setPref('ipCache', out);
    const inLib = Store.pref('ipLib', {});
    if (!inLib[it.id]) {
      const d = await Library.add({ title: parsed.title, text: parsed.text, source: 'Infopiguła' });
      Store.setPref('ipLib', { ...inLib, [it.id]: d.id });
    }
    return out;
  },
};

/* ---------- Plan dnia ---------- */
// Plan losowany na każdy dzień: Ruch oczu (rozgrzewka) zawsze pierwszy, potem N ćwiczeń wylosowanych z puli,
// w miarę możliwości innych niż wczoraj. Pulę i N ustawia „Edytuj”. Każde ćwiczenie planu można wymienić („Zmień ćwiczenie”).
const FIRST_IN_PLAN = 'oczy';
const NOT_IN_POOL = [FIRST_IN_PLAN, 'test']; // test prędkości to pomiar, nie trening — można go dodać ręcznie do puli
const exists = (id) => EXERCISES.some((e) => e.id === id);
const planPool = () => (Store.pref('planPool', null) || EXERCISES.map((e) => e.id).filter((id) => !NOT_IN_POOL.includes(id)))
  .filter((id) => id !== FIRST_IN_PLAN && exists(id));
// Domyślna liczba = tyle, ile było w dawnym stałym planie (pref 'plan' zostaje nietknięty).
const planCount = () => Store.pref('planCount', Math.max(1, (Store.pref('plan', null) || ['', 1, 2, 3, 4]).length - 1));
/** Losuje ćwiczenia na dzień: najpierw te, których nie było w `prev`; `keep` zostają (np. już wykonane). */
function drawPlan(prev = [], keep = []) {
  const pool = planPool().filter((id) => !keep.includes(id));
  const need = Math.max(0, Math.min(planCount(), planPool().length + keep.length) - keep.length);
  const picked = [...shuffle(pool.filter((id) => !prev.includes(id))), ...shuffle(pool.filter((id) => prev.includes(id)))].slice(0, need);
  let ids = [...keep, ...shuffle(picked)];
  // Ten sam zestaw co wczoraj (mała pula)? Przynajmniej inna kolejność.
  for (let i = 0; i < 5 && ids.length > 1 && ids.join() === prev.join(); i++) ids = shuffle(ids);
  return ids;
}
function dayPlan() {
  const today = dayKey();
  let dp = Store.pref('dayPlan', null);
  if (!dp || dp.day !== today) {
    const prev = dp?.ids || [];
    dp = { day: today, ids: drawPlan(prev), prev };
    Store.setPref('dayPlan', dp);
  }
  return dp;
}
const getPlan = () => [FIRST_IN_PLAN, ...dayPlan().ids.filter((id) => id !== FIRST_IN_PLAN && exists(id))];
/** Nowa pula / liczba: losuje dzisiejszy plan od nowa, zachowując ćwiczenia już dziś wykonane. */
function setPlanPool(ids, count) {
  Store.setPref('planPool', ids.filter((id) => id !== FIRST_IN_PLAN));
  Store.setPref('planCount', count);
  const dp = dayPlan();
  const keep = dp.ids.filter((id) => Store.doneToday(id));
  Store.setPref('dayPlan', { ...dp, ids: drawPlan(dp.prev || [], keep) });
}
/** Wymiana ćwiczenia w dzisiejszym planie na inne (to samo miejsce w kolejności). */
function swapInPlan(oldId, newId) {
  const dp = dayPlan();
  Store.setPref('dayPlan', { ...dp, ids: dp.ids.map((id) => (id === oldId ? newId : id)) });
}
let currentEx = null; // id otwartego ćwiczenia (do przycisku „Następnie”)

/* ---------- Wspólne elementy UI ---------- */
const GEAR = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const gearBtn = (onclick) => h('button', { class: 'icon-btn gear', 'aria-label': 'Ustawienia', html: GEAR, onclick });

/* ---------- Ekran nie wygasa w trakcie ćwiczenia (Screen Wake Lock API, iOS 16.4+, w aplikacji z ekranu początkowego od iOS 18.4) ---------- */
const Wake = {
  lock: null, want: false,
  async on() {
    this.want = true;
    if (nativeBridge()) { toNative({ type: 'wake', on: true }); return; } // w aplikacji natywnej: isIdleTimerDisabled
    if (this.lock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      this.lock = await navigator.wakeLock.request('screen');
      this.lock.addEventListener('release', () => { this.lock = null; });
    } catch { this.lock = null; }
  },
  off() { this.want = false; if (nativeBridge()) toNative({ type: 'wake', on: false }); this.lock?.release().catch(() => {}); this.lock = null; },
};
// iOS zwalnia blokadę po przejściu aplikacji w tło — odzyskaj ją po powrocie.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Wake.want) Wake.on(); });

/** Akcja koła zębatego na ekranie ćwiczenia (ustawiana przez ustawienia / sesję / wynik). */
let gearAction = null;

function screen(title, ex) {
  const body = h('main', { class: 'screen-body' + (ex ? ' center' : '') });
  const modal = ex?.why ? infoModal(ex) : null;
  const view = h('div', { class: 'screen' },
    h('header', { class: 'bar' },
      // Wstecz: z sesji lub wyniku → ustawienia ćwiczenia; z ustawień → ekran główny.
      h('a', { href: '#/', class: 'back', 'aria-label': 'Wróć', onclick: (e) => { if (ex && gearAction) { e.preventDefault(); gearAction(); } } }, '‹'),
      h('h1', {}, ex ? h('span', { class: 'h1-ico' }, ex.icon) : null, title),
      h('div', { class: 'bar-actions' },
        modal ? h('button', { class: 'icon-btn', 'aria-label': 'Jak to działa', onclick: () => modal.open() }, 'i') : null,
        gearBtn(() => {
          if (!ex) { location.hash = '#/settings'; return; }
          if (gearAction) gearAction(); else window.scrollTo({ top: 0, behavior: 'smooth' });
        })),
    ),
    body, modal);
  // Symulacja ćwiczenia nad ustawieniami; znika w trakcie sesji i na ekranie wyniku. Ikona jest obok nazwy w pasku.
  if (ex) {
    // Na ekranie ustawień: zapętlona symulacja ćwiczenia (krok co 100 ms, tylko gdy jest widoczna).
    const demo = makeDemo(ex.id, h);
    // „Zmień ćwiczenie”: tylko dla ćwiczenia z dzisiejszego planu (poza Ruchem oczu), jeszcze niewykonanego.
    const swapList = h('div', { class: 'swap-list', hidden: true });
    const swapBtn = h('button', { class: 'link', onclick: () => {
      if (!swapList.hidden) { swapList.hidden = true; return; }
      const plan = getPlan();
      swapList.replaceChildren(
        h('p', { class: 'label' }, 'Wymień w planie dnia na:'),
        ...EXERCISES.filter((e) => e.id !== FIRST_IN_PLAN && !plan.includes(e.id)).map((e) => h('button', {
          class: 'pick', onclick: () => { swapInPlan(ex.id, e.id); location.hash = `#/ex/${e.id}`; },
        }, h('span', { class: 'ico' }, e.icon), h('span', {}, e.name), Store.doneToday(e.id) ? h('small', { class: 'muted' }, 'dziś ✓') : null)));
      swapList.hidden = false;
    } }, '⇄ Zmień ćwiczenie');
    const canSwap = () => ex.id !== FIRST_IN_PLAN && getPlan().includes(ex.id) && !Store.doneToday(ex.id);
    const hero = h('div', { class: 'ex-hero' }, demo.el,
      h('div', { class: 'hero-links' },
        h('button', { class: 'link', onclick: () => openTutorial(ex, h) }, '▶ Samouczek'),
        canSwap() ? swapBtn : null),
      swapList);
    const sig = current?.signal;
    const iv = setInterval(() => { if (hero.isConnected && document.visibilityState === 'visible') demo.step(); }, 100);
    sig?.addEventListener('abort', () => clearInterval(iv), { once: true });
    const sync = () => {
      const onSetup = !body.classList.contains('in-session') && !body.querySelector('.result');
      if (onSetup && body.firstChild !== hero) body.prepend(hero);
      else if (!onSetup && hero.isConnected) hero.remove();
    };
    new MutationObserver(sync).observe(body, { childList: true, attributes: true, attributeFilter: ['class'] });
    sync();
  }
  // Przy pierwszym wejściu: samouczek (3 kroki z próbą). Instrukcja tekstowa — pod przyciskiem „i”.
  if (ex && !Store.pref(`tut-${ex.id}`, false)) { Store.setPref(`tut-${ex.id}`, true); Store.setPref(`seen-${ex.id}`, true); setTimeout(() => openTutorial(ex, h), 0); }
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
      h('button', { class: 'btn primary wide', onclick: close }, 'Rozumiem'),
      h('button', { class: 'btn wide', style: 'margin-top:8px', onclick: () => { close(); openTutorial(ex, h); } }, '▶ Pokaż samouczek')));
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

/** Przyciski porównania: „Różne” po lewej (czerwony), „Takie same” po prawej (zielony). */
const sameDiff = (res) => h('div', { class: 'row samediff' },
  h('button', { class: 'btn big diff', onclick: () => res(false) }, '≠ Różne'),
  h('button', { class: 'btn big same', onclick: () => res(true) }, '= Takie same'));

const startBtn = (onclick) => h('button', { class: 'btn primary big', onclick }, `Start · ${DURATION === 60 ? '1 min' : DURATION + ' s'}`);

function lastResult(id) {
  const r = Store.get(id);
  if (!r?.history.length) return h('p', { class: 'muted small center-text' }, 'Brak wcześniejszych wyników.');
  return h('p', { class: 'muted small center-text' }, `Ostatnio: ${num(r.history.at(-1).v)} ${r.unit} · rekord: ${num(r.best)} ${r.unit} · sesji: ${r.history.length}`);
}

/** Ekran startowy przed ćwiczeniem: pierścień wypełnia się w 1,8 s, pod nim ikona, nazwa i poziom. */
async function countdown(el, signal, info = null) {
  const ex = EXERCISES.find((e) => e.id === currentEx);
  const ring = svgEl('svg', { viewBox: '0 0 100 100', class: 'start-ring' });
  ring.append(svgEl('circle', { cx: 50, cy: 50, r: 44, class: 'track' }), svgEl('circle', { cx: 50, cy: 50, r: 44, class: 'fill', pathLength: 100 }), svgEl('circle', { cx: 50, cy: 50, r: 5, class: 'dot' }));
  el.replaceChildren(h('div', { class: 'start-splash' }, ring,
    h('div', { class: 'start-name' }, ex ? h('span', { class: 'ico' }, ex.icon) : null, h('b', {}, info?.name || ex?.name || '')),
    info?.level ? h('span', { class: 'start-level' }, `Poziom ${info.level}`) : null));
  await sleep(1800, signal);
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
  pts.forEach((p, i) => svg.append(svgEl('circle', { cx: x(i), cy: y(p.v), r: i === pts.length - 1 ? 5.5 : 3.5, class: (i === pts.length - 1 ? 'pt last' : 'pt') + (p.partial != null ? ' partial' : '') })));
  const d = (t) => { const dt = new Date(t); return `${dt.getDate()}.${String(dt.getMonth() + 1).padStart(2, '0')}`; };
  const t1 = svgEl('text', { x: L, y: H - 6, class: 'axis' }); t1.textContent = d(pts[0].t); svg.append(t1);
  if (pts.length > 1) { const t2 = svgEl('text', { x: W - R, y: H - 6, 'text-anchor': 'end', class: 'axis' }); t2.textContent = d(pts.at(-1).t); svg.append(t2); }
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  return h('div', { class: 'chart-box' },
    h('div', { class: 'chart-head' }, h('b', {}, 'Postęp'), h('span', { class: 'muted small' }, `${pts.length} ${pts.length === 1 ? 'sesja' : 'sesji'} · śr. z 5 ost.: ${num(Math.round(avg(vals.slice(-5)) * 10) / 10)}`)),
    svg,
    h('div', { class: 'legend small muted' }, h('span', { class: 'lg-line' }), `wyniki (${unit})`, h('span', { class: 'lg-best' }), 'rekord',
      pts.some((p) => p.partial != null) ? [h('span', { class: 'lg-partial' }), 'zakończona wcześniej'] : null),
    pts.length === 1 ? h('p', { class: 'muted small' }, 'Pierwsza sesja — linia trendu pojawi się po kolejnej.') : null);
}

/* ---------- Sesja na czas: Pauza / Zakończ / licznik / poziom / wynik ---------- */
/**
 * def: { id, name, unit, onSetup, level?: {key, max}, start(stage, api), lines?(extra), onFinish?(extra),
 *        finalize?(stage, extra, reason, signal) => {score, lines, skip} }
 * reason: 'time' (minął czas) | 'stop' (przycisk Zakończ) | 'end' (ćwiczenie samo się skończyło)
 * api: { signal, alive, paused, level, sleep(ms), elapsed(), add(n), answer(good), extra, end() }
 */
function session(body, parentSignal, def) {
  let run = null;
  const kill = () => {
    Wake.off();
    if (!run) return;
    run.ended = true; clearInterval(run.iv); run.ctl.abort();
    run.waiters.splice(0).forEach((f) => f());
  };
  parentSignal.addEventListener('abort', kill, { once: true });

  const begin = async () => {
    kill();
    const ctl = new AbortController();
    const r = run = { ctl, score: 0, extra: {}, ended: false, t0: 0, iv: null, paused: false, pausedMs: 0, pauseAt: 0, waiters: [], ev: new EventTarget() };
    const timeEl = h('span', { class: 'mono time' }, `${DURATION} s`);
    const scoreEl = h('b', { class: 'score mono' }, '0');
    const fill = h('div');
    const stage = h('div', { class: 'stage' });
    // Poziom (dla ćwiczeń z oceną poprawne/błędne): startuje od ostatnio osiągniętego.
    let st = def.level ? { level: getLevel(def.level.key), streak: 0, maxLevel: 0 } : null;
    const lvlEl = h('span', { class: 'lvl' }, st ? `Poziom ${st.level}` : '');
    const dots = h('span', { class: 'dots' });
    const drawDots = () => dots.replaceChildren(...Array.from({ length: UP_AFTER }, (_, i) => h('i', { class: i < st.streak ? 'on' : '' })));
    if (st) { st.maxLevel = st.level; Object.assign(r.extra, { levelStart: st.level, level: st.level, maxLevel: st.level, hits: 0, trials: 0 }); drawDots(); }

    const elapsed = () => (r.t0 ? ((r.paused ? r.pauseAt : performance.now()) - r.t0 - r.pausedMs) / 1000 : 0);
    const pause = () => {
      if (r.paused || r.ended || !r.t0) return;
      r.paused = true; r.pauseAt = performance.now();
      overlay.hidden = false; r.ev.dispatchEvent(new Event('pause'));
    };
    const resume = () => {
      if (!r.paused) return;
      r.pausedMs += performance.now() - r.pauseAt; r.paused = false;
      overlay.hidden = true;
      r.waiters.splice(0).forEach((f) => f());
    };
    const stop = () => { overlay.hidden = true; finish(r, stage, 'stop'); };

    const overlay = h('div', { class: 'pause-overlay', hidden: true },
      h('div', { class: 'pause-box' },
        h('div', { class: 'pause-title' }, '⏸ Pauza'),
        h('button', { class: 'btn primary big wide', onclick: resume }, '▶ Wznów'),
        h('button', { class: 'btn wide', onclick: begin }, '↻ Od nowa'),
        h('button', { class: 'btn wide', onclick: () => { kill(); body.classList.remove('in-session'); gearAction = null; def.onSetup(); window.scrollTo(0, 0); } }, '⚙ Zmień ustawienia i zacznij od nowa'),
        h('button', { class: 'btn wide', onclick: stop }, '⏹ Zakończ i zapisz wynik'),
        h('button', { class: 'btn wide danger', onclick: () => { kill(); location.hash = '#/'; } }, '✕ Zakończ i nie zapisuj wyniku')));
    const controls = h('div', { class: 'controls' },
      h('div', { class: 'ctl-row' },
        h('button', { class: 'btn ctl', onclick: pause, 'aria-label': 'Pauza' }, '⏸ Pauza'),
        h('div', { class: 'ctl-info' }, h('span', { class: 'muted' }, `${def.unit}: `, scoreEl)),
        timeEl),
      st ? h('div', { class: 'lvl-row' }, lvlEl, dots, h('span', { class: 'muted small hint' }, `${UP_AFTER}× dobrze = ▲ · błąd = ▼`)) : null,
      h('div', { class: 'timebar' }, fill));
    body.classList.add('in-session');
    body.replaceChildren(controls, stage, overlay);
    Wake.on();
    gearAction = () => {
      if (r.ended) { def.onSetup(); return; }
      pause();
      if (r.t0 && !confirm('Przerwać ćwiczenie i przejść do ustawień? Wynik tej sesji nie zostanie zapisany.')) return;
      kill(); body.classList.remove('in-session'); gearAction = null; def.onSetup();
    };

    const waitUnpaused = () => (r.paused ? new Promise((res) => r.waiters.push(res)) : Promise.resolve());
    const abortErr = () => new DOMException('abort', 'AbortError');
    const api = {
      signal: ctl.signal,
      get alive() { return !r.ended && !ctl.signal.aborted; },
      get paused() { return r.paused; },
      get level() { return st?.level ?? 1; },
      elapsed,
      pause,
      stop,
      /** sleep, który zatrzymuje się na czas pauzy */
      async sleep(ms) {
        let left = ms;
        while (left > 0) {
          await waitUnpaused();
          if (ctl.signal.aborted) throw abortErr();
          const s = performance.now();
          let onPause;
          const paused = new Promise((res) => { onPause = res; r.ev.addEventListener('pause', res, { once: true }); });
          await Promise.race([sleep(left, ctl.signal), paused]);
          r.ev.removeEventListener('pause', onPause);
          left -= performance.now() - s;
        }
      },
      add(n = 1) { if (!api.alive) return; r.score += n; scoreEl.textContent = r.score; },
      /** Zgłoś wynik próby: liczy trafienia, zmienia poziom i zapamiętuje go. */
      answer(good) {
        if (!api.alive || !st) return 0;
        const before = st.level;
        st = adapt(st, good, def.level.max);
        r.extra.trials++;
        if (good) { r.extra.hits++; api.add(); }
        Object.assign(r.extra, { level: st.level, maxLevel: Math.max(r.extra.maxLevel, st.level) });
        setLevel(def.level.key, st.level);
        const diff = st.level - before;
        lvlEl.textContent = `Poziom ${st.level}`;
        if (diff) { lvlEl.classList.remove('up', 'down'); void lvlEl.offsetWidth; lvlEl.classList.add(diff > 0 ? 'up' : 'down'); }
        drawDots();
        vibrate(good ? 5 : [30, 40, 30]);
        return diff;
      },
      extra: r.extra,
      end: () => finish(r, stage, 'end'),
    };
    try { await countdown(stage, ctl.signal, { level: st?.level }); } catch { return; }
    r.t0 = performance.now();
    r.iv = setInterval(() => {
      if (r.paused) return;
      const left = DURATION - elapsed();
      if (left <= 0) { finish(r, stage, 'time'); return; }
      timeEl.textContent = `${Math.ceil(left)} s`;
      fill.style.width = `${(1 - left / DURATION) * 100}%`;
      timeEl.classList.toggle('warn', left <= 10);
    }, 100);
    Promise.resolve(def.start(stage, api)).catch(() => {});
  };

  const finish = async (r, stage, reason) => {
    if (r.ended || !r.t0) return;
    r.extra.seconds = Math.min(DURATION, ((r.paused ? r.pauseAt : performance.now()) - r.t0 - r.pausedMs) / 1000);
    r.ended = true; clearInterval(r.iv); r.paused = false;
    Wake.off();
    if (reason === 'stop' && r.extra.seconds < DURATION - 0.5) r.extra.partial = Math.round(r.extra.seconds);
    let score = r.score; let skip = false;
    const x = r.extra;
    let lines = [
      x.partial != null ? `Zakończone wcześniej — po ${x.partial} s z ${DURATION} s` : '',
      ...(def.level ? [`Poziom: ${x.levelStart} → ${x.level} (najwyższy: ${x.maxLevel})`] : []),
      ...(def.lines ? def.lines(x) : [])];
    if (def.finalize) {
      try {
        const out = await def.finalize(stage, r.extra, reason, r.ctl.signal);
        ({ score, skip = false } = out);
        lines = [lines[0], ...(out.lines || [])];
      } catch { return; }
    }
    r.ctl.abort();
    r.waiters.splice(0).forEach((f) => f());
    def.onFinish?.(r.extra);
    const { seconds, ...extra } = r.extra;
    const rec = skip ? null : Store.record(def.id, score, def, extra);
    if (run !== r) return;
    body.classList.remove('in-session');
    const acc = def.level && x.trials ? { pct: Math.round((x.hits / x.trials) * 100), hits: x.hits, trials: x.trials } : null;
    body.replaceChildren(resultView(def, score, lines, rec, begin, acc));
    gearAction = () => { gearAction = null; def.onSetup(); };
    window.scrollTo(0, 0);
  };

  begin();
}

function resultView(def, score, lines, rec, again, acc = null) {
  const delta = rec?.prev != null ? score - rec.prev : null;
  const plan = getPlan();
  const next = plan.includes(currentEx) ? plan.find((id) => id !== currentEx && !Store.doneToday(id)) : null;
  const nextEx = next && EXERCISES.find((e) => e.id === next);
  return h('div', { class: 'result' },
    h('div', { class: 'result-title' }, def.name),
    h('div', { class: 'result-big' }, num(score), h('small', {}, def.unit)),
    // Skuteczność: zielona ≥ 85% (optimum uczenia), żółta 70–84%, czerwona < 70%
    acc ? h('div', { class: 'acc ' + (acc.pct >= 85 ? 'good' : acc.pct >= 70 ? 'mid' : 'low') },
      h('b', {}, `${acc.pct}%`), h('span', {}, `skuteczność · ${acc.hits}/${acc.trials}`)) : null,
    rec?.isBest ? h('div', { class: 'badge' }, '🏆 Nowy rekord!') : null,
    delta != null ? h('div', { class: 'delta ' + (delta > 0 ? 'up' : delta < 0 ? 'down' : '') },
      `${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '= '}${num(Math.round(delta * 10) / 10)} vs poprzednia sesja`) : null,
    rec && !rec.isBest ? h('div', { class: 'muted' }, `Rekord: ${num(rec.best)} ${def.unit}`) : null,
    ...lines.filter(Boolean).map((l) => h('div', { class: 'muted' }, l)),
    rec ? chart(rec.history, def.unit) : null,
    nextEx ? h('a', { class: 'btn primary wide', href: `#/ex/${next}` }, `Następnie: ${nextEx.name} →`) : null,
    h('button', { class: 'btn wide' + (nextEx ? '' : ' primary'), onclick: again }, '↻ Jeszcze raz'),
    h('a', { class: 'btn wide', href: '#/' }, 'Zakończ'),
    rec ? h('button', { class: 'btn wide danger', onclick: () => { Store.unrecord(def.id, rec.t); location.hash = '#/'; } }, 'Zakończ i nie zapisuj wyniku') : null,
  );
}

/* ======================================================================
   ĆWICZENIA — każde: run(body, signal) pokazuje ustawienia i startuje session()
   ====================================================================== */

const EXERCISES = [];
const ex = (def) => EXERCISES.push(def);

/* ---------- 1. Tablica Schulte’a ---------- */
ex({
  id: 'schulte', group: 'Pole widzenia', icon: '▦', name: 'Tablica Schulte’a',
  short: 'Znajdź liczby po kolei, patrząc w środek',
  how: 'Patrz w środek tablicy (kropka). Nie przesuwaj wzroku — wyszukuj kolejne liczby od 1 widzeniem peryferyjnym i stukaj w nie. Po ukończeniu tablicy od razu pojawia się następna. Zacznij od 3×3 lub 4×4, standardem jest 5×5.',
  score: 'Liczba liczb znalezionych w 1 minutę (osobny rekord dla każdego rozmiaru).',
  why: 'Ostro widzisz tylko mały obszar wokół punktu fiksacji. Tablica zmusza mózg do analizowania obrazu poza nim. Szersze „pole użyteczne” oznacza mniej fiksacji na linijkę, a więc szybsze czytanie.',
  run(body, signal) {
    let size = Store.pref('schulteSize', 5);
    if (!Store.pref('schulteDotRestored', false)) { Store.setPref('schulteDot', true); Store.setPref('schulteDotRestored', true); }
    let dot = Store.pref('schulteDot', true);
    // Zaznaczanie znalezionych liczb jest zawsze domyślnie włączone (wybór obowiązuje tylko do wyjścia z ćwiczenia).
    let mark = true;
    const setup = () => body.replaceChildren(
      h('p', { class: 'label' }, 'Rozmiar tablicy'),
      chips([[3, '3×3'], [4, '4×4'], [5, '5×5'], [6, '6×6'], [7, '7×7']], size, (v) => { size = v; Store.setPref('schulteSize', v); }),
      h('p', { class: 'label' }, 'Opcje'),
      chips([[true, 'Kropka w środku'], [false, 'Bez kropki']], dot, (v) => { dot = v; Store.setPref('schulteDot', v); }),
      chips([[false, 'Nie zaznaczaj'], [true, 'Zaznaczaj znalezione']], mark, (v) => { mark = v; }),
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
            ...shuffle(Array.from({ length: n }, (_, i) => i + 1)).map((v, idx) => h('button', {
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
  how: 'Patrz wyłącznie na krzyżyk w środku koła. Na ułamek sekundy w środku pojawi się cyfra, a gdzieś na okręgu litera. Potem w środku koła zobaczysz pytanie: „litera” albo „cyfra” — wybierz, co widziałeś. Czasem pytanie dotyczy cyfry ze środka — to pilnuje, żebyś nie uciekał wzrokiem. 3 trafienia z rzędu = poziom w górę (większy promień, krótszy czas, a od poziomu 6 i 11 dodatkowa litera na obwodzie), błąd = poziom w dół. Gdy liter jest kilka, wybierz którąkolwiek z nich.',
  score: 'Liczba trafień w 1 minutę. Poziom zapamiętuje się — kolejna sesja startuje od miejsca, w którym skończyłeś.',
  why: 'Ćwiczy widzenie peryferyjne we wszystkich kierunkach naraz (stąd „sferyczne”). Bardzo krótki czas ekspozycji (poniżej ok. 200 ms — tyle trwa zaplanowanie i wykonanie ruchu oka) wyklucza przesunięcie wzroku — rozpoznajesz znak wyłącznie peryferyjnie.',
  run(body, signal) {
    const MAX = 14; const LETTERS = 'ABCDEFHKLMNPRSTUWZ';
    let items = Store.pref('sferaItems', 1);
    // Trudność rośnie też liczbą liter na obwodzie: +1 litera od poziomu 6 i od poziomu 11 (najwyżej 5).
    const lettersAt = (L) => Math.min(5, items + Math.floor((L - 1) / 5));
    const lettersTxt = (n) => `${n} ${n === 1 ? 'litera' : n < 5 ? 'litery' : 'liter'}`;
    const setup = () => body.replaceChildren(
      h('p', { class: 'label' }, 'Liczba liter na obwodzie (na start)'),
      chips([[1, '1 litera'], [2, '2 litery'], [3, '3 litery']], items, (v) => { items = v; Store.setPref('sferaItems', v); setup(); }),
      levelInfo(`sfera-${items}`, MAX, setup, (L) => `${lettersTxt(lettersAt(L))} · promień ${Math.round(Math.min(0.92, 0.18 + L * 0.056) * 100)}% pola · znak widoczny ${Math.max(70, 200 - L * 10)} ms`),
      startBtn(go), lastResult(`sfera-${items}`));
    const go = () => session(body, signal, {
      id: `sfera-${items}`, name: `Widzenie sferyczne · ${items} ${items === 1 ? 'litera' : 'litery'}`, unit: 'trafień', onSetup: setup,
      level: { key: `sfera-${items}`, max: MAX },
      async start(stage, api) {
        // Opis poziomu w rogach nad kołem (bez dodatkowej wysokości) — koło może zająć całą szerokość ekranu.
        const status = h('div', { class: 'status sfera-status' });
        const cross = h('div', { class: 'cross' }, '+');
        const field = h('div', { class: 'field' }, cross);
        const answers = h('div', { class: 'answers sfera-answers' });
        stage.replaceChildren(h('div', { class: 'field-wrap' }, status, field), answers);
        while (api.alive) {
          const radius = Math.min(0.92, 0.18 + api.level * 0.056);
          const exposure = Math.max(70, 200 - api.level * 10);
          const count = lettersAt(api.level);
          status.replaceChildren(h('span', { class: 'muted' }, `${lettersTxt(count)} · promień ${Math.round(radius * 100)}%`), h('span', { class: 'muted' }, `${exposure} ms`));
          answers.replaceChildren();
          await api.sleep(450);
          const center = String(rand(1, 9));
          const letters = shuffle([...LETTERS]).slice(0, count);
          const a0 = Math.random() * Math.PI * 2;
          const nodes = letters.map((l, i) => {
            const a = a0 + (i * Math.PI * 2) / count;
            return h('div', { class: 'blip', style: `left:${50 + Math.cos(a) * radius * 50}%;top:${50 + Math.sin(a) * radius * 50}%` }, l);
          });
          const c = h('div', { class: 'blip center' }, center);
          field.append(c, ...nodes);
          await api.sleep(exposure);
          [c, ...nodes].forEach((n) => n.remove());

          const askCenter = Math.random() < 0.25;
          // Po błysku w środku koła (zamiast krzyżyka) pytanie: „litera” albo „cyfra” — do czasu odpowiedzi.
          const label = askCenter ? 'cyfra' : 'litera';
          cross.textContent = label; cross.classList.add('ask');
          const correct = askCenter ? center : pick(letters);
          const pool = askCenter ? '123456789' : LETTERS;
          const opts = shuffle([correct, ...shuffle([...pool].filter((x) => !letters.includes(x) && x !== center)).slice(0, 5)]);
          const chosen = await new Promise((res) => answers.replaceChildren(
            h('div', { class: 'grid6' }, ...opts.map((o) => h('button', { class: 'btn', onclick: () => res(o) }, o)))));
          cross.textContent = '+'; cross.classList.remove('ask');
          if (!api.alive) return;
          const good = askCenter ? chosen === center : letters.includes(chosen);
          api.answer(good); flash(field, good);
        }
      },
    });
    setup();
  },
});

/* ---------- 2b. Macierz liter (widzenie sferyczne, wzorowane na ReaderPro) ---------- */
ex({
  id: 'macierz', group: 'Pole widzenia', icon: '⁙', name: 'Macierz liter',
  short: 'Wszystkie litery takie same czy jedna inna?',
  how: 'Patrz w czerwoną kropkę w środku. Na chwilę pojawia się macierz liter (część pól jest pusta): albo wszystkie litery są takie same, albo dokładnie jedna się różni. Oceń jak najszybciej: „Takie same” albo „Różne”. Kolejne zestawy pojawiają się w stałym rytmie — nie czekają na Twoją odpowiedź. Odpowiedź dotyczy ostatnio pokazanego zestawu; zestaw bez odpowiedzi liczy się jako błąd. 3 trafienia z rzędu = poziom w górę (większa macierz, krótszy czas, szybszy rytm, podobniejsze litery).',
  score: 'Liczba trafnie ocenionych zestawów w 1 minutę. W podsumowaniu: każdy zestaw porównany z Twoją oceną (trafna / błędna / bez odpowiedzi).',
  why: 'Odmienna litera może pojawić się w dowolnym miejscu macierzy, także na jej brzegu — żeby ją wykryć bez ruchu oczu, musisz analizować całe pole widzenia naraz. Stały rytm wymusza szybką decyzję, tak jak przy czytaniu, gdzie tekst nie czeka.',
  run(body, signal) {
    const MAX = 13;
    const LETTERS = 'ABCDEFGHKLMNPRSTUWXZ';
    const SIMILAR = [['E', 'F'], ['O', 'Q'], ['P', 'R'], ['C', 'G'], ['M', 'N'], ['U', 'V'], ['B', 'R'], ['K', 'X'], ['I', 'L'], ['D', 'O'], ['H', 'N'], ['W', 'V']];
    const params = (L) => ({
      size: Math.min(7, 3 + Math.floor((L - 1) / 3)),
      exposure: Math.max(150, 700 - L * 40),
      window: Math.max(800, 1900 - L * 80),
      similar: L >= 4,
    });
    const setup = () => body.replaceChildren(levelInfo('macierz', MAX, setup, (L) => { const q = params(L); return `macierz ${q.size}×${q.size} · widoczna ${q.exposure} ms · nowy zestaw co ${((q.exposure + q.window) / 1000).toFixed(1).replace('.', ',')} s${q.similar ? ' · podobne litery' : ''}`; }), startBtn(go), lastResult('macierz'));
    const go = () => session(body, signal, {
      id: 'macierz', name: 'Macierz liter', unit: 'trafień', onSetup: setup,
      level: { key: 'macierz', max: MAX },
      lines: (x) => {
        const log = x.log || '';
        const ok = (log.match(/✓/g) || []).length; const bad = (log.match(/✗/g) || []).length; const miss = (log.match(/–/g) || []).length;
        return [`Zestawy: ${log.length} · trafne ${ok} · błędne ${bad} · bez odpowiedzi ${miss}`,
          log ? `Przebieg: ${log.slice(-48)}` : '',
          x.missed ? `Przeoczone różnice: ${x.missed} · fałszywe „Różne”: ${x.falseAlarms || 0}` : ''];
      },
      async start(stage, api) {
        Object.assign(api.extra, { log: '', missed: 0, falseAlarms: 0 });
        let current = null;
        const status = h('div', { class: 'status' });
        const grid = h('div', { class: 'matrix' });
        const field = h('div', { class: 'field sq' }, grid, h('div', { class: 'mfix' }));
        const judge = (same) => {
          const s = current;
          if (!api.alive || !s || s.answer != null) return;
          s.answer = same;
          const good = same === s.same;
          if (!good) { if (s.same) api.extra.falseAlarms++; else api.extra.missed++; }
          api.extra.log += good ? '✓' : '✗';
          api.answer(good); flash(field, good);
        };
        stage.replaceChildren(status, field, sameDiff(judge));
        while (api.alive) {
          const L = api.level; const p = params(L);
          status.replaceChildren(h('span', { class: 'muted' }, `${p.size}×${p.size}`), h('span', { class: 'muted' }, `${p.exposure} ms · co ${((p.exposure + p.window) / 1000).toFixed(1).replace('.', ',')} s`));
          let base; let odd;
          if (p.similar) { const pair = shuffle(pick(SIMILAR)); [base, odd] = pair; } else { base = pick([...LETTERS]); odd = pick([...LETTERS].filter((c) => c !== base)); }
          const n = p.size * p.size;
          const same = Math.random() < 0.5;
          // Część pól zostaje pusta (ok. 40–50%); co najmniej 2 litery na brzegu macierzy — wymusza widzenie peryferyjne.
          const filled = new Set(shuffle([...Array(n).keys()]).slice(0, Math.max(4, Math.round(n * (0.5 + Math.random() * 0.1)))));
          const edge = [...Array(n).keys()].filter((i) => { const r = Math.floor(i / p.size); const c = i % p.size; return r === 0 || c === 0 || r === p.size - 1 || c === p.size - 1; });
          for (const i of shuffle(edge)) { if (edge.filter((e) => filled.has(e)).length >= 2) break; filled.add(i); }
          const oddAt = same ? -1 : pick([...filled]);
          const set = { same, answer: null };
          current = set;
          grid.style.setProperty('--n', p.size);
          grid.replaceChildren(...Array.from({ length: n }, (_, i) => h('span', {}, !filled.has(i) ? '' : i === oddAt ? odd : base)));
          field.classList.add('showing');
          await api.sleep(p.exposure);
          grid.replaceChildren(); field.classList.remove('showing');
          await api.sleep(p.window);
          if (set.answer == null && api.alive) {
            set.answer = 'none';
            if (!set.same) api.extra.missed++;
            api.extra.log += '–';
            api.answer(false); flash(field, false);
          }
        }
      },
    });
    setup();
  },
});

/* ---------- 2c. Widzenie boczne ---------- */
ex({
  id: 'boczne', group: 'Pole widzenia', icon: '⌖', name: 'Widzenie boczne',
  short: 'Cztery żółte litery na brzegach — wszystkie takie same?',
  how: 'Patrz na kropkę w środku siatki. Cztery żółte pola leżą na brzegach: u góry, na dole, po lewej i po prawej. Gdy żółte litery NIE są wszystkie takie same — stuknij „Znaleziono różnicę”. Gdy są takie same — nie stukaj, poczekaj na kolejny zestaw. Zestawy zmieniają się same.',
  score: 'Liczba trafnych decyzji w 1 minutę: stuknięcie przy różnicy i wstrzymanie się, gdy litery są takie same. Fałszywe stuknięcie i przeoczona różnica to błędy.',
  why: 'Żółte pola są daleko od punktu fiksacji, więc rozpoznajesz je wyłącznie widzeniem peryferyjnym, a otaczające losowe litery utrudniają zadanie (tzw. zatłoczenie wzrokowe). Decyzja „stukam / czekam” uczy szybkiego, kontrolowanego reagowania na to, co widać kątem oka.',
  run(body, signal) {
    const MAX = 12;
    const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const SIMILAR = { E: 'F', F: 'E', O: 'Q', Q: 'O', P: 'R', R: 'P', C: 'G', G: 'C', M: 'N', N: 'M', U: 'V', V: 'U', I: 'L', L: 'I', D: 'O', H: 'N', K: 'X', B: 'R', W: 'V', T: 'I' };
    const params = (L) => ({ size: 5 + 2 * Math.floor((L - 1) / 4), show: Math.max(900, 2600 - (L - 1) * 150), similar: L >= 4 });
    const setup = () => body.replaceChildren(
      levelInfo('boczne', MAX, setup, (L) => { const q = params(L); return `siatka ${q.size}×${q.size} · zestaw co ${(q.show / 1000).toFixed(1).replace('.', ',')} s${q.similar ? ' · podobne litery' : ''}`; }),
      startBtn(go), lastResult('boczne'));
    const go = () => session(body, signal, {
      id: 'boczne', name: 'Widzenie boczne', unit: 'trafień', onSetup: setup,
      level: { key: 'boczne', max: MAX },
      lines: (x) => [x.missed || x.falseAlarms ? `Przeoczone różnice: ${x.missed || 0} · fałszywe stuknięcia: ${x.falseAlarms || 0}` : ''],
      async start(stage, api) {
        Object.assign(api.extra, { missed: 0, falseAlarms: 0 });
        let trial = null;
        const grid = h('div', { class: 'side-grid' });
        const btn = h('button', { class: 'btn big wide side-btn', onpointerdown: (e) => {
          e.preventDefault();
          if (!api.alive || !trial || trial.done) return;
          trial.done = true;
          const good = !trial.same;
          if (!good) api.extra.falseAlarms++;
          api.answer(good); flash(btn, good);
          trial.resolve();
        } }, 'Znaleziono różnicę');
        stage.replaceChildren(h('div', { class: 'side-wrap' }, grid), h('p', { class: 'muted small center-text' }, 'Stuknij, gdy żółte litery nie są wszystkie takie same.'), btn);
        while (api.alive) {
          const L = api.level; const p = params(L); const n = p.size; const mid = (n - 1) / 2;
          const base = pick([...ABC]); const same = Math.random() < 0.5;
          const odd = p.similar && SIMILAR[base] ? SIMILAR[base] : pick([...ABC].filter((c) => c !== base));
          const spots = [mid, mid * n, mid * n + n - 1, (n - 1) * n + mid]; // góra, lewo, prawo, dół
          const oddSpot = same ? -1 : pick(spots);
          grid.style.setProperty('--n', n);
          grid.replaceChildren(...Array.from({ length: n * n }, (_, i) => {
            if (i === mid * n + mid) return h('span', { class: 'side-dot' }, '•');
            if (spots.includes(i)) return h('span', { class: 'side-spot' }, i === oddSpot ? odd : base);
            return h('span', {}, pick([...ABC].filter((c) => c !== base && c !== odd)));
          }));
          let resolve; const tapped = new Promise((r) => { resolve = r; });
          trial = { same, done: false, resolve };
          await Promise.race([api.sleep(p.show), tapped]);
          if (!api.alive) return;
          if (!trial.done) { // brak stuknięcia: dobrze, jeśli litery były takie same
            trial.done = true;
            if (!same) api.extra.missed++;
            api.answer(same);
            if (!same) flash(btn, false);
          }
          await api.sleep(250);
        }
      },
    });
    setup();
  },
});

/* ---------- 3b. Niepasujące pary (siatka par słów) ---------- */
ex({
  id: 'niepary', group: 'Uwaga i pamięć', icon: '⧉', name: 'Niepasujące pary',
  short: 'Stukaj kafelki, w których dwa słowa się różnią',
  how: 'Każdy kafelek zawiera dwa słowa jedno pod drugim. Większość par jest identyczna, ale kilka różni się jedną literą albo kolejnością liter. Stukaj tylko kafelki z różniącymi się słowami. Gdy znajdziesz wszystkie na planszy, pojawi się nowa. Stuknięcie pasującej pary to błąd.',
  score: 'Liczba znalezionych niepasujących par w 1 minutę. Poziom zapamiętuje się — wyższy to więcej kafelków, więcej różnic i dłuższe słowa.',
  why: 'Szybkie porównywanie całych słów uczy rozpoznawać wyraz jednym spojrzeniem, a jednocześnie wymusza dokładność: mózg ma tendencję do „domykania” słowa po kształcie i przeoczenia drobnej różnicy — tak powstają błędy przy szybkim czytaniu umów czy liczb.',
  run(body, signal) {
    const MAX = 12;
    const params = (L) => {
      const rows = 3 + Math.floor((L - 1) / 4);
      const cells = rows * 3;
      return { rows, cells, odd: Math.min(Math.floor(cells / 3), 2 + Math.floor(L / 4)), minLen: Math.min(7, 3 + Math.floor(L / 3)) };
    };
    const setup = () => body.replaceChildren(
      levelInfo('niepary', MAX, setup, (L) => { const q = params(L); return `${q.cells} kafelków (3×${q.rows}) · ${q.odd} różnice · słowa od ${q.minLen} liter`; }),
      startBtn(go), lastResult('niepary'));
    const go = () => session(body, signal, {
      id: 'niepary', name: 'Niepasujące pary', unit: 'par', onSetup: setup,
      level: { key: 'niepary', max: MAX },
      lines: (x) => [`Ukończone plansze: ${x.boards || 0}`, x.wrong ? `Stuknięte pasujące pary: ${x.wrong}` : ''],
      start(stage, api) {
        Object.assign(api.extra, { boards: 0, wrong: 0 });
        const found = h('b', {}, '0'); const left = h('b', {});
        const head = h('div', { class: 'np-head' }, h('span', {}, h('small', {}, 'Znaleziono'), found), h('span', {}, h('small', {}, 'Pozostało'), left));
        const grid = h('div', { class: 'np-grid' });
        stage.replaceChildren(head, grid, h('p', { class: 'muted small center-text' }, 'Znajdź niepasujące pary'));
        let total = 0;
        const board = () => {
          const p = params(api.level);
          const pool = shuffle(WORDS.filter((w) => [...w].length >= p.minLen));
          const words = pool.slice(0, p.cells);
          const oddIdx = new Set(shuffle([...words.keys()]).slice(0, p.odd));
          let remaining = p.odd; left.textContent = remaining;
          grid.replaceChildren(...words.map((w, i) => {
            const odd = oddIdx.has(i); const b2 = odd ? mutate(w) : w;
            return h('button', { class: 'np-tile', onpointerdown: (e) => {
              e.preventDefault();
              const el = e.currentTarget;
              if (!api.alive || el.classList.contains('found')) return;
              if (odd) {
                el.classList.add('found'); total++; found.textContent = total; remaining--; left.textContent = remaining;
                api.answer(true);
                if (!remaining) { api.extra.boards++; setTimeout(() => api.alive && board(), 350); }
              } else { api.extra.wrong++; api.answer(false); shake(el); }
            } }, h('span', {}, w), h('span', {}, b2));
          }));
        };
        board();
      },
    });
    setup();
  },
});

/* ---------- 3. Pary słów (dawniej „Linia wzroku”; id 'linia' zachowane dla wyników) ---------- */
ex({
  id: 'linia', group: 'Pole widzenia', icon: '⇹', name: 'Pary słów',
  short: 'Porównaj słowa po obu stronach osi',
  how: 'Patrz na czerwoną pionową linię. Po obu stronach błysną dwa słowa. Oceń, czy są identyczne. 3 trafienia z rzędu = poziom w górę (słowa dalej od środka, dłuższe i krócej widoczne), błąd = poziom w dół.',
  score: 'Liczba trafnych odpowiedzi w 1 minutę. Poziom zapamiętuje się między sesjami.',
  why: 'Poszerza poziome pole widzenia — dokładnie ten kierunek, który wykorzystujesz w linijce tekstu. Jeśli widzisz peryferyjnie początek i koniec krótkiej linii, możesz ją objąć jedną–dwiema fiksacjami.',
  run(body, signal) {
    const MAX = 12;
    const setup = () => body.replaceChildren(levelInfo('linia', MAX, setup, (L) => `odległość od osi ${Math.round(Math.min(44, 9 + L * 3.2))}% · słowa widoczne ${Math.max(100, 380 - L * 25)} ms`), startBtn(go), lastResult('linia'));
    const go = () => session(body, signal, {
      id: 'linia', name: 'Pary słów', unit: 'trafień', onSetup: setup,
      level: { key: 'linia', max: MAX },
      async start(stage, api) {
        const status = h('div', { class: 'status' });
        const field = h('div', { class: 'field wide' }, h('div', { class: 'axis' }));
        const answers = h('div', { class: 'answers' });
        stage.replaceChildren(status, field, answers);
        while (api.alive) {
          const dist = Math.min(44, 9 + api.level * 3.2);
          const exposure = Math.max(100, 380 - api.level * 25);
          status.replaceChildren(h('span', { class: 'muted' }, `odległość ${Math.round(dist)}%`), h('span', { class: 'muted' }, `${exposure} ms`));
          answers.replaceChildren();
          await api.sleep(400);
          const pool = WORDS.filter((w) => [...w].length <= 4 + Math.ceil(api.level / 3));
          const a = pick(pool); const same = Math.random() < 0.5; const b = same ? a : mutate(a);
          const L = h('div', { class: 'word-l', style: `right:${50 + dist}%` }, a);
          const R = h('div', { class: 'word-r', style: `left:${50 + dist}%` }, b);
          field.append(L, R);
          await api.sleep(exposure);
          L.remove(); R.remove();
          const ans = await new Promise((res) => answers.replaceChildren(sameDiff(res)));
          if (!api.alive) return;
          const good = ans === same;
          api.answer(good); flash(field, good);
          if (!good) {
            // Poprawna odpowiedź pokazana tak jak w ćwiczeniu, ale w ustawieniu poziomu 1 (blisko osi, dłużej).
            const d1 = Math.min(44, 9 + 1 * 3.2);
            const mark = (w, other) => [...w].map((ch, i) => (ch !== [...other][i] ? h('u', { class: 'diff' }, ch) : ch));
            const L1 = h('div', { class: 'word-l reveal', style: `right:${50 + d1}%` }, ...mark(a, b));
            const R1 = h('div', { class: 'word-r reveal', style: `left:${50 + d1}%` }, ...mark(b, a));
            field.append(L1, R1);
            answers.replaceChildren(h('p', { class: 'reveal-note center-text' }, same ? 'Były takie same' : 'Były różne'));
            try { await api.sleep(1600); } finally { L1.remove(); R1.remove(); }
          }
        }
      },
    });
    setup();
  },
});

/* ---------- 4. Czytanie w miejscu (RSVP) ---------- */
ex({
  id: 'rsvp', group: 'Tempo', icon: '▶', name: 'Czytanie w miejscu',
  short: 'Czytaj słowo po słowie, tempo rośnie w trakcie',
  how: 'Patrz na czerwoną literę — słowa zmieniają się w tym samym miejscu. Ustaw tempo startowe, przy którym rozumiesz tekst. W trakcie sesji tempo rośnie automatycznie co 10 s (możesz też poprawić je ręcznie przyciskami − / +). Możesz wkleić własny tekst, np. artykuł.',
  score: 'Liczba słów przeczytanych w 1 minutę. Dodatkowo: tempo końcowe, do którego doszedłeś.',
  why: 'Słowa podawane w jednym punkcie eliminują sakkady i regresje (powroty wzroku), a stopniowe przyspieszanie przesuwa granicę komfortowego tempa. Sprawdzaj zrozumienie testem czytania, bo przy zbyt wysokim tempie ono spada.',
  run(body, signal) {
    let wpmVal = Store.pref('rsvpWpm', 300);
    let size = Store.pref('rsvpChunk', 1);
    let textId = Store.pref('rsvpText', TEXTS[0].id);
    let ramp = Store.pref('rsvpRamp', 25);
    const RAMP_EVERY = 10;
    const area = h('textarea', { class: 'custom', placeholder: 'Wklej tutaj własny tekst…', rows: 5 });
    area.value = Store.pref('rsvpCustom', '');
    area.addEventListener('input', () => Store.setPref('rsvpCustom', area.value));
    const hasIp = () => !!Infopigula.url();
    if (textId === 'infopigula' && !hasIp()) textId = TEXTS[0].id;
    const getText = () => (textId === 'custom' ? area.value : TEXTS.find((t) => t.id === textId)?.body || '');
    const ipInfo = h('p', { class: 'muted small ip-info' });
    const showIpInfo = () => {
      ipInfo.hidden = textId !== 'infopigula';
      if (ipInfo.hidden) return;
      const c = Infopigula.cached(); const pos = Store.pref('ipPos', {});
      ipInfo.textContent = c ? `Wydanie ${c.issue} · ${c.count} wiadomości · ${tokenize(c.text).length} słów` + (pos.id === c.id && pos.w ? ` · wznowisz od słowa ${pos.w}` : '') : 'Najnowsze wydanie pobierze się przy starcie.';
    };
    const setup = () => {
      const wpmLabel = h('b', {}, wpmVal);
      area.hidden = textId !== 'custom';
      body.replaceChildren(
        h('p', { class: 'label' }, 'Tekst'),
        chips([...(hasIp() ? [['infopigula', '📰 Infopiguła (dziś)']] : []), ...TEXTS.map((t) => [t.id, t.title]), ['custom', 'Własny tekst']], textId, (v) => { textId = v; area.hidden = v !== 'custom'; Store.setPref('rsvpText', v); showIpInfo(); }),
        ipInfo,
        hasIp() ? null : h('p', { class: 'muted small' }, 'Codzienną Infopigułę z Gmaila podłączysz w Ustawieniach (koło zębate na ekranie głównym).'),
        area,
        h('p', { class: 'label' }, 'Tempo startowe: ', wpmLabel, ' słów/min'),
        h('input', { type: 'range', min: 100, max: 1000, step: 25, value: wpmVal, oninput: (e) => { wpmVal = +e.target.value; wpmLabel.textContent = wpmVal; Store.setPref('rsvpWpm', wpmVal); } }),
        h('p', { class: 'label' }, `Przyspieszanie co ${RAMP_EVERY} s`),
        chips([[0, 'Wył.'], [10, '+10'], [25, '+25'], [50, '+50']], ramp, (v) => { ramp = v; Store.setPref('rsvpRamp', v); }),
        h('p', { class: 'label' }, 'Słów naraz'),
        chips([[1, '1'], [2, '2'], [3, '3']], size, (v) => { size = v; Store.setPref('rsvpChunk', v); }),
        startBtn(go), lastResult('rsvp'));
      showIpInfo();
    };
    const go = async () => {
      let words; let ip = null; let startW = 0;
      if (textId === 'infopigula') {
        try { ip = await Infopigula.latest(); } catch (e) { alert(`Infopiguła: ${e.message}`); return; }
        words = tokenize(ip.text);
        const pos = Store.pref('ipPos', {});
        // Wydanie jest dłuższe niż minuta czytania — kolejna sesja wznawia od miejsca, w którym skończyłeś.
        startW = pos.id === ip.id && pos.w < words.length - 5 ? pos.w : 0;
        words = words.slice(startW);
      } else words = tokenize(getText());
      if (words.length < 5) { alert('Tekst jest za krótki.'); return; }
      session(body, signal, {
        id: 'rsvp', name: 'Czytanie w miejscu', unit: 'słów', onSetup: setup,
        lines: (x) => [
          ip ? (x.textDone ? `Infopiguła ${ip.issue} przeczytana do końca ✓` : `Infopiguła ${ip.issue}: przeczytano do słowa ${startW + (x.shown || 0)} z ${startW + words.length} — następna sesja wznowi od tego miejsca`) : '',
          !ip && x.textDone ? `Tekst przeczytany w całości w ${Math.round(x.seconds)} s → średnio ${Math.round((words.length / Math.max(1, x.seconds)) * 60)} sł/min` : '',
          `Tempo: ${x.wpmStart} → ${x.wpm} sł/min`],
        start(stage, api) {
          let cur = wpmVal;
          Object.assign(api.extra, { wpm: cur, wpmStart: cur });
          const parts = chunk(words, size); let i = 0; let timer = null;
          const display = h('div', { class: 'rsvp' });
          const bar = h('div', { class: 'progress' }, h('div'));
          const speed = h('b', {}, cur);
          const next = h('small', {}, '');
          let ramps = 0;
          const manual = (v) => { setWpm(v); wpmVal = Math.max(100, cur - ramps * ramp); Store.setPref('rsvpWpm', wpmVal); };
          const setWpm = (v) => { cur = Math.min(1000, Math.max(100, v)); speed.textContent = cur; api.extra.wpm = cur; speed.classList.remove('bump'); void speed.offsetWidth; speed.classList.add('bump'); };
          stage.replaceChildren(display, bar, h('div', { class: 'row tempo' },
            h('button', { class: 'btn', onclick: () => manual(cur - 25) }, '− 25'),
            h('span', { class: 'center-text' }, speed, h('small', {}, 'sł/min'), next),
            h('button', { class: 'btn', onclick: () => manual(cur + 25) }, '+ 25')));
          const step = () => {
            if (!api.alive) return;
            if (api.paused) { timer = setTimeout(step, 100); return; }
            const el = api.elapsed();
            if (ramp && Math.floor(el / RAMP_EVERY) > ramps) { ramps = Math.floor(el / RAMP_EVERY); setWpm(cur + ramp); }
            next.textContent = ramp ? `+${ramp} za ${Math.ceil(RAMP_EVERY - (el % RAMP_EVERY))} s` : '';
            // Koniec tekstu = koniec ćwiczenia (bez zapętlania).
            if (i >= parts.length) { api.extra.textDone = true; if (ip) Store.setPref('ipPos', { id: ip.id, w: 0 }); api.end(); return; }
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
            api.extra.shown = (api.extra.shown || 0) + frag.split(' ').length;
            if (ip) Store.setPref('ipPos', { id: ip.id, w: startW + api.extra.shown });
            timer = setTimeout(step, delayFor(frag, cur));
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
  how: 'Trzymaj głowę nieruchomo i śledź punkt samymi oczami. Wybierz wzór, tempo startowe i przyspieszanie — punkt skacze coraz szybciej co 10 s. To dobra rozgrzewka przed pozostałymi ćwiczeniami.',
  score: 'Liczba skoków wykonanych w 1 minutę — rośnie, gdy zwiększasz tempo.',
  why: 'Czytanie to seria precyzyjnych skoków oczu (sakkad). Ćwiczenie uczy szybkiego, celnego przenoszenia wzroku i skraca czas „lądowania” na kolejnej fiksacji — szczególnie przy przejściu na początek następnej linijki.',
  run(body, signal) {
    let mode = Store.pref('eyeMode', 'h'); let bpm = Store.pref('eyeBpm', 90);
    // Przyspieszanie: o ile skoków/min rośnie tempo co RAMP_EVERY sekund (0 = stałe tempo).
    let ramp = Store.pref('eyeRamp', 10); const RAMP_EVERY = 10; const MAX_BPM = 240;
    const setup = () => {
      const lbl = h('b', {}, bpm);
      body.replaceChildren(
        h('p', { class: 'label' }, 'Wzór'),
        chips([['h', 'Poziomo'], ['v', 'Pionowo'], ['d', 'Przekątne'], ['z', 'Linijki (Z)'], ['r', 'Losowo']], mode, (v) => { mode = v; Store.setPref('eyeMode', v); }),
        h('p', { class: 'label' }, 'Tempo na start: ', lbl, ' skoków/min'),
        h('input', { type: 'range', min: 40, max: 240, step: 10, value: bpm, oninput: (e) => { bpm = +e.target.value; lbl.textContent = bpm; Store.setPref('eyeBpm', bpm); } }),
        h('p', { class: 'label' }, 'Przyspieszanie'),
        chips([['0', 'Stałe tempo'], ['10', '+10 co 10 s'], ['20', '+20 co 10 s']], String(ramp), (v) => { ramp = +v; Store.setPref('eyeRamp', ramp); }),
        startBtn(go), lastResult('oczy'));
    };
    const go = () => session(body, signal, {
      id: 'oczy', name: 'Ruch oczu', unit: 'skoków', onSetup: setup,
      lines: (x) => [x.bpmStart !== x.bpm ? `Tempo: ${x.bpmStart} → ${x.bpm} skoków/min` : `Tempo: ${x.bpm} skoków/min`],
      start(stage, api) {
        Object.assign(api.extra, { bpm, bpmStart: bpm });
        // Tempo bieżące = tempo bazowe (−/+ w trakcie) + przyrost za każde pełne RAMP_EVERY s ćwiczenia.
        const curBpm = () => Math.min(MAX_BPM, bpm + ramp * Math.floor(api.elapsed() / RAMP_EVERY));
        // Pełny ekran w poziomie. Safari na iOS nie pozwala zablokować orientacji, więc przy telefonie
        // trzymanym pionowo cała plansza jest obrócona o 90° — wystarczy obrócić iPhone'a.
        try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* iOS: brak obsługi */ }
        const dot = h('div', { class: 'dot' });
        const time = h('b', { class: 'mono time' }); const score = h('span', { class: 'muted' });
        const speedEl = h('span', { class: 'eye-bpm' }, h('b', { class: 'mono' }, bpm), h('small', {}, 'skoków/min'));
        let to = null; let shown = 0;
        const showBpm = () => {
          const v = curBpm(); if (v === shown) return;
          if (shown) { speedEl.classList.remove('up'); void speedEl.offsetWidth; speedEl.classList.add('up'); }
          shown = v; speedEl.firstChild.textContent = v; api.extra.bpm = v;
        };
        // Następny skok planowany po każdym poprzednim — odstęp wynika z bieżącego tempa.
        const schedule = () => { clearTimeout(to); to = setTimeout(() => { tick(); schedule(); }, 60000 / curBpm()); };
        // Zmiana tempa w trakcie: od razu działa; tempo bazowe zapisuje się jako tempo startowe następnej sesji.
        const setBpm = (v) => {
          bpm = Math.min(MAX_BPM, Math.max(40, v)); Store.setPref('eyeBpm', bpm);
          showBpm(); schedule();
        };
        const full = h('div', { class: 'eye-full' },
          h('div', { class: 'eye-field' }, dot),
          h('div', { class: 'eye-hud' },
            h('span', { class: 'eye-btns' },
              h('button', { class: 'btn ctl', onclick: () => api.pause() }, '⏸ Pauza'), score),
            h('span', { class: 'eye-speed' },
              h('button', { class: 'btn ctl', 'aria-label': 'Wolniej', onclick: () => setBpm(bpm - 10) }, '−'),
              speedEl,
              h('button', { class: 'btn ctl', 'aria-label': 'Szybciej', onclick: () => setBpm(bpm + 10) }, '+')),
            time),
          h('div', { class: 'eye-hint' }, '↻ Obróć iPhone\'a poziomo'));
        document.body.append(full);
        document.documentElement.classList.add('eye-mode');
        const hud = setInterval(() => {
          const left = Math.max(0, Math.ceil(DURATION - api.elapsed()));
          time.textContent = `${left} s`; time.classList.toggle('warn', left <= 10);
          showBpm();
          score.textContent = `skoków: ${Math.max(0, k - 1)}`;
        }, 200);
        api.signal.addEventListener('abort', () => {
          clearInterval(hud); full.remove(); document.documentElement.classList.remove('eye-mode');
          try { screen.orientation?.unlock?.(); } catch { /* brak */ }
        });
        stage.replaceChildren(h('p', { class: 'muted center-text' }, 'Ćwiczenie trwa na pełnym ekranie.'));
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
          if (!api.alive || api.paused) return;
          const [x, y] = pos(); dot.style.left = x + '%'; dot.style.top = y + '%'; k++;
          if (k > 1) api.add();
        };
        showBpm(); tick(); schedule();
        api.signal.addEventListener('abort', () => clearTimeout(to));
      },
    });
    setup();
  },
});

/* ---------- 6. Szukanie liter ---------- */
ex({
  id: 'litery', group: 'Uwaga i pamięć', icon: 'Aa', name: 'Szukanie liter',
  short: 'Znajdź wszystkie wskazane litery wśród podobnych',
  how: 'Znajdź i stuknij wszystkie wystąpienia litery docelowej. Litery wokół są do niej celowo podobne (b/d/p/q). Po znalezieniu wszystkich pojawia się nowa plansza. 3 trafienia z rzędu = poziom w górę (większa plansza), pomyłka = poziom w dół. Zmiana rozmiaru następuje od kolejnej planszy.',
  score: 'Liczba znalezionych liter w 1 minutę. Poziom zapamiętuje się między sesjami.',
  why: 'Uczy szybkiego rozróżniania kształtów liter i utrzymania koncentracji podczas skanowania. To ta sama praca wzrokowa, którą wykonujesz przy rozpoznawaniu słów — tylko wyizolowana.',
  run(body, signal) {
    const MAX = 8;
    const setup = () => body.replaceChildren(levelInfo('litery', MAX, setup, (L) => `plansza 8×${3 + L} liter`), startBtn(go), lastResult('litery'));
    const go = () => session(body, signal, {
      id: 'litery', name: 'Szukanie liter', unit: 'liter', onSetup: setup,
      level: { key: 'litery', max: MAX },
      lines: (x) => [`Ukończone plansze: ${x.boards}`],
      start(stage, api) {
        api.extra.boards = 0;
        const board = () => {
          const rows = 3 + api.level; const n = rows * 8;
          const { target, cells } = letterGrid(n, Math.max(4, Math.round(n / 9)));
          const total = cells.filter((c) => c === target).length; let found = 0;
          const status = h('div', { class: 'status' });
          const upd = () => status.replaceChildren(h('span', {}, 'Szukaj: ', h('b', { class: 'target' }, target)), h('span', { class: 'muted' }, `${found}/${total} · 8×${rows}`));
          const grid = h('div', { class: 'letters' }, ...cells.map((c) => h('button', {
            class: 'cell small', onpointerdown: (e) => {
              const el = e.currentTarget; if (!api.alive || el.classList.contains('found')) return;
              if (c === target) {
                el.classList.add('found'); found++; api.answer(true); upd();
                if (found === total) { api.extra.boards++; setTimeout(() => api.alive && board(), 200); }
              } else { api.answer(false); shake(el); }
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
  how: 'Na górze widzisz liczbę. Znajdź ją w siatce wśród liczb różniących się jedną cyfrą lub kolejnością. 3 trafienia z rzędu = poziom w górę (liczby dłuższe o cyfrę), pomyłka = poziom w dół.',
  score: 'Liczba znalezionych liczb w 1 minutę. Poziom zapamiętuje się między sesjami.',
  why: 'Trenuje precyzyjne postrzeganie całych ciągów znaków jednym spojrzeniem, zamiast znak po znaku. Przydatne wprost przy czytaniu tabel, faktur i raportów.',
  run(body, signal) {
    const MAX = 6;
    const setup = () => body.replaceChildren(levelInfo('liczby', MAX, setup, (L) => `liczby ${3 + L}-cyfrowe`), startBtn(go), lastResult('liczby'));
    const go = () => session(body, signal, {
      id: 'liczby', name: 'Szukanie liczb', unit: 'liczb', onSetup: setup,
      level: { key: 'liczby', max: MAX },
      start(stage, api) {
        const round = () => {
          const digits = 3 + api.level;
          const { target, cells } = numberRound(digits, 20);
          stage.replaceChildren(
            h('div', { class: 'status' }, h('span', {}, 'Znajdź: ', h('b', { class: 'target mono' }, target)), h('span', { class: 'muted' }, `${digits} cyfr`)),
            h('div', { class: 'numbers' + (digits > 6 ? ' n3' : '') }, ...cells.map((c) => h('button', {
              class: 'cell mono', onpointerdown: (e) => {
                if (!api.alive) return;
                if (c === target) { api.answer(true); round(); } else { api.answer(false); shake(e.currentTarget); }
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
  how: 'Liczba pojawi się na ułamek sekundy. Wpisz ją z pamięci. Poziom = długość liczby (poziom 1 = 3 cyfry). 3 poprawne z rzędu = poziom w górę, błąd = poziom w dół.',
  score: 'Liczba poprawnie zapamiętanych liczb w 1 minutę. Poziom zapamiętuje się między sesjami.',
  why: 'Ćwiczy „chwytanie” całej grupy znaków w jednej fiksacji i utrzymanie jej w pamięci roboczej. Przy czytaniu pozwala to obejmować wzrokiem kilka słów naraz zamiast jednego.',
  run(body, signal) {
    const MAX = 10;
    const setup = () => body.replaceChildren(levelInfo('pamiec', MAX, setup, (L) => `liczba ${L + 2}-cyfrowa`), startBtn(go), lastResult('pamiec'));
    const go = () => session(body, signal, {
      id: 'pamiec', name: 'Zapamiętaj liczbę', unit: 'liczb', onSetup: setup,
      level: { key: 'pamiec', max: MAX },
      async start(stage, api) {
        // Klawiatura stoi na ekranie cały czas (układ się nie przesuwa), a wpisywana liczba
        // pojawia się w tym samym polu, w którym była pokazana.
        const status = h('div', { class: 'status' }); const show = h('div', { class: 'flash' });
        let onKey = null;
        const keypad = h('div', { class: 'keypad' },
          ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k) => h('button', {
            class: 'btn' + (k === 'OK' ? ' primary' : ''), onpointerdown: (e) => { e.preventDefault(); onKey?.(k); },
          }, k)));
        const lock = (on) => keypad.classList.toggle('locked', on);
        stage.replaceChildren(status, show, keypad);
        while (api.alive) {
          const len = api.level + 2;
          status.replaceChildren(h('span', { class: 'muted' }, `${len} cyfr`));
          lock(true); show.classList.remove('typing');
          show.textContent = '+'; await api.sleep(600);
          let n = String(rand(1, 9));
          while (n.length < len) n += rand(0, 9);
          show.textContent = n.replace(/(\d{3})(?=\d)/g, '$1 ');
          await api.sleep(Math.min(1200, 300 + len * 70));
          show.textContent = '';
          show.classList.add('typing'); lock(false);
          const answer = await new Promise((res) => {
            let val = '';
            onKey = (k) => {
              if (k === 'OK') { onKey = null; res(val); return; }
              if (k === '⌫') val = val.slice(0, -1); else if (val.length < len + 2) val += k;
              show.textContent = val.replace(/(\d{3})(?=\d)/g, '$1 ');
            };
          });
          lock(true); show.classList.remove('typing');
          if (!api.alive) return;
          const good = answer === n;
          api.answer(good); flash(show, good);
          if (good) show.textContent = '✓'; else show.replaceChildren(h('span', { class: 'bad' }, n));
          await api.sleep(good ? 350 : 900);
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
          let read = spans.length; const sec = extra.seconds;
          if (reason !== 'end') {
            stage.querySelector('.sticky')?.remove();
            const art = stage.querySelector('.reading');
            art.classList.add('picking');
            stage.prepend(h('div', { class: 'banner' }, `${reason === 'time' ? 'Czas!' : 'Koniec.'} Stuknij słowo, na którym skończyłeś`));
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
    const sel = new Set(planPool());
    let n = Math.min(planCount(), Math.max(1, sel.size));
    const ordered = [EXERCISES.find((e) => e.id === FIRST_IN_PLAN), ...EXERCISES.filter((e) => e.id !== FIRST_IN_PLAN)];
    const list = h('div', { class: 'plan-edit' }, ...ordered.map((e) => {
      if (e.id === FIRST_IN_PLAN) {
        return h('div', { class: 'pick on locked' }, h('span', { class: 'box' }), h('span', { class: 'ico' }, e.icon), h('span', {}, e.name), h('small', { class: 'muted' }, 'zawsze pierwsze'));
      }
      const row = h('button', {
        class: 'pick' + (sel.has(e.id) ? ' on' : ''), onclick: () => {
          if (sel.has(e.id)) sel.delete(e.id); else sel.add(e.id);
          row.classList.toggle('on', sel.has(e.id));
          drawCount();
        },
      }, h('span', { class: 'box' }), h('span', { class: 'ico' }, e.icon), h('span', {}, e.name));
      return row;
    }));
    const countBox = h('div', {});
    const info = h('span', { class: 'muted' });
    const drawCount = () => {
      const max = Math.max(1, sel.size); n = Math.min(n, max);
      countBox.replaceChildren(chips(Array.from({ length: Math.min(8, max) }, (_, i) => [i + 1, String(i + 1)]), n, (v) => { n = v; info.textContent = `${n + 1} × 1 min`; }));
      info.textContent = `${n + 1} × 1 min`;
    };
    drawCount();
    wrap.replaceChildren(
      h('div', { class: 'plan-head' }, h('h2', {}, 'Plan dnia — losowanie'), info),
      h('p', { class: 'muted small' }, 'Codziennie losuję ćwiczenia z zaznaczonych poniżej, w miarę możliwości inne niż wczoraj. Ruch oczu jest zawsze pierwszy.'),
      h('p', { class: 'label' }, 'Ile ćwiczeń losować (oprócz Ruchu oczu)'),
      countBox,
      h('p', { class: 'label' }, 'Losuj spośród'),
      list,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: view }, 'Anuluj'),
        h('button', { class: 'btn primary', disabled: false, onclick: () => { if (!sel.size) { alert('Zaznacz przynajmniej jedno ćwiczenie.'); return; } setPlanPool([...sel], n); view(); } }, 'Zapisz i losuj')));
  };
  if (Store.pref('openPlanEdit', false)) { Store.setPref('openPlanEdit', false); edit(); } else view();
  return wrap;
}

const HOME_TABS = [['plan', 'Plan dnia'], ['ex', 'Ćwiczenia'], ['reader', 'Czytnik']];

function exerciseList() {
  const groups = [...new Set(EXERCISES.map((e) => e.group))];
  return groups.map((g) => h('section', {},
    h('h2', { class: 'group' }, g),
    h('div', { class: 'cards' }, ...EXERCISES.filter((e) => e.group === g).map((e) => {
      const r = Object.entries(Store.data.results).filter(([id]) => id === e.id || id.startsWith(e.id + '-')).map(([, v]) => v);
      const sessions = r.reduce((a, v) => a + v.history.length, 0);
      return h('a', { class: 'card', href: `#/ex/${e.id}` },
        h('span', { class: 'ico' }, e.icon),
        h('span', { class: 'txt' }, h('b', {}, e.name), h('small', {}, e.short)),
        sessions ? h('span', { class: 'cnt muted', title: 'Liczba sesji' }, sessions) : null);
    }))));
}

function home() {
  if (Infopigula.url() && Infopigula.cached()?.day !== dayKey()) Infopigula.latest().catch(() => {}); // codzienne pobranie w tle
  const s = streak(Store.data.days);
  let tab = Store.pref('homeTab', 'plan');
  if (!HOME_TABS.some(([t]) => t === tab)) tab = 'plan';
  const panel = h('main', { class: 'screen-body home' });
  const tabs = h('nav', { class: 'tabs', role: 'tablist' });
  const show = (t) => {
    tab = t; Store.setPref('homeTab', t);
    tabs.replaceChildren(...HOME_TABS.map(([id, label]) => h('button', {
      class: 'tab' + (id === t ? ' on' : ''), role: 'tab', 'aria-selected': id === t ? 'true' : 'false', onclick: () => { show(id); window.scrollTo(0, 0); },
    }, label)));
    panel.dataset.tab = t;
    if (t === 'plan') {
      panel.replaceChildren(planSection(),
        h('a', { class: 'btn wide', href: '#/stats' }, 'Statystyki i postęp'),
        h('p', { class: 'foot muted' }, 'Wyniki są zapisywane tylko na tym urządzeniu.'));
    } else if (t === 'ex') {
      panel.replaceChildren(...exerciseList(), h('a', { class: 'btn wide', href: '#/stats' }, 'Statystyki i postęp'));
    } else {
      panel.replaceChildren(Reader.homeCard(), h('a', { class: 'btn wide', href: '#/library' }, 'Biblioteka — wszystkie teksty'), Reader.statsCard());
    }
  };
  show(tab);
  return h('div', { class: 'screen' },
    h('header', { class: 'hero' },
      h('div', {}, h('h1', {}, 'Szybkie czytanie', CHANNEL === 'test' ? h('span', { class: 'chan-badge' }, 'TEST') : null), h('p', { class: 'muted' }, 'Trening i czytnik')),
      h('div', { class: 'hero-actions' },
        h('a', { class: 'streak', href: '#/stats', 'aria-label': 'Statystyki' }, h('b', {}, s), h('span', {}, s === 1 ? 'dzień' : 'dni')),
        gearBtn(() => { location.hash = '#/settings'; }))),
    tabs,
    panel);
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
    Reader.statsCard(),
  );
  return view;
}

/* ---------- Kopia danych: wyniki, ustawienia, poziomy i biblioteka (np. przeniesienie PWA → aplikacja natywna) ---------- */
async function exportData() {
  const payload = { app: 'szybkie-czytanie', version: 1, exported: new Date().toISOString(), store: Store.data, docs: await Library.all() };
  const json = JSON.stringify(payload);
  const name = `szybkie-czytanie-kopia-${dayKey()}.json`;
  if (nativeBridge()) { toNative({ type: 'export', name, json }); return; }
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch { /* anulowano */ } }
  const a = h('a', { href: URL.createObjectURL(file), download: name }); document.body.append(a); a.click(); a.remove();
}
const importInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== 'szybkie-czytanie' || !data.store) throw new Error('To nie jest kopia danych Szybkiego czytania.');
    if (!confirm(`Zastąpić wyniki i ustawienia kopią z ${new Date(data.exported).toLocaleString('pl-PL')}? Dokumenty z kopii zostaną dodane do biblioteki (${data.docs?.length || 0}).`)) return;
    Store.data = { results: {}, days: [], prefs: {}, ...data.store }; Store.save();
    const have = new Set((await Library.list()).map((d) => d.id));
    for (const d of data.docs || []) if (!have.has(d.id)) await Library.put(d);
    alert('Dane zaimportowane.'); route();
  } catch (err) { alert(`Import nieudany: ${err.message}`); }
} });

function infopigulaSettings() {
  const input = h('input', { class: 'search', type: 'url', placeholder: 'https://script.google.com/macros/s/…/exec?token=…', value: Infopigula.url() });
  const status = h('p', { class: 'muted small' }, Infopigula.cached() ? `Ostatnio: wydanie ${Infopigula.cached().issue}` : '');
  const test = async () => {
    Store.setPref('infopigulaUrl', input.value.trim());
    if (!input.value.trim()) { status.textContent = 'Odłączono.'; return; }
    status.textContent = 'Łączenie…';
    try { const r = await Infopigula.latest(true); status.textContent = `✓ Działa: wydanie ${r.issue}, ${r.count} wiadomości — dodane do Biblioteki i do Czytania w miejscu.`; } catch (e) { status.textContent = `✗ ${e.message}`; }
  };
  return h('section', { class: 'plan' },
    h('h2', { class: 'set-h' }, '📰 Infopiguła z Gmaila'),
    h('p', { class: 'muted small' }, 'Codzienne wydanie trafia do Czytania w miejscu i do Biblioteki. Adres skryptu Apps Script z Twojego konta Google — instrukcja w repozytorium: docs/INFOPIGULA.md.'),
    input,
    h('button', { class: 'btn wide', onclick: test }, 'Zapisz i sprawdź połączenie'),
    status);
}

function settings() {
  const { view, body } = screen('Ustawienia');
  const levelKeys = Object.keys(Store.data.prefs).filter((k) => k.startsWith('lvl-'));
  body.append(
    h('section', { class: 'plan' },
      h('h2', { class: 'set-h' }, 'Trening'),
      h('a', { class: 'btn wide', href: '#/', onclick: () => { Store.setPref('openPlanEdit', true); Store.setPref('homeTab', 'plan'); } }, 'Edytuj plan dnia'),
      h('button', { class: 'btn wide', disabled: !levelKeys.length, onclick: () => { if (confirm('Wrócić do poziomu 1 we wszystkich ćwiczeniach?')) { levelKeys.forEach((k) => delete Store.data.prefs[k]); Store.save(); route(); } } }, 'Resetuj poziomy do 1')),
    infopigulaSettings(),
    h('section', { class: 'plan' },
      h('h2', { class: 'set-h' }, 'Dane'),
      h('a', { class: 'btn wide', href: '#/stats' }, 'Statystyki i postęp'),
      h('button', { class: 'btn wide', onclick: exportData }, '⬆︎ Eksportuj kopię danych'),
      h('button', { class: 'btn wide', onclick: () => importInput.click() }, '⬇︎ Importuj kopię danych'),
      importInput,
      h('button', { class: 'btn danger wide', onclick: () => { if (confirm('Usunąć wszystkie wyniki i ustawienia z tego urządzenia?')) { Store.data = { results: {}, days: [], prefs: {} }; Store.save(); route(); } } }, 'Wyczyść wyniki i ustawienia'),
      h('p', { class: 'muted small' }, 'Wszystko jest zapisane tylko na tym urządzeniu.')),
    h('p', { class: 'muted small center-text' }, 'Ustawienia konkretnego ćwiczenia: koło zębate na ekranie ćwiczenia.'),
    h('p', { class: 'muted small center-text' }, `Wersja: ${CHANNEL === 'prod' ? 'aplikacja (PROD)' : 'web (TEST)'} · ${BUILD === '__BUILD__' ? 'lokalna' : BUILD}`));
  return view;
}

/* ---------- Czytnik i biblioteka ---------- */
const Reader = createReader({ h, Store, screen, chips, Wake, num });

/* ---------- Most: teksty udostępnione z innych aplikacji (rozszerzenie „Udostępnij” w aplikacji iOS) ---------- */
window.ReaderBridge = {
  async importShared(items) {
    const ids = []; let last = null;
    for (const it of items || []) {
      try {
        let title = it.title || ''; let text = it.text || '';
        if (text.split(/\s+/).filter(Boolean).length < 20 && it.html) {
          const a = articleFromHtml(it.html); text = a.text || text; title = title || a.title;
        }
        text = normalizeText(text);
        if (text.split(/\s+/).filter(Boolean).length >= 3) {
          last = await Library.add({ title: title || text.split('\n')[0].slice(0, 70), text, source: 'Udostępniony', url: it.url || '' });
        }
      } catch { /* pomiń uszkodzony element */ }
      ids.push(it.id);
    }
    toNative({ type: 'imported', ids });
    if (last) location.hash = `#/read/${last.id}`;
    return ids.length;
  },
};

/* ---------- Router ---------- */
const app = $('#app');
let current = null;
function route() {
  current?.abort();
  current = new AbortController();
  const [, kind, id] = (location.hash || '#/').split('/');
  currentEx = null; gearAction = null;
  document.querySelectorAll('body > .tut').forEach((t) => t.remove());
  let view;
  if (kind === 'ex') {
    const e = EXERCISES.find((x) => x.id === id);
    if (!e) { location.hash = '#/'; return; }
    currentEx = e.id;
    const s = screen(e.name, e);
    e.run(s.body, current.signal);
    view = s.view;
  } else if (kind === 'library') view = Reader.libraryView();
  else if (kind === 'read' && id) view = Reader.readerView(decodeURIComponent(id), current.signal);
  else if (kind === 'stats') view = stats();
  else if (kind === 'settings') view = settings();
  else view = home();
  app.replaceChildren(view);
  window.scrollTo(0, 0);
}

// Aplikacja z ekranu początkowego (pełny ekran) czy karta Safari (z paskiem narzędzi na dole)?
const isStandalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
document.documentElement.classList.toggle('standalone', isStandalone);

Store.load();
// Przy każdym uruchomieniu aplikacji ekran główny otwiera się na zakładce „Plan dnia”
// (w trakcie korzystania zakładka zostaje zapamiętana, np. po powrocie z ćwiczenia).
Store.data.prefs.homeTab = 'plan';
// Zmiana nazw ćwiczeń (XI 2026): „Linia wzroku” → „Pary słów”; dawne ćwiczenie „Pary słów” usunięte razem z wynikami i poziomem.
if (Store.data.results.linia) Store.data.results.linia.name = 'Pary słów';
if (Store.data.results.rsvp) Store.data.results.rsvp.name = 'Czytanie w miejscu'; // dawniej „Biegające słowa”
if (Store.data.results.pary || 'lvl-pary' in Store.data.prefs) {
  delete Store.data.results.pary; delete Store.data.prefs['lvl-pary']; delete Store.data.prefs['seen-pary'];
  Store.save();
}
addEventListener('hashchange', route);
route();

/* ---------- Aktualizacje ----------
 * TEST (web): nowa wersja działa od razu.
 * PROD (iPhone): nowa wersja pobiera się w tle i czeka. Pasek „Dostępna aktualizacja” pyta, czy zainstalować;
 * jeśli nie zainstalujesz, instaluje się sama przy pierwszym uruchomieniu po nocy (po 3:00), jak aktualizacje z App Store.
 * Aktualizacja wymienia wyłącznie pliki aplikacji — wyniki, poziomy, plan i biblioteka zostają nietknięte. */
const Updates = {
  reg: null, bar: null, applying: false,
  /** Czy od chwili wykrycia aktualizacji minęła godzina 3:00 (noc)? */
  nightPassed(since) {
    const d = new Date(since); d.setHours(3, 0, 0, 0);
    if (d.getTime() <= since) d.setDate(d.getDate() + 1);
    return Date.now() >= d.getTime();
  },
  apply() {
    const w = Updates.reg?.waiting; if (!w) return;
    delete Store.data.prefs.updSeen; Store.save();
    Updates.bar?.remove(); Updates.applying = true;
    w.postMessage('skipWaiting'); // po przejęciu strony przez nową wersję: przeładowanie (controllerchange)
  },
  check() {
    const reg = Updates.reg;
    if (!reg?.waiting || !navigator.serviceWorker.controller) return;
    const seen = Store.pref('updSeen', 0) || Date.now();
    if (!Store.pref('updSeen', 0)) Store.setPref('updSeen', seen);
    const busy = !!document.querySelector('.in-session');
    if (!busy && Updates.nightPassed(seen)) { Updates.apply(); return; }
    if (Updates.bar?.isConnected) return;
    Updates.bar = h('div', { class: 'update-bar', role: 'status' },
      h('span', {}, h('b', {}, 'Dostępna aktualizacja'), h('small', {}, 'Zainstaluje się sama w nocy. Twoje wyniki i poziomy zostaną.')),
      h('button', { class: 'btn primary', onclick: () => Updates.apply() }, 'Zainstaluj'),
      h('button', { class: 'btn', onclick: () => Updates.bar.remove() }, 'Później'));
    document.body.append(Updates.bar);
  },
  async init() {
    if (!('serviceWorker' in navigator) || !isSecureContext) return;
    try { Updates.reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }); } catch { return; }
    if (CHANNEL !== 'prod') return;
    const reg = Updates.reg;
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') Updates.check(); });
    });
    // Przeładowanie tylko po zatwierdzeniu aktualizacji (nie przy pierwszej instalacji).
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (Updates.applying) { Updates.applying = false; location.reload(); } });
    Updates.check();
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      reg.update().catch(() => {}); Updates.check();
    });
  },
};
Updates.init();
