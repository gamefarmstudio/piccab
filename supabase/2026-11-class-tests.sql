-- Piccab — 📝 paper spelling tests checked from a photo (run once in Supabase → SQL Editor)
-- A teacher prints one sheet per student (name + QR code on it), photographs the sheets, AI reads what each child
-- wrote, the teacher checks it, and the result is kept here. The photos themselves are never stored.
-- No policies on purpose, like the other class tables: only the Worker (secret key) reads and writes them,
-- and it checks that the caller owns the class (or, for a student, that the result is their own).

create table if not exists public.class_tests (
  id          text primary key check (id ~ '^[A-Za-z0-9]{8,16}$'),
  class_id    text not null references public.classes on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  words       jsonb not null,                       -- the answer key: [{w, th}], in the set's order
  opts        jsonb not null default '{}'::jsonb,   -- how it was printed: {q, hint}
  roster      jsonb not null,                       -- the students it was printed for: [{u: user id, n: nickname, o: [word order]}]
  reads       integer not null default 0,           -- photos read by AI so far (the Worker caps it per test)
  created_at  timestamptz not null default now(),
  constraint class_tests_size check (octet_length(words::text) + octet_length(roster::text) <= 200000)
);
create index if not exists class_tests_class_idx on public.class_tests (class_id, created_at desc);

create table if not exists public.class_test_results (
  test_id     text not null references public.class_tests on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  answers     jsonb not null,                       -- per word of the key: {a: what the child wrote, ok: right or not} or null (not checked)
  score       integer not null check (score between 0 and 100),
  total       integer not null check (total between 1 and 100),
  updated_at  timestamptz not null default now(),
  primary key (test_id, user_id)
);
create index if not exists class_test_results_user_idx on public.class_test_results (user_id, updated_at desc);

alter table public.class_tests        enable row level security;
alter table public.class_test_results enable row level security;
revoke all on public.class_tests, public.class_test_results from anon, authenticated;
grant select, insert, update, delete on public.class_tests, public.class_test_results to service_role;
