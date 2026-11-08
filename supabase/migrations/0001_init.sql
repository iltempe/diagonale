-- Diagonale — schema (SPEC §14). Used by the web app when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set.
-- Ids are text because boards are created offline first (local-first, nanoid ids).

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  locale text check (locale in ('it', 'en'))
);

create table if not exists public.boards (
  id text primary key,
  owner uuid not null references auth.users on delete cascade,
  title text not null default '',
  kind text not null check (kind in ('tactic', 'set_piece', 'training', 'match_plan')),
  data jsonb not null,
  schema_version int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_boards (
  slug text primary key,
  board_id text,
  owner uuid references auth.users on delete cascade,
  snapshot jsonb not null,
  audio_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.sequences (
  id text primary key,
  owner uuid not null references auth.users on delete cascade,
  name text not null default '',
  data jsonb not null
);

create table if not exists public.sessions (
  id text primary key,
  owner uuid not null references auth.users on delete cascade,
  data jsonb not null
);

create table if not exists public.teams (
  id text primary key,
  owner uuid not null references auth.users on delete cascade,
  data jsonb not null
);

create table if not exists public.fixtures (
  id text primary key,
  team_id text not null references public.teams on delete cascade,
  data jsonb not null
);

alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.shared_boards enable row level security;
alter table public.sequences enable row level security;
alter table public.sessions enable row level security;
alter table public.teams enable row level security;
alter table public.fixtures enable row level security;

create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own boards" on public.boards for all using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "own sequences" on public.sequences for all using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "own sessions" on public.sessions for all using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "own teams" on public.teams for all using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "own fixtures" on public.fixtures for all
  using (exists (select 1 from public.teams t where t.id = team_id and t.owner = auth.uid()))
  with check (exists (select 1 from public.teams t where t.id = team_id and t.owner = auth.uid()));

-- shared snapshots: public read-only, immutable (no update policy)
create policy "public read shared" on public.shared_boards for select using (true);
create policy "owner creates shared" on public.shared_boards for insert with check (auth.uid() = owner);
create policy "owner deletes shared" on public.shared_boards for delete using (auth.uid() = owner);

-- Team Talk audio: public bucket, writes only into the owner's folder
insert into storage.buckets (id, name, public) values ('talks', 'talks', true) on conflict (id) do nothing;
create policy "talks public read" on storage.objects for select using (bucket_id = 'talks');
create policy "talks owner write" on storage.objects for insert
  with check (bucket_id = 'talks' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "talks owner delete" on storage.objects for delete
  using (bucket_id = 'talks' and auth.uid()::text = (storage.foldername(name))[1]);
