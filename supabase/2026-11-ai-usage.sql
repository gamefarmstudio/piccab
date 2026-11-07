-- Piccab: AI usage counter for the admin page (🛡️ → ✨ AI usage). Safe to run more than once.
-- One row per call to an AI model (finding words in a picture, or translating a scene's words).
-- No user, picture or words are stored — only what was called, how it went and how many tokens it used.
create table if not exists public.ai_usage (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind       text not null check (kind in ('scan', 'translate')),
  provider   text not null check (char_length(provider) <= 20),
  model      text not null check (char_length(model) <= 60),
  outcome    text not null check (char_length(outcome) <= 30),   -- ok, quota_day, quota_minute, no_quota, busy, error code…
  ms         integer,
  tok_in     integer,
  tok_out    integer
);
create index if not exists ai_usage_created_idx on public.ai_usage (created_at);
alter table public.ai_usage enable row level security;          -- no policies: only the server (secret key) can read or write
revoke all on public.ai_usage from anon, authenticated;

-- Totals since a moment, per kind / provider / model / outcome
create or replace function public.ai_usage_summary(p_since timestamptz)
returns table (kind text, provider text, model text, outcome text, n bigint, tok_in bigint, tok_out bigint)
language sql stable security definer set search_path = '' as $$
  select u.kind, u.provider, u.model, u.outcome, count(*), coalesce(sum(u.tok_in), 0), coalesce(sum(u.tok_out), 0)
    from public.ai_usage u
   where u.created_at >= p_since
   group by 1, 2, 3, 4;
$$;

-- Per day (Thai time) since a moment: pictures and translations, worked or not
create or replace function public.ai_usage_daily(p_since timestamptz)
returns table (day date, kind text, ok boolean, n bigint)
language sql stable security definer set search_path = '' as $$
  select (u.created_at at time zone 'Asia/Bangkok')::date, u.kind, u.outcome = 'ok', count(*)
    from public.ai_usage u
   where u.created_at >= p_since
   group by 1, 2, 3;
$$;

-- Old rows: keep about 13 months
create or replace function public.ai_usage_cleanup()
returns void language sql security definer set search_path = '' as $$
  delete from public.ai_usage where created_at < now() - interval '400 days';
$$;

revoke execute on function public.ai_usage_summary(timestamptz) from public, anon, authenticated;
revoke execute on function public.ai_usage_daily(timestamptz)   from public, anon, authenticated;
revoke execute on function public.ai_usage_cleanup()            from public, anon, authenticated;
grant  execute on function public.ai_usage_summary(timestamptz) to service_role;
grant  execute on function public.ai_usage_daily(timestamptz)   to service_role;
grant  execute on function public.ai_usage_cleanup()            to service_role;
grant  insert, select on public.ai_usage to service_role;
