// Czytnik i biblioteka (funkcje w stylu Outread): tryby Prowadzenie (Guide), Flash (RSVP), Na głos (TTS) i Zwykły,
// import plików, zapamiętana pozycja, zakładki z notatkami, preferencje z podglądem na żywo, statystyki czytania.
import { Library } from './db.js';
import { importFile, ACCEPT, normalizeText } from './importers.js';
import { buildDoc, paginate, pageOf, sentenceBack, sentenceForward, minutesLeft, formatMinutes } from './textmodel.js';
import { delayFor, orpIndex, dayKey } from './lib.js';
import { TEXTS } from './texts.js';
import { mergeReadDays } from './syncmerge.js';

export const READER_DEFAULTS = {
  mode: 'guide', wpm: 300, guideChunk: 3, flashChunk: 1, punct: true,
  theme: 'auto', font: 'sans', size: 20, line: 1.6, hl: 'yellow', ttsRate: 1, voice: '',
};
const MODES = [['guide', 'Prowadzenie'], ['flash', 'Flash'], ['tts', 'Na głos'], ['normal', 'Zwykły']];
const THEMES = [['auto', 'Auto'], ['light', 'Jasny'], ['sepia', 'Sepia'], ['gray', 'Szary'], ['dark', 'Ciemny'], ['black', 'Czarny OLED']];
const FONTS = [['sans', 'Systemowa'], ['serif', 'Szeryfowa'], ['rounded', 'Zaokrąglona'], ['mono', 'Stała szer.']];
const HLS = ['yellow', 'green', 'blue', 'pink', 'orange'];

