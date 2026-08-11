revoke execute on function public.fn_touch_audit() from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  base_currency text not null default 'INR' references public.currencies(code),
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  number_format text not null default 'indian' check (number_format in ('indian','international')),
  round_to_nearest boolean not null default false,
  theme text not null default 'light' check (theme in ('light','dark')),
  accent text,
  sidebar text not null default 'expanded' check (sidebar in ('expanded','collapsed')),
  reduce_motion boolean not null default false,
  assistant_tone text not null default 'concise' check (assistant_tone in ('concise','detailed')),
  assistant_context boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_profiles before insert or update on public.profiles
  for each row execute function public.fn_touch_audit();

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  institution text,
  kind public.account_kind not null,
  currency_code text not null references public.currencies(code),
  opening_balance bigint not null default 0,
  credit_limit bigint check (credit_limit is null or credit_limit >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_accounts before insert or update on public.accounts
  for each row execute function public.fn_touch_audit();
create index ix_accounts_user on public.accounts(user_id) where deleted_at is null;
create unique index ux_accounts_primary on public.accounts(user_id)
  where is_primary and deleted_at is null;
create unique index ux_accounts_name on public.accounts(user_id, lower(name))
  where deleted_at is null;

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color_token text,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_labels before insert or update on public.labels
  for each row execute function public.fn_touch_audit();
create unique index ux_labels_name on public.labels(user_id, lower(name)) where deleted_at is null;

grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant select, insert, update, delete on public.accounts to authenticated;
grant all on public.accounts to service_role;
grant select, insert, update, delete on public.labels to authenticated;
grant all on public.labels to service_role;

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.labels enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy accounts_select on public.accounts for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy accounts_insert on public.accounts for insert to authenticated
  with check (user_id = auth.uid());
create policy accounts_update on public.accounts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy accounts_delete on public.accounts for delete to authenticated
  using (user_id = auth.uid());

create policy labels_select on public.labels for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy labels_insert on public.labels for insert to authenticated
  with check (user_id = auth.uid());
create policy labels_update on public.labels for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy labels_delete on public.labels for delete to authenticated
  using (user_id = auth.uid());