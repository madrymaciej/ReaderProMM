# Aplikacja natywna iOS „Szybkie czytanie” (z rozszerzeniem „Udostępnij”)

## Jak to działa
- **Aplikacja** (`ios/App`) wyświetla aplikację webową z https://madrymaciej.github.io/SzybkieCzytanie/ w WKWebView
  (te same ćwiczenia i czytnik; aktualizacje przychodzą same, działa offline dzięki service workerowi).
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
