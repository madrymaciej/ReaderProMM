# SzybkieCzytanie

Aplikacja na iPhone'a z ćwiczeniami szybkiego czytania, wzorowana na zestawie ćwiczeń z wycofanej aplikacji ReaderPro.
Działa jako **PWA** (Progressive Web App), czyli strona instalowana na ekranie głównym. Uruchamia się na pełnym ekranie i działa offline.
Nie wymaga App Store, Xcode ani konta deweloperskiego Apple.

## Ćwiczenia

Każde ćwiczenie trwa **1 minutę**: robisz jak najwięcej powtórzeń, a wynik trafia do historii z wykresem postępu.
W trakcie sesji: **Pauza** (zatrzymuje czas; w menu pauzy: Wznów / Od nowa / Zakończ) i **Zakończ** (kończy przed czasem, wynik z dotychczasowych powtórzeń jest zapisywany i oznaczony na wykresie).
Aplikacja działa też w **widoku poziomym** (iPhone obrócony): sterowanie po lewej, ćwiczenie po prawej.

| Grupa | Ćwiczenie | Wynik (na minutę) |
|---|---|---|
| Pole widzenia | Tablica Schulte’a (3×3–7×7) | znalezione liczby (kolejne tablice pojawiają się automatycznie) |
| Pole widzenia | **Widzenie sferyczne** | trafienia; adaptacyjny promień i czas ekspozycji (190→70 ms) |
| Pole widzenia | **Widzenie boczne** | trafne decyzje: stuknij, gdy 4 żółte litery na brzegach siatki nie są takie same; czekaj, gdy są |
| Pole widzenia | **Macierz liter** (jak w ReaderPro) | trafnie ocenione zestawy: wszystkie litery takie same czy jedna inna; zestawy lecą w stałym rytmie bez czekania |
| Pole widzenia | Pary słów | trafienia (takie same / różne słowa po obu stronach osi) |
| Tempo | Czytanie w miejscu (RSVP) | przeczytane słowa; tempo rośnie co 10 s, własny tekst; koniec tekstu kończy ćwiczenie |
| Tempo | Ruch oczu | skoki wzroku (5 wzorów); pełny ekran w poziomie (przy pionowym telefonie obraz obrócony o 90°) |
| Uwaga i pamięć | **Niepasujące pary** | znalezione pary w siatce kafelków, w których słowa się różnią |
| Uwaga i pamięć | Szukanie liter | znalezione litery |
| Uwaga i pamięć | Szukanie liczb | znalezione liczby |
| Uwaga i pamięć | Zapamiętaj liczbę | poprawnie zapamiętane liczby |
| Pomiar | Test prędkości czytania | efektywne tempo = sł/min × zrozumienie |

Każde ćwiczenie ma **samouczek** (3 kroki z próbą na przykładzie) — otwiera się przy pierwszym wejściu, potem „▶ Samouczek” na ekranie ustawień. Nad ustawieniami jest animowana symulacja ćwiczenia.

Ekran główny ma zakładki **Plan dnia / Ćwiczenia / Czytnik** (aplikacja pamięta ostatnio wybraną).

**Plan dnia** — codziennie losowany: Ruch oczu (rozgrzewka) zawsze pierwszy, potem ćwiczenia wylosowane z puli („Edytuj”: z jakich i ile), w miarę możliwości inne niż wczoraj. Na ekranie ćwiczenia z planu „⇄ Zmień ćwiczenie” wymienia je na inne. Aplikacja prowadzi przez plan po kolei („Następnie: … →”).
Pod planem jest pełna lista ćwiczeń. Statystyki: licznik dni z rzędu, rekordy, wykres każdego ćwiczenia.
Wyniki zapisują się lokalnie na urządzeniu.

