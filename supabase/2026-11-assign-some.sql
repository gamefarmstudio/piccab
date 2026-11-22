-- Piccab — 👥 give an assignment to some students only (run once in Supabase → SQL Editor). Safe to run again.
-- class_items.students: the students who get it; empty (null) = everyone in the class, also those who join later.
alter table public.class_items add column if not exists students uuid[];
alter table public.class_items drop constraint if exists class_items_students_size;
alter table public.class_items add constraint class_items_students_size check (students is null or cardinality(students) between 1 and 200);