export function createReader({ h, Store, screen, chips, Wake, num }) {
  const prefs = () => ({ ...READER_DEFAULTS, ...Store.pref('reader', {}) });
  const setPrefs = (patch) => Store.setPref('reader', { ...prefs(), ...patch });
  const speechOK = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  /* ---------- Statystyki czytania ---------- */
  const stats = () => (Store.data.read ||= { days: {} });
  function addReading(words, secs) {
    if (words <= 0 && secs < 1) return;
    const d = dayKey(); const s = stats();
    const day = (s.days[d] ||= { words: 0, secs: 0 });
    day.words += Math.max(0, words); day.secs += Math.max(0, secs);
    if (!Store.data.days.includes(d)) Store.data.days.push(d);
    Store.sync?.queueRead();
    Store.save();
  }
  /** Dni czytania z tego urządzenia + z pozostałych (synchronizacja). */
  const allDays = () => mergeReadDays(stats().days, Store.data.readRemote);
  function statsSummary() {
    const days = allDays(); const today = days[dayKey()] || { words: 0, secs: 0 };
    let words = 0; let secs = 0;
    for (const v of Object.values(days)) { words += v.words; secs += v.secs; }
    return { today, words, secs, wpm: secs > 30 ? Math.round(words / (secs / 60)) : null };
  }
  function statsCard() {
    const s = statsSummary();
    const bars = [];
    const days = allDays();
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); bars.push({ d, v: days[dayKey(d)]?.words || 0 }); }
    const max = Math.max(1, ...bars.map((b) => b.v));
    return h('section', { class: 'plan read-stats' },
      h('div', { class: 'plan-head' }, h('h2', {}, 'Statystyki czytania')),
      h('div', { class: 'tiles' },
        h('div', { class: 'tile' }, h('b', {}, num(s.today.words)), h('small', {}, `słów dziś · ${Math.round(s.today.secs / 60)} min`)),
        h('div', { class: 'tile' }, h('b', {}, num(s.words)), h('small', {}, `słów łącznie · ${Math.round(s.secs / 60)} min`)),
        h('div', { class: 'tile' }, h('b', {}, s.wpm ?? '—'), h('small', {}, 'śr. tempo sł/min'))),
      h('div', { class: 'bars', title: 'Słowa dziennie — ostatnie 14 dni' },
        ...bars.map((b) => h('div', { class: 'bar-col' },
          h('div', { class: 'bar-v', style: `height:${Math.round((b.v / max) * 100)}%`, title: `${b.v} słów` }),
          h('small', {}, b.d.getDate())))),
      h('p', { class: 'muted small center-text' }, 'Słowa przeczytane dziennie w czytniku — ostatnie 14 dni'));
  }

  /* ---------- Wbudowane teksty ---------- */
  async function seed() {
    if (Store.pref('librarySeeded', false)) return;
    for (const t of TEXTS.slice().reverse()) await Library.add({ title: t.title, text: t.body, source: 'Wbudowany', builtin: true });
    Store.setPref('librarySeeded', true);
  }

  /* ---------- Arkusze (modale) ---------- */
  function sheet(title, ...content) {
    const close = () => { el.remove(); };
    const el = h('div', { class: 'modal', onclick: (e) => { if (e.target === el) close(); } },
      h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'close', 'aria-label': 'Zamknij', onclick: close }, '✕')),
        ...content));
    el.close = close;
    document.body.append(el);
    return el;
  }

  /* ======================= BIBLIOTEKA ======================= */
  function libraryView() {
    const { view, body } = screen('Biblioteka');
    body.classList.add('library');
    const list = h('div', { class: 'lib-list' }, h('p', { class: 'muted center-text' }, 'Wczytywanie…'));
    const status = h('p', { class: 'muted small center-text import-status', hidden: true });
    const search = h('input', { type: 'search', class: 'search', placeholder: 'Szukaj w bibliotece…', oninput: () => render() });
    const file = h('input', { type: 'file', accept: ACCEPT, multiple: true, hidden: true, onchange: () => doImport([...file.files]) });
    let docs = [];

    const render = () => {
      const q = search.value.trim().toLowerCase();
      const shown = docs.filter((d) => !q || d.title.toLowerCase().includes(q));
      const wpmNow = prefs().wpm;
      list.replaceChildren(...(shown.length ? shown.map((d) => {
        const pct = d.words ? Math.min(100, Math.round((d.pos / d.words) * 100)) : 0;
        const left = d.finished ? 'przeczytane' : `zostało ${formatMinutes(Math.max(0, d.words - d.pos) / wpmNow)}`;
        return h('div', { class: 'lib-item' },
          h('a', { class: 'lib-main', href: `#/read/${d.id}` },
            h('b', {}, d.title),
            h('small', { class: 'muted' }, `${d.source} · ${num(d.words)} słów · ${pct}% · ${left}`),
            h('div', { class: 'progress' }, h('div', { style: `width:${d.finished ? 100 : pct}%` }))),
          h('button', { class: 'icon-btn more', 'aria-label': 'Opcje dokumentu', onclick: () => docMenu(d) }, '⋯'));
      }) : [h('p', { class: 'muted center-text' }, q ? 'Brak wyników.' : 'Biblioteka jest pusta.')]));
    };
    const reload = async () => { docs = await Library.list(); render(); };

    const doImport = async (files) => {
      status.hidden = false;
      let last = null;
      for (const f of files) {
        status.textContent = `Importuję: ${f.name}…`;
        try {
          const res = await importFile(f, (p) => { status.textContent = `Importuję: ${f.name} — ${Math.round(p * 100)}%`; });
          last = await Library.add(res);
        } catch (e) { alert(`${f.name}: ${e.message}`); }
      }
      file.value = ''; status.hidden = true;
      await reload();
      if (files.length === 1 && last) location.hash = `#/read/${last.id}`;
    };

    const pasteSheet = () => {
      const title = h('input', { class: 'search', placeholder: 'Tytuł (opcjonalnie)' });
      const area = h('textarea', { class: 'custom', rows: 9, placeholder: 'Wklej tekst artykułu, rozdziału, raportu…' });
      const s = sheet('Wklej tekst',
        title, area,
        h('div', { class: 'row' },
          navigator.clipboard?.readText ? h('button', { class: 'btn', onclick: async () => {
            try { area.value = await navigator.clipboard.readText(); } catch { alert('Brak dostępu do schowka — wklej ręcznie (przytrzymaj pole → Wklej).'); }
          } }, '📋 Ze schowka') : null,
          h('button', { class: 'btn primary', onclick: async () => {
            const text = normalizeText(area.value);
            if (text.split(/\s+/).length < 3) { alert('Tekst jest za krótki.'); return; }
            const firstLine = text.split('\n')[0].slice(0, 70);
            const d = await Library.add({ title: title.value.trim() || firstLine, text, source: 'Wklejony' });
            s.close(); location.hash = `#/read/${d.id}`;
          } }, 'Zapisz i czytaj')),
        h('p', { class: 'muted small' }, 'Artykuł z internetu: otwórz go w Safari, włącz widok Czytnik (ikona „aA”), zaznacz tekst i skopiuj — potem wklej tutaj.'));
      setTimeout(() => area.focus(), 50);
    };

    const docMenu = (d) => {
      const s = sheet(d.title,
        h('button', { class: 'btn wide', onclick: async () => { const t = prompt('Nowy tytuł:', d.title); if (t) { await Library.update(d.id, { title: t.trim() }); s.close(); reload(); } } }, 'Zmień nazwę'),
        h('button', { class: 'btn wide', onclick: async () => { await Library.update(d.id, { pos: 0, finished: false }); s.close(); reload(); } }, 'Czytaj od początku'),
        h('button', { class: 'btn danger wide', onclick: async () => { if (confirm(`Usunąć „${d.title}” z biblioteki?`)) { await Library.remove(d.id); s.close(); reload(); } } }, 'Usuń'));
      s.querySelectorAll('.btn + .btn').forEach((b) => { b.style.marginTop = '8px'; });
    };

    body.append(
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: pasteSheet }, '＋ Wklej tekst'),
        h('button', { class: 'btn primary', onclick: () => file.click() }, '＋ Dodaj plik')),
      h('p', { class: 'muted small center-text' }, 'PDF, EPUB (bez DRM), Word .docx, RTF, TXT, HTML'),
      file, status, search, list, statsCard());
    seed().then(reload).catch((e) => { list.replaceChildren(h('p', { class: 'muted' }, `Błąd biblioteki: ${e.message}`)); });
    return view;
  }

  /* ======================= CZYTNIK ======================= */
  function readerView(id, signal) {
    const { view, body } = screen('Czytnik');
    view.classList.add('reader');
    const titleEl = view.querySelector('.bar h1');
    body.className = 'reader-body';
    body.append(h('p', { class: 'muted center-text' }, 'Wczytywanie…'));

    let doc = null; let model = null; let pages = null; let pos = 0;
    let playing = false; let timer = null; let renderedPage = -1;
    let statWords = 0; let statT0 = 0;
    let p = prefs();

    const applyLook = () => {
      p = prefs();
      view.classList.remove(...[...view.classList].filter((c) => /^(theme|font|hl)-/.test(c)));
      view.classList.add(`theme-${p.theme}`, `font-${p.font}`, `hl-${p.hl}`);
      view.style.setProperty('--rsize', `${p.size}px`);
      view.style.setProperty('--rline', p.line);
    };
    applyLook();

    /* --- elementy UI --- */
    const page = h('article', { class: 'rpage' });
    const flashBox = h('div', { class: 'rflash' });
    const content = h('div', { class: 'rcontent' }, page, flashBox);
    const pct = h('span', { class: 'muted small' });
    const scrub = h('input', { type: 'range', class: 'scrub', min: 0, max: 1, value: 0 });
    const playBtn = h('button', { class: 'btn primary play', 'aria-label': 'Odtwarzaj' }, '▶');
    const wpmEl = h('b', { class: 'mono' });
    const modeChips = h('div');
    const ctlRow = h('div', { class: 'rctl' });
    const footer = h('footer', { class: 'rbar' }, h('div', { class: 'rprog' }, scrub, pct), modeChips, ctlRow);

    const save = (() => { let t = null; return () => { clearTimeout(t); t = setTimeout(() => doc && Library.update(doc.id, { pos, opened: Date.now(), finished: pos >= model.words.length }), 600); }; })();

    const updateProgress = () => {
      const n = model.words.length;
      scrub.max = Math.max(1, n - 1); scrub.value = Math.min(pos, n - 1);
      const ratePerMin = p.mode === 'tts' ? 160 * p.ttsRate : p.wpm;
      pct.textContent = `${Math.min(100, Math.round((pos / Math.max(1, n)) * 100))}% · ${formatMinutes(minutesLeft(model, pos, ratePerMin))}`;
    };

    /* --- strona (tryby Prowadzenie, Na głos, Zwykły) --- */
    const renderPage = (pi) => {
      const [a, b] = pages[pi];
      const frag = document.createDocumentFragment();
      let para = null; let pIdx = -1;
      for (let i = a; i < b; i++) {
        if (model.paraOf[i] !== pIdx) { pIdx = model.paraOf[i]; para = h('p'); frag.append(para); }
        const s = document.createElement('span'); s.dataset.i = i;
        // spacja wewnątrz <span>, żeby znacznik był ciągły (bez przerw między słowami)
        s.textContent = model.paraOf[i + 1] === pIdx && i + 1 < b ? `${model.words[i]} ` : model.words[i];
        para.append(s);
      }
      page.replaceChildren(frag, h('div', { class: 'page-no muted small' }, `strona ${pi + 1} / ${pages.length}`));
      renderedPage = pi;
    };
    const span = (i) => page.querySelector(`span[data-i="${i}"]`);
    const clearHl = () => page.querySelectorAll('.hl').forEach((s) => s.classList.remove('hl'));
    const highlight = (a, b) => {
      clearHl();
      let first = null;
      for (let i = a; i < b; i++) { const s = span(i); if (s) { s.classList.add('hl'); first ||= s; } }
      if (first) {
        const r = first.getBoundingClientRect(); const vh = window.innerHeight;
        if (r.top < vh * 0.15 || r.bottom > vh * 0.62) first.scrollIntoView({ block: 'center', behavior: playing ? 'smooth' : 'auto' });
      }
    };
    const ensurePage = (at) => {
      const pi = pageOf(pages, Math.min(at, model.words.length - 1));
      if (pi !== renderedPage) { renderPage(pi); if (!playing) window.scrollTo(0, 0); }
    };
    /** Fragment od pozycji: `chunk` słów, nie przekraczając końca akapitu. */
    const chunkAt = (at, size) => {
      const pi = model.paraOf[at];
      const paraEnd = model.paraStart[pi + 1] ?? model.words.length;
      return [at, Math.min(at + size, paraEnd, model.words.length)];
    };

    /* --- flash --- */
    const showFlash = (a, b) => {
      const text = model.words.slice(a, b).join(' ');
      if (b - a === 1) {
        const chars = [...text]; const k = orpIndex(text);
        flashBox.replaceChildren(h('div', { class: 'orp' },
          h('span', { class: 'pre' }, chars.slice(0, k).join('')), h('span', { class: 'pivot' }, chars[k] || ''), h('span', { class: 'post' }, chars.slice(k + 1).join(''))));
      } else flashBox.replaceChildren(h('div', { class: 'phrase' }, text));
    };

    /* --- rysowanie stanu --- */
    const draw = () => {
      view.dataset.mode = p.mode;
      if (pos >= model.words.length) {
        if (p.mode === 'flash') flashBox.replaceChildren(h('div', { class: 'phrase muted' }, 'Koniec tekstu ✓'));
        else { ensurePage(model.words.length - 1); clearHl(); }
      } else if (p.mode === 'flash') {
        const [a, b] = chunkAt(pos, p.flashChunk); showFlash(a, b);
      } else {
        ensurePage(pos);
        if (p.mode === 'guide') { const [a, b] = chunkAt(pos, p.guideChunk); highlight(a, b); }
        else if (p.mode === 'tts') highlight(pos, sentenceForward(model, pos));
        else { clearHl(); const s = span(pos); if (s && pos !== pages[renderedPage][0]) s.classList.add('hl', 'mark'); }
      }
      updateProgress();
      drawControls();
    };

    /* --- odtwarzanie --- */
    const flushStats = () => {
      if (statT0) { addReading(statWords, (performance.now() - statT0) / 1000); statT0 = 0; statWords = 0; }
    };
    const stop = () => {
      playing = false; clearTimeout(timer);
      if (speechOK) speechSynthesis.cancel();
      flushStats(); drawControls(); save();
    };
    const finishDoc = () => { stop(); pos = model.words.length; draw(); Library.update(doc.id, { pos, finished: true, opened: Date.now() }); };

    const step = () => {
      if (!playing) return;
      if (pos >= model.words.length) { finishDoc(); return; }
      const size = p.mode === 'flash' ? p.flashChunk : p.guideChunk;
      const [a, b] = chunkAt(pos, size);
      if (p.mode === 'flash') showFlash(a, b); else { ensurePage(a); highlight(a, b); }
      const text = model.words.slice(a, b).join(' ');
      const ms = p.punct ? delayFor(text, p.wpm) : Math.round((60000 / p.wpm) * (b - a));
      updateProgress();
      timer = setTimeout(() => { statWords += b - a; pos = b; save(); step(); }, ms);
    };

    const pickVoice = () => {
      const vs = speechSynthesis.getVoices();
      return vs.find((v) => v.voiceURI === p.voice) || vs.find((v) => /^pl/i.test(v.lang)) || null;
    };
    const speakNext = () => {
      if (!playing) return;
      if (pos >= model.words.length) { finishDoc(); return; }
      const end = sentenceForward(model, pos);
      ensurePage(pos); highlight(pos, end); updateProgress();
      const u = new SpeechSynthesisUtterance(model.words.slice(pos, end).join(' '));
      const v = pickVoice(); if (v) u.voice = v;
      u.lang = v?.lang || 'pl-PL'; u.rate = p.ttsRate;
      u.onend = () => { if (!playing) return; statWords += end - pos; pos = end; save(); speakNext(); };
      u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') stop(); };
      speechSynthesis.speak(u);
    };

    const play = () => {
      if (p.mode === 'normal') return;
      if (pos >= model.words.length) pos = 0;
      if (p.mode === 'tts' && !speechOK) { alert('To urządzenie nie obsługuje czytania na głos.'); return; }
      playing = true; statT0 = performance.now(); statWords = 0;
      drawControls();
      if (p.mode === 'tts') { speechSynthesis.cancel(); speakNext(); } else step();
    };
    const toggle = () => (playing ? stop() : play());
    const jump = (to) => {
      const was = playing; if (was) stop();
      pos = Math.max(0, Math.min(model.words.length, to)); draw(); save();
      if (was) play();
    };

    /* --- sterowanie --- */
    const drawControls = () => {
      playBtn.textContent = playing ? '⏸' : '▶';
      playBtn.setAttribute('aria-label', playing ? 'Pauza' : 'Odtwarzaj');
      wpmEl.textContent = p.mode === 'tts' ? `${num(p.ttsRate)}×` : p.wpm;
      if (p.mode === 'normal') {
        const pi = renderedPage < 0 ? 0 : renderedPage;
        ctlRow.replaceChildren(
          h('button', { class: 'btn', disabled: pi === 0, onclick: () => jump(pages[Math.max(0, pi - 1)][0]) }, '◀ Strona'),
          h('span', { class: 'muted small center-text' }, `${pi + 1} / ${pages.length}`),
          h('button', { class: 'btn', disabled: pi >= pages.length - 1, onclick: () => { addReading(pages[pi][1] - pages[pi][0], 0); jump(pages[Math.min(pages.length - 1, pi + 1)][0]); } }, 'Strona ▶'));
      } else {
        const adj = (d) => {
          if (p.mode === 'tts') setPrefs({ ttsRate: Math.round(Math.min(2, Math.max(0.5, p.ttsRate + d / 250)) * 10) / 10 });
          else setPrefs({ wpm: Math.min(1500, Math.max(60, p.wpm + d)) });
          p = prefs(); drawControls(); updateProgress();
          if (p.mode === 'tts' && playing) { stop(); play(); }
        };
        ctlRow.replaceChildren(
          h('button', { class: 'btn', 'aria-label': 'Poprzednie zdanie', onclick: () => jump(sentenceBack(model, pos)) }, '⏮'),
          playBtn,
          h('button', { class: 'btn', 'aria-label': 'Następne zdanie', onclick: () => jump(sentenceForward(model, pos)) }, '⏭'),
          h('div', { class: 'wpm' },
            h('button', { class: 'btn small-btn', onclick: () => adj(-25) }, '−'),
            h('span', { class: 'center-text' }, wpmEl, h('small', {}, p.mode === 'tts' ? 'mowa' : 'sł/min')),
            h('button', { class: 'btn small-btn', onclick: () => adj(25) }, '+')));
      }
    };
    playBtn.addEventListener('click', toggle);
    const setMode = (m) => {
      stop(); setPrefs({ mode: m }); p = prefs();
      renderModes(); draw();
    };
    const renderModes = () => modeChips.replaceChildren(chips(MODES.filter(([m]) => m !== 'tts' || speechOK), p.mode, setMode));
    scrub.addEventListener('input', () => jump(+scrub.value));

    // Stuknięcie w słowo = start od tego miejsca; stuknięcie w trakcie = pauza.
    page.addEventListener('click', (e) => {
      if (playing) { stop(); return; }
      const i = e.target.dataset?.i;
      if (i != null) { pos = +i; draw(); save(); }
    });
    flashBox.addEventListener('click', toggle);

    /* --- zakładki --- */
    const bookmarksSheet = () => {
      const list = h('div', { class: 'bm-list' });
      const renderBm = () => list.replaceChildren(...(doc.bookmarks.length ? doc.bookmarks.map((bm, k) => h('div', { class: 'bm' },
        h('button', { class: 'bm-main', onclick: () => { s.close(); jump(bm.pos); } },
          h('b', {}, `${Math.round((bm.pos / model.words.length) * 100)}% — „${model.words.slice(bm.pos, bm.pos + 8).join(' ')}…”`),
          bm.note ? h('small', {}, bm.note) : null,
          h('small', { class: 'muted' }, new Date(bm.t).toLocaleDateString('pl-PL'))),
        h('button', { class: 'icon-btn more', 'aria-label': 'Usuń zakładkę', onclick: async () => { doc.bookmarks.splice(k, 1); await Library.update(doc.id, { bookmarks: doc.bookmarks }); renderBm(); } }, '✕')))
        : [h('p', { class: 'muted' }, 'Brak zakładek.')]));
      const s = sheet('Zakładki i notatki',
        h('button', { class: 'btn primary wide', onclick: async () => {
          const note = prompt('Notatka do zakładki (opcjonalnie):', '');
          if (note === null) return;
          doc.bookmarks.push({ pos, note: note.trim(), t: Date.now() });
          doc.bookmarks.sort((a, b) => a.pos - b.pos);
          await Library.update(doc.id, { bookmarks: doc.bookmarks }); renderBm();
        } }, '🔖 Dodaj zakładkę w tym miejscu'),
        list);
      renderBm();
    };

    /* --- preferencje z podglądem na żywo --- */
    const prefsSheet = () => {
      const was = playing; if (was) stop();
      const preview = h('div', { class: 'rpreview' });
      const sample = 'Czytanie to seria krótkich skoków oczu. Prowadzący znacznik ustala rytm i pomaga utrzymać skupienie na tekście.'.split(' ');
      preview.append(h('p', {}, ...sample.map((w, i) => h('span', { 'data-i': i }, i < sample.length - 1 ? `${w} ` : w))));
      let k = 0;
      const anim = setInterval(() => {
        const q = prefs(); const size = q.guideChunk;
        preview.querySelectorAll('span').forEach((s, i) => s.classList.toggle('hl', i >= k && i < k + size));
        k = (k + size) % sample.length;
      }, 450);
      const syncPreview = () => {
        const q = prefs();
        preview.className = `rpreview reader theme-${q.theme} font-${q.font} hl-${q.hl}`;
        preview.style.setProperty('--rsize', `${q.size}px`); preview.style.setProperty('--rline', q.line);
      };
      const set = (patch) => { setPrefs(patch); syncPreview(); applyLook(); draw(); };
      const sizeLbl = h('b', {}, p.size); const wpmLbl = h('b', {}, p.wpm); const rateLbl = h('b', {}, num(p.ttsRate));
      const voiceSel = speechOK ? h('select', { class: 'search', onchange: (e) => set({ voice: e.target.value }) }) : null;
      const fillVoices = () => {
        if (!voiceSel) return;
        const vs = speechSynthesis.getVoices().slice().sort((a, b) => (/^pl/i.test(b.lang) - /^pl/i.test(a.lang)) || a.name.localeCompare(b.name));
        voiceSel.replaceChildren(h('option', { value: '' }, 'Automatycznie (polski)'),
          ...vs.map((v) => h('option', { value: v.voiceURI, selected: v.voiceURI === prefs().voice }, `${v.name} (${v.lang})`)));
      };
      if (speechOK) { fillVoices(); speechSynthesis.addEventListener?.('voiceschanged', fillVoices); }
      const s = sheet('Ustawienia czytnika',
        preview,
        h('p', { class: 'label' }, 'Tempo: ', wpmLbl, ' sł/min'),
        h('input', { type: 'range', min: 60, max: 1500, step: 10, value: p.wpm, oninput: (e) => { wpmLbl.textContent = e.target.value; set({ wpm: +e.target.value }); } }),
        h('p', { class: 'label' }, 'Prowadzenie — słów w znaczniku'),
        chips([[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], p.guideChunk, (v) => set({ guideChunk: v })),
        h('p', { class: 'label' }, 'Flash — słów naraz'),
        chips([[1, '1'], [2, '2'], [3, '3'], [4, '4']], p.flashChunk, (v) => set({ flashChunk: v })),
        h('label', { class: 'switch-row' }, h('span', {}, h('b', {}, 'Pauzy na interpunkcji'), h('small', {}, 'Dłużej na kropce i przecinku — naturalniejszy rytm.')),
          h('input', { type: 'checkbox', class: 'switch', checked: p.punct, onchange: (e) => set({ punct: e.target.checked }) })),
        h('p', { class: 'label' }, 'Motyw'), chips(THEMES, p.theme, (v) => set({ theme: v })),
        h('p', { class: 'label' }, 'Czcionka'), chips(FONTS, p.font, (v) => set({ font: v })),
        h('p', { class: 'label' }, 'Rozmiar tekstu: ', sizeLbl, ' px'),
        h('input', { type: 'range', min: 14, max: 34, step: 1, value: p.size, oninput: (e) => { sizeLbl.textContent = e.target.value; set({ size: +e.target.value }); } }),
        h('p', { class: 'label' }, 'Interlinia'), chips([[1.3, '1,3'], [1.5, '1,5'], [1.6, '1,6'], [1.8, '1,8'], [2, '2,0']], p.line, (v) => set({ line: v })),
        h('p', { class: 'label' }, 'Kolor znacznika'),
        h('div', { class: 'chips' }, ...HLS.map((c) => h('button', { class: `swatch hl-${c}` + (c === p.hl ? ' on' : ''), 'aria-label': c, onclick: (e) => {
          e.currentTarget.parentElement.querySelectorAll('.swatch').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); set({ hl: c });
        } }))),
        speechOK ? [h('p', { class: 'label' }, 'Czytanie na głos — tempo mowy: ', rateLbl, '×'),
          h('input', { type: 'range', min: 0.5, max: 2, step: 0.1, value: p.ttsRate, oninput: (e) => { rateLbl.textContent = num(e.target.value); set({ ttsRate: +e.target.value }); } }),
          h('p', { class: 'label' }, 'Głos'), voiceSel] : null);
      syncPreview();
      const origClose = s.close;
      s.close = () => { clearInterval(anim); origClose(); };
      s.querySelector('.close').onclick = s.close;
      s.onclick = (e) => { if (e.target === s) s.close(); };
    };

    /* --- pasek górny: zakładki, Aa; koło zębate = ustawienia czytnika --- */
    const actions = view.querySelector('.bar-actions');
    actions.prepend(
      h('button', { class: 'icon-btn plain', 'aria-label': 'Zakładki', onclick: () => doc && bookmarksSheet() }, '🔖'),
      h('button', { class: 'icon-btn plain aa', 'aria-label': 'Wygląd tekstu', onclick: () => doc && prefsSheet() }, 'Aa'));
    const gear = actions.querySelector('.gear');
    gear.replaceWith(gear.cloneNode(true));
    actions.querySelector('.gear').addEventListener('click', () => doc && prefsSheet());
    view.querySelector('.back').setAttribute('href', '#/library');

    /* --- skróty klawiszowe (iPad / klawiatura Bluetooth / Mac) --- */
    const onKey = (e) => {
      if (!model || e.target.closest?.('input, textarea, select')) return;
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowLeft') jump(sentenceBack(model, pos));
      else if (e.key === 'ArrowRight') jump(sentenceForward(model, pos));
      else if (e.key === 'ArrowUp') { setPrefs({ wpm: Math.min(1500, p.wpm + 25) }); p = prefs(); drawControls(); }
      else if (e.key === 'ArrowDown') { setPrefs({ wpm: Math.max(60, p.wpm - 25) }); p = prefs(); drawControls(); }
    };
    document.addEventListener('keydown', onKey);
    const onHide = () => { if (document.visibilityState === 'hidden' && playing && p.mode !== 'tts') stop(); };
    document.addEventListener('visibilitychange', onHide);

    signal.addEventListener('abort', () => {
      stop(); Wake.off();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
      document.querySelectorAll('body > .modal').forEach((m) => m.remove());
    }, { once: true });

    Library.get(id).then((d) => {
      if (!d) { body.replaceChildren(h('p', { class: 'muted center-text' }, 'Nie znaleziono dokumentu.'), h('a', { class: 'btn wide', href: '#/library' }, 'Biblioteka')); return; }
      doc = d; doc.bookmarks ||= [];
      model = buildDoc(d.text); pages = paginate(model, 320);
      pos = d.finished ? 0 : Math.min(d.pos || 0, Math.max(0, model.words.length - 1));
      titleEl.textContent = d.title;
      Library.update(d.id, { opened: Date.now() });
      body.replaceChildren(content, footer);
      renderModes(); draw();
      Wake.on();
    });
    return view;
  }

  /** Karta „Czytnik” na ekranie głównym: biblioteka + „Czytaj dalej”. */
  function homeCard() {
    const wrap = h('section', { class: 'plan reader-card' },
      h('div', { class: 'plan-head' }, h('h2', {}, 'Czytnik'), h('a', { class: 'link', href: '#/library' }, 'Biblioteka')),
      h('p', { class: 'muted small' }, 'Twoje teksty, PDF i e-booki w trybach Prowadzenie, Flash i Na głos.'));
    seed().then(() => Library.list()).then((docs) => {
      const last = docs.find((d) => d.opened && !d.finished);
      if (last) {
        const pct = Math.round((last.pos / Math.max(1, last.words)) * 100);
        wrap.append(h('a', { class: 'btn primary wide', href: `#/read/${last.id}` }, `Czytaj dalej: ${last.title.slice(0, 32)}${last.title.length > 32 ? '…' : ''} · ${pct}%`));
      } else wrap.append(h('a', { class: 'btn primary wide', href: '#/library' }, 'Otwórz bibliotekę →'));
    }).catch(() => {});
    return wrap;
  }

  return { libraryView, readerView, homeCard, statsCard };
}

