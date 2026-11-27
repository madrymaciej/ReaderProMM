// Połączenie z Supabase (projekt „MM-apps”, Frankfurt, schemat szybkie_czytanie).
// Klucz publiczny (sb_publishable_…) może być w repozytorium: dane chroni logowanie + RLS (wiersz widzi tylko właściciel).
// NIGDY nie wpisuj tu klucza service_role / secret.
// Aplikacja jest prywatna: przy ustawionym adresie bez zalogowania widać tylko ekran logowania.
// Puste wartości = synchronizacja i logowanie wyłączone (aplikacja działa tylko lokalnie).
export const SUPABASE = {
  url: 'https://blwrnbzqqhnprriezahy.supabase.co',
  key: 'sb_publishable_Mp90YBT1elzHwilDzJrDiQ_WHAtAWXj',
  schema: 'szybkie_czytanie',
};
