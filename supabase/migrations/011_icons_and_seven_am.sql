-- Task icons, and a 7:00 AM day. Additive.
-- Rows still on the old untouched defaults (6:00 AM start, 8:00 AM wake) move to 7:00 AM.
-- A day start or wake time you already changed is left alone.

alter table public.items
  add column if not exists icon text;

alter table public.items
  drop constraint if exists items_icon_check;

alter table public.items
  add constraint items_icon_check
  check (icon is null or icon ~ '^[a-z0-9-]{1,40}$');

alter table public.user_settings
  alter column day_start_minutes set default 420;

alter table public.user_settings
  alter column wake_minutes set default 420;

update public.user_settings
set day_start_minutes = 420
where day_start_minutes = 360;

update public.user_settings
set wake_minutes = 420
where wake_minutes = 480;
