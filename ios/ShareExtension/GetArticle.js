// Uruchamiany przez Safari na otwartej stronie przy udostępnianiu do „Szybkie czytanie”.
// Wyciąga sam artykuł (ten sam algorytm co js/article.js w aplikacji). Gdy się nie uda — przekazuje HTML.
var GetArticle = function () {};

GetArticle.prototype = {
  run: function (args) {
    var result = { url: document.URL, title: document.title || '', text: '', html: '' };
    try {
      var selection = String(window.getSelection ? window.getSelection() : '').trim();
      if (selection.split(/\s+/).length >= 30) {
        result.text = selection; // zaznaczony fragment ma pierwszeństwo
      } else {
        var a = extractArticle(document);
        result.text = a.text;
        if (a.title) result.title = a.title;
      }
    } catch (e) { /* zwróć HTML */ }
    if (!result.text) {
      try { result.html = document.documentElement.outerHTML.slice(0, 3000000); } catch (e2) { /* brak */ }
    }
    args.completionFunction(result);
  },
  finalize: function () {}
};

function extractArticle(doc) {
  var SKIP = 'nav, aside, footer, header, form, figure, figcaption, script, style, noscript, button, [role="navigation"], [aria-hidden="true"], .comments, #comments, .related, .share, .social, .advert, .ads';
  var BLOCKS = 'h1, h2, h3, h4, p, li, blockquote, pre';
  var clean = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };
  var og = doc.querySelector('meta[property="og:title"]');
  var h1 = doc.querySelector('h1');
  var title = clean((og && og.getAttribute('content')) || (h1 && h1.textContent) || doc.title);
  var scores = new Map();
  var ps = doc.querySelectorAll('p');
  for (var i = 0; i < ps.length; i++) {
    var p = ps[i];
    if (p.closest(SKIP)) continue;
    var len = clean(p.textContent).length;
    if (len < 40) continue;
    var par = p.parentElement; var gp = par && par.parentElement;
    if (par) scores.set(par, (scores.get(par) || 0) + len);
    if (gp) scores.set(gp, (scores.get(gp) || 0) + len / 2);
  }
  var best = null; var bestScore = 0;
  scores.forEach(function (sc, el) { if (sc > bestScore) { best = el; bestScore = sc; } });
  if (!best) return { title: title, text: '' };
  var parts = [];
  var els = best.querySelectorAll(BLOCKS);
  for (var j = 0; j < els.length; j++) {
    var el = els[j];
    if (el.closest(SKIP) && !best.closest(SKIP)) continue;
    if (el.querySelector(BLOCKS)) continue;
    var t = clean(el.textContent);
    if (t.length < 2) continue;
    if (/^h[1-4]$/i.test(el.tagName) && t === title) continue;
    parts.push(t);
  }
  return { title: title, text: parts.join('\n\n') };
}

var ExtensionPreprocessingJS = new GetArticle();
