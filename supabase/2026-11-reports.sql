-- Piccab: 📈 learning reports for teachers and parents, family groups, and the Pro plan.
-- Needs 2026-11-classes.sql first. Safe to run more than once.
-- Until this is run the app works as before: classes only, no reports, no family groups.
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

notify pgrst, 'reload schema';
