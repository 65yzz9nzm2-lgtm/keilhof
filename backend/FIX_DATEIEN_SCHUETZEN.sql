-- ============================================================================
-- KEILHOF — Dateispeicher absichern
-- Bisher durfte JEDER (auch ohne Anmeldung, nur mit dem öffentlichen API-Key)
-- die Liste aller Dateien im Speicher "hof-management" abrufen und so Fotos,
-- Belege und Dokumente finden. Ab jetzt dürfen das nur freigeschaltete Nutzer.
-- Einmal im Supabase SQL Editor ausführen.
-- HINWEIS: Überholt durch NACHTRAG_DATEIEN_PRIVAT.sql (Speicher ganz privat,
-- Regeln nur für angemeldete, freigeschaltete Nutzer). Das bitte stattdessen ausführen.
-- ============================================================================
drop policy if exists "jeder liest oeffentliche dateien" on storage.objects;
drop policy if exists "aktive nutzer lesen dateien" on storage.objects;
create policy "aktive nutzer lesen dateien" on storage.objects for select
  using (bucket_id = 'hof-management' and public.is_active_user());
