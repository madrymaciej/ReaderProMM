# ReaderProMM

Aplikacja na iPhone'a z ćwiczeniami szybkiego czytania, wzorowana na zestawie ćwiczeń z wycofanej aplikacji ReaderPro.
Działa jako **PWA** (Progressive Web App), czyli strona instalowana na ekranie głównym. Uruchamia się na pełnym ekranie i działa offline.
Nie wymaga App Store, Xcode ani konta deweloperskiego Apple.

## Ćwiczenia

Każde ćwiczenie trwa **1 minutę**: robisz jak najwięcej powtórzeń, a wynik trafia do historii z wykresem postępu.
W trakcie sesji dostępne są przyciski **Stop** (powrót do ustawień, wynik nie jest zapisywany) i **Od nowa**.

| Grupa | Ćwiczenie | Wynik (na minutę) |
|---|---|---|
| Pole widzenia | Tablica Schultego (3×3–7×7) | znalezione liczby (kolejne tablice pojawiają się automatycznie) |
| Pole widzenia | **Widzenie sferyczne** | trafienia; adaptacyjny promień i czas ekspozycji (190→70 ms) |
| Pole widzenia | Linia wzroku | trafienia (takie same / różne słowa po obu stronach osi) |
| Tempo | Biegające słowa (RSVP) | przeczytane słowa; tempo 100–1000 sł/min, własny tekst |
| Tempo | Ruch oczu | skoki wzroku (5 wzorów) |
| Uwaga i pamięć | Szukanie liter | znalezione litery |
| Uwaga i pamięć | Szukanie liczb | znalezione liczby |
| Uwaga i pamięć | Zapamiętaj liczbę | poprawnie zapamiętane liczby |
| Uwaga i pamięć | Pary słów | trafienia |
| Pomiar | Test prędkości czytania | efektywne tempo = sł/min × zrozumienie |

**Plan dnia** — wybierasz ćwiczenia na dany dzień („Edytuj”), aplikacja prowadzi przez nie po kolei („Dalej w planie →”).
Pod planem jest pełna lista ćwiczeń. Statystyki: licznik dni z rzędu, rekordy, wykres każdego ćwiczenia.
Wyniki zapisują się lokalnie na urządzeniu.

Do testów czas sesji można skrócić parametrem `?t=5` (sekundy).

## Instalacja na iPhonie

1. Otwórz w Safari adres `https://madrymaciej.github.io/ReaderProMM/`.
2. Stuknij **Udostępnij** → **Do ekranu początkowego** → **Dodaj**.
3. Uruchamiaj aplikację z ikony **ReaderProMM**.

## Rozwój

```bash
npm test     # testy logiki (node:test)
npm start    # serwer lokalny na http://localhost:8080
```

Każdy push na `main` uruchamia testy i publikuje stronę na GitHub Pages (`.github/workflows/pages.yml`).
Po zmianach podbij `VERSION` w `sw.js`, żeby iPhone pobrał nową wersję.

Struktura: `js/lib.js` zawiera czystą logikę (testowaną), `js/app.js` ekrany i ćwiczenia, a `js/texts.js` teksty treningowe.
