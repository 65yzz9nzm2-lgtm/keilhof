-- ============================================================================
-- KEILHOF — MODUL IMKEREI (Datenmodell)
-- Einmal im Supabase SQL Editor ausführen: SQL Editor -> New query -> alles
-- einfügen -> Run. Setzt voraus, dass KEILHOF_SETUP.sql bereits gelaufen ist
-- (nutzt is_active_user()/is_admin() von dort).
-- Das Skript darf auch mehrfach laufen: bestehende Tabellen bleiben unverändert.
-- ============================================================================

-- Eigener Betriebskodex für die Imkerei (Einstellungen -> Betrieb)
alter table public.betrieb add column if not exists betriebskodex_imkerei text;

-- ============================================================================
-- BIENENSTÄNDE
-- ============================================================================
create table if not exists public.bienenstaende (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  standort text,                 -- Ortsbeschreibung, z.B. "oberhalb Stadel"
  lat numeric, lng numeric,      -- Koordinaten (WGS84)
  foto_url text, notiz text,
  erstellt_von text, erstellt_am timestamptz default now(), aktiv boolean default true
);

-- ============================================================================
-- VÖLKER
-- status: Aktiv | Aufgelöst | Verkauft | Abgeschwärmt | Eingegangen
-- Ein Volk wird nie wirklich gelöscht (Historie) - "Löschen" blendet es nur aus
-- (aktiv=false), der Lebenslauf steckt in status + voelker_ereignisse.
-- eingangsdatum/abgangsdatum: seit wann/bis wann das Volk zum Betrieb gehört -
-- Grundlage für die Zählung aktiver Völker zu einem Stichtag.
-- qr_code: kurzer, eigener Code für das Beuten-Etikett (unabhängig von der id,
-- damit ein Etikett ersetzt werden kann).
-- ============================================================================
create table if not exists public.voelker (
  id uuid primary key default gen_random_uuid(),
  bienenstand_id uuid references public.bienenstaende(id),
  nummer text, name text,
  beutentyp text,
  status text not null default 'Aktiv',
  herkunft text,                 -- z.B. Ableger, Schwarm, Kauf
  muttervolk_id uuid references public.voelker(id) on delete set null,
  eingangsdatum date, abgangsdatum date,
  qr_code text unique not null default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  foto_url text, notiz text,
  erstellt_von text, erstellt_am timestamptz default now(), aktiv boolean default true
);

-- ============================================================================
-- VOLKS-EREIGNISSE (Lebenslauf eines Volkes)
-- typ: Ableger gebildet | Vereinigt | Schwarm | Auflösung/Verlust | Standortwechsel
-- partner_volk_id: das jeweils andere Volk (neuer Ableger, eingefangener Schwarm,
--   Volk, mit dem vereinigt wurde)
-- von_/nach_bienenstand_id: bei Standortwechsel - damit lässt sich für jeden
--   Stichtag rekonstruieren, wo ein Volk stand.
-- ============================================================================
create table if not exists public.voelker_ereignisse (
  id uuid primary key default gen_random_uuid(),
  volk_id uuid references public.voelker(id) on delete cascade,
  datum date not null,
  typ text not null,
  partner_volk_id uuid references public.voelker(id) on delete set null,
  von_bienenstand_id uuid references public.bienenstaende(id) on delete set null,
  nach_bienenstand_id uuid references public.bienenstaende(id) on delete set null,
  grund text, notiz text,
  erfasst_von text, erfasst_am timestamptz default now()
);

