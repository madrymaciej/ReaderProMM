# ReaderProMM

Aplikacja na iPhone'a z ćwiczeniami szybkiego czytania, wzorowana na zestawie ćwiczeń z wycofanej aplikacji ReaderPro.
Działa jako **PWA** (Progressive Web App), czyli strona instalowana na ekranie głównym. Uruchamia się na pełnym ekranie i działa offline.
Nie wymaga App Store, Xcode ani konta deweloperskiego Apple.

## Ćwiczenia

| Grupa | Ćwiczenie | Co trenuje |
|---|---|---|
| Pole widzenia | Tablica Schultego (3×3–7×7) | widzenie peryferyjne, szybkie wyszukiwanie |
| Pole widzenia | **Widzenie sferyczne** | rozpoznawanie znaków na okręgu wokół punktu fiksacji (adaptacyjny promień i czas) |
| Pole widzenia | Linia wzroku | poziome pole widzenia — porównywanie słów po obu stronach osi |
| Tempo | Biegające słowa (RSVP) | tempo 100–1000 sł/min, 1–3 słowa naraz, własny tekst |
| Tempo | Ruch oczu | sakkady: poziomo, pionowo, przekątne, linijki, losowo |
| Uwaga i pamięć | Szukanie liter | rozróżnianie podobnych liter (b/d/p/q…) |
| Uwaga i pamięć | Szukanie liczb | precyzyjne postrzeganie ciągów cyfr |
| Uwaga i pamięć | Zapamiętaj liczbę | rozpiętość percepcji i pamięć robocza |
| Uwaga i pamięć | Pary słów | wyłapywanie drobnych różnic w słowach |
| Pomiar | Test prędkości czytania | tempo × zrozumienie = efektywne tempo |

Dodatkowo: plan dnia (~10 min), licznik dni z rzędu, rekordy i wykresy postępu. Wyniki zapisują się lokalnie na urządzeniu.

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
