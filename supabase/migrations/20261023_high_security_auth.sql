-- High Security: Device login approvals and secret recovery codes
create table if not exists public.user_security_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recovery_secret_code text not null default '',
  primary_device_id text default '',
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.device_login_requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_fingerprint text not null,
  device_name text default 'Unknown Device',
  status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_security_settings enable row level security;
alter table public.device_login_requests enable row level security;

create policy "Users can manage their own security settings"
  on public.user_security_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own device login requests"
  on public.device_login_requests for all
  using (auth.uid() = user_id);

-- Allow anonymous or authenticated insert for login requests during auth check
create policy "Allow insert login requests"
  on public.device_login_requests for insert
  with check (true);

create policy "Allow select login requests for user"
  on public.device_login_requests for select
  using (true);

create policy "Allow update login requests"
  on public.device_login_requests for update
  using (true);
