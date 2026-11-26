# Synchronizacja między urządzeniami (Supabase)

Wyniki, poziomy, plan dnia, ustawienia i biblioteka (z prasówkami) są wspólne dla aplikacji iOS i PWA w Safari.
Każde urządzenie zapisuje wszystko **najpierw lokalnie** (jak dotąd). Gdy jest sieć, zmiany idą do chmury i prawie
od razu (Realtime) pojawiają się na drugim urządzeniu. Bez sieci zmiany czekają w kolejce i wysyłają się po jej powrocie.

## Jak łączone są dane

| Dane | Zasada | Tabela |
|---|---|---|
| Wyniki ćwiczeń | **suma** — historia z obu urządzeń; „Zakończ i nie zapisuj” usuwa sesję wszędzie | `wyniki` |
| Poziomy, plan dnia, ustawienia ćwiczeń i czytnika | **najnowsza zmiana wygrywa** (także po długim offline — starszy zapis z kolejki nie nadpisze nowszego) | `stan` |
| Statystyki czytania | każde urządzenie liczy swoje, wyświetlana jest suma | `stan` (`read@…`) |
| Biblioteka: tytuł, pozycja, zakładki | najnowsza zmiana wygrywa | `dokumenty` |
| Pełne teksty (książki, prasówki) | zapisywane raz, pobierane przy pierwszej synchronizacji | `teksty` (poza Realtime) |

**Nie są synchronizowane** (zostają na urządzeniu): adres skryptu Infopiguły (zawiera prywatny token), ostatnio
otwarta zakładka ekranu głównego, teksty wbudowane, pamięć podręczna wydania Infopiguły.
Przy **pierwszym** logowaniu urządzenia wartości ustawień, które są już w chmurze, wygrywają nad lokalnymi.

## Bezpieczeństwo

- Logowanie e-mail + hasło (Supabase Auth), **jedno konto**, rejestracja nowych kont wyłączona.
- W aplikacji jest tylko **klucz publiczny** (`sb_publishable_…`, w `js/config.js`). Dane chroni RLS:
  każdy wiersz ma `user_id`, a polityka wpuszcza wyłącznie właściciela (`user_id = auth.uid()`).
- Bez logowania (rola `anon`) dostępna jest tylko funkcja `ping()` — zwraca liczbę 1, żadnych danych.
- Klucza `service_role` / secret **nie ma** w repozytorium ani w aplikacji. Nie ma własnego serwera.
- Service worker nie zapisuje odpowiedzi Supabase w pamięci podręcznej (prywatne dane nie lądują w cache).

## Konfiguracja (raz)

Projekt Supabase **„madry-apps”** (region Frankfurt, `eu-central-1`) jest wspólny dla prywatnych aplikacji; ta używa schematu `szybkie_czytanie`.

1. **Załóż projekt**: https://supabase.com/dashboard → New project → nazwa `madry-apps`, region *Central EU (Frankfurt)*, plan Free.
   Hasło bazy zapisz w menedżerze haseł (aplikacja go nie potrzebuje).
2. **Schemat i tabele**: SQL Editor → wklej całość z [`supabase/migrations/20261126120000_szybkie_czytanie_sync.sql`](../supabase/migrations/20261126120000_szybkie_czytanie_sync.sql) → Run.
   (Może to też zrobić Claude przez connector Supabase.)
3. **Udostępnij schemat w API**: Project Settings → Data API → *Exposed schemas* → dodaj `szybkie_czytanie` → Save.
4. **Wyłącz rejestrację**: Authentication → Sign In / Providers → wyłącz *Allow new users to sign up*;
   *Email* zostaw włączony; *Anonymous sign-ins* — wyłączone.
5. **Utwórz swoje konto**: Authentication → Users → Add user → Create new user → e-mail + mocne hasło, zaznacz *Auto Confirm User*.
6. **Klucz publiczny**: Project Settings → API Keys → skopiuj *Publishable key* (`sb_publishable_…`) i adres projektu
   (`https://<ref>.supabase.co`) do `js/config.js`. Podbij `VERSION` w `sw.js`, commit, push.
7. **W aplikacji** (iPhone i PWA osobno): Ustawienia → ☁️ Synchronizacja → e-mail + hasło → *Zaloguj i synchronizuj*.
   iOS zaproponuje zapisanie hasła (aplikacja Hasła / pęk kluczy iCloud).

Nazwy pozycji w panelu Supabase mogą się nieco różnić — panel często się zmienia.

## Podtrzymanie darmowego projektu

Supabase wstrzymuje projekty Free po 7 dniach słabej aktywności (przywrócenie możliwe przez 90 dni).
Workflow [`.github/workflows/supabase-keepalive.yml`](../.github/workflows/supabase-keepalive.yml) co 3 dni wywołuje `ping()`.
Uwagi:
- Supabase nie podaje progu „wystarczającej aktywności” — jeśli projekt i tak zostanie wstrzymany, przywróć go w panelu i daj znać.
- GitHub wyłącza zaplanowane workflowy w publicznym repozytorium po 60 dniach bez aktywności w repo — dostaniesz e-mail;
  wystarczy włączyć workflow ponownie (Actions → workflow → Enable).
- Ręczne uruchomienie: Actions → „Supabase — podtrzymanie projektu” → Run workflow.

## Limity planu Free (stan z dokumentacji Supabase, XI 2026)

| Zasób | Limit Free | Zużycie tej aplikacji |
|---|---|---|
| Aktywne projekty | 2 (wstrzymane się nie liczą) | 1 (`madry-apps`) |
| Baza danych | 500 MB na projekt | wyniki: KB; teksty książek: po kilka MB |
| Egress | 5 GB / mies. | znikomy |
| Realtime | 200 połączeń, 2 mln wiadomości / mies., ładunek zmiany ≤ 1 MB | 2 połączenia, setki wiadomości |
| MAU (Auth) | 50 000 | 1 |

Teksty dłuższe niż 8 MB nie są wysyłane (zostają na urządzeniu, na którym je dodano).
