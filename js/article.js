// Wyciąganie treści artykułu ze strony („readability-lite”).
// Ten sam algorytm jest w ios/ShareExtension/GetArticle.js (uruchamiany przez Safari na otwartej stronie).

const SKIP = 'nav, aside, footer, header, form, figure, figcaption, script, style, noscript, button, [role="navigation"], [aria-hidden="true"], .comments, #comments, .related, .share, .social, .advert, .ads';
const BLOCKS = 'h1, h2, h3, h4, p, li, blockquote, pre';
const clean = (s) => s.replace(/\s+/g, ' ').trim();

/** @param {Document} doc @returns {{title: string, text: string}} */
export function extractArticle(doc) {
  const title = clean(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
    || doc.querySelector('h1')?.textContent || doc.title || '');
  // Punktacja: każdy dłuższy akapit dodaje swoją długość rodzicowi i połowę dziadkowi.
  const scores = new Map();
  for (const p of doc.querySelectorAll('p')) {
    if (p.closest(SKIP)) continue;
    const len = clean(p.textContent).length;
    if (len < 40) continue;
    const par = p.parentElement; const gp = par?.parentElement;
    if (par) scores.set(par, (scores.get(par) || 0) + len);
    if (gp) scores.set(gp, (scores.get(gp) || 0) + len / 2);
  }
  let best = null; let bestScore = 0;
  for (const [el, sc] of scores) if (sc > bestScore) { best = el; bestScore = sc; }
  if (!best) return { title, text: '' };
  const parts = [];
  for (const el of best.querySelectorAll(BLOCKS)) {
    if (el.closest(SKIP) && !best.closest(SKIP)) continue;
    if (el.querySelector(BLOCKS)) continue; // tylko „liście” — bez duplikatów
    const t = clean(el.textContent);
    if (t.length < 2) continue;
    if (/^(h[1-4])$/i.test(el.tagName) && t === title) continue;
    parts.push(t);
  }
  return { title, text: parts.join('\n\n') };
}

/** HTML jako tekst → artykuł (w przeglądarce, przez DOMParser). */
export function articleFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return extractArticle(doc);
}
