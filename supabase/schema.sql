-- Piccab database schema (Supabase / Postgres)
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to re-run: every statement is idempotent.
--
-- Every table has Row Level Security: a signed-in user can only see and change
-- their own rows. AI credits can only be changed by the server (service role).

-- ─────────────────────────────────────────────────────────────
-- Profiles (one row per user, created automatically on sign-up)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                  uuid primary key references auth.users on delete cascade,
  display_name        text check (char_length(display_name) <= 60),
  ai_credits          integer not null default 30 check (ai_credits >= 0),
  ai_credits_month    date not null default date_trunc('month', now())::date,
  created_at          timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Users may only change their display name (never their credits).
revoke update on public.profiles from anon, authenticated;
grant  update (display_name) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Scenes (the user's own pictures + word boxes)
-- id is the app's scene id (e.g. "s1abc…"); the picture lives in R2 at image_path.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.scenes (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  id          text not null check (char_length(id) between 1 and 40),
  name        text not null check (char_length(name) <= 60),
  w           integer not null check (w > 0 and w <= 4000),
  h           integer not null check (h > 0 and h <= 4000),
  items       jsonb not null default '{}'::jsonb,
  image_path  text,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.scenes enable row level security;

drop policy if exists "scenes: own rows" on public.scenes;
create policy "scenes: own rows" on public.scenes
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ─────────────────────────────────────────────────────────────
-- Progress (per user, per scene — also for the built-in sample scene "tea")
-- ─────────────────────────────────────────────────────────────
create table if not exists public.progress (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  scene_id    text not null check (char_length(scene_id) between 1 and 40),
  done        jsonb not null default '{}'::jsonb,
  star        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, scene_id)
);
alter table public.progress enable row level security;

drop policy if exists "progress: own rows" on public.progress;
create policy "progress: own rows" on public.progress
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

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

-- ─────────────────────────────────────────────────────────────
-- 🎮 Game progress across devices (XP, streak days, badges, stickers, chests, quests, best stars, word stats):
-- one row per account; the app merges it with each device (numbers take the larger side, badges are joined).
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- Classrooms (🎓). Students join with a room code + nickname (often anonymous accounts).
-- No policies on purpose: browsers cannot read these tables; the Worker (secret key) does,
-- and checks who is the teacher (owner) and who is a member.
-- An assignment is a share link (public.shares), so it is a snapshot the teacher can update.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.classes (
  id          text primary key check (id ~ '^[A-Za-z0-9]{8,16}$'),
  code        text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  owner       uuid not null references auth.users on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  created_at  timestamptz not null default now()
);
create index if not exists classes_owner_idx on public.classes (owner);
-- Class leaderboard (🏆): the teacher turns it on per class; students then see nicknames + scores of their class.
alter table public.classes add column if not exists leaderboard boolean not null default false;

create table if not exists public.class_members (
  class_id    text not null references public.classes on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  nickname    text not null check (char_length(nickname) between 1 and 30),
  joined_at   timestamptz not null default now(),
  primary key (class_id, user_id)
);
create index if not exists class_members_user_idx on public.class_members (user_id);

create table if not exists public.class_items (
  class_id    text not null references public.classes on delete cascade,
  share_id    text not null references public.shares on delete cascade,
  added_at    timestamptz not null default now(),
  students    uuid[],                -- 👥 the students who get it; null = everyone (also in 2026-11-assign-some.sql)
  due         timestamptz,           -- ⏰ when it closes; null = no due date (also in 2026-11-assign-due.sql)
  primary key (class_id, share_id),
  constraint class_items_students_size check (students is null or cardinality(students) between 1 and 200)
);

create table if not exists public.class_progress (
  class_id    text not null,
  share_id    text not null,
  user_id     uuid not null,
  total       integer not null default 0 check (total between 0 and 10000),
  done        integer not null default 0 check (done between 0 and 10000),
  star        integer not null default 0 check (star between 0 and 10000),
  updated_at  timestamptz not null default now(),
  primary key (class_id, share_id, user_id),
  foreign key (class_id, user_id)  references public.class_members (class_id, user_id) on delete cascade,
  foreign key (class_id, share_id) references public.class_items (class_id, share_id) on delete cascade
);

alter table public.classes        enable row level security;
alter table public.class_members  enable row level security;
alter table public.class_items    enable row level security;
alter table public.class_progress enable row level security;
revoke all on public.classes, public.class_members, public.class_items, public.class_progress from anon, authenticated;

