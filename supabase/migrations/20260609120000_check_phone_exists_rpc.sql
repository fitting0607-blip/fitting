-- Signup phone duplicate check (anon-safe).
-- public.users SELECT is blocked by RLS before login; use SECURITY DEFINER RPC instead.

create or replace function public.check_phone_exists(check_phone text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.users
    where phone is not null
      and regexp_replace(trim(phone), '\D', '', 'g')
        = regexp_replace(trim(check_phone), '\D', '', 'g')
  );
$$;

revoke all on function public.check_phone_exists(text) from public;
grant execute on function public.check_phone_exists(text) to anon, authenticated;
