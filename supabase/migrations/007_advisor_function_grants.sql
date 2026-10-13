-- Advisor fixes for the live database.
-- 002 through 006 are already applied there and live on the feature branches.
-- This file is safe to run after 001 on its own: set_updated_at comes from 001,
-- and the revoke is skipped when rls_auto_enable is not installed.

-- Pin search_path so the updated_at trigger cannot follow a caller-chosen path.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- rls_auto_enable is the ensure_rls event trigger. The app never calls it.
-- Execute is also granted to public, which anon and authenticated inherit,
-- so that grant has to go too. The function owner and service_role keep execute,
-- which is what the event trigger uses.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
