-- Recurring protected time, such as a school run or dinner.
-- Additive: existing tables are left as they are.

create table if not exists public.protected_times (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  days text[] not null,
  start_minutes integer not null,
  end_minutes integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint protected_times_name_check check (char_length(trim(name)) > 0),
  constraint protected_times_window_check check (
    start_minutes >= 0
    and start_minutes < 24 * 60
    and end_minutes > start_minutes
    and end_minutes <= 24 * 60
  ),
  constraint protected_times_days_check check (
    cardinality(days) > 0
    and days <@ array['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']::text[]
  )
);

create index if not exists protected_times_user_id_idx on public.protected_times (user_id);

drop trigger if exists protected_times_set_updated_at on public.protected_times;
create trigger protected_times_set_updated_at
  before update on public.protected_times
  for each row
  execute procedure public.set_updated_at();

alter table public.protected_times enable row level security;

drop policy if exists "protected_times_select_own" on public.protected_times;
drop policy if exists "protected_times_insert_own" on public.protected_times;
drop policy if exists "protected_times_update_own" on public.protected_times;
drop policy if exists "protected_times_delete_own" on public.protected_times;

create policy "protected_times_select_own" on public.protected_times
  for select using (auth.uid() = user_id);
create policy "protected_times_insert_own" on public.protected_times
  for insert with check (auth.uid() = user_id);
create policy "protected_times_update_own" on public.protected_times
  for update using (auth.uid() = user_id);
create policy "protected_times_delete_own" on public.protected_times
  for delete using (auth.uid() = user_id);
