-- 📷 Photos of checked paper tests, kept as evidence of the marking (the pictures are in R2: tp/<owner>/<test>/<k>-<page>).
-- Only the teacher who owns the test can see them. Free: 300 sheets, kept 6 months; Pro: 5,000 sheets, kept 1 year.
-- Run once in the Supabase SQL Editor (safe to run again).
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
