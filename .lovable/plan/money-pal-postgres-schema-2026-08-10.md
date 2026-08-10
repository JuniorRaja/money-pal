# Money Pal — Postgres Schema

A production-shaped schema derived from the current mock data (accounts, transactions, categories, labels, monthly budgets, goals, holdings, timeline, imports, settings).

## Key decisions

1. **Money is `bigint` minor units** (paise/cents) plus a currency code. Never `float`/`real`. Each currency row carries its `minor_unit` exponent and symbol, so the UI formats from the account's currency.
2. **Balances are always derived.** Transactions are a header + **entries** (light double-entry). One expense = one entry; a transfer = two entries in one transaction, so balances, transfers and multi-currency all fall out of the same table. Account balance = `sum(entries.amount)` per account, exposed via a view and a function — no stored balance column to drift.
3. **Universal audit + soft delete** on every business table: `created_at, created_by, modified_at, modified_by, deleted_at, is_active`, maintained by a trigger. All read paths filter `deleted_at is null`.
4. **Simple relationships** — one owner (`user_id`) per row, plain FKs, no polymorphic keys, no EAV.
5. **Master data** (`currencies`, `category_groups`, `categories`, `budget_templates`) is global (`user_id is null`) and readable by everyone; users may add their own rows on top.
6. **Monthly budgets**: `budgets` (one per user + month + currency) → `budget_lines` (per category). Actuals are never stored; `v_budget_progress` computes them.
7. **RLS everywhere**, owner-scoped via `auth.uid()`; master rows are read-only to `authenticated`.
8. **Views/functions replace repeated math**: balances, net worth, monthly cashflow, budget progress, goal progress, holdings valuation.

## Other points to be considered

- **FX for cross-currency roll-ups.** Net worth across accounts in different currencies needs rates. The script includes an `fx_rates` table and converts via it, defaulting to the user's base currency.
- **Holdings pricing** — fetched from a market-data provider later. Script stores `last_price` + `priced_at` and derives value.
- **Budget rollover** — no rollover.
- **Goals** — funded by  explicit contribution rows. 
- **Imports** (Gmail/PDF/CSV) — real ingestion Later.
- **Auth/2FA** — Supabase auth.

Create required supabase code. We shall wire supabase next.

## Technical section — full DDL

