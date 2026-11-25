// Krótkie, zapętlone symulacje ćwiczeń na ekranie ustawień („jak to wygląda”).
// makeDemo(id, h) → { el, step } — step() wywoływane co 100 ms (tylko gdy demo jest na ekranie).

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const LETTERS = 'ABCDEFHKLMNPRSTUWZ';

export function makeDemo(id, h) {
  const box = h('div', { class: `demo demo-${id}`, 'aria-hidden': 'true' });
  const caption = h('div', { class: 'demo-cap' });
  let step = () => {};

  switch (id) {
    case 'schulte': {
      const n = 4; let nums; let next; let cells;
      const grid = h('div', { class: 'd-grid', style: `--n:${n}` });
      const reset = () => {
        nums = shuffle([...Array(n * n)].map((_, i) => i + 1)); next = 1;
        cells = nums.map((v) => h('span', {}, v)); grid.replaceChildren(...cells, h('i', { class: 'd-dot' }));
      };
      reset(); box.append(grid, caption);
      step = (k) => {
        if (k % 5) return;
        if (next > n * n) { reset(); return; }
        cells[nums.indexOf(next)].classList.add('hit');
        caption.textContent = `szukaj: ${next < n * n ? next + 1 : '—'}`; next++;
      };
      break;
    }
    case 'sfera': {
      const field = h('div', { class: 'd-circle' }); const cross = h('b', { class: 'd-cross' }, '+');
      field.append(cross); box.append(field, caption);
      let blips = [];
      step = (k) => {
        const t = k % 22;
        if (t === 3) {
          const a = Math.random() * Math.PI * 2; const r = 0.62;
          blips = [h('span', { class: 'd-blip', style: `left:${50 + Math.cos(a) * r * 50}%;top:${50 + Math.sin(a) * r * 50}%` }, pick([...LETTERS]))];
          cross.textContent = String(1 + Math.floor(Math.random() * 9));
          field.append(...blips); caption.textContent = 'patrz w środek…';
        } else if (t === 5) { blips.forEach((b) => b.remove()); cross.textContent = 'litera'; cross.classList.add('ask'); caption.textContent = 'jaka litera była na okręgu?'; }
        else if (t === 17) { cross.textContent = '+'; cross.classList.remove('ask'); caption.textContent = ''; }
      };
      break;
    }
    case 'macierz': {
      const grid = h('div', { class: 'd-matrix' }); const verdict = h('div', { class: 'd-verdict' });
      box.append(grid, verdict);
      let same = true;
      step = (k) => {
        const t = k % 24;
        if (t === 2) {
          same = Math.random() < 0.5; const base = pick(['E', 'O', 'P', 'C']); const odd = { E: 'F', O: 'Q', P: 'R', C: 'G' }[base];
          const filled = shuffle([...Array(16).keys()]).slice(0, 9); const oddAt = same ? -1 : pick(filled);
          grid.replaceChildren(...[...Array(16)].map((_, i) => h('span', {}, filled.includes(i) ? (i === oddAt ? odd : base) : '')));
          verdict.textContent = ''; verdict.className = 'd-verdict';
        } else if (t === 9) grid.replaceChildren(...[...Array(16)].map(() => h('span')));
        else if (t === 11) { verdict.textContent = same ? '= takie same' : '≠ jedna inna'; verdict.className = `d-verdict ${same ? 'same' : 'diff'}`; }
      };
      break;
    }
    case 'boczne': {
      const n = 5; const grid = h('div', { class: 'd-side', style: `--n:${n}` }); const verdict = h('div', { class: 'd-verdict' });
      box.append(grid, verdict);
      const spots = [2, 10, 14, 22];
      step = (k) => {
        const t = k % 22;
        if (t === 1) {
          const same = Math.random() < 0.5; const base = pick([...LETTERS]); const odd = pick([...LETTERS].filter((c) => c !== base)); const oddAt = same ? -1 : pick(spots);
          grid.dataset.same = same ? '1' : '';
          grid.replaceChildren(...[...Array(n * n)].map((_, i) => (i === 12 ? h('b', {}, '•') : spots.includes(i) ? h('span', { class: 'spot' }, i === oddAt ? odd : base) : h('span', {}, pick([...LETTERS])))));
          verdict.textContent = ''; verdict.className = 'd-verdict';
        } else if (t === 12) {
          const s = grid.dataset.same === '1';
          verdict.textContent = s ? 'takie same — czekaj' : '≠ różnica — stuknij!'; verdict.className = `d-verdict ${s ? 'same' : 'diff'}`;
        }
      };
      break;
    }
    case 'niepary': {
      const grid = h('div', { class: 'd-np' }); const cap = h('div', { class: 'demo-cap' }); box.append(grid, cap);
      const W = ['dom', 'kawa', 'rynek', 'mapa', 'okno', 'koszt', 'lampa', 'umowa', 'cena']; let odd = []; let tiles = [];
      const reset = () => {
        const ws = shuffle(W); odd = shuffle([...Array(9).keys()]).slice(0, 2);
        const mut = (w) => w.slice(0, -1) + (w.endsWith('a') ? 'o' : 'a');
        tiles = ws.map((w, i) => h('div', {}, h('span', {}, w), h('span', {}, odd.includes(i) ? mut(w) : w)));
        grid.replaceChildren(...tiles); cap.textContent = 'pozostało: 2';
      };
      reset();
      step = (k) => { const t = k % 30; if (t === 10) { tiles[odd[0]].classList.add('hit'); cap.textContent = 'pozostało: 1'; } else if (t === 18) { tiles[odd[1]].classList.add('hit'); cap.textContent = 'pozostało: 0'; } else if (t === 0) reset(); };
      break;
    }
    case 'linia': {
      const field = h('div', { class: 'd-line' }, h('i', { class: 'd-axis' })); const verdict = h('div', { class: 'd-verdict' });
      const L = h('span', { class: 'd-wl' }); const R = h('span', { class: 'd-wr' }); field.append(L, R);
      box.append(field, verdict);
      const pairs = [['kawa', 'kawa'], ['mapa', 'mapo'], ['okno', 'okno'], ['dom', 'dam'], ['rynek', 'rynek'], ['koszt', 'kosz']];
      step = (k) => {
        const t = k % 20;
        if (t === 2) { const [a, b] = pick(pairs); L.textContent = a; R.textContent = b; field.dataset.same = a === b ? '1' : ''; verdict.textContent = ''; verdict.className = 'd-verdict'; }
        else if (t === 6) { L.textContent = ''; R.textContent = ''; }
        else if (t === 8) { const s = field.dataset.same === '1'; verdict.textContent = s ? '= takie same' : '≠ różne'; verdict.className = `d-verdict ${s ? 'same' : 'diff'}`; }
      };
      break;
    }
    case 'rsvp': {
      const words = 'Słowa pojawiają się jedno po drugim w tym samym miejscu, a tempo stopniowo rośnie.'.split(' ');
      const disp = h('div', { class: 'd-rsvp' }); box.append(disp, caption);
      let i = 0;
      step = (k) => {
        if (k % 3) return;
        const w = words[i % words.length]; const c = [...w]; const p = c.length <= 1 ? 0 : c.length <= 5 ? 1 : c.length <= 9 ? 2 : 3;
        disp.replaceChildren(h('span', { class: 'pre' }, c.slice(0, p).join('')), h('span', { class: 'pivot' }, c[p]), h('span', { class: 'post' }, c.slice(p + 1).join('')));
        caption.textContent = `${300 + Math.floor(i / words.length) * 25} sł/min`; i++;
      };
      break;
    }
    case 'oczy': {
      const field = h('div', { class: 'd-eye' }); const dot = h('i', { class: 'd-edot' }); field.append(dot); box.append(field, caption);
      const pos = [[8, 50], [92, 50]]; let j = 0;
      caption.textContent = 'śledź punkt samymi oczami';
      step = (k) => { if (k % 6) return; const [x, y] = pos[j++ % 2]; dot.style.left = `${x}%`; dot.style.top = `${y}%`; };
      break;
    }
    case 'litery': {
      const grid = h('div', { class: 'd-letters' }); box.append(h('div', { class: 'demo-cap' }, 'szukaj: ', h('b', {}, 'b')), grid);
      let cells; let targets;
      const reset = () => {
        const arr = shuffle([...'bbbbb', ...[...Array(19)].map(() => pick(['d', 'p', 'q', 'h']))]);
        cells = arr.map((c) => h('span', {}, c)); targets = arr.map((c, i) => (c === 'b' ? i : -1)).filter((i) => i >= 0);
        grid.replaceChildren(...cells);
      };
      reset();
      step = (k) => { if (k % 6) return; if (!targets.length) { reset(); return; } cells[targets.shift()].classList.add('hit'); };
      break;
    }
    case 'liczby': {
      const target = h('b'); const grid = h('div', { class: 'd-numbers' }); box.append(h('div', { class: 'demo-cap' }, 'znajdź: ', target), grid);
      let ans; let cells;
      const reset = () => {
        const t = String(1000 + Math.floor(Math.random() * 9000)); const set = new Set([t]);
        while (set.size < 6) { const d = [...t]; const i = Math.floor(Math.random() * 4); d[i] = String((+d[i] + 1 + Math.floor(Math.random() * 8)) % 10); if (d[0] !== '0') set.add(d.join('')); }
        const list = shuffle([...set]); ans = list.indexOf(t); target.textContent = t;
        cells = list.map((v) => h('span', {}, v)); grid.replaceChildren(...cells);
      };
      reset();
      step = (k) => { const t = k % 24; if (t === 12) cells[ans].classList.add('hit'); else if (t === 0) reset(); };
      break;
    }
    case 'pamiec': {
      const disp = h('div', { class: 'd-flash' }); box.append(disp, caption);
      let num = '';
      step = (k) => {
        const t = k % 34;
        if (t === 1) { num = String(100 + Math.floor(Math.random() * 900)) + Math.floor(Math.random() * 10); disp.textContent = '+'; disp.classList.remove('typing'); caption.textContent = ''; }
        else if (t === 4) { disp.textContent = num; caption.textContent = 'zapamiętaj'; }
        else if (t === 11) { disp.textContent = ''; disp.classList.add('typing'); caption.textContent = 'wpisz z pamięci'; }
        else if (t >= 14 && t < 14 + 4 * 3 && (t - 14) % 3 === 0) disp.textContent = num.slice(0, (t - 14) / 3 + 1);
        else if (t === 28) { disp.classList.remove('typing'); disp.textContent = '✓'; }
      };
      break;
    }
    default: { // test czytania: znacznik przesuwa się po tekście
      const words = 'Czytaj normalnie przez minutę, potem wskaż słowo, na którym skończyłeś, i odpowiedz na pytania o treść.'.split(' ');
      const p = h('p', { class: 'd-text' }, ...words.map((w) => h('span', {}, `${w} `)));
      box.append(p, caption);
      let i = 0;
      step = (k) => {
        if (k % 4) return;
        p.querySelectorAll('.hl').forEach((s) => s.classList.remove('hl'));
        if (i >= words.length) { i = 0; caption.textContent = ''; return; }
        p.children[i].classList.add('hl'); caption.textContent = `${Math.round((i / words.length) * 60)} s`; i++;
      };
    }
  }
  let tick = 0;
  return { el: box, step: () => step(++tick) };
}
