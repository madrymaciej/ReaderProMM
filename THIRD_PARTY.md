# Komponenty zewnętrzne

- **pdf.js 3.11.174** (Mozilla, licencja Apache-2.0) — `vendor/pdfjs/`, pełny tekst licencji w `vendor/pdfjs/LICENSE`.
  Używany wyłącznie do odczytu tekstu z importowanych plików PDF; ładowany dopiero przy pierwszym imporcie PDF.
- **supabase-js 2.119.0** (Supabase, licencja MIT) — `vendor/supabase/supabase.min.js` (oficjalny build UMD z npm), licencja w `vendor/supabase/LICENSE`.
  Ładowany dopiero przy logowaniu do synchronizacji lub gdy jesteś zalogowany.
