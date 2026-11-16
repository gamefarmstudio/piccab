-- Piccab: sentences for each picture-library scene (for the sentence game).
-- Each one is {"en": "The girl is sleeping in the bed.", "th": "เด็กผู้หญิงกำลังนอนหลับบนเตียง", "words": ["bed"]};
-- "words" are the scene's words used in the sentence. Imported with the scene (📥 นำเข้าจาก Gemini) and edited in 🛡️ admin → 🖼️ คลังภาพ.
-- Run once in Supabase → SQL Editor. Safe to run again.
-- Until it is run, the library still works; only the sentences are not kept.

alter table public.gallery_scenes add column if not exists sentences jsonb not null default '[]'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gallery_scenes_sentences_small') then
    alter table public.gallery_scenes add constraint gallery_scenes_sentences_small
      check (jsonb_typeof(sentences) = 'array' and pg_column_size(sentences) <= 32768);
  end if;
end $$;

notify pgrst, 'reload schema';
