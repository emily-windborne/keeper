-- How many times an item happens inside one period.
-- Daily items: times each day. Weekly items: times each week (3 = three tasks).

alter table public.items
  add column if not exists times_per_period integer not null default 1;

alter table public.items
  drop constraint if exists items_times_per_period_check;

alter table public.items
  add constraint items_times_per_period_check
  check (times_per_period >= 1 and times_per_period <= 14);
