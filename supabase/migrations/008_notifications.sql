-- Phone notifications. Additive: existing rows keep working.
-- Run after 005_fixed_time_and_day_start.sql (user_settings).

alter table public.user_settings
  add column if not exists timezone text,
  add column if not exists morning_digest_enabled boolean not null default true,
  add column if not exists morning_digest_minutes integer not null default 450,
  add column if not exists nightly_reminder_enabled boolean not null default true,
  add column if not exists nightly_reminder_minutes integer not null default 1380,
  add column if not exists morning_digest_sent_on date,
  add column if not exists nightly_reminder_sent_on date;

alter table public.user_settings
  drop constraint if exists user_settings_morning_minutes_check;

alter table public.user_settings
  add constraint user_settings_morning_minutes_check
  check (morning_digest_minutes >= 0 and morning_digest_minutes < 24 * 60);

alter table public.user_settings
  drop constraint if exists user_settings_nightly_minutes_check;

alter table public.user_settings
  add constraint user_settings_nightly_minutes_check
  check (nightly_reminder_minutes >= 0 and nightly_reminder_minutes < 24 * 60);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update using (auth.uid() = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
