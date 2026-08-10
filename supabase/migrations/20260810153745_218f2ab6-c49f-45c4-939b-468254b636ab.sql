create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_month date not null check (period_month = date_trunc('month', period_month::timestamp)::date),
  currency_code text not null references public.currencies(code),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_budgets before insert or update on public.budgets
  for each row execute function public.fn_touch_audit();
create unique index ux_budget_month on public.budgets(user_id, period_month) where deleted_at is null;

create table public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  planned bigint not null check (planned >= 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_budget_lines before insert or update on public.budget_lines
  for each row execute function public.fn_touch_audit();
create unique index ux_budget_line on public.budget_lines(budget_id, category_id) where deleted_at is null;
create index ix_budget_lines_user on public.budget_lines(user_id) where deleted_at is null;

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  blurb text,
  icon text,
  target_amount bigint not null check (target_amount > 0),
  currency_code text not null references public.currencies(code),
  target_date date,
  account_id uuid references public.accounts(id),
  monthly_contribution bigint not null default 0 check (monthly_contribution >= 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_goals before insert or update on public.goals
  for each row execute function public.fn_touch_audit();
create index ix_goals_user on public.goals(user_id) where deleted_at is null;

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null check (amount <> 0),
  contributed_on date not null default current_date,
  transaction_id uuid references public.transactions(id),
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_goal_contributions before insert or update on public.goal_contributions
  for each row execute function public.fn_touch_audit();
create index ix_goal_contrib_goal on public.goal_contributions(goal_id) where deleted_at is null;

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  name text not null,
  asset_class public.holding_class not null,
  units numeric(20,6) not null check (units >= 0),
  invested bigint not null default 0 check (invested >= 0),
  last_price bigint not null default 0 check (last_price >= 0),
  priced_at timestamptz,
  currency_code text not null references public.currencies(code),
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_holdings before insert or update on public.holdings
  for each row execute function public.fn_touch_audit();
create index ix_holdings_user on public.holdings(user_id) where deleted_at is null;
create index ix_holdings_account on public.holdings(account_id) where deleted_at is null;

grant select, insert, update, delete on public.budgets to authenticated;
grant all on public.budgets to service_role;
grant select, insert, update, delete on public.budget_lines to authenticated;
grant all on public.budget_lines to service_role;
grant select, insert, update, delete on public.goals to authenticated;
grant all on public.goals to service_role;
grant select, insert, update, delete on public.goal_contributions to authenticated;
grant all on public.goal_contributions to service_role;
grant select, insert, update, delete on public.holdings to authenticated;
grant all on public.holdings to service_role;

alter table public.budgets enable row level security;
alter table public.budget_lines enable row level security;
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.holdings enable row level security;

create policy budgets_select on public.budgets for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy budgets_insert on public.budgets for insert to authenticated with check (user_id = auth.uid());
create policy budgets_update on public.budgets for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy budgets_delete on public.budgets for delete to authenticated using (user_id = auth.uid());

create policy budget_lines_select on public.budget_lines for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy budget_lines_insert on public.budget_lines for insert to authenticated with check (user_id = auth.uid());
create policy budget_lines_update on public.budget_lines for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy budget_lines_delete on public.budget_lines for delete to authenticated using (user_id = auth.uid());

create policy goals_select on public.goals for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy goals_insert on public.goals for insert to authenticated with check (user_id = auth.uid());
create policy goals_update on public.goals for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_delete on public.goals for delete to authenticated using (user_id = auth.uid());

create policy goal_contrib_select on public.goal_contributions for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy goal_contrib_insert on public.goal_contributions for insert to authenticated with check (user_id = auth.uid());
create policy goal_contrib_update on public.goal_contributions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goal_contrib_delete on public.goal_contributions for delete to authenticated using (user_id = auth.uid());

create policy holdings_select on public.holdings for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy holdings_insert on public.holdings for insert to authenticated with check (user_id = auth.uid());
create policy holdings_update on public.holdings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy holdings_delete on public.holdings for delete to authenticated using (user_id = auth.uid());