-- ============================================================================
-- KÖNIGINNEN
-- aktuell: ist das die derzeitige Königin des Volkes (in der App "aktiv")?
-- (bewusst nicht "aktiv" genannt - diese Spalte bedeutet in der App "ausgeblendet")
-- Bewertungen als Zahl, die Skala legt die Oberfläche fest.
-- ============================================================================
create table if not exists public.koeniginnen (
  id uuid primary key default gen_random_uuid(),
  volk_id uuid references public.voelker(id) on delete cascade,
  jahrgang int,
  farbe text, zeichnung text,
  herkunft text,
  eingesetzt_am date,
  sanftmut int, wabensitz int, schwarmneigung int, leistung int,
  aktuell boolean default true,
  notiz text,
  erstellt_von text, erstellt_am timestamptz default now()
);

-- ============================================================================
-- DURCHSICHTEN: ein Kopf (Datum/Wetter/Notiz) für mehrere Völker gleichzeitig,
-- die Werte je Volk stehen direkt in der Verknüpfungstabelle durchsicht_voelker.
-- ============================================================================
create table if not exists public.durchsichten (
  id uuid primary key default gen_random_uuid(),
  datum date not null,
  wetter text, temperatur_c numeric,
  notiz text,
  erfasst_von text, erfasst_am timestamptz default now()
);

create table if not exists public.durchsicht_voelker (
  id uuid primary key default gen_random_uuid(),
  durchsicht_id uuid not null references public.durchsichten(id) on delete cascade,
  volk_id uuid not null references public.voelker(id) on delete cascade,
  brutwaben numeric,
  koenigin_gesehen boolean,
  stifte boolean,
  weiselzellen int,
  futterwaben numeric,
  volksstaerke numeric,
  sanftmut int,
  notiz text,
  unique (durchsicht_id, volk_id)
);

-- ============================================================================
-- BEHANDLUNGEN und FÜTTERUNGEN: eine Zeile pro Volk. Wird für mehrere Völker
-- gemeinsam erfasst, bekommen alle Zeilen dieselbe sammel_id.
-- ============================================================================
create table if not exists public.behandlungen (
  id uuid primary key default gen_random_uuid(),
  volk_id uuid references public.voelker(id) on delete cascade,
  datum date not null, datum_bis date,
  mittel text, wirkstoff text, chargennummer text,
  menge numeric, einheit text,
  methode text,
  wartezeit_tage int,
  bezugsquelle text, tierarzt text,
  sammel_id uuid,
  notiz text,
  erfasst_von text, erfasst_am timestamptz default now()
);

create table if not exists public.fuetterungen (
  id uuid primary key default gen_random_uuid(),
  volk_id uuid references public.voelker(id) on delete cascade,
  datum date not null,
  futterart text,
  menge numeric, einheit text,   -- kg | Liter
  sammel_id uuid,
  notiz text,
  erfasst_von text, erfasst_am timestamptz default now()
);

-- ============================================================================
-- VARROA-KONTROLLEN
-- methode: Gemüllwindel | Puderzucker | Auswaschen
-- milben_anzahl = gezählte Milben; zeitraum_tage nur bei Gemüllwindel
-- (Milben/Tag = milben_anzahl / zeitraum_tage, wird in der App berechnet)
-- ============================================================================
create table if not exists public.varroa_kontrollen (
  id uuid primary key default gen_random_uuid(),
  volk_id uuid references public.voelker(id) on delete cascade,
  datum date not null,
  methode text,
  milben_anzahl numeric,
  zeitraum_tage numeric,
  notiz text,
  erfasst_von text, erfasst_am timestamptz default now()
);

-- ============================================================================
-- HONIGERNTEN: Kopf mit Gesamtmenge + Verknüpfung zu den beteiligten Völkern
-- (Menge je Volk optional - lässt sich oft nicht genau aufteilen).
-- ============================================================================
create table if not exists public.honigernten (
  id uuid primary key default gen_random_uuid(),
  datum date not null,
  sorte text,
  menge_kg numeric,
  wassergehalt numeric,          -- in %
  losnummer text,
  notiz text,
  erfasst_von text, erfasst_am timestamptz default now()
);

