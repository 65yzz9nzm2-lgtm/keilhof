-- ============================================================================
-- KEILHOF — Nachtrag: Behandlungen um Bestandsbuch-Angaben ergänzen
-- (Kaufdatum, Belegnummer, behandelnde Person). Darf mehrfach laufen.
-- ============================================================================
alter table public.behandlungen add column if not exists kaufdatum date;
alter table public.behandlungen add column if not exists belegnummer text;
alter table public.behandlungen add column if not exists behandelnde_person text;
notify pgrst, 'reload schema';