```sql
-- 1. EXTENSIONS + ENUMS ------------------------------------------------------
create extension if not exists pgcrypto;

create type account_kind   as enum ('bank','cash','credit_card','investment','loan');
create type txn_type       as enum ('income','expense','transfer','adjustment');
create type category_kind  as enum ('income','essentials','lifestyle','transfer','investment');
create type holding_class  as enum ('equity','mutual_fund','gold','fixed_income','crypto');
create type timeline_kind  as enum ('money','ai_insight','goal','bill','system');
create type import_kind    as enum ('gmail','pdf','csv','manual');
create type review_kind    as enum ('duplicate','unknown_merchant','large_transfer');

-- 2. AUDIT CONTRACT ----------------------------------------------------------
create or replace function public.fn_touch_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now(); new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.created_at := old.created_at; new.created_by := old.created_by;
  end if;
  new.modified_at := now(); new.modified_by := auth.uid();
  new.is_active := (new.deleted_at is null);
  return new;
end $$;
-- applied to every table below:
-- create trigger trg_audit before insert or update on <t>
--   for each row execute function public.fn_touch_audit();

-- 3. MASTER DATA -------------------------------------------------------------
create table public.currencies (
  code text primary key,                       -- 'INR'
  name text not null, symbol text not null,
  minor_unit smallint not null default 2 check (minor_unit between 0 and 4),
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);

create table public.fx_rates (
  base_code text not null references public.currencies(code),
  quote_code text not null references public.currencies(code),
  rate numeric(20,10) not null check (rate > 0),   -- numeric: a rate, not money
  as_of date not null,
  primary key (base_code, quote_code, as_of));

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,  -- null = master row
  parent_id uuid references public.categories(id),
  name text not null, kind category_kind not null,
  icon text, color_token text,
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);
create unique index ux_categories_name on public.categories
  (coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  where deleted_at is null;

create table public.budget_templates (            -- seeded "simple budget" presets
  id uuid primary key default gen_random_uuid(),
  name text not null, category_id uuid not null references public.categories(id),
  share_bps int not null check (share_bps between 0 and 10000),  -- % of income
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);

-- 4. USER SCOPE --------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text, email text,
  base_currency text not null default 'INR' references public.currencies(code),
  week_starts_on smallint not null default 1, number_format text not null default 'indian',
  theme text not null default 'light', accent text, reduce_motion boolean not null default false,
  assistant_tone text not null default 'concise', assistant_context boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, institution text, kind account_kind not null,
  currency_code text not null references public.currencies(code),
  opening_balance bigint not null default 0,      -- minor units
  credit_limit bigint check (credit_limit is null or credit_limit >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);
create index ix_accounts_user on public.accounts(user_id) where deleted_at is null;
create unique index ux_accounts_primary on public.accounts(user_id)
  where is_primary and deleted_at is null;

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, color_token text,
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);

-- 5. LEDGER ------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null,
  type txn_type not null,
  merchant text, descriptor text, note text,
  category_id uuid references public.categories(id),
  label_id uuid references public.labels(id),
  payment_method text, source text default 'manual',
  confidence numeric(4,3) check (confidence between 0 and 1),
  external_ref text,                              -- import dedupe key
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);
create index ix_txn_user_time on public.transactions(user_id, occurred_at desc) where deleted_at is null;
create index ix_txn_month on public.transactions(user_id, date_trunc('month', occurred_at)) where deleted_at is null;
create index ix_txn_category on public.transactions(category_id) where deleted_at is null;
create unique index ux_txn_external on public.transactions(user_id, external_ref) where external_ref is not null and deleted_at is null;

create table public.transaction_entries (         -- one row per account leg
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  amount bigint not null check (amount <> 0),     -- signed minor units, account currency
  currency_code text not null references public.currencies(code),
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);
create index ix_entries_account on public.transaction_entries(account_id) where deleted_at is null;
create index ix_entries_txn on public.transaction_entries(transaction_id);

-- entry currency must match its account
create or replace function public.fn_entry_currency_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select currency_code from public.accounts where id = new.account_id) <> new.currency_code
  then raise exception 'entry currency must match account currency'; end if;
  return new;
end $$;

-- 6. PLAN --------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_month date not null check (date_trunc('month', period_month) = period_month),
  currency_code text not null references public.currencies(code),
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);
create unique index ux_budget_month on public.budgets(user_id, period_month) where deleted_at is null;

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  planned bigint not null check (planned >= 0),
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);
create unique index ux_budget_line on public.budget_lines(budget_id, category_id) where deleted_at is null;

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, blurb text, icon text,
  target_amount bigint not null check (target_amount > 0),
  currency_code text not null references public.currencies(code),
  target_date date, account_id uuid references public.accounts(id),
  monthly_contribution bigint not null default 0,
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null, contributed_on date not null default current_date,
  transaction_id uuid references public.transactions(id),
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  name text not null, asset_class holding_class not null,
  units numeric(20,6) not null check (units >= 0),      -- quantity, not money
  invested bigint not null default 0,
  last_price bigint not null default 0, priced_at timestamptz,
  currency_code text not null references public.currencies(code),
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);

-- 7. WORKSHOP ----------------------------------------------------------------
create table public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null, kind timeline_kind not null,
  title text not null, detail text, amount bigint,
  currency_code text references public.currencies(code),
  account_id uuid references public.accounts(id), action_label text,
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);
create index ix_timeline_user_time on public.timeline_events(user_id, occurred_at desc) where deleted_at is null;

create table public.import_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind import_kind not null, name text not null, status text not null default 'idle',
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.import_sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text, rows_total int not null default 0, rows_done int not null default 0,
  imported int not null default 0, duplicates int not null default 0, finished_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);

create table public.import_review_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.import_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind review_kind not null, title text, detail text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid,
  modified_at timestamptz not null default now(), modified_by uuid,
  deleted_at timestamptz, is_active boolean not null default true);

-- 8. GRANTS ------------------------------------------------------------------
-- for every table above:
--   grant select, insert, update, delete on public.<t> to authenticated;
--   grant all on public.<t> to service_role;
-- master tables (currencies, fx_rates, categories, budget_templates): also
--   grant select ... to anon;  (read-only reference data)

-- 9. FUNCTIONS ---------------------------------------------------------------
create or replace function public.fn_account_balance(p_account uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(a.opening_balance,0) + coalesce(sum(e.amount),0)
  from public.accounts a
  left join public.transaction_entries e
    on e.account_id = a.id and e.deleted_at is null
  where a.id = p_account and a.deleted_at is null
  group by a.opening_balance $$;

create or replace function public.fn_convert(p_amount bigint, p_from text, p_to text, p_on date default current_date)
returns bigint language sql stable set search_path = public as $$
  select case when p_from = p_to then p_amount else round(p_amount * (
    select rate from public.fx_rates
    where base_code = p_from and quote_code = p_to and as_of <= p_on
    order by as_of desc limit 1))::bigint end $$;

-- 10. VIEWS (all owner-filtered; RLS on base tables still applies) -----------
create view public.v_account_balances as
select a.id account_id, a.user_id, a.name, a.kind, a.currency_code, c.symbol,
       a.credit_limit,
       a.opening_balance + coalesce(sum(e.amount),0) as balance
from public.accounts a
join public.currencies c on c.code = a.currency_code
left join public.transaction_entries e on e.account_id = a.id and e.deleted_at is null
where a.deleted_at is null
group by a.id, c.symbol;

create view public.v_net_worth as
select b.user_id, p.base_currency,
  sum(public.fn_convert(b.balance, b.currency_code, p.base_currency))
    filter (where b.kind in ('bank','cash'))       as cash,
  sum(public.fn_convert(b.balance, b.currency_code, p.base_currency))
    filter (where b.kind = 'investment')            as investments,
  sum(public.fn_convert(b.balance, b.currency_code, p.base_currency))
    filter (where b.kind in ('credit_card','loan')) as liabilities,
  sum(public.fn_convert(b.balance, b.currency_code, p.base_currency)) as net_worth
from public.v_account_balances b
join public.profiles p on p.user_id = b.user_id
group by b.user_id, p.base_currency;

create view public.v_monthly_cashflow as
select t.user_id, date_trunc('month', t.occurred_at)::date as period_month,
       e.currency_code,
       sum(e.amount) filter (where e.amount > 0) as income,
       -sum(e.amount) filter (where e.amount < 0) as expense,
       sum(e.amount) as net, count(distinct t.id) as txn_count
from public.transactions t
join public.transaction_entries e on e.transaction_id = t.id and e.deleted_at is null
where t.deleted_at is null and t.type <> 'transfer'
group by 1,2,3;

create view public.v_budget_progress as
select bl.user_id, b.period_month, bl.category_id, cat.name category_name,
       b.currency_code, bl.planned,
       coalesce(-sum(e.amount),0) as spent,
       bl.planned - coalesce(-sum(e.amount),0) as remaining,
       case when bl.planned = 0 then 0
            else round(coalesce(-sum(e.amount),0) * 10000.0 / bl.planned)::int end as used_bps
from public.budget_lines bl
join public.budgets b on b.id = bl.budget_id and b.deleted_at is null
join public.categories cat on cat.id = bl.category_id
left join public.transactions t
  on t.user_id = bl.user_id and t.category_id = bl.category_id
 and t.deleted_at is null and t.type = 'expense'
 and date_trunc('month', t.occurred_at)::date = b.period_month
left join public.transaction_entries e on e.transaction_id = t.id and e.deleted_at is null
where bl.deleted_at is null
group by bl.user_id, b.period_month, bl.category_id, cat.name, b.currency_code, bl.planned;

create view public.v_goal_progress as
select g.id goal_id, g.user_id, g.name, g.target_amount, g.currency_code, g.target_date,
       coalesce(sum(gc.amount),0) as saved,
       case when g.target_amount = 0 then 0
            else round(coalesce(sum(gc.amount),0) * 10000.0 / g.target_amount)::int end as progress_bps
from public.goals g
left join public.goal_contributions gc on gc.goal_id = g.id and gc.deleted_at is null
where g.deleted_at is null group by g.id;

create view public.v_holdings_valuation as
select h.*, round(h.units * h.last_price)::bigint as current_value,
       round(h.units * h.last_price)::bigint - h.invested as unrealised_gain
from public.holdings h where h.deleted_at is null;

-- 11. RLS --------------------------------------------------------------------
-- Owner tables (accounts, labels, transactions, transaction_entries, budgets,
-- budget_lines, goals, goal_contributions, holdings, timeline_events,
-- import_sources, import_jobs, import_review_items, profiles):
--   alter table public.<t> enable row level security;
--   create policy own_select on public.<t> for select to authenticated
--     using (auth.uid() = user_id and deleted_at is null);
--   create policy own_insert on public.<t> for insert to authenticated
--     with check (auth.uid() = user_id);
--   create policy own_update on public.<t> for update to authenticated
--     using (auth.uid() = user_id) with check (auth.uid() = user_id);
--   create policy own_delete on public.<t> for delete to authenticated
--     using (auth.uid() = user_id);          -- app uses soft delete via update
-- categories: select using (user_id is null or auth.uid() = user_id);
--             insert/update/delete only where auth.uid() = user_id.
-- currencies / fx_rates / budget_templates: select to authenticated, anon; no writes.
-- Soft delete is enforced app-side by setting deleted_at; the audit trigger
-- keeps is_active in sync.

-- 12. SEED (master data) -----------------------------------------------------
-- currencies: INR ₹, USD $, EUR €, GBP £, AED د.إ, SGD S$ (minor_unit 2)
-- categories (master, user_id null): Income, Housing, Food, Transport,
--   Utilities, Shopping, Entertainment, Subscriptions, Health, Transfer,
--   Investment — with icon + color_token matching the current UI taxonomy.
-- budget_templates: "50/30/20 starter" lines mapping the essentials/lifestyle/
--   investment categories to share_bps.
```

## Rollout

Create migrations one by one (enums → master → user → ledger → plan → workshop → grants → functions → views → RLS), then a seed migration with literal `INSERT`s for currencies, categories and budget templates. The app's `src/data/repository.ts` stays the only boundary that changes — each function becomes a server function reading these views.