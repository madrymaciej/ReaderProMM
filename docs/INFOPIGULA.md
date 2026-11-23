# Infopiguła z Gmaila → Biegające słowa i Biblioteka

Codzienne wydanie newslettera Infopiguła (od `newsletter@infopigula.pl`) trafia do aplikacji
**bezpośrednio z Twojego konta Google** — przez mały skrypt Google Apps Script działający na Twoim koncie.
Treść nie jest publikowana w repozytorium ani na stronie (to płatna, chroniona prawem autorskim prasówka,
a w mailu jest też Twój osobisty link do wypisania się — aplikacja go usuwa).

## Instalacja skryptu (raz, ok. 5 min)
1. Otwórz https://script.google.com → **Nowy projekt** → nazwij go „Szybkie czytanie – Infopiguła”.
2. Wklej całą zawartość pliku [`tools/infopigula/Code.gs`](../tools/infopigula/Code.gs) w miejsce domyślnego kodu → zapisz (⌘S).
3. Z listy funkcji u góry wybierz **`ustawToken`** → **Uruchom** → zezwól na dostęp do Gmaila (Twoje konto, odczyt wiadomości).
   W **Dzienniku wykonań** pojawi się `Twój token: …` — skopiuj go.
4. **Wdróż → Nowe wdrożenie** → typ: **Aplikacja internetowa**:
   - *Wykonaj jako*: **Ja**,
   - *Kto ma dostęp*: **Każdy** (dostęp i tak chroni token; bez tego aplikacja na iPhonie nie może pobrać danych).
   → **Wdróż** → skopiuj **adres URL aplikacji internetowej** (kończy się na `/exec`).
5. W aplikacji: **Ustawienia** (koło zębate na ekranie głównym) → **Infopiguła z Gmaila** → wklej adres w postaci
   `https://script.google.com/macros/s/…/exec?token=TWÓJ_TOKEN` → **Zapisz i sprawdź połączenie**.

## Jak działa w aplikacji
- Raz dziennie (przy otwarciu aplikacji) pobiera najnowsze wydanie i dodaje je do **Biblioteki** jako „Infopiguła DD.MM.RRRR”.
- W **Biegających słowach** pojawia się tekst **📰 Infopiguła (dziś)**. Wydanie jest dłuższe niż minuta czytania,
  więc każda kolejna sesja **wznawia od miejsca, w którym skończyłeś**; po przeczytaniu całości zaczyna od początku.
- Z tekstu usuwane są: linki i źródła, nagłówek, stopka, sekcja „Twórcy”, link do wypisania się,
  dopiski „(2 źródła)”, oraz newsy oznaczone jako „brutalne treści”.

## Bezpieczeństwo
- Token jest zapisany we właściwościach skryptu (nie w kodzie) i w aplikacji na Twoim telefonie.
- Gdyby token wyciekł: uruchom ponownie `ustawToken` (stary przestaje działać) i wklej nowy adres w aplikacji.
- Skrypt tylko **czyta** maile od `newsletter@infopigula.pl` z ostatnich 10 dni.
