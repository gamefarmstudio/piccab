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
  primary key (class_id, share_id)
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
