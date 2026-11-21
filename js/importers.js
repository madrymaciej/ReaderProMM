// Import tekstów do biblioteki: TXT/MD, HTML, EPUB, DOCX, RTF, PDF.
// Funkcje „czyste” (bez DOM) są testowane w tests/importers.test.js.

/* ---------- ZIP (EPUB i DOCX to archiwa ZIP) ---------- */
/** Rozpakowuje archiwum ZIP. Zwraca Map: ścieżka → Uint8Array. Obsługuje metody 0 (stored) i 8 (deflate). */
export async function unzip(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('To nie jest poprawne archiwum ZIP.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const lnlen = dv.getUint16(local + 26, true);
    const lxlen = dv.getUint16(local + 28, true);
    const start = local + 30 + lnlen + lxlen;
    const data = u8.subarray(start, start + csize);
    if (method === 0) out.set(name, data.slice());
    else if (method === 8) out.set(name, await inflateRaw(data));
  }
  return out;
}

async function inflateRaw(data) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ---------- Kodowanie i czyszczenie tekstu ---------- */
/** UTF-8, a gdy plik nim nie jest — Windows-1250 (typowe polskie pliki TXT). */
export function decodeBytes(u8) {
  const utf = new TextDecoder('utf-8').decode(u8);
  if (!utf.includes('�')) return utf.replace(/^﻿/, '');
  try { return new TextDecoder('windows-1250').decode(u8); } catch { return utf; }
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', bdquo: '„', rdquo: '”', ldquo: '“', rsquo: '’', lsquo: '‘', shy: '' };
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

/** Normalizuje tekst: akapity oddzielone pustą linią, bez nadmiarowych spacji. */
export function normalizeText(s) {
  return s.replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** HTML/XHTML → tekst z zachowaniem akapitów. */
export function htmlToText(html) {
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, html])[1];
  const t = body
    .replace(/<(script|style|head|nav)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|section|article|tr|dd|dt|figcaption|pre)>/gi, '\n\n')
    .replace(/<(p|div|h[1-6]|li|blockquote|section|article|tr)(\s[^>]*)?>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  return normalizeText(decodeEntities(t));
}

/** word/document.xml (DOCX) → tekst. */
export function docxToText(xml) {
  const paras = xml.split(/<\/w:p>/).map((p) => {
    const parts = [];
    p.replace(/<w:tab\/>|<w:br\/>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, (m, t) => { parts.push(t != null ? t : m === '<w:tab/>' ? '\t' : '\n'); return m; });
    return decodeEntities(parts.join(''));
  });
  return normalizeText(paras.filter((p) => p.trim()).join('\n\n'));
}

/** RTF → tekst (podstawowe: akapity, znaki \'xx w cp1250, \uN). */
export function rtfToText(rtf) {
  const bytes = [];
  let out = '';
  const flush = () => { if (bytes.length) { out += new TextDecoder('windows-1250').decode(new Uint8Array(bytes)); bytes.length = 0; } };
  let depth = 0; const skipAt = [];
  for (let i = 0; i < rtf.length; i++) {
    const c = rtf[i];
    if (c === '{') { depth++; continue; }
    if (c === '}') { if (skipAt.at(-1) === depth) skipAt.pop(); depth--; continue; }
    if (skipAt.length) { if (c === '\\') { const m = /^\\[a-z]+-?\d* ?|^\\./i.exec(rtf.slice(i)); if (m) i += m[0].length - 1; } continue; }
    if (c === '\\') {
      const rest = rtf.slice(i);
      let m;
      if ((m = /^\\'([0-9a-f]{2})/i.exec(rest))) { bytes.push(parseInt(m[1], 16)); i += 3; continue; }
      flush();
      if ((m = /^\\u(-?\d+) ?\??/.exec(rest))) { let n = +m[1]; if (n < 0) n += 65536; out += String.fromCharCode(n); i += m[0].length - 1; continue; }
      if ((m = /^\\\*/.exec(rest))) { skipAt.push(depth); i += 1; continue; }
      if ((m = /^\\([a-z]+)(-?\d+)? ?/i.exec(rest))) {
        const w = m[1];
        if (['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer'].includes(w)) skipAt.push(depth);
        else if (w === 'par' || w === 'line') out += '\n\n';
        else if (w === 'tab') out += '\t';
        i += m[0].length - 1; continue;
      }
      if (rest[1] === '\\' || rest[1] === '{' || rest[1] === '}') { out += rest[1]; i++; continue; }
      i++; continue;
    }
    if (c === '\n' || c === '\r') continue;
    flush(); out += c;
  }
  flush();
  return normalizeText(out);
}

/* ---------- EPUB ---------- */
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1];
function resolvePath(base, href) {
  const parts = (base ? base.split('/') : []).concat(decodeURIComponent(href.split('#')[0]).split('/'));
  const out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
  return out.join('/');
}

/** Pliki EPUB (Map z unzip) → { title, text } w kolejności spisu (spine). */
export function epubToText(files) {
  const dec = new TextDecoder();
  const read = (n) => (files.has(n) ? dec.decode(files.get(n)) : null);
  const container = read('META-INF/container.xml');
  const opfPath = container && attr(container.match(/<rootfile\s[^>]*>/i)?.[0] || '', 'full-path');
  const opf = opfPath && read(opfPath);
  if (!opf) throw new Error('Nie znaleziono opisu książki (OPF) w pliku EPUB.');
  const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';
  const title = decodeEntities((opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i) || [])[1] || '').trim();
  const manifest = new Map();
  for (const tag of opf.match(/<item\s[^>]*>/gi) || []) manifest.set(attr(tag, 'id'), attr(tag, 'href'));
  const spine = (opf.match(/<itemref\s[^>]*>/gi) || []).map((t) => attr(t, 'idref')).filter((id) => manifest.has(id));
  const chapters = spine.map((id) => read(resolvePath(dir, manifest.get(id)))).filter(Boolean).map(htmlToText).filter(Boolean);
  return { title, text: normalizeText(chapters.join('\n\n')) };
}

