-- Piccab: add classrooms (needs 2026-11-shares.sql first). Safe to run more than once.
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
