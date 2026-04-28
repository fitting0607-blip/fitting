-- Adds per-post image transform metadata (Instagram-like crop).
-- Run this once on your Supabase project (SQL editor).

alter table public.posts
add column if not exists image_transform jsonb;

-- Optional: add a lightweight check constraint (ignored if existing).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_image_transform_is_object'
  ) then
    alter table public.posts
      add constraint posts_image_transform_is_object
      check (image_transform is null or jsonb_typeof(image_transform) = 'object');
  end if;
end $$;

