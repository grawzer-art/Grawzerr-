-- ═══════════════════════════════════════════════════════════════════
-- JARVIS — schéma initial (phase 1)
-- À exécuter une seule fois dans Supabase > SQL Editor > New query.
-- Chaque table est protégée par Row Level Security : un utilisateur ne
-- voit et ne modifie que ses propres lignes.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Utilitaire : updated_at automatique ───────────────────────────
create or replace function public.jarvis_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Paramètres de personnalité ────────────────────────────────────
create table if not exists public.jarvis_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  user_name text not null default '' check (char_length(user_name) <= 60),
  address_as text not null default 'Monsieur' check (char_length(address_as) <= 40),
  formality text not null default 'vous' check (formality in ('tu', 'vous')),
  humor smallint not null default 60 check (humor between 0 and 100),
  sarcasm smallint not null default 35 check (sarcasm between 0 and 100),
  verbosity text not null default 'adaptive' check (verbosity in ('concise', 'adaptive', 'detailed')),
  proactivity smallint not null default 50 check (proactivity between 0 and 100),
  emotional_adaptation boolean not null default true,
  relationship_notes text not null default '' check (char_length(relationship_notes) <= 2000),
  voice_enabled boolean not null default false,
  voice_name text not null default '' check (char_length(voice_name) <= 120),
  voice_rate real not null default 1.0 check (voice_rate between 0.5 and 2.0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Conversations ─────────────────────────────────────────────────
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Nouvelle conversation' check (char_length(title) <= 200),
  summary text not null default '' check (char_length(summary) <= 8000),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

-- ── Messages ──────────────────────────────────────────────────────
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 100000),
  status text not null default 'complete' check (status in ('complete', 'interrupted', 'error')),
  tone text,
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index if not exists messages_user_created_idx
  on public.messages (user_id, created_at desc);

-- ── Mémoire à long terme ──────────────────────────────────────────
-- status : confirmed = souvenir validé par l'utilisateur
--          suggested = hypothèse proposée, jamais traitée comme un fait
--          outdated  = conservé pour l'historique, ignoré par JARVIS
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  category text not null default 'personal'
    check (category in ('personal', 'preference', 'project', 'relationship', 'important', 'other')),
  status text not null default 'confirmed' check (status in ('confirmed', 'suggested', 'outdated')),
  source text not null default 'user' check (source in ('user', 'assistant')),
  importance smallint not null default 3 check (importance between 1 and 5),
  last_confirmed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists memories_user_status_idx
  on public.memories (user_id, status, importance desc);

-- ── Consommation IA (garde-fous budgétaires) ──────────────────────
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'chat',
  provider text not null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(12, 6) not null default 0 check (estimated_cost_usd >= 0),
  tokens_estimated boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_user_created_idx
  on public.usage_events (user_id, created_at desc);

-- ── Journal d'activité ────────────────────────────────────────────
create table if not exists public.action_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action text not null check (char_length(action) <= 80),
  status text not null check (status in ('success', 'failure', 'pending', 'blocked')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists action_log_user_created_idx
  on public.action_log (user_id, created_at desc);

-- ── Triggers updated_at ───────────────────────────────────────────
drop trigger if exists jarvis_settings_touch on public.jarvis_settings;
create trigger jarvis_settings_touch before update on public.jarvis_settings
  for each row execute function public.jarvis_touch_updated_at();
drop trigger if exists conversations_touch on public.conversations;
create trigger conversations_touch before update on public.conversations
  for each row execute function public.jarvis_touch_updated_at();
drop trigger if exists memories_touch on public.memories;
create trigger memories_touch before update on public.memories
  for each row execute function public.jarvis_touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════════
alter table public.jarvis_settings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.usage_events enable row level security;
alter table public.action_log enable row level security;

-- Paramètres
drop policy if exists "settings_owner_all" on public.jarvis_settings;
create policy "settings_owner_all" on public.jarvis_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Conversations
drop policy if exists "conversations_owner_all" on public.conversations;
create policy "conversations_owner_all" on public.conversations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Messages : propriétaire ET conversation lui appartenant
drop policy if exists "messages_owner_select" on public.messages;
create policy "messages_owner_select" on public.messages
  for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "messages_owner_insert" on public.messages;
create policy "messages_owner_insert" on public.messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );
drop policy if exists "messages_owner_delete" on public.messages;
create policy "messages_owner_delete" on public.messages
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Mémoire
drop policy if exists "memories_owner_all" on public.memories;
create policy "memories_owner_all" on public.memories
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Consommation : lecture + ajout uniquement (pas de modification a posteriori)
drop policy if exists "usage_owner_select" on public.usage_events;
create policy "usage_owner_select" on public.usage_events
  for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "usage_owner_insert" on public.usage_events;
create policy "usage_owner_insert" on public.usage_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Journal : lecture + ajout uniquement (journal non modifiable)
drop policy if exists "log_owner_select" on public.action_log;
create policy "log_owner_select" on public.action_log
  for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "log_owner_insert" on public.action_log;
create policy "log_owner_insert" on public.action_log
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ═══════════════════════════════════════════════════════════════════
-- Grants explicites (obligatoires pour les projets Supabase créés après
-- le 30 mai 2026, sans effet négatif sur les plus anciens).
-- Le rôle anonyme n'a accès à rien.
-- ═══════════════════════════════════════════════════════════════════
revoke all on public.jarvis_settings, public.conversations, public.messages,
  public.memories, public.usage_events, public.action_log from anon;

grant select, insert, update, delete on public.jarvis_settings to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, delete on public.messages to authenticated;
grant select, insert, update, delete on public.memories to authenticated;
grant select, insert on public.usage_events to authenticated;
grant select, insert on public.action_log to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- Suppression totale des données de l'utilisateur connecté.
-- Le journal et la consommation sont effacés aussi : rien ne reste.
-- ═══════════════════════════════════════════════════════════════════
create or replace function public.jarvis_delete_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from public.messages where user_id = uid;
  delete from public.conversations where user_id = uid;
  delete from public.memories where user_id = uid;
  delete from public.usage_events where user_id = uid;
  delete from public.action_log where user_id = uid;
  delete from public.jarvis_settings where user_id = uid;
end;
$$;

revoke all on function public.jarvis_delete_my_data() from public, anon;
grant execute on function public.jarvis_delete_my_data() to authenticated;
