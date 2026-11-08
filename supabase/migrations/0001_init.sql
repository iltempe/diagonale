-- Diagonale — initial schema (SPEC §14). Not used by the GitHub Pages build yet (see docs/decisions.md D-001/D-018).

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  locale text check (locale in ('it', 'en'))
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  title text not null default '',
  kind text not null check (kind in ('tactic', 'set_piece', 'training', 'match_plan')),
  data jsonb not null,
  schema_version int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_boards (
  slug text primary key,
  board_id uuid references public.boards on delete set null,
  owner uuid references auth.users on delete cascade,
  snapshot jsonb not null,
  audio_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  name text not null,
  data jsonb not null
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  data jsonb not null
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  data jsonb not null
);

create table if not exists public.fixtures (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams on delete cascade,
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

-- shared snapshots: public read-only, owner can create/delete (immutable: no update policy)
create policy "public read shared" on public.shared_boards for select using (true);
create policy "owner creates shared" on public.shared_boards for insert with check (auth.uid() = owner);
create policy "owner deletes shared" on public.shared_boards for delete using (auth.uid() = owner);
