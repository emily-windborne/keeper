-- Keeper schema: run in Supabase SQL Editor (or via CLI migrations).
-- Requires pgcrypto for gen_random_uuid().

create extension if not exists "pgcrypto";

-- Items (inventory)
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  category text not null check (category in ('Home','Family','Personal','Work','Upkeep','Health')),
  type text not null check (type in ('recurring','one_off','goal')),
  frequency_type text check (
    frequency_type is null
    or frequency_type in ('daily','weekly','biweekly','monthly','custom')
  ),
  frequency_value numeric,
  preferred_days jsonb,
  preferred_time_of_day text check (
    preferred_time_of_day is null
    or preferred_time_of_day in ('morning','afternoon','evening','anytime')
  ),
  estimated_minutes integer not null,
  priority text not null check (priority in ('Critical','Important','Standard','Optional')),
  flexibility text not null check (flexibility in ('Fixed','Preferred window','Flexible anytime')),
  cadence_pressure text not null check (
    cadence_pressure in ('Must stay on cadence','Can slide a little','Can defer')
  ),
  minimum_success_threshold text,
  notes text,
  is_archived boolean not null default false,
  last_completed_at timestamptz,
  next_due_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_user_id_idx on public.items (user_id);

-- Planned tasks
create table public.planned_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  title_snapshot text not null,
  scheduled_date date not null,
  scheduled_time_start text,
  scheduled_time_end text,
  status text not null check (status in ('planned','done','skipped','moved')),
  priority_override text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index planned_tasks_user_date_idx on public.planned_tasks (user_id, scheduled_date);
create index planned_tasks_item_id_idx on public.planned_tasks (item_id);

-- Check-ins
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  energy_level text not null check (energy_level in ('Low','Medium','High')),
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index check_ins_user_id_idx on public.check_ins (user_id);

-- Check-in task updates
create table public.check_in_task_updates (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins (id) on delete cascade,
  planned_task_id uuid not null references public.planned_tasks (id) on delete cascade,
  outcome text not null check (outcome in ('done','skipped','move_tomorrow','move_later'))
);

create index check_in_task_updates_check_in_idx on public.check_in_task_updates (check_in_id);

-- updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_set_updated_at
  before update on public.items
  for each row
  execute procedure public.set_updated_at();

create trigger planned_tasks_set_updated_at
  before update on public.planned_tasks
  for each row
  execute procedure public.set_updated_at();

-- Row Level Security
alter table public.items enable row level security;
alter table public.planned_tasks enable row level security;
alter table public.check_ins enable row level security;
alter table public.check_in_task_updates enable row level security;

create policy "items_select_own" on public.items for select using (auth.uid() = user_id);
create policy "items_insert_own" on public.items for insert with check (auth.uid() = user_id);
create policy "items_update_own" on public.items for update using (auth.uid() = user_id);
create policy "items_delete_own" on public.items for delete using (auth.uid() = user_id);

create policy "planned_tasks_select_own" on public.planned_tasks for select using (auth.uid() = user_id);
create policy "planned_tasks_insert_own" on public.planned_tasks for insert with check (auth.uid() = user_id);
create policy "planned_tasks_update_own" on public.planned_tasks for update using (auth.uid() = user_id);
create policy "planned_tasks_delete_own" on public.planned_tasks for delete using (auth.uid() = user_id);

create policy "check_ins_select_own" on public.check_ins for select using (auth.uid() = user_id);
create policy "check_ins_insert_own" on public.check_ins for insert with check (auth.uid() = user_id);
create policy "check_ins_update_own" on public.check_ins for update using (auth.uid() = user_id);
create policy "check_ins_delete_own" on public.check_ins for delete using (auth.uid() = user_id);

create policy "check_in_task_updates_select" on public.check_in_task_updates for select using (
  exists (
    select 1
    from public.check_ins c
    inner join public.planned_tasks pt on pt.id = check_in_task_updates.planned_task_id
    where c.id = check_in_task_updates.check_in_id
      and c.user_id = auth.uid()
      and pt.user_id = auth.uid()
  )
);

create policy "check_in_task_updates_insert" on public.check_in_task_updates for insert with check (
  exists (
    select 1
    from public.check_ins c
    inner join public.planned_tasks pt on pt.id = check_in_task_updates.planned_task_id
    where c.id = check_in_task_updates.check_in_id
      and c.user_id = auth.uid()
      and pt.user_id = auth.uid()
  )
);

create policy "check_in_task_updates_update" on public.check_in_task_updates for update using (
  exists (
    select 1
    from public.check_ins c
    inner join public.planned_tasks pt on pt.id = check_in_task_updates.planned_task_id
    where c.id = check_in_task_updates.check_in_id
      and c.user_id = auth.uid()
      and pt.user_id = auth.uid()
  )
);

create policy "check_in_task_updates_delete" on public.check_in_task_updates for delete using (
  exists (
    select 1
    from public.check_ins c
    inner join public.planned_tasks pt on pt.id = check_in_task_updates.planned_task_id
    where c.id = check_in_task_updates.check_in_id
      and c.user_id = auth.uid()
      and pt.user_id = auth.uid()
  )
);
