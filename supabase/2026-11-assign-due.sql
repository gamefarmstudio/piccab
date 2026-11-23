-- Piccab — ⏰ a due date for an assignment (run once in Supabase → SQL Editor). Safe to run again.
-- class_items.due: when the work closes (the end of the chosen day, in the teacher's time zone); null = no due date.
-- After it, the class's progress for that work stays as it was (students can still practise in the app).
alter table public.class_items add column if not exists due timestamptz;
