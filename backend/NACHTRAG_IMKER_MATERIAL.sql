-- ============================================================================
-- KEILHOF — Nachtrag: Imkerei-Material & Einkaufsliste
-- Einmal im Supabase SQL Editor ausführen (darf auch mehrfach laufen).
-- Supabase warnt wegen "drop policy" - das betrifft nur die Regeln dieser
-- neuen Tabelle, es werden keine Daten gelöscht -> "Run query".
-- ============================================================================
create table if not exists public.imker_material (
  id uuid primary key default gen_random_uuid(),
  kategorie text, bezeichnung text not null,
  menge_vorhanden numeric, einheit text, mindest_bestand numeric,
  auf_einkaufsliste boolean default false, einkauf_menge numeric,
  bezugsquelle text, preis_je_einheit numeric, notiz text,
  erstellt_von text, erstellt_am timestamptz default now(), aktiv boolean default true
);

alter table public.imker_material enable row level security;
drop policy if exists "select_active" on public.imker_material;
drop policy if exists "insert_active" on public.imker_material;
drop policy if exists "update_active" on public.imker_material;
drop policy if exists "delete_admin" on public.imker_material;
create policy "select_active" on public.imker_material for select using (public.is_active_user());
create policy "insert_active" on public.imker_material for insert with check (public.is_active_user());
create policy "update_active" on public.imker_material for update using (public.is_active_user()) with check (public.is_active_user());
create policy "delete_admin" on public.imker_material for delete using (public.is_admin());

notify pgrst, 'reload schema';
