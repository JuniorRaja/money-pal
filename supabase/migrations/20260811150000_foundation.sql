-- Baseline 1/4: extensions, enums, audit helper, reference data + RLS

create extension if not exists pgcrypto;

create type public.account_kind  as enum ('bank','cash','credit_card','investment','loan');
create type public.txn_type      as enum ('income','expense','transfer','adjustment');
create type public.category_kind as enum ('income','essentials','lifestyle','transfer','investment');
create type public.holding_class as enum ('equity','mutual_fund','gold','fixed_income','crypto');
create type public.timeline_kind as enum ('money','ai_insight','goal','bill','system');
create type public.import_kind   as enum ('gmail','pdf','csv','manual');
create type public.review_kind   as enum ('duplicate','unknown_merchant','large_transfer');
create type public.slice_kind    as enum ('owned','custodial','earmark');

create or replace function public.fn_touch_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.modified_at := now();
  new.modified_by := auth.uid();
  new.is_active := (new.deleted_at is null);
  return new;
end $$;

revoke execute on function public.fn_touch_audit() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Reference tables
-- -----------------------------------------------------------------------------

create table public.currencies (
  code text primary key,
  name text not null,
  symbol text not null,
  minor_unit smallint not null default 2 check (minor_unit between 0 and 4),
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_currencies before insert or update on public.currencies
  for each row execute function public.fn_touch_audit();

create table public.fx_rates (
  base_code text not null references public.currencies(code),
  quote_code text not null references public.currencies(code),
  as_of date not null,
  rate numeric(20,10) not null check (rate > 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true,
  primary key (base_code, quote_code, as_of)
);
create trigger trg_audit_fx_rates before insert or update on public.fx_rates
  for each row execute function public.fn_touch_audit();

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  parent_id uuid references public.categories(id),
  name text not null,
  kind public.category_kind not null,
  icon text,
  color_token text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_categories before insert or update on public.categories
  for each row execute function public.fn_touch_audit();
create unique index ux_categories_name on public.categories
  (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  where deleted_at is null;
create index ix_categories_user on public.categories(user_id) where deleted_at is null;

create table public.budget_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid not null references public.categories(id),
  share_bps int not null check (share_bps between 0 and 10000),
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_budget_templates before insert or update on public.budget_templates
  for each row execute function public.fn_touch_audit();
create unique index ux_budget_template_line on public.budget_templates(name, category_id)
  where deleted_at is null;

insert into public.currencies (code, name, symbol, minor_unit)
values ('INR', 'Indian Rupee', '₹', 2);

-- -----------------------------------------------------------------------------
-- Grants + RLS (reference data)
-- Soft-deleted rows are filtered in views/app, not SELECT policies.
-- -----------------------------------------------------------------------------

grant select on public.currencies to authenticated, anon;
grant all on public.currencies to service_role;
grant select on public.fx_rates to authenticated, anon;
grant all on public.fx_rates to service_role;
grant select, insert, update, delete on public.categories to authenticated;
grant select on public.categories to anon;
grant all on public.categories to service_role;
grant select on public.budget_templates to authenticated, anon;
grant all on public.budget_templates to service_role;

alter table public.currencies enable row level security;
alter table public.fx_rates enable row level security;
alter table public.categories enable row level security;
alter table public.budget_templates enable row level security;

create policy currencies_read on public.currencies for select to authenticated, anon
  using (true);
create policy fx_rates_read on public.fx_rates for select to authenticated, anon
  using (true);
create policy budget_templates_read on public.budget_templates for select to authenticated, anon
  using (true);

create policy categories_read on public.categories for select to authenticated
  using (user_id is null or user_id = auth.uid());
create policy categories_read_anon on public.categories for select to anon
  using (user_id is null);
create policy categories_insert on public.categories for insert to authenticated
  with check (user_id = auth.uid());
create policy categories_update on public.categories for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy categories_delete on public.categories for delete to authenticated
  using (user_id = auth.uid());