-- 📈 Learning reports, family groups and the Pro plan (also in 2026-11-reports.sql)
-- ─────────────────────────────────────────────────────────────
-- Family groups are classes with kind = 'family': a parent makes one, their child joins with the code.
-- ─────────────────────────────────────────────────────────────
alter table public.classes add column if not exists kind text not null default 'class';
alter table public.classes drop constraint if exists classes_kind_check;
alter table public.classes add constraint classes_kind_check check (kind in ('class', 'family'));

-- A member chooses whether the teacher sees their learning report (always on in a family group).
alter table public.class_members add column if not exists report boolean not null default false;

-- ─────────────────────────────────────────────────────────────
-- Learning report: a summary the learner's own device works out (days active, words passed, words that
-- needed help, CEFR levels, games played). Kept only while the learner shares it with at least one class
-- or family group; deleted when they stop sharing, leave, or delete their account.
-- Only the server (secret key) reads it, and only for the owner of a group the learner shares it with.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.learner_reports (
  user_id     uuid primary key references auth.users on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  constraint learner_reports_size check (octet_length(data::text) <= 40000)
);
alter table public.learner_reports enable row level security;
revoke all on public.learner_reports from anon, authenticated;
grant select, insert, update, delete on public.learner_reports to service_role;

-- ─────────────────────────────────────────────────────────────
-- 📧 Weekly summary e-mail to parents (family groups): on/off, language, the last Sunday sent. Worker only.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.email_prefs (
  user_id     uuid primary key references auth.users on delete cascade,
  weekly      boolean not null default true,
  lang        text not null default 'th' check (lang in ('th', 'en')),
  last_sent   date,
  updated_at  timestamptz not null default now()
);
alter table public.email_prefs enable row level security;
revoke all on public.email_prefs from anon, authenticated;
grant select, insert, update, delete on public.email_prefs to service_role;

-- ─────────────────────────────────────────────────────────────
-- Pro plan (detailed reports), given by an admin per e-mail. "until" null = no end date.
-- The Worker variable PRO_REQUIRED=1 turns the lock on; without it everyone can use Pro features.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.plans (
  email       text primary key check (email = lower(email) and char_length(email) between 3 and 200),
  plan        text not null default 'pro' check (plan in ('pro')),
  until       timestamptz,
  note        text check (char_length(note) <= 200),
  created_at  timestamptz not null default now()
);
alter table public.plans enable row level security;
revoke all on public.plans from anon, authenticated;
grant select, insert, update, delete on public.plans to service_role;

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
-- 🗺️ level and badges shown to friends (also in 2026-11-journey.sql)
alter table public.friend_profiles add column if not exists level  integer not null default 0;
alter table public.friend_profiles add column if not exists badges integer not null default 0;
alter table public.friend_profiles drop constraint if exists friend_profiles_level_check;
alter table public.friend_profiles add constraint friend_profiles_level_check check (level between 0 and 999 and badges between 0 and 500);
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
-- Reports: which share link (if any), and the admin's follow-up.
alter table public.friend_reports add column if not exists share_id    text;
alter table public.friend_reports add column if not exists resolved_at timestamptz;
alter table public.friend_reports add column if not exists note        text check (char_length(note) <= 300);
create index if not exists friend_reports_open_idx on public.friend_reports (created_at desc) where resolved_at is null;
alter table public.friend_profiles enable row level security;
alter table public.friendships     enable row level security;
alter table public.friend_blocks   enable row level security;
alter table public.friend_events   enable row level security;
alter table public.friend_reports  enable row level security;
revoke all on public.friend_profiles, public.friendships, public.friend_blocks, public.friend_events, public.friend_reports from anon, authenticated;

-- Pictures are NOT stored in Supabase: they live in Cloudflare R2 (bucket "piccab-images"),
-- served by the Worker at /api/img/<scene id> to the signed-in owner only (key u/<user id>/<scene id>).
-- scenes.image_path records that key.

-- ─────────────────────────────────────────────────────────────
-- AI credits: monthly allowance, used and refunded only by the server (Worker with the secret key)
-- ─────────────────────────────────────────────────────────────
create or replace function public.use_ai_credit(p_user uuid, p_monthly integer default 30)
returns integer language plpgsql security definer set search_path = '' as $$
declare left_after integer;
begin
  -- new month → refill to the monthly allowance (never takes away extra credits)
  update public.profiles
     set ai_credits = greatest(ai_credits, p_monthly),
         ai_credits_month = date_trunc('month', now())::date
   where id = p_user and ai_credits_month < date_trunc('month', now())::date;

  update public.profiles set ai_credits = ai_credits - 1
   where id = p_user and ai_credits > 0
  returning ai_credits into left_after;
  return coalesce(left_after, -1);   -- -1 = no credits left (or no profile)
