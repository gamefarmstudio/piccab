-- Piccab: the learning path. Each picture-library scene says which school years it suits (stage) and its CEFR level.
-- stage: p12 = ป.1–2, p34 = ป.3–4, p56 = ป.5–6, m13 = ม.1–3, m46 = ม.4–6, adult = มหาวิทยาลัย/ทำงาน
-- cefr:  preA1, A1, A2, B1, B2, C1, C2  (OBEC targets: A1 by the end of ป.6, A2 by ม.3, B1 by ม.6)
-- Run once in Supabase → SQL Editor. Safe to run again (it only fills scenes that have no stage yet).
-- Change any scene's level afterwards in 🛡️ admin → 🖼️ คลังภาพ.

alter table public.gallery_scenes add column if not exists stage text;
alter table public.gallery_scenes add column if not exists cefr text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gallery_scenes_stage_ok') then
    alter table public.gallery_scenes add constraint gallery_scenes_stage_ok
      check (stage is null or stage in ('p12', 'p34', 'p56', 'm13', 'm46', 'adult'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gallery_scenes_cefr_ok') then
    alter table public.gallery_scenes add constraint gallery_scenes_cefr_ok
      check (cefr is null or cefr in ('preA1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'));
  end if;
end $$;

-- A first suggestion for the scenes made so far (by title); the rest follow their old level.
update public.gallery_scenes g set stage = v.stage, cefr = v.cefr
from (values
  ('Kitchen', 'p12', 'preA1'), ('Living room', 'p12', 'preA1'), ('Bedroom', 'p12', 'preA1'), ('Bathroom', 'p12', 'preA1'),
  ('Front yard', 'p34', 'A1'),
  ('Classroom', 'p12', 'preA1'), ('Playground', 'p12', 'preA1'), ('School canteen', 'p34', 'A1'), ('Library', 'p34', 'A1'),
  ('Breakfast', 'p12', 'preA1'), ('Street food cart', 'p34', 'A1'), ('Family dinner', 'p34', 'A1'),
  ('Fruit stall', 'p12', 'preA1'),
  ('Farm', 'p12', 'preA1'), ('Zoo', 'p12', 'preA1'), ('Pets', 'p12', 'preA1'), ('Under the sea', 'p56', 'A1'),
  ('Daily routine', 'p34', 'A1'), ('At the playground', 'p34', 'A1'), ('In the kitchen', 'p56', 'A2'), ('Housework', 'p56', 'A2'),
  ('Opposites', 'p12', 'preA1'), ('Colours and shapes', 'p12', 'preA1'),
  ('Where is the cat?', 'p34', 'A1'), ('How do you feel?', 'p34', 'A1')
) as v(title, stage, cefr)
where g.title = v.title and g.stage is null;

update public.gallery_scenes set
  stage = case level when 'advanced' then 'm13' when 'intermediate' then 'p56' else 'p12' end,
  cefr  = case level when 'advanced' then 'A2' when 'intermediate' then 'A1' else 'preA1' end
where stage is null;

notify pgrst, 'reload schema';
