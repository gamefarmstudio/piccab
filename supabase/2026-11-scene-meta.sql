-- Word lists for dictation tests: a scene can carry a little extra about itself (scenes.meta),
-- e.g. {"kind":"list","exam":"2026-11-14","style":"listen"} for a teacher's word list with its test date.
-- Run once in Supabase → SQL Editor. Safe to run again.
-- Until it is run, the app still works and syncs; only the test date and style of a word list stay on the device.

alter table public.scenes add column if not exists meta jsonb not null default '{}'::jsonb;

-- keep it small: an object of at most 1 KB
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'scenes_meta_small') then
    alter table public.scenes add constraint scenes_meta_small
      check (jsonb_typeof(meta) = 'object' and pg_column_size(meta) <= 1024);
  end if;
end $$;

notify pgrst, 'reload schema';
