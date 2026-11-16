-- Piccab: sentences for your own scenes and word sheets (the ✍️ sentence game), made by AI on request.
-- Each one is {"en": "...", "th": "...", "words": ["..."]}, like gallery_scenes.sentences.
-- Run once in Supabase → SQL Editor. Safe to run again.
-- Until it is run, sentences stay on the device that made them (they do not sync).

alter table public.scenes add column if not exists sentences jsonb not null default '[]'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'scenes_sentences_small') then
    alter table public.scenes add constraint scenes_sentences_small
      check (jsonb_typeof(sentences) = 'array' and pg_column_size(sentences) <= 32768);
  end if;
end $$;

-- AI use log: also count reading word sheets and writing sentences
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('scan', 'translate', 'wordlist', 'sentences'));

notify pgrst, 'reload schema';
