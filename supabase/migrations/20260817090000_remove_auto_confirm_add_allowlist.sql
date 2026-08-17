-- P4-1: Multi-user hardening — disable auto-confirm, enable invite-only signup.
--
-- The fn_auto_confirm_user() trigger confirmed every signup without email
-- verification. This migration:
-- 1. Drops the trigger and function
-- 2. Creates an allowlist table so only invited emails can sign up
-- 3. Adds a trigger that blocks signup for emails not in the allowlist
--
-- To invite a user:
--   INSERT INTO public.allowed_emails (email) VALUES ('friend@example.com');
--
-- To enable open signup (not recommended for multi-user), drop the trigger:
--   DROP TRIGGER IF EXISTS on_auth_user_check_allowlist ON auth.users;

-- Drop the auto-confirm trigger and function
drop trigger if exists on_auth_user_auto_confirm on auth.users;
drop function if exists public.fn_auto_confirm_user();

-- Create the allowlist table for invite-only signup
create table if not exists public.allowed_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  invited_by uuid references auth.users(id),
  invited_at timestamptz not null default now(),
  used_at timestamptz,
  note text
);

-- RLS: only service_role can manage the allowlist (via Supabase dashboard or admin scripts)
alter table public.allowed_emails enable row level security;
grant select on public.allowed_emails to service_role;
grant insert, update, delete on public.allowed_emails to service_role;

-- Block signup for emails not in the allowlist
create or replace function public.fn_check_email_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow if the email is in the allowlist
  if exists (
    select 1 from public.allowed_emails
    where lower(email) = lower(new.email)
      and used_at is null
  ) then
    -- Mark the invite as used
    update public.allowed_emails
       set used_at = now()
     where lower(email) = lower(new.email)
       and used_at is null;
    return new;
  end if;

  -- Block signup with a clear message
  raise exception 'Signup is invite-only. Contact the administrator for access.';
end $$;

revoke execute on function public.fn_check_email_allowlist() from public, anon, authenticated;

create trigger on_auth_user_check_allowlist
  before insert on auth.users
  for each row execute function public.fn_check_email_allowlist();

-- Seed the owner's email so they can still sign up/in
-- Replace 'owner@example.com' with the actual owner email, or insert via dashboard
-- insert into public.allowed_emails (email, note) values ('owner@example.com', 'Project owner');

comment on table public.allowed_emails is 
  'Allowlist for invite-only signup. Add emails here to permit new accounts.';
comment on function public.fn_check_email_allowlist() is 
  'Blocks signups from emails not in the allowed_emails table.';
