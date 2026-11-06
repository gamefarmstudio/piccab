-- Piccab: add word decks (ชุดคำ). Safe to run more than once.
-- ─────────────────────────────────────────────────────────────
-- Word decks ("ชุดคำ"): the user's own groups of words across scenes.
-- words = ["<scene id>|<item id>", …]; id "saved" is the built-in 🔖 เก็บไว้ deck.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.decks (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  id          text not null check (char_length(id) between 1 and 40),
  name        text not null default '' check (char_length(name) <= 60),
  words       jsonb not null default '[]'::jsonb,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.decks enable row level security;

drop policy if exists "decks: own rows" on public.decks;
create policy "decks: own rows" on public.decks
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
