-- Piccab — 🎮 game progress across devices (run once in Supabase → SQL Editor)
-- XP and level, streak days, badges, stickers, chests, today's quests, best stars, boss wins and word stats
-- for the learning report: one row per account, readable and writable only by that account.
-- The app merges it with each device (numbers take the larger side, badges are joined), so nothing counts twice.
create table if not exists public.game_state (
  user_id     uuid primary key default auth.uid() references auth.users on delete cascade,
  data        jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 400000),
  updated_at  timestamptz not null default now()
);
alter table public.game_state enable row level security;

drop policy if exists "game_state: own row" on public.game_state;
create policy "game_state: own row" on public.game_state
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
