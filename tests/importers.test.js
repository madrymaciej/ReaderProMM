import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzip, htmlToText, docxToText, rtfToText, decodeBytes, epubToText, pdfItemsToText, decodeEntities } from '../js/importers.js';

test('htmlToText zachowuje akapity i dekoduje encje', () => {
  const t = htmlToText('<html><head><title>x</title><style>p{}</style></head><body><h1>Tytuł</h1><p>Ala &amp; kot&nbsp;ma</p><p>Drugi<br>wiersz</p><script>x()</script></body></html>');
  assert.equal(t, 'Tytuł\n\nAla & kot ma\n\nDrugi\nwiersz');
  assert.equal(decodeEntities('&#8222;&#x201D;'), '„”');
});
test('docxToText łączy w:t w akapity', () => {
  const xml = '<w:body><w:p><w:r><w:t>Zażółć</w:t></w:r><w:r><w:t xml:space="preserve"> gęślą</w:t></w:r></w:p><w:p><w:r><w:t>jaźń</w:t></w:r></w:p></w:body>';
  assert.equal(docxToText(xml), 'Zażółć gęślą\n\njaźń');
});
test('rtfToText: akapity, \\\'xx (cp1250) i \\uN', () => {
  const rtf = "{\\rtf1\\ansi\\ansicpg1250{\\fonttbl{\\f0 Arial;}}\\f0 Za\\'bf\\'f3\\'b3\\'e6\\par gęś\\u322?\\par}";
  assert.equal(rtfToText(rtf), 'Zażółć\n\ngęśł');
});
test('decodeBytes rozpoznaje Windows-1250', () => {
  assert.equal(decodeBytes(new Uint8Array([0x5a, 0x61, 0xbf, 0xf3, 0xb3, 0xe6])), 'Zażółć');
  assert.equal(decodeBytes(new TextEncoder().encode('żółw')), 'żółw');
});
test('pdfItemsToText: linie, akapity, dzielenie wyrazów', () => {
  const it = (str, y, hasEOL = false) => ({ str, transform: [1, 0, 0, 10, 0, y], height: 10, hasEOL });
  assert.equal(pdfItemsToText([it('Pierwsza li-', 100), it('nia tekstu.', 88), it('Nowy akapit.', 50)]), 'Pierwsza linia tekstu.\n\nNowy akapit.');
});
test('unzip + epubToText (EPUB zbudowany w Pythonie, z kompresją deflate)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'epub-'));
  const out = join(dir, 'b.epub');
  execFileSync('python3', ['-c', `
import zipfile,sys
z=zipfile.ZipFile(sys.argv[1],'w')
z.writestr('mimetype','application/epub+zip',compress_type=zipfile.ZIP_STORED)
d=zipfile.ZIP_DEFLATED
z.writestr('META-INF/container.xml','<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',compress_type=d)
z.writestr('OEBPS/content.opf','<package><metadata><dc:title>Pan Tadeusz</dc:title></metadata><manifest><item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>',compress_type=d)
z.writestr('OEBPS/text/c1.xhtml','<html><body><p>Litwo! Ojczyzno moja!</p></body></html>',compress_type=d)
z.writestr('OEBPS/text/c2.xhtml','<html><body><p>Ty jesteś jak zdrowie.</p></body></html>',compress_type=d)
z.close()`, out]);
  const files = await unzip(readFileSync(out));
  assert.equal(new TextDecoder().decode(files.get('mimetype')), 'application/epub+zip');
  const { title, text } = epubToText(files);
  assert.equal(title, 'Pan Tadeusz');
  assert.equal(text, 'Litwo! Ojczyzno moja!\n\nTy jesteś jak zdrowie.');
});
