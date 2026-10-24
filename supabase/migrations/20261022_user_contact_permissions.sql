-- Per-user contact permissions and access activity logs
create table if not exists public.user_contact_permissions (
  id uuid default gen_random_uuid() primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  allow_remote_camera boolean default false,
  allow_remote_location boolean default false,
  allow_last_seen boolean default true,
  allow_privacy boolean default true,
  last_camera_access_at timestamp with time zone,
  last_location_access_at timestamp with time zone,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint user_contact_permissions_unique unique (owner_user_id, target_user_id)
);

alter table public.user_contact_permissions enable row level security;

create policy "Users can view their own contact permissions"
  on public.user_contact_permissions for select
  using (auth.uid() = owner_user_id or auth.uid() = target_user_id);

create policy "Users can insert/update their own contact permissions"
  on public.user_contact_permissions for all
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

-- Indexes for fast lookup
create index if not exists idx_user_contact_permissions_owner on public.user_contact_permissions(owner_user_id);
create index if not exists idx_user_contact_permissions_target on public.user_contact_permissions(target_user_id);
