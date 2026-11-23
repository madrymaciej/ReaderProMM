/**
 * Szybkie czytanie — Infopiguła z Twojego Gmaila.
 * Udostępnia aplikacji ostatnie wydania newslettera newsletter@infopigula.pl.
 * Dostęp chroni losowy token zapisany we właściwościach skryptu (nie w kodzie).
 *
 * Instalacja (raz): docs/INFOPIGULA.md
 */
const NADAWCA = 'newsletter@infopigula.pl';

function doGet(e) {
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || !e || !e.parameter || e.parameter.token !== token) {
    return wyslij_({ error: 'Brak dostępu — sprawdź token w adresie.' });
  }
  const ile = Math.max(1, Math.min(7, Number(e.parameter.n || 1)));
  const wiadomosci = [];
  GmailApp.search('from:' + NADAWCA + ' newer_than:10d', 0, 15).forEach(function (watek) {
    watek.getMessages().forEach(function (m) {
      if (m.getFrom().indexOf(NADAWCA) >= 0) wiadomosci.push(m);
    });
  });
  wiadomosci.sort(function (a, b) { return b.getDate() - a.getDate(); });
  return wyslij_({
    issues: wiadomosci.slice(0, ile).map(function (m) {
      return {
        id: m.getId(),
        date: Utilities.formatDate(m.getDate(), 'Europe/Warsaw', 'yyyy-MM-dd'),
        subject: m.getSubject(),
        html: m.getBody(),
      };
    }),
  });
}

/** Uruchom raz z edytora: tworzy token i wypisuje go w dzienniku (Wykonania / Logger). */
function ustawToken() {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  PropertiesService.getScriptProperties().setProperty('TOKEN', token);
  Logger.log('Twój token: ' + token);
}

function wyslij_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
