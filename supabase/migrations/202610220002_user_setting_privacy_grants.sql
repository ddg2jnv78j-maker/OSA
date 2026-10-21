-- Add individual per-contact privacy permissions and correct grant visibility RLS.
-- Safe to run whether the base User Setting migration has already been applied or not.
alter table public.user_setting_grants add column if not exists privacy_last_seen boolean not null default true;
alter table public.user_setting_grants add column if not exists privacy_profile_photo boolean not null default true;
alter table public.user_setting_grants add column if not exists privacy_about boolean not null default true;
alter table public.user_setting_grants add column if not exists privacy_status boolean not null default true;
alter table public.user_setting_grants add column if not exists privacy_read_receipts boolean not null default true;
alter table public.user_setting_grants add column if not exists privacy_typing_indicator boolean not null default true;
alter table public.user_setting_grants add column if not exists privacy_online_status boolean not null default true;

alter table public.user_setting_grants enable row level security;

drop policy if exists "Users can read their own User Setting grants" on public.user_setting_grants;
drop policy if exists "Users can read relevant User Setting grants" on public.user_setting_grants;
create policy "Users can read relevant User Setting grants"
  on public.user_setting_grants for select
  to authenticated
  using (auth.uid() = owner_user_id or auth.uid() = grantee_user_id);
