// Numer wydania — podmieniany przez GitHub Actions przy publikacji (lokalnie zostaje '__BUILD__').
export const BUILD = '__BUILD__';
// Kanał: PROD = aplikacja na iPhonie (/prod/), TEST = wersja web.
export const CHANNEL = location.pathname.includes('/prod/') ? 'prod' : 'test';
