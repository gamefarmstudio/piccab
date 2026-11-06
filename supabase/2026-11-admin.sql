-- Piccab: report follow-up for the admin page. Safe to run more than once.
-- Reports: which share link (if any), and the admin's follow-up.
alter table public.friend_reports add column if not exists share_id    text;
alter table public.friend_reports add column if not exists resolved_at timestamptz;
alter table public.friend_reports add column if not exists note        text check (char_length(note) <= 300);
create index if not exists friend_reports_open_idx on public.friend_reports (created_at desc) where resolved_at is null;