end;
$$;

create or replace function public.refund_ai_credit(p_user uuid)
returns integer language sql security definer set search_path = '' as $$
  update public.profiles set ai_credits = ai_credits + 1 where id = p_user returning ai_credits;
$$;

revoke execute on function public.use_ai_credit(uuid, integer) from public, anon, authenticated;
revoke execute on function public.refund_ai_credit(uuid)       from public, anon, authenticated;
grant  execute on function public.use_ai_credit(uuid, integer) to service_role;
grant  execute on function public.refund_ai_credit(uuid)       to service_role;

-- 🎨 line pictures for word sheets (also in 2026-11-word-pics.sql)
create table if not exists public.word_pics (
  word        text primary key check (word = lower(word) and char_length(word) between 1 and 60),
  svg         text not null check (char_length(svg) <= 4000),
  created_at  timestamptz not null default now()
);
alter table public.word_pics enable row level security;          -- only the server (secret key) reads and writes
revoke all on public.word_pics from anon, authenticated;
grant select, insert, update, delete on public.word_pics to service_role;


-- 📝 paper spelling tests checked from a photo (also in 2026-11-class-tests.sql + 2026-11-test-names.sql)
-- A test belongs to the teacher who made it: for a class or group (class_id), or for a typed list of names (no class).
create table if not exists public.class_tests (
  id          text primary key check (id ~ '^[A-Za-z0-9]{8,16}$'),
  owner       uuid not null references auth.users on delete cascade,
  class_id    text references public.classes on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  words       jsonb not null,                       -- the answer key: [{w, th}], in the set's order
  opts        jsonb not null default '{}'::jsonb,   -- how it was printed: {q, hint}
  roster      jsonb not null,                       -- who it was printed for: [{u: user id (students with an account), n: name, o: [word order]}]
  reads       integer not null default 0,           -- photos read by AI so far (the Worker caps it per test)
  created_at  timestamptz not null default now(),
  constraint class_tests_size check (octet_length(words::text) + octet_length(roster::text) <= 200000)
);
create index if not exists class_tests_class_idx on public.class_tests (class_id, created_at desc);
create index if not exists class_tests_owner_idx on public.class_tests (owner, created_at desc);

create table if not exists public.class_test_results (
  test_id     text not null references public.class_tests on delete cascade,
  k           integer not null check (k between 0 and 199),   -- place on the test's list
  user_id     uuid references auth.users on delete cascade,   -- set for a student with an account
  answers     jsonb not null,                       -- per word of the key: {a: what was written, ok: right or not} or null (not checked)
  score       integer not null check (score between 0 and 100),
  total       integer not null check (total between 1 and 100),
  updated_at  timestamptz not null default now(),
  primary key (test_id, k)
);
create index if not exists class_test_results_user_idx on public.class_test_results (user_id, updated_at desc);

alter table public.class_tests        enable row level security;
alter table public.class_test_results enable row level security;
revoke all on public.class_tests, public.class_test_results from anon, authenticated;
grant select, insert, update, delete on public.class_tests, public.class_test_results to service_role;

-- 📷 Photos (also in 2026-11-test-photos.sql): of checked paper tests, kept as evidence of the marking (the pictures are in R2: tp/<owner>/<test>/<k>-<page>).
-- Only the teacher who owns the test can see them. Free: 300 sheets, kept 6 months; Pro: 5,000 sheets, kept 1 year.
create table if not exists public.class_test_photos (
  test_id     text not null references public.class_tests on delete cascade,
  k           integer not null check (k between 0 and 199),   -- place on the test's list
  p           integer not null check (p between 0 and 19),    -- page of that person's sheet
  owner       uuid not null references auth.users on delete cascade,
  bytes       integer not null check (bytes between 1 and 2000000),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  primary key (test_id, k, p)
);
create index if not exists class_test_photos_owner_idx on public.class_test_photos (owner, expires_at);
create index if not exists class_test_photos_expires_idx on public.class_test_photos (expires_at);

alter table public.class_test_photos enable row level security;
revoke all on public.class_test_photos from anon, authenticated;
grant select, insert, update, delete on public.class_test_photos to service_role;