create table if not exists public.honigernte_voelker (
  id uuid primary key default gen_random_uuid(),
  honigernte_id uuid not null references public.honigernten(id) on delete cascade,
  volk_id uuid not null references public.voelker(id) on delete cascade,
  menge_kg numeric,
  unique (honigernte_id, volk_id)
);

-- ============================================================================
-- AUFGABEN (für ein Volk oder einen ganzen Bienenstand)
-- ============================================================================
create table if not exists public.bienen_aufgaben (
  id uuid primary key default gen_random_uuid(),
  volk_id uuid references public.voelker(id) on delete cascade,
  bienenstand_id uuid references public.bienenstaende(id) on delete cascade,
  titel text not null,
  faellig_am date,
  erledigt boolean default false, erledigt_am date,
  notiz text,
  erstellt_von text, erstellt_am timestamptz default now()
);

-- ============================================================================
-- INDIZES auf Fremdschlüsseln
-- ============================================================================
create index if not exists voelker_bienenstand_idx on public.voelker (bienenstand_id);
create index if not exists voelker_muttervolk_idx on public.voelker (muttervolk_id);
create index if not exists voelker_ereignisse_volk_idx on public.voelker_ereignisse (volk_id);
create index if not exists koeniginnen_volk_idx on public.koeniginnen (volk_id);
create index if not exists durchsicht_voelker_durchsicht_idx on public.durchsicht_voelker (durchsicht_id);
create index if not exists durchsicht_voelker_volk_idx on public.durchsicht_voelker (volk_id);
create index if not exists behandlungen_volk_idx on public.behandlungen (volk_id);
create index if not exists fuetterungen_volk_idx on public.fuetterungen (volk_id);
create index if not exists varroa_kontrollen_volk_idx on public.varroa_kontrollen (volk_id);
create index if not exists honigernte_voelker_ernte_idx on public.honigernte_voelker (honigernte_id);
create index if not exists honigernte_voelker_volk_idx on public.honigernte_voelker (volk_id);
create index if not exists bienen_aufgaben_volk_idx on public.bienen_aufgaben (volk_id);
create index if not exists bienen_aufgaben_stand_idx on public.bienen_aufgaben (bienenstand_id);

-- ============================================================================
-- ROW LEVEL SECURITY — gleiche Regeln wie alle anderen Tabellen:
-- freigeschaltete Nutzer lesen/anlegen/bearbeiten, Löschen nur Admins.
-- ============================================================================
alter table public.bienenstaende enable row level security;
alter table public.voelker enable row level security;
alter table public.voelker_ereignisse enable row level security;
alter table public.koeniginnen enable row level security;
alter table public.durchsichten enable row level security;
alter table public.durchsicht_voelker enable row level security;
alter table public.behandlungen enable row level security;
alter table public.fuetterungen enable row level security;
alter table public.varroa_kontrollen enable row level security;
alter table public.honigernten enable row level security;
alter table public.honigernte_voelker enable row level security;
alter table public.bienen_aufgaben enable row level security;

do $$
declare
  t text;
  tables text[] := array[
    'bienenstaende','voelker','voelker_ereignisse','koeniginnen','durchsichten',
    'durchsicht_voelker','behandlungen','fuetterungen','varroa_kontrollen',
    'honigernten','honigernte_voelker','bienen_aufgaben'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "select_active" on public.%I;', t);
    execute format('drop policy if exists "insert_active" on public.%I;', t);
    execute format('drop policy if exists "update_active" on public.%I;', t);
    execute format('drop policy if exists "delete_admin" on public.%I;', t);
    execute format('create policy "select_active" on public.%I for select using (public.is_active_user());', t);
    execute format('create policy "insert_active" on public.%I for insert with check (public.is_active_user());', t);
    execute format('create policy "update_active" on public.%I for update using (public.is_active_user()) with check (public.is_active_user());', t);
    execute format('create policy "delete_admin" on public.%I for delete using (public.is_admin());', t);
  end loop;
end $$;
