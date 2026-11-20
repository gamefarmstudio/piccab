-- Piccab — 📧 weekly summary e-mail to parents (run once in Supabase → SQL Editor)
-- One row per parent who has changed the setting or has been sent a summary: on/off, language, the last Sunday sent.
-- Only the Worker (secret key) reads and writes it; parents change it in the app or with the link in the e-mail.
create table if not exists public.email_prefs (
  user_id     uuid primary key references auth.users on delete cascade,
  weekly      boolean not null default true,
  lang        text not null default 'th' check (lang in ('th', 'en')),
  last_sent   date,
  updated_at  timestamptz not null default now()
);
alter table public.email_prefs enable row level security;
revoke all on public.email_prefs from anon, authenticated;
grant select, insert, update, delete on public.email_prefs to service_role;
