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
4. W Xcode, dla **obu** celów (SzybkieCzytanie i ShareExtension) → *Signing & Capabilities* → **Team**: Twoje konto.
   Xcode sam zarejestruje identyfikatory i App Group.
5. Podłącz iPhone'a kablem (pierwszy raz: na iPhonie *Ustawienia → Prywatność i ochrona → Tryb dewelopera* → włącz, restart).
6. Wybierz iPhone'a u góry i ▶︎ **Run** (⌘R).

## Przeniesienie danych z wersji webowej
Stara ikona (PWA) → Ustawienia → **Eksportuj kopię danych** → zapisz w Plikach.
Aplikacja natywna → Ustawienia → **Importuj kopię danych**.

## Automatyczna kontrola
`.github/workflows/ios.yml` kompiluje projekt na macOS (symulator, bez podpisu) przy każdej zmianie w `ios/`.
