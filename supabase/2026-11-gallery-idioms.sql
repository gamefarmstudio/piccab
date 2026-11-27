-- Piccab: a picture-library category for idioms (word cards made by tools/list-scenes/make.py from idioms.json).
-- Run once in Supabase → SQL Editor before importing the scenes. Safe to run again.
insert into public.gallery_categories (id, name_th, name_en, emoji, sort) values
  ('idioms', 'สำนวน (Idioms)', 'Idioms', '💬', 140)
on conflict (id) do nothing;
notify pgrst, 'reload schema';
