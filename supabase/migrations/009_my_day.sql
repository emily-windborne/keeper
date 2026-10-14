-- Wake and wind-down. Additive: existing rows keep the defaults.

alter table public.user_settings
  add column if not exists wake_minutes integer not null default 480,
  add column if not exists wind_down_minutes integer not null default 1320;

alter table public.user_settings
  drop constraint if exists user_settings_my_day_check;

alter table public.user_settings
  add constraint user_settings_my_day_check
  check (
    wake_minutes >= 0
    and wake_minutes < 24 * 60
    and wind_down_minutes > wake_minutes
    and wind_down_minutes <= 24 * 60
  );
