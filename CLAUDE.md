# Zasady pracy w tym repozytorium

- **TEST = wersja web** (gałąź `main`, https://madrymaciej.github.io/SzybkieCzytanie/), **PROD = aplikacja na iPhonie** (gałąź `prod`, ścieżka `/prod/`). Szczegóły: docs/IOS.md → „Wersje TEST i PROD”.
- Każdą zmianę wrzucaj najpierw do TEST (push na `main`). **Nie wydawaj na PROD samodzielnie** — wydanie (`gh workflow run pages.yml -f release=true`) uruchamia właściciel lub robisz to tylko na jego wyraźną prośbę.
- **Nigdy nie kasuj zapisanych danych** użytkownika (wyniki, poziomy, plan, biblioteka) — ani w migracjach, ani przy aktualizacji. Nie zmieniaj `Store.key` (js/app.js) ani `DB_NAME` (js/db.js). Service worker usuwa tylko własne cache plików.
- Numer wydania (`__BUILD__` w sw.js i js/version.js) podstawia workflow — nie trzeba ręcznie podbijać wersji.
