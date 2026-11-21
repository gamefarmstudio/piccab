-- Piccab — 📝 paper tests for a typed list of names, not only for a class (run once in Supabase → SQL Editor,
-- after 2026-11-class-tests.sql). Safe to run more than once.
-- A test now belongs to the teacher who made it (owner). It may be for a class or group (class_id), or for a list of
-- names the teacher typed (class_id empty): those people need no account. A result is kept per place on the test's
-- list (k); user_id is set only for a student with an account (so they get their score and words to practise).

alter table public.class_tests add column if not exists owner uuid references auth.users on delete cascade;
update public.class_tests t set owner = c.owner from public.classes c where c.id = t.class_id and t.owner is null;
delete from public.class_tests where owner is null;
alter table public.class_tests alter column owner set not null;
alter table public.class_tests alter column class_id drop not null;
create index if not exists class_tests_owner_idx on public.class_tests (owner, created_at desc);

alter table public.class_test_results add column if not exists k integer;
update public.class_test_results r set k = x.ord - 1
  from public.class_tests t, jsonb_array_elements(t.roster) with ordinality as x(e, ord)
  where t.id = r.test_id and x.e->>'u' = r.user_id::text and r.k is null;
delete from public.class_test_results where k is null;
alter table public.class_test_results alter column k set not null;
alter table public.class_test_results drop constraint if exists class_test_results_k_check;
alter table public.class_test_results add constraint class_test_results_k_check check (k between 0 and 199);
alter table public.class_test_results drop constraint if exists class_test_results_pkey;
alter table public.class_test_results add primary key (test_id, k);
alter table public.class_test_results alter column user_id drop not null;
