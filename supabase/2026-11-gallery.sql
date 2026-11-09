-- Piccab: picture library (คลังภาพ) — ready-made scenes in categories that anyone can add to their own library.
-- Made by the Piccab team (🛡️ admin → 🖼️ คลังภาพ). Pictures are in R2 under gallery/<id> and gallery/<id>-t (thumbnail).
-- Only the server (secret key) reads or writes these tables: the app gets them through /api/gallery. Safe to run more than once.

create table if not exists public.gallery_categories (
  id       text primary key check (id ~ '^[a-z][a-z0-9-]{1,30}$'),
  name_th  text not null check (char_length(name_th) between 1 and 40),
  name_en  text not null check (char_length(name_en) between 1 and 40),
  emoji    text not null default '' check (char_length(emoji) <= 8),
  sort     integer not null default 0
);

insert into public.gallery_categories (id, name_th, name_en, emoji, sort) values
  ('home',      'บ้าน',               'Home',               '🏠', 10),
  ('school',    'โรงเรียน',           'School',             '🏫', 20),
  ('food',      'อาหารและผลไม้',      'Food and fruit',     '🍎', 30),
  ('shop',      'ตลาดและร้านค้า',     'Markets and shops',  '🛒', 40),
  ('animals',   'สัตว์',              'Animals',            '🐘', 50),
  ('travel',    'การเดินทาง',         'Travel',             '🚗', 60),
  ('city',      'ในเมือง',            'In town',            '🏙️', 70),
  ('nature',    'ธรรมชาติและอากาศ',   'Nature and weather', '🌳', 80),
  ('clothes',   'เสื้อผ้า',            'Clothes',            '👕', 90),
  ('sports',    'กีฬาและงานอดิเรก',   'Sports and hobbies', '⚽', 100),
  ('jobs',      'อาชีพ',              'Jobs',               '👩‍⚕️', 110),
  ('festivals', 'เทศกาลไทย',          'Thai festivals',     '🎉', 120)
on conflict (id) do nothing;

create table if not exists public.gallery_scenes (
  id          text primary key check (id ~ '^[a-z0-9]{6,24}$'),
  category    text not null references public.gallery_categories on update cascade,
  title       text not null check (char_length(title) between 1 and 60),        -- English name of the scene
  title_th    text not null default '' check (char_length(title_th) <= 60),
  level       text not null default 'beginner' check (level in ('beginner', 'intermediate', 'advanced')),
  w           integer not null check (w between 50 and 4000),
  h           integer not null check (h between 50 and 4000),
  items       jsonb not null default '{}'::jsonb check (pg_column_size(items) <= 65536),   -- same shape as a scene's items
  word_count  integer not null default 0,
  img_ver     integer not null default 0,                                         -- 0 = picture not uploaded yet
  published   boolean not null default false,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists gallery_scenes_cat_idx on public.gallery_scenes (category, sort, created_at);

alter table public.gallery_categories enable row level security;
alter table public.gallery_scenes     enable row level security;
revoke all on public.gallery_categories, public.gallery_scenes from anon, authenticated;
grant select, insert, update, delete on public.gallery_categories, public.gallery_scenes to service_role;

notify pgrst, 'reload schema';
