// Połączenie z Supabase (projekt „madry-apps”, schemat szybkie_czytanie).
// Klucz publiczny (sb_publishable_…) może być w repozytorium: dane chroni logowanie + RLS (wiersz widzi tylko właściciel).
// NIGDY nie wpisuj tu klucza service_role / secret.
// Puste wartości = synchronizacja wyłączona (aplikacja działa jak dotąd, tylko lokalnie).
export const SUPABASE = {
  url: '',          // np. https://abcdefghijklmnop.supabase.co
  key: '',          // sb_publishable_…
  schema: 'szybkie_czytanie',
};
