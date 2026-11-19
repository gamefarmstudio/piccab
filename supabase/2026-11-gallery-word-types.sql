-- Piccab: picture-library categories for words that are not things:
-- actions (verbs), describing words and opposites (adjectives), positions (prepositions), feelings.
-- Run once in Supabase → SQL Editor. Safe to run again.

insert into public.gallery_categories (id, name_th, name_en, emoji, sort) values
  ('actions',    'การกระทำ',            'Actions',             '🏃', 130),
  ('describing', 'คำบอกลักษณะ',          'Describing words',    '🎨', 140),
  ('positions',  'ตำแหน่ง',              'Positions',           '📦', 150),
  ('feelings',   'ความรู้สึก',            'Feelings',            '😊', 160)
on conflict (id) do nothing;
