-- ============================================================================
-- KEILHOF — Dateispeicher privat, Teil 2: Speicher schließen
-- Voraussetzung: App ab Version 2026-11-09.1 (zeigt Dateien über zeitlich
-- begrenzte Links an). Am besten vorher NACHTRAG_DATEIPFADE.sql ausführen.
--
-- 1. Speicher "hof-management" wird privat: Links ".../object/public/..." liefern
--    danach ohne Anmeldung einen Fehler.
-- 2. Alle bisherigen Regeln für diesen Speicher werden entfernt (auch solche mit
--    anderem Namen, z.B. im Dashboard angelegte) und durch drei neue ersetzt:
--    lesen, hochladen und löschen nur für angemeldete UND freigeschaltete Nutzer.
-- Einmal im Supabase SQL Editor ausführen; darf auch mehrfach laufen.
-- Supabase warnt wegen "drop policy" - es werden nur Regeln ersetzt, keine
-- Dateien gelöscht -> "Run query".
-- ============================================================================
update storage.buckets set public = false where id = 'hof-management';

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and (coalesce(qual, '') || coalesce(with_check, '')) like '%hof-management%'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

create policy "aktive nutzer lesen dateien" on storage.objects for select to authenticated
  using (bucket_id = 'hof-management' and public.is_active_user());
create policy "aktive nutzer laden hoch" on storage.objects for insert to authenticated
  with check (bucket_id = 'hof-management' and public.is_active_user());
create policy "aktive nutzer loeschen dateien" on storage.objects for delete to authenticated
  using (bucket_id = 'hof-management' and public.is_active_user());

-- Kontrolle: Speicher privat? Welche Regeln gelten? Plus ein Test-Link: diesen in
-- einem privaten Browserfenster öffnen - er muss jetzt einen Fehler liefern.
select 'Speicher öffentlich?' as was, (select public::text from storage.buckets where id = 'hof-management') as wert
union all
select 'Regel: ' || policyname, cmd || ' für ' || array_to_string(roles, ',')
  from pg_policies where schemaname = 'storage' and tablename = 'objects'
union all
select 'Test-Link (muss Fehler liefern)',
  'https://zaaqjqlhnhpjzvdfmyqj.supabase.co/storage/v1/object/public/hof-management/' || name
  from (select name from storage.objects where bucket_id = 'hof-management' order by created_at limit 1) x;
