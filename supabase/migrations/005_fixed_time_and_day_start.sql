-- A fixed item can keep a real clock time (Visit mom at 13:00 for 3 hours).
-- Each person can choose when their day starts. The app default is 6:00 (360 minutes).

alter table public.items
  add column if not exists fixed_start_time text;

alter table public.items
  drop constraint if exists items_fixed_start_time_check;

alter table public.items
  add constraint items_fixed_start_time_check
  check (
    fixed_start_time is null
    or fixed_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  );

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  day_start_minutes integer not null default 360,
  auto_schedule_next boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_day_start_check check (day_start_minutes >= 0 and day_start_minutes <= 20 * 60)
);

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row
  execute procedure public.set_updated_at();

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
drop policy if exists "user_settings_insert_own" on public.user_settings;
drop policy if exists "user_settings_update_own" on public.user_settings;
drop policy if exists "user_settings_delete_own" on public.user_settings;

create policy "user_settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);
create policy "user_settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);
create policy "user_settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id);
create policy "user_settings_delete_own" on public.user_settings
  for delete using (auth.uid() = user_id);
