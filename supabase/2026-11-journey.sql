-- Piccab: 🗺️ การเดินทาง — friends see each other's level and number of badges. Safe to run more than once.
-- Levels and badges are worked out on each device; this only lets the friend list show them.
-- Until this is run, everything else works (friends just don't see levels).
alter table public.friend_profiles add column if not exists level  integer not null default 0;
alter table public.friend_profiles add column if not exists badges integer not null default 0;
alter table public.friend_profiles drop constraint if exists friend_profiles_level_check;
alter table public.friend_profiles add constraint friend_profiles_level_check check (level between 0 and 999 and badges between 0 and 500);
notify pgrst, 'reload schema';
