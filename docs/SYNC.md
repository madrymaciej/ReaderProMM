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

## Prywatność i bezpieczeństwo

- **Aplikacja jest prywatna.** Bez zalogowania widać tylko ekran logowania. Konta zakłada wyłącznie właściciel
  (panel Supabase); rejestracja nowych kont jest wyłączona. Po zalogowaniu sesja jest pamiętana — aplikacja działa też offline.
- **Każdy użytkownik widzi tylko swoje dane** (wyniki, poziomy, bibliotekę, prasówki): każdy wiersz ma `user_id`,
  a RLS wpuszcza wyłącznie właściciela (`user_id = auth.uid()`).
- W aplikacji jest tylko **klucz publiczny** (`sb_publishable_…`, w `js/config.js`). Bez logowania (rola `anon`)
  dostępna jest tylko funkcja `ping()` — zwraca liczbę 1, żadnych danych.
- Klucza `service_role` / secret **nie ma** w repozytorium ani w aplikacji. Nie ma własnego serwera.
- Service worker nie zapisuje odpowiedzi Supabase w pamięci podręcznej (prywatne dane nie lądują w cache).
- Kod aplikacji i strona (GitHub Pages) są publiczne — to świadoma decyzja: kod nie zawiera sekretów ani danych,
  a bez konta daje tylko ekran logowania.

## Projekt Supabase „MM-apps”

Wspólny projekt dla prywatnych aplikacji (region Central EU — Frankfurt, `eu-central-1`, plan Free):
każda aplikacja ma osobny schemat (`szybkie_czytanie`, `mahjong`, …), wspólne są konta użytkowników i limity.
Arca ma osobny projekt.

| Zadanie | Gdzie |
|---|---|
| Dodanie osoby (dziecko, znajomy) | Authentication → Users → Add user → Create new user → e-mail + hasło, ✓ Auto Confirm User |
| Odebranie dostępu | Authentication → Users → usuń konto (dostęp znika najpóźniej przy odświeżeniu sesji, ok. 1 h) |
| Rejestracja | Authentication → Sign In / Providers → *Allow new users to sign up*: wyłączone |
| Nowy schemat aplikacji w API | Project Settings → Data API → *Exposed schemas* |

Jedno konto działa we wszystkich aplikacjach projektu, ale dane każdej aplikacji są w jej schemacie,
a dane każdej osoby — tylko dla niej (chyba że aplikacja świadomie ma dane wspólne, jak ranking mahjonga).

## Konfiguracja (wykonana XI 2026)

1. Schemat i tabele: SQL z [`supabase/migrations/20261126120000_szybkie_czytanie_sync.sql`](../supabase/migrations/20261126120000_szybkie_czytanie_sync.sql)
   uruchomiony w SQL Editor projektu MM-apps.
2. Data API → Exposed schemas: `szybkie_czytanie`.
3. Rejestracja wyłączona, konta założone ręcznie.
4. Adres i klucz publiczny w `js/config.js`.
5. W aplikacji (iPhone i PWA osobno): ekran logowania → e-mail + hasło. iOS zaproponuje zapisanie hasła (aplikacja Hasła).

Nazwy pozycji w panelu Supabase mogą się nieco różnić — panel często się zmienia.

## Podtrzymanie darmowego projektu

Supabase wstrzymuje projekty Free po 7 dniach słabej aktywności (przywrócenie możliwe przez 90 dni).
Workflow [`.github/workflows/supabase-keepalive.yml`](../.github/workflows/supabase-keepalive.yml) co 3 dni wywołuje `szybkie_czytanie.ping()`;
mahjong ma własny ping co 2 dni — ten sam projekt, więc podtrzymanie jest podwójne.
Uwagi:
- Supabase nie podaje progu „wystarczającej aktywności” — jeśli projekt i tak zostanie wstrzymany, przywróć go w panelu i daj znać.
- GitHub wyłącza zaplanowane workflowy w publicznym repozytorium po 60 dniach bez aktywności w repo — dostaniesz e-mail;
  wystarczy włączyć workflow ponownie (Actions → workflow → Enable).
- Ręczne uruchomienie: Actions → „Supabase — podtrzymanie projektu” → Run workflow.

## Limity planu Free (stan z dokumentacji Supabase, XI 2026)

| Zasób | Limit Free | Zużycie tej aplikacji |
|---|---|---|
| Aktywne projekty | 2 (wstrzymane się nie liczą) | 1 (`MM-apps`, wspólny) + Arca |
| Baza danych | 500 MB na projekt | wyniki: KB; teksty książek: po kilka MB |
| Egress | 5 GB / mies. | znikomy |
| Realtime | 200 połączeń, 2 mln wiadomości / mies., ładunek zmiany ≤ 1 MB | 2 połączenia, setki wiadomości |
| MAU (Auth) | 50 000 | kilka osób |

Teksty dłuższe niż 8 MB nie są wysyłane (zostają na urządzeniu, na którym je dodano).
