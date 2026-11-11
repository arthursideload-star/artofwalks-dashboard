-- ArtOfWalks · internes Dashboard
--
-- Rein additiv: neue Tabellen mit Präfix dash_, Hilfsfunktionen im nicht
-- veröffentlichten Schema dash_intern, zusätzliche Lese-Policies für das Team
-- auf upload_anfragen und den Bucket auftrag-uploads. Bestehende Tabellen,
-- Policies und Funktionen der Website bleiben unverändert.
--
-- Zugriff: nur angemeldete Konten mit bestätigter E-Mail, deren Adresse in
-- public.dash_team steht. Kundenkonten der Website sehen nichts. anon nichts.

create schema if not exists dash_intern;
revoke all on schema dash_intern from public;
grant usage on schema dash_intern to authenticated;

-- Wer gehört zum Team?
create table public.dash_team (
  email text primary key
    check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text not null check (name in ('Arthur', 'Dean', 'Team')),
  created_at timestamptz not null default now()
);
comment on table public.dash_team is 'Dashboard: erlaubte Konten (Kleinbuchstaben-E-Mail) und wer sie sind.';

-- Ist das angemeldete Konto im Team? Nur mit bestätigter E-Mail.
create or replace function dash_intern.ist_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.dash_team t on t.email = lower(u.email)
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  );
$$;

-- Name des angemeldeten Teammitglieds (Arthur, Dean, Team) oder null.
create or replace function dash_intern.mein_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.name
  from auth.users u
  join public.dash_team t on t.email = lower(u.email)
  where u.id = auth.uid()
    and u.email_confirmed_at is not null;
$$;

revoke all on function dash_intern.ist_team() from public;
revoke all on function dash_intern.mein_name() from public;
grant execute on function dash_intern.ist_team() to authenticated;
grant execute on function dash_intern.mein_name() to authenticated;

-- Für die Oberfläche: wer bin ich? (null = kein Zugang)
create or replace function public.dash_ich()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select dash_intern.mein_name(); $$;
revoke all on function public.dash_ich() from public;
grant execute on function public.dash_ich() to authenticated;

create or replace function dash_intern.updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Tage des 30-Tage-Plans (Inhalt wird separat eingespielt, nicht im Repo)
create table public.dash_plantage (
  tag integer primary key check (tag between 1 and 366),
  datum date not null unique,
  woche integer,
  titel text check (char_length(titel) <= 200)
);

-- Aufgaben: aus dem Plan (quelle = plan) oder selbst angelegt (quelle = eigen).
-- Nicht erledigte Aufgaben vergangener Tage zeigt die Oberfläche am heutigen Tag
-- als "übernommen".
create table public.dash_aufgaben (
  id bigint generated always as identity primary key,
  tag integer,
  datum date not null,
  person text not null check (person in ('Arthur', 'Dean')),
  text text not null check (char_length(text) between 1 and 1000),
  dauer text check (char_length(dauer) <= 40),
  quelle text not null default 'eigen' check (quelle in ('plan', 'eigen')),
  sortierung integer not null default 0,
  erledigt_am timestamptz,
  erledigt_von text check (char_length(erledigt_von) <= 20),
  created_at timestamptz not null default now(),
  erstellt_von text default dash_intern.mein_name()
);
create index dash_aufgaben_datum on public.dash_aufgaben (datum);

-- Gemeinsame Notizen / Chat
create table public.dash_notizen (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  autor text not null default dash_intern.mein_name(),
  text text not null check (char_length(text) between 1 and 4000),
  angeheftet boolean not null default false
);
create index dash_notizen_created on public.dash_notizen (created_at desc);

-- Leads / Pipeline
create table public.dash_leads (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  firma text not null check (char_length(firma) between 1 and 200),
  ansprechpartner text check (char_length(ansprechpartner) <= 200),
  email text check (char_length(email) <= 254),
  telefon text check (char_length(telefon) <= 50),
  ort text check (char_length(ort) <= 120),
  website text check (char_length(website) <= 300),
  kanal text not null default 'Sonstiges'
    check (kanal in ('Brief', 'LinkedIn', 'Telefon', 'Besuch', 'Mail', 'Website', 'Empfehlung', 'Sonstiges')),
  stufe text not null default 'Neu'
    check (stufe in ('Neu', 'Kontaktiert', 'Antwort', 'Probevideo angefragt', 'Probevideo geliefert', 'Angebot', 'Kunde', 'Ruht')),
  wer text check (wer in ('Arthur', 'Dean')),
  letzter_kontakt date,
  naechster_schritt text check (char_length(naechster_schritt) <= 500),
  faellig date,
  notiz text check (char_length(notiz) <= 4000),
  upload_id uuid,
  erstellt_von text default dash_intern.mein_name()
);
create index dash_leads_stufe on public.dash_leads (stufe);
create trigger dash_leads_updated_at before update on public.dash_leads
  for each row execute function dash_intern.updated_at();

