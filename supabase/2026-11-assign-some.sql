-- Piccab — 👥 give an assignment to some students only (run once in Supabase → SQL Editor). Safe to run again.
-- class_items.only: the students who get it; empty (null) = everyone in the class, also those who join later.
alter table public.class_items add column if not exists only uuid[];
alter table public.class_items drop constraint if exists class_items_only_size;
alter table public.class_items add constraint class_items_only_size check (only is null or cardinality(only) between 1 and 200);
