-- posts RLS: 관리자만 UPDATE 허용 (is_deleted 토글 등)
-- prerequisites:
-- - public.users.is_admin boolean column exists
-- - posts table exists in public schema
-- - RLS is enabled on posts (if not, this file enables it)

alter table public.posts enable row level security;

drop policy if exists "admin_update_posts" on public.posts;
create policy "admin_update_posts"
on public.posts
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