-- Einstellungen (nur nicht geheime Werte, z. B. Google-Client-ID für Gmail)
create table public.dash_einstellungen (
  schluessel text primary key check (schluessel ~ '^[a-z_]{1,40}$'),
  wert text check (char_length(wert) <= 500),
  updated_at timestamptz not null default now()
);
create trigger dash_einstellungen_updated_at before update on public.dash_einstellungen
  for each row execute function dash_intern.updated_at();

-- Rechte: anon nichts, authenticated nur über RLS (= nur Team)
revoke all on table public.dash_team, public.dash_plantage, public.dash_aufgaben,
  public.dash_notizen, public.dash_leads, public.dash_einstellungen from anon, authenticated;
grant select, insert, delete on table public.dash_team to authenticated;
grant select on table public.dash_plantage to authenticated;
grant select, insert, update, delete on table public.dash_aufgaben, public.dash_notizen,
  public.dash_leads, public.dash_einstellungen to authenticated;

alter table public.dash_team enable row level security;
alter table public.dash_plantage enable row level security;
alter table public.dash_aufgaben enable row level security;
alter table public.dash_notizen enable row level security;
alter table public.dash_leads enable row level security;
alter table public.dash_einstellungen enable row level security;

create policy "dash_team: Team liest" on public.dash_team
  for select to authenticated using ((select dash_intern.ist_team()));
create policy "dash_team: Team fügt hinzu" on public.dash_team
  for insert to authenticated with check ((select dash_intern.ist_team()));
create policy "dash_team: Team entfernt andere" on public.dash_team
  for delete to authenticated using (
    (select dash_intern.ist_team())
    and email <> lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );

create policy "dash_plantage: Team liest" on public.dash_plantage
  for select to authenticated using ((select dash_intern.ist_team()));

create policy "dash_aufgaben: Team liest" on public.dash_aufgaben
  for select to authenticated using ((select dash_intern.ist_team()));
create policy "dash_aufgaben: Team legt an" on public.dash_aufgaben
  for insert to authenticated with check ((select dash_intern.ist_team()) and quelle = 'eigen');
create policy "dash_aufgaben: Team ändert" on public.dash_aufgaben
  for update to authenticated using ((select dash_intern.ist_team()))
  with check ((select dash_intern.ist_team()));
create policy "dash_aufgaben: Team löscht eigene" on public.dash_aufgaben
  for delete to authenticated using ((select dash_intern.ist_team()) and quelle = 'eigen');

create policy "dash_notizen: Team liest" on public.dash_notizen
  for select to authenticated using ((select dash_intern.ist_team()));
create policy "dash_notizen: Team schreibt als sich selbst" on public.dash_notizen
  for insert to authenticated
  with check ((select dash_intern.ist_team()) and autor = (select dash_intern.mein_name()));
create policy "dash_notizen: Team ändert" on public.dash_notizen
  for update to authenticated using ((select dash_intern.ist_team()))
  with check ((select dash_intern.ist_team()));
create policy "dash_notizen: Team löscht" on public.dash_notizen
  for delete to authenticated using ((select dash_intern.ist_team()));

create policy "dash_leads: Team liest" on public.dash_leads
  for select to authenticated using ((select dash_intern.ist_team()));
create policy "dash_leads: Team legt an" on public.dash_leads
  for insert to authenticated with check ((select dash_intern.ist_team()));
create policy "dash_leads: Team ändert" on public.dash_leads
  for update to authenticated using ((select dash_intern.ist_team()))
  with check ((select dash_intern.ist_team()));
create policy "dash_leads: Team löscht" on public.dash_leads
  for delete to authenticated using ((select dash_intern.ist_team()));

create policy "dash_einstellungen: Team liest" on public.dash_einstellungen
  for select to authenticated using ((select dash_intern.ist_team()));
create policy "dash_einstellungen: Team legt an" on public.dash_einstellungen
  for insert to authenticated with check ((select dash_intern.ist_team()));
create policy "dash_einstellungen: Team ändert" on public.dash_einstellungen
  for update to authenticated using ((select dash_intern.ist_team()))
  with check ((select dash_intern.ist_team()));
create policy "dash_einstellungen: Team löscht" on public.dash_einstellungen
  for delete to authenticated using ((select dash_intern.ist_team()));

-- Foto-Uploads der Website: Team darf lesen (Posteingang im Dashboard).
-- anon bleibt bei "nur einfügen".
grant select on table public.upload_anfragen to authenticated;
create policy "upload_anfragen: Team liest" on public.upload_anfragen
  for select to authenticated using ((select dash_intern.ist_team()));

-- Dateien im Bucket: Team darf lesen (für befristete Links im Dashboard).
create policy "auftrag-uploads: Team liest"
on storage.objects
for select
to authenticated
using (bucket_id = 'auftrag-uploads' and (select dash_intern.ist_team()));

-- Live-Aktualisierung zwischen Arthur und Dean
alter publication supabase_realtime add table public.dash_notizen, public.dash_aufgaben, public.dash_leads;

-- Nachtrag: dash_ich nicht für anon (Supabase vergibt EXECUTE in public standardmäßig)
revoke execute on function public.dash_ich() from anon;
