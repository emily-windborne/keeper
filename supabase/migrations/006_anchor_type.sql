-- Quiet routines such as bedtime or skincare. They show as markers and do not block the day.

alter table public.items drop constraint if exists items_type_check;

alter table public.items
  add constraint items_type_check
  check (type in ('recurring', 'one_off', 'goal', 'anchor'));
