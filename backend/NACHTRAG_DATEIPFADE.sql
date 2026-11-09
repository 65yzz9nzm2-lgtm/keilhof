-- ============================================================================
-- KEILHOF — Dateispeicher privat, Teil 1: gespeicherte Links in Pfade umwandeln
-- Vorher steht in der Datenbank die öffentliche Adresse einer Datei, z.B.
--   https://<projekt>.supabase.co/storage/v1/object/public/hof-management/Imkerei/<uuid>.jpg
-- danach nur noch der Pfad im Speicher:  Imkerei/<uuid>.jpg
-- Die App (ab Version 2026-11-09.1) holt sich damit beim Anzeigen einen zeitlich
-- begrenzten Link. Fremde Links (z.B. https://example.com/...) bleiben unverändert.
-- Einmal im Supabase SQL Editor ausführen; darf auch mehrfach laufen. Die Umstellung
-- läuft in einem Block: bei einem Fehler wird nichts geändert.
-- Das Ergebnis zeigt je Spalte: wie viele umgestellt wurden und wie viele öffentliche
-- Links danach noch übrig sind (muss überall 0 sein).
-- ============================================================================
drop table if exists pg_temp._dateipfade_ergebnis;
create temp table _dateipfade_ergebnis (wo text, umgestellt int, noch_oeffentlich int);

do $$
declare
  muster constant text := '^https?://[^/]+/storage/v1/object/public/hof-management/';
  r record;
  n int;
  rest int;
begin
  for r in select * from (values
    ('flaschenbestand','foto_url'), ('maschinen','foto_url'), ('bienenstaende','foto_url'), ('voelker','foto_url'),
    ('maschinen_kosten','beleg_url'), ('allgemeine_kosten','beleg_url'), ('sonstige_einnahmen','beleg_url'), ('tier_kosten','beleg_url')
  ) v(tabelle, spalte) where to_regclass('public.' || v.tabelle) is not null
  loop
    execute format(
      'update public.%I set %I = regexp_replace(regexp_replace(%I, $1, ''''), ''[?#].*$'', '''') where %I ~ $1',
      r.tabelle, r.spalte, r.spalte, r.spalte) using muster;
    get diagnostics n = row_count;
    execute format('select count(*) from public.%I where %I like ''%%/object/public/%%''', r.tabelle, r.spalte) into rest;
    insert into _dateipfade_ergebnis values (r.tabelle || '.' || r.spalte, n, rest);
  end loop;

  -- Dokumente der Maschinen: Liste von {name, url} - nur das Feld url umstellen
  select count(*) into n from public.maschinen m,
    jsonb_array_elements(case when jsonb_typeof(m.dokumente_json) = 'array' then m.dokumente_json else '[]' end) d
    where d->>'url' ~ muster;
  update public.maschinen m set dokumente_json = (
      select jsonb_agg(case when d->>'url' ~ muster
               then jsonb_set(d, '{url}', to_jsonb(regexp_replace(regexp_replace(d->>'url', muster, ''), '[?#].*$', '')))
               else d end order by i)
      from jsonb_array_elements(m.dokumente_json) with ordinality x(d, i))
    where jsonb_typeof(m.dokumente_json) = 'array'
      and exists (select 1 from jsonb_array_elements(m.dokumente_json) d where d->>'url' ~ muster);
  select count(*) into rest from public.maschinen m,
    jsonb_array_elements(case when jsonb_typeof(m.dokumente_json) = 'array' then m.dokumente_json else '[]' end) d
    where d->>'url' like '%/object/public/%';
  insert into _dateipfade_ergebnis values ('maschinen.dokumente_json (Dokumente)', n, rest);
end $$;

select * from _dateipfade_ergebnis;
