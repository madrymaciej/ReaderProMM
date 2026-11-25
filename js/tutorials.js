// Samouczki ćwiczeń: 3 kroki — zasada, przykład, próba na przykładzie (trzeba ją zaliczyć, by przejść dalej).

const shake = (el) => { el.classList.remove('err'); void el.offsetWidth; el.classList.add('err'); };

export function openTutorial(ex, h, { onFinish } = {}) {
  const build = TUTORIALS[ex.id];
  if (!build) { onFinish?.(); return; }
  const steps = build(h);
  let i = 0; let unlocked = false;

  const progress = h('div', { class: 'tut-progress' });
  const content = h('div', { class: 'tut-content' });
  const cta = h('button', { class: 'btn primary big wide tut-cta' });
  const hint = h('p', { class: 'muted small center-text tut-hint' });
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); onFinish?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const el = h('div', { class: 'tut', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Samouczek: ${ex.name}` },
    h('div', { class: 'tut-bar' },
      h('button', { class: 'tut-x', 'aria-label': 'Zamknij samouczek', onclick: close }, '✕'),
      h('b', {}, `Samouczek: ${ex.name}`), h('span')),
    progress, content,
    h('div', { class: 'tut-foot' }, hint, cta, h('button', { class: 'link tut-skip', onclick: close }, 'Pomiń samouczek')));

  const render = () => {
    const s = steps[i]; const last = i === steps.length - 1;
    unlocked = !s.task;
    progress.replaceChildren(...steps.map((_, k) => h('i', { class: k <= i ? 'on' : '' })));
    const unlock = () => { unlocked = true; cta.disabled = false; hint.textContent = 'Świetnie! Możesz przejść dalej.'; };
    content.replaceChildren(...[
      h('h2', {}, s.title),
      s.visual ? s.visual() : null,
      h('p', { class: 'tut-text' }, s.text),
      s.example ? h('div', { class: 'tut-example' }, h('small', { class: 'muted' }, s.example.label), h('div', { class: `tut-demo-btn ${s.example.kind}` }, s.example.button, h('span', { class: 'tut-ico' }, s.example.kind === 'tap' ? '👆' : '⏸'))) : null,
      s.task ? s.task(unlock) : null].filter(Boolean));
    cta.textContent = last ? 'Przejdź do ćwiczenia' : 'Dalej';
    cta.disabled = !unlocked;
    hint.textContent = s.task ? 'Wypróbuj przykład, aby kontynuować.' : '';
  };
  cta.addEventListener('click', () => { if (!unlocked) return; if (i < steps.length - 1) { i++; render(); } else close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(el);
  render();
}

/* ---------- elementy wizualne ---------- */
const grid = (h, cells, n, cls = '') => h('div', { class: `tut-grid ${cls}`, style: `--n:${n}` }, ...cells);
const choice = (h, options, correct, unlock, { cls = '' } = {}) => {
  const wrap = h('div', { class: `tut-choices ${cls}` });
  options.forEach((o) => wrap.append(h('button', { class: 'btn', onclick: (e) => {
    if (o === correct) { e.currentTarget.classList.add('ok'); [...wrap.children].forEach((b) => { b.disabled = true; }); unlock(); } else shake(e.currentTarget);
  } }, o)));
  return wrap;
};
const sameDiffTask = (h, isSame, unlock) => {
  const row = h('div', { class: 'row samediff' });
  const btn = (same, label, cls) => h('button', { class: `btn big ${cls}`, onclick: (e) => {
    if (same === isSame) { e.currentTarget.classList.add('ok'); [...row.children].forEach((b) => { b.disabled = true; }); unlock(); } else shake(e.currentTarget);
  } }, label);
  row.append(btn(false, '≠ Różne', 'diff'), btn(true, '= Takie same', 'same'));
  return row;
};
const sideGrid = (h, spotLetter, oddLetter) => {
  const L = ['R', 'T', null, 'K', 'S', 'N', 'L', 'O', 'P', 'E', null, 'V', '•', 'A', null, 'C', 'F', 'H', 'D', 'Q', 'W', 'X', null, 'Y', 'Z'];
  const spots = [2, 10, 14, 22];
  return grid(h, L.map((c, i) => {
    if (i === 12) return h('span', { class: 'tut-center' }, '•');
    if (spots.includes(i)) return h('span', { class: 'spot' }, i === 14 && oddLetter ? oddLetter : spotLetter);
    return h('span', {}, c);
  }), 5, 'side');
};

/* ---------- treść samouczków ---------- */
const TUTORIALS = {
  boczne: (h) => [
    { title: 'Patrz na środek', visual: () => sideGrid(h, 'A'), text: 'Patrz na kropkę i dostrzegaj cztery żółte litery za pomocą widzenia peryferyjnego.' },
    { title: 'Poczekaj, gdy litery są takie same', visual: () => sideGrid(h, 'A'), text: 'Wszystkie cztery żółte litery to A, więc nie stukaj. Stuknij Dalej, aby zobaczyć różnicę.',
      example: { label: 'Przykład: poczekaj, nie stukaj', button: 'Znaleziono różnicę', kind: 'wait' } },
    { title: 'Stuknij, gdy litera się różni', visual: () => sideGrid(h, 'A', 'B'), text: 'Jedna żółta litera to B. Stuknij „Znaleziono różnicę”, gdy cztery żółte litery nie są wszystkie takie same.',
      task: (unlock) => h('button', { class: 'btn big wide side-btn', onclick: (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = '✓ Znaleziono różnicę'; unlock(); } }, 'Znaleziono różnicę') },
  ],
  niepary: (h) => {
    const tile = (a, b, cls = '') => h('div', { class: `np-tile static ${cls}` }, h('span', {}, a), h('span', {}, b));
    return [
      { title: 'Pary słów w kafelkach', visual: () => h('div', { class: 'np-grid tut-np' }, tile('ogród', 'ogród'), tile('rynek', 'rynek'), tile('kapitał', 'kapitał'), tile('umowa', 'umowa'), tile('koszt', 'kosz'), tile('lampa', 'lampa')),
        text: 'Każdy kafelek ma dwa słowa. Większość par jest identyczna — kilka różni się jedną literą lub kolejnością.' },
      { title: 'Nie stukaj pasujących par', visual: () => h('div', { class: 'np-grid tut-np two' }, tile('garden', 'garden'), tile('sklep', 'sklep')),
        text: 'Pasująca para to błąd. Stukaj tylko te, w których słowa się różnią. „Pozostało” pokazuje, ile różnic zostało na planszy.' },
      { title: 'Znajdź różniącą się parę', text: 'Stuknij kafelek, którego dwa słowa się różnią. Nie stukaj pasującej pary.', task: (unlock) => {
        const msg = h('div', { class: 'tut-feedback' }); const again = h('button', { class: 'btn tut-again', hidden: true }, 'Spróbuj ponownie');
        const wrap = h('div', { class: 'np-grid tut-np two' });
        const reset = () => { msg.replaceChildren(); again.hidden = true; wrap.querySelectorAll('.np-tile').forEach((t) => t.classList.remove('found')); };
        const mk = (a, b, odd) => h('button', { class: 'np-tile', onclick: (e) => {
          if (odd) {
            e.currentTarget.classList.add('found');
            msg.replaceChildren(h('span', { class: 'ok-ico' }, '✓'), h('span', {}, `Zgadza się — ${a} i ${b} to różne słowa. W ćwiczeniu stukaj tylko pary, które się różnią.`));
            again.hidden = false; unlock();
          } else { shake(e.currentTarget); msg.replaceChildren(h('span', { class: 'bad-ico' }, '✕'), h('span', {}, 'To ta sama para — szukaj kafelka, w którym słowa się różnią.')); }
        } }, h('span', {}, a), h('span', {}, b));
        wrap.append(mk('ogród', 'ogród', false), mk('forma', 'froma', true));
        again.addEventListener('click', reset);
        return h('div', { class: 'tut-np-task' }, wrap, msg, again);
      } },
    ];
  },
  schulte: (h) => {
    const nums = [7, 2, 9, 4, 1, 6, 3, 8, 5];
    const g = (hit = []) => grid(h, nums.map((v, i) => h('span', { class: hit.includes(v) ? 'hit' : '' }, i === 4 ? h('i', { class: 'tut-dot' }, v) : v)), 3);
    return [
      { title: 'Patrz na środek', visual: () => g(), text: 'Trzymaj wzrok na kropce w środku tablicy. Liczb szukaj kątem oka, bez przesuwania wzroku.' },
      { title: 'Szukaj po kolei: 1, 2, 3…', visual: () => g([1, 2]), text: 'Stukaj liczby rosnąco. Po ukończeniu tablicy od razu pojawi się nowa — liczy się, ile liczb znajdziesz w minutę.' },
      { title: 'Spróbuj: stuknij 1, 2 i 3', text: 'Patrz w środek i stukaj liczby po kolei.', task: (unlock) => {
        let next = 1;
        return grid(h, nums.map((v) => h('button', { class: 'tut-cell', onclick: (e) => {
          if (v === next) { e.currentTarget.classList.add('hit'); next++; if (next > 3) unlock(); } else if (v > 3 || v !== next) shake(e.currentTarget);
        } }, v)), 3);
      } },
    ];
  },
  sfera: (h) => {
    const circle = (center, letter) => h('div', { class: 'tut-circle' }, h('b', { class: 'c' }, center), letter ? h('span', { class: 'blip' }, letter) : null);
    return [
      { title: 'Patrz na krzyżyk', visual: () => circle('+'), text: 'Wzrok cały czas na środku koła. Nie szukaj liter wzrokiem — mają pojawiać się „kątem oka”.' },
      { title: 'Litera błyśnie na okręgu', visual: () => circle('5', 'K'), text: 'Na ułamek sekundy w środku pojawi się cyfra, a na okręgu litera. Potem w środku zobaczysz pytanie: „litera” albo „cyfra”.' },
      { title: 'Spróbuj: jaka litera była na okręgu?', visual: () => circle('litera'), text: 'W poprzednim kroku na okręgu była litera K.', task: (unlock) => choice(h, ['D', 'K', 'R', 'H', 'M', 'S'], 'K', unlock, { cls: 'six' }) },
    ];
  },
  macierz: (h) => {
    const m = (odd) => grid(h, ['E', '', 'E', '', '', 'E', '', 'E', 'E', '', odd ? 'F' : 'E', '', '', 'E', '', 'E'].map((c) => h('span', {}, c)), 4, 'mono');
    return [
      { title: 'Patrz w środek macierzy', visual: () => m(false), text: 'Macierz liter pojawi się na chwilę. Część pól jest pusta. Wszystkie litery są takie same albo dokładnie jedna się różni.' },
      { title: 'Zestawy nie czekają', visual: () => m(false), text: 'Kolejne zestawy pojawiają się w stałym rytmie. Odpowiedź dotyczy ostatniego zestawu; brak odpowiedzi liczy się jako błąd.' },
      { title: 'Spróbuj: takie same czy różne?', visual: () => m(true), text: 'Przyjrzyj się literom — jedna jest inna.', task: (unlock) => sameDiffTask(h, false, unlock) },
    ];
  },
  linia: (h) => {
    const line = (a, b) => h('div', { class: 'tut-line' }, h('i'), h('span', { class: 'l' }, a), h('span', { class: 'r' }, b));
    return [
      { title: 'Patrz na czerwoną linię', visual: () => line('', ''), text: 'Wzrok trzymaj na pionowej linii w środku.' },
      { title: 'Po bokach błysną dwa słowa', visual: () => line('kawa', 'kawa'), text: 'Oceń, czy oba słowa są identyczne. Różnice są drobne: jedna litera albo zamiana kolejności.' },
      { title: 'Spróbuj: takie same czy różne?', visual: () => line('mapa', 'mapo'), text: 'Porównaj słowa po obu stronach linii.', task: (unlock) => sameDiffTask(h, false, unlock) },
    ];
  },
  rsvp: (h) => {
    const word = (pre, piv, post) => h('div', { class: 'tut-rsvp' }, h('span', {}, pre), h('b', {}, piv), h('span', {}, post));
    return [
      { title: 'Patrz na czerwoną literę', visual: () => word('cz', 'y', 'tanie'), text: 'Słowa pojawiają się jedno po drugim w tym samym miejscu. Nie przesuwasz wzroku — tylko czytasz.' },
      { title: 'Tempo rośnie', visual: () => word('sz', 'y', 'bciej'), text: 'Co 10 sekund tempo rośnie (np. +25 słów/min). Przyciski − / + pozwalają je poprawić. Ćwiczenie kończy się po minucie albo z końcem tekstu.' },
      { title: 'Spróbuj: jakie było ostatnie słowo?', text: 'Patrz na czerwoną literę — przeczytasz 4 słowa.', task: (unlock) => {
        const words = ['Czytam', 'coraz', 'szybciej', 'dzisiaj']; const disp = h('div', { class: 'tut-rsvp' });
        const opts = h('div'); let k = 0;
        const t = setInterval(() => {
          if (!disp.isConnected && k > 0) { clearInterval(t); return; }
          if (k < words.length) { const w = words[k++]; const p = w.length <= 5 ? 1 : 2; disp.replaceChildren(h('span', {}, w.slice(0, p)), h('b', {}, w[p]), h('span', {}, w.slice(p + 1))); }
          else { clearInterval(t); disp.replaceChildren(h('span', { class: 'muted' }, '…')); opts.replaceChildren(choice(h, ['szybciej', 'dzisiaj', 'coraz'], 'dzisiaj', unlock)); }
        }, 450);
        return h('div', {}, disp, opts);
      } },
    ];
  },
  oczy: (h) => {
    const field = (x) => h('div', { class: 'tut-eye' }, h('i', { style: `left:${x}%` }));
    return [
      { title: 'Głowa nieruchomo', visual: () => field(10), text: 'Śledź skaczący punkt samymi oczami, bez ruszania głową.' },
      { title: 'Obróć telefon poziomo', visual: () => field(90), text: 'Ćwiczenie działa na pełnym ekranie w poziomie. Tempo zmienisz przyciskami − / + na górnym pasku.' },
      { title: 'Spróbuj: stuknij punkt 3 razy', text: 'Punkt przeskoczy po każdym stuknięciu.', task: (unlock) => {
        const f = h('div', { class: 'tut-eye' }); const dot = h('button', { class: 'tut-eye-dot', 'aria-label': 'Punkt' }); f.append(dot);
        const pos = [[10, 50], [90, 50], [50, 20], [10, 50]]; let n = 0;
        const place = () => { const [x, y] = pos[n]; dot.style.left = `${x}%`; dot.style.top = `${y}%`; };
        dot.addEventListener('click', () => { n++; if (n >= 3) { dot.disabled = true; dot.classList.add('ok'); unlock(); } else place(); });
        place(); return f;
      } },
    ];
  },
  litery: (h) => {
    const L = ['d', 'b', 'p', 'q', 'h', 'd', 'p', 'b', 'q', 'd', 'h', 'p'];
    return [
      { title: 'Znajdź wszystkie wskazane litery', visual: () => grid(h, L.map((c) => h('span', { class: c === 'b' ? 'hit' : '' }, c)), 6, 'serif'), text: 'U góry widzisz literę docelową (np. b). Litery wokół są do niej podobne: d, p, q. Przeszukuj rzędami.' },
      { title: 'Plansza rośnie z poziomem', text: 'Po znalezieniu wszystkich liter pojawia się nowa plansza. 3 trafienia z rzędu podnoszą poziom, pomyłka go obniża.' },
      { title: 'Spróbuj: stuknij obie litery b', text: 'Szukaj: b', task: (unlock) => {
        let found = 0;
        return grid(h, L.map((c) => h('button', { class: 'tut-cell serif', onclick: (e) => {
          if (c === 'b' && !e.currentTarget.classList.contains('hit')) { e.currentTarget.classList.add('hit'); if (++found === 2) unlock(); } else if (c !== 'b') shake(e.currentTarget);
        } }, c)), 6);
      } },
    ];
  },
  liczby: (h) => [
    { title: 'Znajdź liczbę', visual: () => h('div', { class: 'tut-target' }, 'Znajdź: ', h('b', {}, '4821')), text: 'U góry widzisz liczbę. Odszukaj ją wśród bardzo podobnych — różnią się jedną cyfrą albo kolejnością.' },
    { title: 'Liczby się wydłużają', text: 'Z poziomem liczby mają więcej cyfr. Postaraj się objąć całą liczbę jednym spojrzeniem.' },
    { title: 'Spróbuj: znajdź 4821', task: (unlock) => choice(h, ['4812', '4821', '4281', '4921'], '4821', unlock, { cls: 'mono two' }), text: 'Stuknij właściwą liczbę.' },
  ],
  pamiec: (h) => [
    { title: 'Liczba błyśnie na chwilę', visual: () => h('div', { class: 'tut-flash' }, '472'), text: 'Zapamiętaj ją jednym spojrzeniem — całą naraz, a nie cyfra po cyfrze.' },
    { title: 'Wpisz ją w tym samym miejscu', visual: () => h('div', { class: 'tut-flash typing' }, '47'), text: 'Po zniknięciu liczby wpisz ją z pamięci na klawiaturze i stuknij OK. Poprawna odpowiedź wydłuża kolejną liczbę.' },
    { title: 'Spróbuj: zapamiętaj liczbę', text: 'Liczba zniknie po 1,5 s.', task: (unlock) => {
      const box = h('div', { class: 'tut-flash' }, '583'); const opts = h('div');
      setTimeout(() => { box.textContent = '?'; opts.replaceChildren(choice(h, ['538', '583', '853'], '583', unlock)); }, 1500);
      return h('div', {}, box, opts);
    } },
  ],
  test: (h) => {
    const words = 'Czytaj normalnie przez minutę, a potem wskaż słowo, na którym skończyłeś.'.split(' ');
    return [
      { title: 'Czytaj normalnie', text: 'Czytasz tekst w swoim zwykłym tempie, ze zrozumieniem, przez 1 minutę.' },
      { title: 'Wskaż, gdzie skończyłeś', text: 'Po minucie stukasz słowo, na którym skończyłeś. Potem odpowiadasz na pytania tylko z przeczytanych akapitów. Wynik = tempo × zrozumienie.' },
      { title: 'Spróbuj: stuknij słowo „minutę,”', text: 'Stuknij to słowo w zdaniu.', task: (unlock) => h('p', { class: 'tut-words' }, ...words.map((w) => h('span', { onclick: (e) => {
        if (w === 'minutę,') { e.currentTarget.classList.add('hit'); unlock(); } else shake(e.currentTarget);
      } }, `${w} `))) },
    ];
  },
};