/* ---------- PDF (pdf.js ładowany dopiero przy pierwszym imporcie PDF) ---------- */
let pdfjsReady = null;
function loadPdfJs() {
  pdfjsReady ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/pdfjs/pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js'; res(window.pdfjsLib); };
    s.onerror = () => { pdfjsReady = null; rej(new Error('Nie udało się wczytać modułu PDF.')); };
    document.head.append(s);
  });
  return pdfjsReady;
}

/** Łączy fragmenty tekstu ze strony PDF w linie i akapity (odstęp pionowy > 1,6× wysokości linii = nowy akapit). */
export function pdfItemsToText(items) {
  let out = ''; let lastY = null; let lastH = 0;
  for (const it of items) {
    if (!('str' in it)) continue;
    const y = it.transform ? it.transform[5] : null;
    const hgt = Math.abs(it.height || (it.transform ? it.transform[3] : 0)) || lastH || 10;
    if (lastY != null && y != null && Math.abs(lastY - y) > 1) {
      const gap = Math.abs(lastY - y);
      if (gap > hgt * 1.6) out += '\n\n';
      else if (/-$/.test(out) && !/\s-$/.test(out)) out = out.slice(0, -1); // dzielenie wyrazów
      else out += ' ';
    }
    out += it.str;
    if (it.hasEOL) out += ' ';
    if (y != null) { lastY = y; lastH = hgt; }
  }
  return out;
}

async function pdfToText(buffer, onProgress) {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    pages.push(pdfItemsToText(tc.items));
    onProgress?.(i / pdf.numPages);
  }
  let title = '';
  try { title = (await pdf.getMetadata())?.info?.Title || ''; } catch { /* brak metadanych */ }
  return { title, text: normalizeText(pages.join('\n\n')) };
}

/* ---------- Główna funkcja importu ---------- */
export const ACCEPT = '.txt,.md,.text,.html,.htm,.xhtml,.epub,.docx,.rtf,.pdf';

export async function importFile(file, onProgress) {
  const name = file.name || 'Dokument';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const base = name.replace(/\.[^.]+$/, '');
  const buf = await file.arrayBuffer();
  let res;
  switch (ext) {
    case 'txt': case 'md': case 'text': res = { text: normalizeText(decodeBytes(new Uint8Array(buf))) }; break;
    case 'html': case 'htm': case 'xhtml': {
      const html = decodeBytes(new Uint8Array(buf));
      res = { title: decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim(), text: htmlToText(html) };
      break;
    }
    case 'epub': res = epubToText(await unzip(buf)); break;
    case 'docx': {
      const files = await unzip(buf);
      const xml = files.get('word/document.xml');
      if (!xml) throw new Error('Nie znaleziono treści dokumentu Word.');
      res = { text: docxToText(new TextDecoder().decode(xml)) };
      break;
    }
    case 'rtf': res = { text: rtfToText(new TextDecoder('latin1').decode(new Uint8Array(buf))) }; break;
    case 'pdf': res = await pdfToText(buf, onProgress); break;
    case 'doc': throw new Error('Stary format .doc nie jest obsługiwany — zapisz plik jako .docx lub PDF.');
    default: throw new Error(`Nieobsługiwany format: .${ext}`);
  }
  if (!res.text || res.text.split(/\s+/).length < 3) throw new Error('Nie udało się odczytać tekstu z pliku (może to skan bez warstwy tekstowej?).');
  return { title: res.title || base, text: res.text, source: ext.toUpperCase() };
}
