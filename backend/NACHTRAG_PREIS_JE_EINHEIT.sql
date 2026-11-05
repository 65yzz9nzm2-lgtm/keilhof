-- ============================================================================
-- KEILHOF — Nachtrag: Preis je Einheit bei Verkäufen (z.B. Honig €/kg)
-- Einmal im Supabase SQL Editor ausführen (darf auch mehrfach laufen).
-- ============================================================================
alter table public.erntevermarktung add column if not exists preis_je_einheit numeric;