**Poziomy** (widzenie sferyczne, widzenie boczne, macierz liter, pary słów, szukanie liter i liczb, zapamiętaj liczbę):
3 poprawne odpowiedzi z rzędu = poziom +1, każdy błąd = poziom −1 (reguła schodkowa Levitta „3-down/1-up”,
skuteczność ok. 79%). Poziom jest zapamiętywany i kolejna sesja startuje od niego. Aktualny poziom widać na górze ekranu.
Czytanie w miejscu przyspiesza automatycznie co 10 s (+10/+25/+50 sł/min do wyboru).

Propozycje dalszego rozwoju (przegląd aplikacji rynkowych): [docs/PROPOZYCJE.md](docs/PROPOZYCJE.md).

Do testów czas sesji można skrócić parametrem `?t=5` (sekundy).

## Czytnik i biblioteka (funkcje wzorowane na Outread)

| Funkcja | Opis |
|---|---|
| Tryb **Prowadzenie** | znacznik przesuwa się po zwykłym tekście w zadanym tempie (1–5 słów naraz) |
| Tryb **Flash** | 1–4 słowa w środku ekranu (RSVP), litera ORP na czerwono |
| Tryb **Na głos** | czytanie syntezą mowy z podświetlaniem zdania; wybór głosu i tempa mowy |
| Tryb **Zwykły** | czytanie stronami, bez prowadzenia |
| Import | PDF (pdf.js, offline), EPUB bez DRM, Word .docx, RTF, TXT (UTF-8 i Windows-1250), HTML, wklejony tekst / schowek |
| Biblioteka | wyszukiwarka, postęp i pozostały czas, zapamiętana pozycja, zmiana nazwy, usuwanie |
| Nawigacja | ⏮/⏭ o zdanie, suwak pozycji, stuknięcie w słowo = start od niego, stuknięcie w trakcie = pauza; klawiatura: spacja, ←/→, ↑/↓ |
| Zakładki i notatki | zakładka z notatką w dowolnym miejscu, lista z podglądem fragmentu |
| Wygląd z podglądem na żywo | motywy (Auto, Jasny, Sepia, Szary, Ciemny, Czarny OLED), 4 czcionki, rozmiar, interlinia, 5 kolorów znacznika, pauzy na interpunkcji |
| Statystyki czytania | słowa i czas dziś / łącznie, średnie tempo, wykres 14 dni |

Bez odpowiedników (wymagałyby serwera lub natywnej aplikacji): synchronizacja między urządzeniami, rozszerzenie „Udostępnij” w Safari,
import ze strony po adresie URL (blokada CORS), Instapaper/Pocket, przypomnienia push. Artykuły: Safari → widok Czytnik → kopiuj → „Wklej tekst”.

## Infopiguła z Gmaila

Codzienne wydanie prasówki trafia do Czytania w miejscu i Biblioteki przez Twój skrypt Apps Script — instrukcja: [docs/INFOPIGULA.md](docs/INFOPIGULA.md).

## Aplikacja natywna iOS (menu „Udostępnij”)

Kod w `ios/`, instrukcja: [docs/IOS.md](docs/IOS.md). Udostępnienie artykułu z Safari lub innej aplikacji dodaje go do Biblioteki.
Kopię danych (wyniki, ustawienia, biblioteka) przeniesiesz przez Ustawienia → Eksportuj / Importuj kopię danych.

## Instalacja na iPhonie

1. Otwórz w Safari adres `https://madrymaciej.github.io/SzybkieCzytanie/`.
2. Stuknij **Udostępnij** → **Do ekranu początkowego** → **Dodaj**.
3. Uruchamiaj aplikację z ikony **Szybkie czytanie**.

## Rozwój

```bash
npm test     # testy logiki (node:test)
npm start    # serwer lokalny na http://localhost:8080
```

Każdy push na `main` uruchamia testy i publikuje stronę na GitHub Pages (`.github/workflows/pages.yml`).
Po zmianach podbij `VERSION` w `sw.js`, żeby iPhone pobrał nową wersję.

Struktura: `js/lib.js` zawiera czystą logikę (testowaną), `js/app.js` ekrany i ćwiczenia, a `js/texts.js` teksty treningowe.
