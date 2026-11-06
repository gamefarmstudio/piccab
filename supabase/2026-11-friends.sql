-- Piccab: friends. Safe to run more than once.
-- ─────────────────────────────────────────────────────────────
-- Friends (👫), designed for young learners: no search, no chat.
-- Friends are added with a friend code / QR in person and must accept; messages are a fixed set
-- of cheers; scenes sent by a friend are only seen after the receiver accepts them.
-- Student accounts (no e-mail) can only be friends with classmates. Block + report available.
-- No policies on purpose: only the Worker (secret key) reads and writes these tables.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.friend_profiles (
  user_id     uuid primary key references auth.users on delete cascade,
  code        text not null unique check (code ~ '^[A-Z2-9]{8}$'),
  nickname    text not null check (char_length(nickname) between 1 and 30),
  student     boolean not null default false,                         -- a student account (no e-mail)
  streak      integer not null default 0 check (streak between 0 and 100000),
  week_words  integer not null default 0 check (week_words between 0 and 1000000),
  total_words integer not null default 0 check (total_words between 0 and 1000000),
  updated_at  timestamptz not null default now()
);
create table if not exists public.friendships (
  a           uuid not null references auth.users on delete cascade,   -- a < b
  b           uuid not null references auth.users on delete cascade,
  status      text not null check (status in ('pending','accepted')),
  requested_by uuid not null,
  created_at  timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
create index if not exists friendships_b_idx on public.friendships (b);
create table if not exists public.friend_blocks (
  user_id     uuid not null references auth.users on delete cascade,
  blocked     uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, blocked)
);
create table if not exists public.friend_events (
  id          bigint generated always as identity primary key,
  to_user     uuid not null references auth.users on delete cascade,
  from_user   uuid not null references auth.users on delete cascade,
  kind        text not null check (kind in ('cheer','share')),
  data        jsonb not null default '{}'::jsonb,
  seen        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists friend_events_to_idx on public.friend_events (to_user, created_at desc);
create table if not exists public.friend_reports (
  id          bigint generated always as identity primary key,
  reporter    uuid references auth.users on delete set null,
  reported    uuid references auth.users on delete set null,
  reason      text not null default '' check (char_length(reason) <= 300),
  created_at  timestamptz not null default now()
);
alter table public.friend_profiles enable row level security;
alter table public.friendships     enable row level security;
alter table public.friend_blocks   enable row level security;
alter table public.friend_events   enable row level security;
alter table public.friend_reports  enable row level security;
revoke all on public.friend_profiles, public.friendships, public.friend_blocks, public.friend_events, public.friend_reports from anon, authenticated;
