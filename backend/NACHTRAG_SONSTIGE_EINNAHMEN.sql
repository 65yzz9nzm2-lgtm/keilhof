-- ============================================================================
-- KEILHOF — Nachtrag: Sonstige Einnahmen (Förderungen, Beiträge, Prämien ...)
-- Einmal im Supabase SQL Editor ausführen (darf auch mehrfach laufen).
-- Gleiche Zugriffsregeln wie alle anderen Tabellen.
-- ============================================================================
create table if not exists public.sonstige_einnahmen (
  id uuid primary key default gen_random_uuid(),
  datum date, kategorie text, betrag numeric, beschreibung text, beleg_url text,
  erfasst_von text, erfasst_am timestamptz default now()
);

alter table public.sonstige_einnahmen enable row level security;
drop policy if exists "select_active" on public.sonstige_einnahmen;
drop policy if exists "insert_active" on public.sonstige_einnahmen;
drop policy if exists "update_active" on public.sonstige_einnahmen;
drop policy if exists "delete_admin" on public.sonstige_einnahmen;
create policy "select_active" on public.sonstige_einnahmen for select using (public.is_active_user());
create policy "insert_active" on public.sonstige_einnahmen for insert with check (public.is_active_user());
create policy "update_active" on public.sonstige_einnahmen for update using (public.is_active_user()) with check (public.is_active_user());
create policy "delete_admin" on public.sonstige_einnahmen for delete using (public.is_admin());
