-- products RLS: 관리자만 INSERT/UPDATE/DELETE
-- prerequisites:
-- - public.users.is_admin boolean column exists
-- - products table exists in public schema

alter table public.products enable row level security;

-- Everyone can read products (app store uses it with is_active filter)
drop policy if exists "products_select_all" on public.products;
create policy "products_select_all"
on public.products
for select
to authenticated, anon
using (true);

-- Only admins can insert/update/delete
drop policy if exists "admin_insert_products" on public.products;
create policy "admin_insert_products"
on public.products
for insert
to authenticated
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_admin = true
  )
);

drop policy if exists "admin_update_products" on public.products;
create policy "admin_update_products"
on public.products
for update
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_admin = true
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_admin = true
  )
);

drop policy if exists "admin_delete_products" on public.products;
create policy "admin_delete_products"
on public.products
for delete
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_admin = true
  )
);

