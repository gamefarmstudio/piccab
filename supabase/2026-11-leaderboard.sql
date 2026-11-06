-- Piccab: class leaderboard switch. Safe to run more than once.
-- Class leaderboard (🏆): the teacher turns it on per class; students then see nicknames + scores of their class.
alter table public.classes add column if not exists leaderboard boolean not null default false;
