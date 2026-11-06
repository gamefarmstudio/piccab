-- Piccab: add share links. Safe to run more than once.
-- ─────────────────────────────────────────────────────────────
-- Share links (piccab.com/s/<id>): a snapshot of a scene or a word deck.
-- No policies on purpose: browsers cannot read or list this table; only the Worker
-- (secret key) reads a share by its id, so links cannot be discovered.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.shares (
  id          text primary key check (id ~ '^[A-Za-z0-9]{8,16}$'),
  owner       uuid not null references auth.users on delete cascade,
  kind        text not null check (kind in ('scene','deck')),
  name        text not null default '' check (char_length(name) <= 60),
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists shares_owner_idx on public.shares (owner);
alter table public.shares enable row level security;
revoke all on public.shares from anon, authenticated;
