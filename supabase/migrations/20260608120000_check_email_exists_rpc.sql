-- Signup email duplicate check (anon-safe).
-- public.users SELECT is blocked by RLS before login; use SECURITY DEFINER RPC instead.

create or replace function public.check_email_exists(check_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.users
    where email is not null
      and lower(trim(email)) = lower(trim(check_email))
  );
$$;

revoke all on function public.check_email_exists(text) from public;
grant execute on function public.check_email_exists(text) to anon, authenticated;
