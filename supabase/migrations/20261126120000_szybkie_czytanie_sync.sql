-- Synchronizacja SzybkieCzytanie — schemat `szybkie_czytanie` w projekcie Supabase „MM-apps” (Frankfurt).
-- Każdy wiersz należy do jednego użytkownika (user_id = auth.uid()); RLS wpuszcza tylko właściciela.
-- Rola `anon` (klucz publiczny bez logowania) ma dostęp wyłącznie do funkcji ping() — bez żadnych danych.

create schema if not exists szybkie_czytanie;

-- Dostęp do schematu: tylko zalogowani + anon do ping(). Nic nie jest nadawane automatycznie.
revoke all on schema szybkie_czytanie from public;
grant usage on schema szybkie_czytanie to authenticated, anon, service_role;
alter default privileges in schema szybkie_czytanie revoke all on tables from anon, authenticated, public;
alter default privileges in schema szybkie_czytanie revoke all on functions from anon, authenticated, public;

/* ---------- Tabele ---------- */

-- Jedna sesja ćwiczenia. Łączenie: suma wierszy z obu urządzeń; usunięcie = usuniety = true.
create table szybkie_czytanie.wyniki (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  cwiczenie  text    not null check (length(cwiczenie) <= 64),
  t          bigint  not null,                         -- znacznik czasu sesji (ms, z urządzenia)
  v          double precision not null,
  extra      jsonb   not null default '{}'::jsonb,
  nazwa      text,
  jednostka  text,
  usuniety   boolean not null default false,
  ts         bigint  not null,                         -- czas ostatniej zmiany (ms, z urządzenia)
  zmieniono  timestamptz not null default now(),       -- czas serwera (kursor pobierania)
  primary key (user_id, cwiczenie, t)
);

-- Ustawienia, poziomy, plan dnia, statystyki czytania (klucz → wartość). Najnowsza wersja wygrywa.
create table szybkie_czytanie.stan (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  klucz      text    not null check (length(klucz) <= 128),
  wartosc    jsonb,
  usuniety   boolean not null default false,
  ts         bigint  not null,
  zmieniono  timestamptz not null default now(),
  primary key (user_id, klucz)
);

-- Metadane biblioteki (tytuł, pozycja czytania, zakładki…). Najnowsza wersja wygrywa.
create table szybkie_czytanie.dokumenty (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  id         text    not null check (length(id) <= 64),
  meta       jsonb   not null default '{}'::jsonb,
  usuniety   boolean not null default false,
  ts         bigint  not null,
  zmieniono  timestamptz not null default now(),
  primary key (user_id, id)
);

-- Pełne teksty (książki, prasówki). Osobno i poza Realtime: tekst może mieć kilka MB,
-- a zmiana pozycji czytania nie powinna przesyłać go ponownie.
create table szybkie_czytanie.teksty (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  id         text    not null check (length(id) <= 64),
  tekst      text    not null,
  zmieniono  timestamptz not null default now(),
  primary key (user_id, id)
);

create index wyniki_kursor    on szybkie_czytanie.wyniki    (user_id, zmieniono);
create index stan_kursor      on szybkie_czytanie.stan      (user_id, zmieniono);
create index dokumenty_kursor on szybkie_czytanie.dokumenty (user_id, zmieniono);

/* ---------- Wyzwalacze: czas serwera + „najnowsza wersja wygrywa” ---------- */

-- Starszy zapis (np. z kolejki urządzenia, które długo było offline) nie nadpisuje nowszego.
create or replace function szybkie_czytanie.najnowszy_wygrywa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.ts < old.ts then
    return null;                 -- pomiń aktualizację tego wiersza
  end if;
  new.zmieniono := clock_timestamp();
  return new;
end;
$$;

create or replace function szybkie_czytanie.ustaw_zmieniono()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.zmieniono := clock_timestamp();
  return new;
end;
$$;

create trigger lww before insert or update on szybkie_czytanie.wyniki
  for each row execute function szybkie_czytanie.najnowszy_wygrywa();
create trigger lww before insert or update on szybkie_czytanie.stan
  for each row execute function szybkie_czytanie.najnowszy_wygrywa();
create trigger lww before insert or update on szybkie_czytanie.dokumenty
  for each row execute function szybkie_czytanie.najnowszy_wygrywa();
create trigger zmieniono before insert or update on szybkie_czytanie.teksty
  for each row execute function szybkie_czytanie.ustaw_zmieniono();

/* ---------- Uprawnienia + RLS ---------- */

grant select, insert, update, delete on
  szybkie_czytanie.wyniki, szybkie_czytanie.stan, szybkie_czytanie.dokumenty, szybkie_czytanie.teksty
  to authenticated;

alter table szybkie_czytanie.wyniki    enable row level security;
alter table szybkie_czytanie.stan      enable row level security;
alter table szybkie_czytanie.dokumenty enable row level security;
alter table szybkie_czytanie.teksty    enable row level security;

-- (select auth.uid()) — wyliczane raz na zapytanie (zalecenie Supabase dla wydajności RLS).
create policy wlasciciel on szybkie_czytanie.wyniki for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy wlasciciel on szybkie_czytanie.stan for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy wlasciciel on szybkie_czytanie.dokumenty for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy wlasciciel on szybkie_czytanie.teksty for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

/* ---------- Realtime (bez tabeli teksty) ---------- */

alter publication supabase_realtime add table
  szybkie_czytanie.wyniki, szybkie_czytanie.stan, szybkie_czytanie.dokumenty;

/* ---------- Podtrzymanie darmowego projektu (GitHub Actions) ---------- */

-- Zwraca tylko liczbę — żadnych danych. Jedyne, co może wywołać rola anon.
create or replace function szybkie_czytanie.ping()
returns integer
language sql
stable
set search_path = ''
as $$ select 1 $$;

revoke all on function szybkie_czytanie.ping() from public;
grant execute on function szybkie_czytanie.ping() to anon, authenticated;
