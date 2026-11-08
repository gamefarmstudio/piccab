-- Piccab: tools for the trial (🛡️ admin → 💬 ความเห็น / 🐞 ข้อผิดพลาด / 📊 การใช้งาน). Safe to run more than once.
-- Only the server (secret key) can read or write these tables: no policies for signed-in users.

-- ────────────────────────────────────────────────────────────
-- Feedback sent from the app (💬 ส่งความเห็น)
-- ────────────────────────────────────────────────────────────
create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('problem', 'idea', 'other')),
  message     text not null check (char_length(message) between 1 and 2000),
  contact     text check (char_length(contact) <= 200),          -- e-mail to reply to, only if the person gave one
  user_id     uuid references auth.users on delete cascade,      -- signed-in sender (null if not signed in); deleted with the account
  page        text check (char_length(page) <= 80),               -- where in the app, e.g. "play/quiz"
  ui          text check (char_length(ui) <= 5),
  ua          text check (char_length(ua) <= 300),                -- browser and device
  resolved_at timestamptz,
  note        text check (char_length(note) <= 300)
);
create index if not exists feedback_open_idx on public.feedback (created_at desc) where resolved_at is null;
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant insert, select, update, delete on public.feedback to service_role;

-- ────────────────────────────────────────────────────────────
-- Errors in the app (JavaScript errors on people's devices). No user, scene or words.
-- Same error from the same place on the same day = one row with a count.
-- ────────────────────────────────────────────────────────────
create table if not exists public.client_errors (
  day        date not null,
  sig        text not null check (char_length(sig) <= 64),          -- hash of message + where
  msg        text not null check (char_length(msg) <= 300),
  src        text check (char_length(src) <= 200),
  stack      text check (char_length(stack) <= 1500),
  page       text check (char_length(page) <= 80),
  ua         text check (char_length(ua) <= 300),               -- the latest browser that hit it
  n          integer not null default 1,
  last_at    timestamptz not null default now(),
  primary key (day, sig)
);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
grant select on public.client_errors to service_role;

create or replace function public.client_error_add(p_day date, p_sig text, p_msg text, p_src text, p_stack text, p_page text, p_ua text)
returns void language sql security definer set search_path = '' as $$
  insert into public.client_errors (day, sig, msg, src, stack, page, ua)
  values (p_day, left(p_sig, 64), left(p_msg, 300), left(p_src, 200), left(p_stack, 1500), left(p_page, 80), left(p_ua, 300))
  on conflict (day, sig) do update set n = public.client_errors.n + 1, last_at = now(), ua = excluded.ua
  where public.client_errors.n < 100000;
$$;

-- ────────────────────────────────────────────────────────────
-- Usage counts per day (Thai time): how many devices opened the app, which modes were used…
-- Only totals: no user, device id, scene or words.
-- ────────────────────────────────────────────────────────────
create table if not exists public.usage_daily (
  day    date not null,
  event  text not null check (char_length(event) <= 40),
  n      bigint not null default 0,
  primary key (day, event)
);
alter table public.usage_daily enable row level security;
revoke all on public.usage_daily from anon, authenticated;
grant select on public.usage_daily to service_role;

-- p_events = {"open": 1, "mode:quiz": 3, …}
create or replace function public.usage_add(p_day date, p_events jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.usage_daily (day, event, n)
  select p_day, left(e.key, 40), least(greatest(e.value::text::bigint, 0), 1000)
    from jsonb_each(p_events) e
   where jsonb_typeof(e.value) = 'number'
  on conflict (day, event) do update set n = public.usage_daily.n + excluded.n;
$$;

-- Totals from the accounts and their data (for the 📊 page)
create or replace function public.trial_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'accounts',        (select count(*) from auth.users where coalesce(is_anonymous, false) = false),
    'accounts_7d',     (select count(*) from auth.users where coalesce(is_anonymous, false) = false and created_at > now() - interval '7 days'),
    'students',        (select count(*) from auth.users where coalesce(is_anonymous, false) = true),
    'signed_in_7d',    (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'active_7d',       (select count(distinct user_id) from public.progress where updated_at > now() - interval '7 days'),
    'active_30d',      (select count(distinct user_id) from public.progress where updated_at > now() - interval '30 days'),
    'scenes',          (select count(*) from public.scenes where not deleted),
    'scenes_7d',       (select count(*) from public.scenes where not deleted and created_at > now() - interval '7 days'),
    'scene_users',     (select count(distinct user_id) from public.scenes where not deleted),
    'shares',          (select count(*) from public.shares),
    'classes',         (select count(*) from public.classes),
    'class_members',   (select count(*) from public.class_members)
  );
$$;

-- Old rows: errors 90 days, usage about 13 months
create or replace function public.trial_cleanup()
returns void language sql security definer set search_path = '' as $$
  delete from public.client_errors where day < current_date - 90;
  delete from public.usage_daily   where day < current_date - 400;
  delete from public.feedback      where created_at < now() - interval '2 years';
$$;

revoke execute on function public.client_error_add(date, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.usage_add(date, jsonb) from public, anon, authenticated;
revoke execute on function public.trial_stats()          from public, anon, authenticated;
revoke execute on function public.trial_cleanup()        from public, anon, authenticated;
grant  execute on function public.client_error_add(date, text, text, text, text, text, text) to service_role;
grant  execute on function public.usage_add(date, jsonb) to service_role;
grant  execute on function public.trial_stats()          to service_role;
grant  execute on function public.trial_cleanup()        to service_role;

notify pgrst, 'reload schema';
