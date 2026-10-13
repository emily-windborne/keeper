-- Plan my week: update deferred due dates and insert tasks in one transaction.
-- Run in the Supabase SQL Editor after 001_schema.sql (or via the CLI).

create or replace function public.apply_plan_my_week(
  p_tasks jsonb,
  p_deferred jsonb
)
returns setof public.planned_tasks
language plpgsql
security invoker
set search_path = public
as $$
declare
  rec record;
  task_count integer;
  owned_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if p_tasks is null then
    p_tasks := '[]'::jsonb;
  end if;
  if p_deferred is null then
    p_deferred := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_tasks) <> 'array' or jsonb_typeof(p_deferred) <> 'array' then
    raise exception 'Expected JSON arrays for tasks and deferred items';
  end if;

  for rec in select value from jsonb_array_elements(p_deferred) as x(value)
  loop
    update public.items
    set next_due_date = (rec.value->>'next_due_date')::timestamptz
    where id = (rec.value->>'item_id')::uuid
      and user_id = auth.uid();

    if not found then
      raise exception 'Could not update item %', rec.value->>'item_id';
    end if;
  end loop;

  select count(*) into task_count from jsonb_array_elements(p_tasks);

  select count(*) into owned_count
  from jsonb_array_elements(p_tasks) as t(value)
  join public.items i
    on i.id = (t.value->>'item_id')::uuid
   and i.user_id = auth.uid();

  if owned_count <> task_count then
    raise exception 'One or more items are not in your inventory';
  end if;

  return query
  insert into public.planned_tasks (
    user_id,
    item_id,
    title_snapshot,
    scheduled_date,
    scheduled_time_start,
    scheduled_time_end,
    status,
    priority_override,
    notes
  )
  select
    auth.uid(),
    (t.value->>'item_id')::uuid,
    t.value->>'title_snapshot',
    (t.value->>'scheduled_date')::date,
    nullif(t.value->>'scheduled_time_start', ''),
    nullif(t.value->>'scheduled_time_end', ''),
    coalesce(nullif(t.value->>'status', ''), 'planned'),
    nullif(t.value->>'priority_override', ''),
    nullif(t.value->>'notes', '')
  from jsonb_array_elements(p_tasks) as t(value)
  returning *;
end;
$$;

revoke all on function public.apply_plan_my_week(jsonb, jsonb) from public;
revoke all on function public.apply_plan_my_week(jsonb, jsonb) from anon;
grant execute on function public.apply_plan_my_week(jsonb, jsonb) to authenticated;
