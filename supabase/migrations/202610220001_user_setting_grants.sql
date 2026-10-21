-- Per-contact permission grants for OSA User Setting.
-- A grant only authorizes a contact to request access; it never bypasses device
-- permissions, the protected user's consent, or the app's existing privacy checks.
create table if not exists public.user_setting_grants (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  grantee_user_id uuid not null references public.profiles(id) on delete cascade,
  remote_camera boolean not null default false,
  location boolean not null default false,
  privacy_details boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_setting_grants_unique_pair unique (owner_user_id, grantee_user_id),
  constraint user_setting_grants_not_self check (owner_user_id <> grantee_user_id)
);

alter table public.user_setting_grants enable row level security;

drop policy if exists "Users can read their own User Setting grants" on public.user_setting_grants;
create policy "Users can read their own User Setting grants"
  on public.user_setting_grants for select
  to authenticated
  using (auth.uid() = owner_user_id);

drop policy if exists "Users can create their own User Setting grants" on public.user_setting_grants;
create policy "Users can create their own User Setting grants"
  on public.user_setting_grants for insert
  to authenticated
  with check (auth.uid() = owner_user_id);

drop policy if exists "Users can update their own User Setting grants" on public.user_setting_grants;
create policy "Users can update their own User Setting grants"
  on public.user_setting_grants for update
  to authenticated
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists "Users can delete their own User Setting grants" on public.user_setting_grants;
create policy "Users can delete their own User Setting grants"
  on public.user_setting_grants for delete
  to authenticated
  using (auth.uid() = owner_user_id);

create index if not exists user_setting_grants_grantee_idx
  on public.user_setting_grants (grantee_user_id);
