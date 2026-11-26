-- Piccab: a picture-library category for phrasal verbs (word cards made by tools/list-scenes/make.py).
-- Run once in Supabase → SQL Editor before importing the scenes. Safe to run again.
insert into public.gallery_categories (id, name_th, name_en, emoji, sort) values
  ('phrasal-verbs', 'กริยาวลี (Phrasal Verbs)', 'Phrasal verbs', '🔗', 130)
on conflict (id) do nothing;
notify pgrst, 'reload schema';
