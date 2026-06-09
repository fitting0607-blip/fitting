-- Customer support inquiries (app + admin).

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  content text not null,
  answer text,
  answered_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'answered')),
  created_at timestamptz not null default now()
);

create index if not exists inquiries_user_id_created_at_idx
  on public.inquiries (user_id, created_at desc);

alter table public.inquiries enable row level security;

create policy inquiries_select_own
  on public.inquiries
  for select
  using (auth.uid() = user_id);

create policy inquiries_select_admin
  on public.inquiries
  for select
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.is_admin = true
    )
  );

create policy inquiries_insert_own
  on public.inquiries
  for insert
  with check (auth.uid() = user_id);

create policy inquiries_update_admin
  on public.inquiries
  for update
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.is_admin = true
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.is_admin = true
    )
  );
