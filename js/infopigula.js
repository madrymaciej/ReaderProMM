// Infopiguła: zamiana wydania newslettera (HTML z Gmaila) na czysty tekst do czytania.
// Treść trafia do aplikacji z Twojego konta Google przez skrypt Apps Script (tools/infopigula/Code.gs) —
// nie jest publikowana w repozytorium ani na stronie.

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const NOTES = /\s*\((?:wiele|\d+)\s+źród[^)]*\)|\s*\((?:video|wideo) w źródle\)/giu;
const SECTION = (name) => {
  const n = clean(name).toLowerCase();
  return n.charAt(0).toUpperCase() + n.slice(1);
};

/** @returns {{issue: string, title: string, text: string, count: number}} */
export function parseInfopigula(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const head = clean(doc.querySelector('h2')?.textContent);
  const issue = (head.match(/(\d{2}\.\d{2}\.\d{4})/) || [])[1] || '';
  const parts = []; let count = 0;
  for (const h2 of doc.querySelectorAll('h2.newsletter-header-label')) {
    const name = clean(h2.textContent);
    if (/twórcy/i.test(name)) continue;
    let ol = h2.nextElementSibling;
    while (ol && ol.tagName !== 'OL' && ol.tagName !== 'H2') ol = ol.nextElementSibling;
    if (!ol || ol.tagName !== 'OL') continue;
    const items = [];
    for (const li of ol.querySelectorAll(':scope > li')) {
      const text = [...li.querySelectorAll('p')]
        .filter((p) => !p.classList.contains('news-source'))
        .map((p) => clean(p.textContent).replace(NOTES, ''))
        .filter(Boolean)
        .join(' ');
      if (!text || /brutalne treści/i.test(text)) continue; // pomiń newsy oznaczone jako brutalne
      items.push(/[.!?…"”]$/.test(text) ? text : `${text}.`);
    }
    if (items.length) { parts.push(`${SECTION(name)}.`, ...items); count += items.length; }
  }
  return { issue, title: `Infopiguła ${issue}`.trim(), text: parts.join('\n\n'), count };
}
