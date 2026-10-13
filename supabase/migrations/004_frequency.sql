-- Repeat rule: every N days/weeks/months, optional end, and a completion count.
-- Notes stay notes. The old custom box used to store its text in notes and treat the number as months.

alter table public.items
  add column if not exists frequency_unit text;

alter table public.items
  drop constraint if exists items_frequency_unit_check;

alter table public.items
  add constraint items_frequency_unit_check
  check (frequency_unit is null or frequency_unit in ('days', 'weeks', 'months'));

alter table public.items
  add column if not exists recurrence_end text not null default 'never';

alter table public.items
  drop constraint if exists items_recurrence_end_check;

alter table public.items
  add constraint items_recurrence_end_check
  check (recurrence_end in ('never', 'on_date', 'after_count'));

alter table public.items
  add column if not exists recurrence_end_date date;

alter table public.items
  add column if not exists recurrence_end_count integer;

alter table public.items
  add column if not exists completed_count integer not null default 0;

alter table public.items
  drop constraint if exists items_recurrence_end_count_check;

alter table public.items
  add constraint items_recurrence_end_count_check
  check (recurrence_end_count is null or recurrence_end_count >= 1);

alter table public.items
  drop constraint if exists items_completed_count_check;

alter table public.items
  add constraint items_completed_count_check
  check (completed_count >= 0);

-- Fill the new unit from the old frequency menu. Do not touch notes.
update public.items
set frequency_unit = case frequency_type
  when 'daily' then 'days'
  when 'weekly' then 'weeks'
  when 'biweekly' then 'weeks'
  when 'monthly' then 'months'
  when 'custom' then 'months'
  else frequency_unit
end
where frequency_unit is null
  and frequency_type is not null;

-- Biweekly was "every 2 weeks" stored as one biweekly period.
update public.items
set frequency_value = greatest(2, round(coalesce(frequency_value, 1) * 2))
where frequency_type = 'biweekly'
  and frequency_unit = 'weeks';
