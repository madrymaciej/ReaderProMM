# Aplikacja natywna iOS „Szybkie czytanie” (z rozszerzeniem „Udostępnij”)

## Jak to działa
- **Aplikacja** (`ios/App`) wyświetla wydaną wersję (PROD) z https://madrymaciej.github.io/SzybkieCzytanie/prod/ w WKWebView
  (te same ćwiczenia i czytnik; aktualizacje — patrz „Wersje TEST i PROD” niżej; działa offline dzięki service workerowi).
- **Rozszerzenie „Udostępnij”** (`ios/ShareExtension`) pojawia się w menu Udostępnij:
  - z **Safari** — `GetArticle.js` wyciąga sam artykuł z otwartej strony (także po zalogowaniu; zaznaczony fragment ma pierwszeństwo),
  - z **innych aplikacji** — link: rozszerzenie pobiera stronę, artykuł wyciąga aplikacja (`js/article.js`),
  - **tekst** — zapisywany bez zmian.
- Rozszerzenie zapisuje element do wspólnego katalogu (**App Group** `group.com.madrymaciej.szybkieczytanie`).
  Aplikacja po otwarciu przekazuje go do Biblioteki (`window.ReaderBridge.importShared`) i otwiera w czytniku.
- Most JS ↔ natywny (`window.webkit.messageHandlers.native`): potwierdzenie importu, blokada wygaszania ekranu, eksport kopii danych.

## Pierwsze uruchomienie (Mac + iPhone, ok. 15 min)
1. Członkostwo w Apple Developer Program aktywne (aplikacja „Apple Developer” → Account).
2. Xcode z App Store na Macu (darmowy) → uruchom raz, zaakceptuj licencję.
3. W Terminalu:
   ```bash
   brew install xcodegen
   git clone https://github.com/madrymaciej/SzybkieCzytanie.git && cd SzybkieCzytanie/ios && xcodegen generate && open SzybkieCzytanie.xcodeproj
   ```
4. **Zaloguj Xcode na konto deweloperskie** (jednorazowo na Macu): ⌘, → *Apple Accounts* → **+** / *Sign In…* → Apple ID.
   Bez tego build kończy się błędami „No Accounts” i „No profiles for 'com.madrymaciej…'”.
5. W Xcode, dla **obu** celów (SzybkieCzytanie i ShareExtension) → *Signing & Capabilities* →
   ✓ *Automatically manage signing*, **Team**: Twój zespół (nie „Personal Team”).
   Xcode sam zarejestruje identyfikatory i App Group.
6. Podłącz iPhone'a kablem, odblokuj, „Ufaj temu komputerowi”, wybierz go u góry okna Xcode.
7. Status „Device … isn't registered in your developer account” → **Register Device** (jednorazowo na urządzenie).
8. ▶︎ **Run** (⌘R). Okno pęku kluczy „codesign potrzebuje dostępu do klucza Apple Development…” →
   hasło do Maca → **Zawsze pozwalaj** (przy „Pozwól” okno wraca przy każdym buildzie).
9. „Developer Mode disabled” → na iPhonie *Ustawienia → Prywatność i ochrona → Tryb dewelopera* → włącz →
   restart → potwierdź **Włącz** → ponownie ⌘R. (Opcja pojawia się dopiero po pierwszej próbie instalacji z Xcode.)
10. Jeśli przy otwieraniu aplikacji pojawi się „Niezaufany deweloper”: *Ustawienia → Ogólne → VPN i urządzenia zarządzane* → Twoje konto → **Ufaj**.

Kroki 4, 7, 8 i 9 robi się raz — przy kolejnych aplikacjach wystarczą kroki 3, 5 i 8 (⌘R).

## Przeniesienie danych z wersji webowej
Stara ikona (PWA) → Ustawienia → **Eksportuj kopię danych** → zapisz w Plikach.
Aplikacja natywna → Ustawienia → **Importuj kopię danych**.

## Automatyczna kontrola
`.github/workflows/ios.yml` kompiluje projekt na macOS (symulator, bez podpisu) przy każdej zmianie w `ios/`.

## Wersje TEST i PROD, aktualizacje
| | Adres | Skąd | Kiedy się zmienia |
|---|---|---|---|
| **TEST** (web) | https://madrymaciej.github.io/SzybkieCzytanie/ | gałąź `main` | po każdym pushu — od razu |
| **PROD** (aplikacja na iPhonie) | https://madrymaciej.github.io/SzybkieCzytanie/prod/ | gałąź `prod` | tylko przy wydaniu |

- Każda zmiana trafia najpierw do TEST. Wydanie na iPhone'a (PROD = obecny TEST) uruchamia właściciel:
  `gh workflow run pages.yml -f release=true` albo GitHub → Actions → „Testy i publikacja…” → Run workflow → ✓ release.
- Aplikacja pobiera nową wersję w tle i pokazuje pasek **„Dostępna aktualizacja — Zainstaluj / Później”**.
  Bez zgody instaluje się sama przy pierwszym uruchomieniu po nocy (po 3:00) — jeśli akurat nie trwa ćwiczenie.
- Aktualizacja wymienia tylko pliki aplikacji. **Dane (wyniki, poziomy, plan, biblioteka) zostają** — są w localStorage/IndexedDB
  domeny `madrymaciej.github.io`, wspólnej dla obu ścieżek. Nie zmieniać `Store.key` ani `DB_NAME`; migracje danych tylko dodają/zmieniają, nigdy nie kasują.
- Kod natywny (Swift) zmienia się rzadko; po jego zmianie apkę trzeba ponownie zainstalować z Xcode (⌘R) — dane zostają.
