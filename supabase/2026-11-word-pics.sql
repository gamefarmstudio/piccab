-- Piccab: 🎨 line pictures for word sheets — a shared bank, so each word is drawn by AI only once for everyone.
-- Safe to run more than once. Until this is run, pictures are still drawn but not kept for others.
create table if not exists public.word_pics (
  word        text primary key check (word = lower(word) and char_length(word) between 1 and 60),
  svg         text not null check (char_length(svg) <= 4000),
  created_at  timestamptz not null default now()
);
alter table public.word_pics enable row level security;          -- only the server (secret key) reads and writes
revoke all on public.word_pics from anon, authenticated;
grant select, insert, update, delete on public.word_pics to service_role;

-- AI usage log: drawing pictures is its own kind
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('scan', 'translate', 'wordlist', 'sentences', 'pics'));

notify pgrst, 'reload schema';
