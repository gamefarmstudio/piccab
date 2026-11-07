-- Piccab: the language a class assignment is practised in (🇬🇧 English, 🇩🇪 German). Safe to run more than once.
-- Old assignments stay English. Until this is run, teachers can still assign in English.
alter table public.class_items add column if not exists lang text not null default 'en';
alter table public.class_items drop constraint if exists class_items_lang_check;
alter table public.class_items add constraint class_items_lang_check check (lang in ('en', 'de'));
