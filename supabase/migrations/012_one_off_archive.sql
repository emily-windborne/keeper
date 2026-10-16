-- When a one-off moves to the archive. Keeper deletes it 30 days later.

alter table public.items
  add column if not exists archived_at timestamptz;
