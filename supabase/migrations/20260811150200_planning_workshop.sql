-- Baseline 3/4: budgets, goals, holdings, timeline, import stubs + RLS

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

create table public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null,
  kind public.timeline_kind not null,
  title text not null,
  detail text,
  amount bigint,
  currency_code text references public.currencies(code),
  account_id uuid references public.accounts(id),
  transaction_id uuid references public.transactions(id),
  action_label text,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_timeline before insert or update on public.timeline_events
  for each row execute function public.fn_touch_audit();
create index ix_timeline_user_time on public.timeline_events(user_id, occurred_at desc) where deleted_at is null;
create index ix_timeline_kind on public.timeline_events(user_id, kind) where deleted_at is null;

create table public.import_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.import_kind not null,
  name text not null,
  status text not null default 'idle',
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_import_sources before insert or update on public.import_sources
  for each row execute function public.fn_touch_audit();
create index ix_import_sources_user on public.import_sources(user_id) where deleted_at is null;

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.import_sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  rows_total int not null default 0 check (rows_total >= 0),
  rows_done int not null default 0 check (rows_done >= 0),
  imported int not null default 0 check (imported >= 0),
  duplicates int not null default 0 check (duplicates >= 0),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_import_jobs before insert or update on public.import_jobs
  for each row execute function public.fn_touch_audit();
create index ix_import_jobs_user on public.import_jobs(user_id, created_at desc) where deleted_at is null;

create table public.import_review_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.import_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.review_kind not null,
  title text,
  detail text,
  action_label text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_import_reviews before insert or update on public.import_review_items
  for each row execute function public.fn_touch_audit();
create index ix_import_reviews_user on public.import_review_items(user_id)
  where deleted_at is null and resolved_at is null;

create or replace function public.fn_apply_budget_template(
  p_template_name text,
  p_period_month date,
  p_monthly_income bigint,
  p_currency text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_month date := date_trunc('month', p_period_month::timestamp)::date;
  v_currency text := coalesce(
    p_currency,
    (select base_currency from public.profiles where user_id = v_uid),
    'INR'
  );
  v_budget uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select id into v_budget from public.budgets
   where user_id = v_uid and period_month = v_month and deleted_at is null;

  if v_budget is null then
    insert into public.budgets (user_id, period_month, currency_code)
    values (v_uid, v_month, v_currency)
    returning id into v_budget;
  end if;

  insert into public.budget_lines (budget_id, user_id, category_id, planned)
  select v_budget, v_uid, bt.category_id, round(p_monthly_income * bt.share_bps / 10000.0)::bigint
  from public.budget_templates bt
  where bt.name = p_template_name and bt.deleted_at is null
  on conflict do nothing;

  return v_budget;
end $$;

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
grant select, insert, update, delete on public.timeline_events to authenticated;
grant all on public.timeline_events to service_role;
grant select, insert, update, delete on public.import_sources to authenticated;
grant all on public.import_sources to service_role;
grant select, insert, update, delete on public.import_jobs to authenticated;
grant all on public.import_jobs to service_role;
grant select, insert, update, delete on public.import_review_items to authenticated;
grant all on public.import_review_items to service_role;

alter table public.budgets enable row level security;
alter table public.budget_lines enable row level security;
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.holdings enable row level security;
alter table public.timeline_events enable row level security;
alter table public.import_sources enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_review_items enable row level security;

create policy budgets_select on public.budgets for select to authenticated
  using (user_id = auth.uid());
create policy budgets_insert on public.budgets for insert to authenticated with check (user_id = auth.uid());
create policy budgets_update on public.budgets for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy budgets_delete on public.budgets for delete to authenticated using (user_id = auth.uid());

create policy budget_lines_select on public.budget_lines for select to authenticated
  using (user_id = auth.uid());
create policy budget_lines_insert on public.budget_lines for insert to authenticated with check (user_id = auth.uid());
create policy budget_lines_update on public.budget_lines for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy budget_lines_delete on public.budget_lines for delete to authenticated using (user_id = auth.uid());

create policy goals_select on public.goals for select to authenticated
  using (user_id = auth.uid());
create policy goals_insert on public.goals for insert to authenticated with check (user_id = auth.uid());
create policy goals_update on public.goals for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_delete on public.goals for delete to authenticated using (user_id = auth.uid());

create policy goal_contrib_select on public.goal_contributions for select to authenticated
  using (user_id = auth.uid());
create policy goal_contrib_insert on public.goal_contributions for insert to authenticated with check (user_id = auth.uid());
create policy goal_contrib_update on public.goal_contributions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goal_contrib_delete on public.goal_contributions for delete to authenticated using (user_id = auth.uid());

create policy holdings_select on public.holdings for select to authenticated
  using (user_id = auth.uid());
create policy holdings_insert on public.holdings for insert to authenticated with check (user_id = auth.uid());
create policy holdings_update on public.holdings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy holdings_delete on public.holdings for delete to authenticated using (user_id = auth.uid());

create policy timeline_select on public.timeline_events for select to authenticated
  using (user_id = auth.uid());
create policy timeline_insert on public.timeline_events for insert to authenticated with check (user_id = auth.uid());
create policy timeline_update on public.timeline_events for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy timeline_delete on public.timeline_events for delete to authenticated using (user_id = auth.uid());

create policy import_sources_select on public.import_sources for select to authenticated
  using (user_id = auth.uid());
create policy import_sources_insert on public.import_sources for insert to authenticated with check (user_id = auth.uid());
create policy import_sources_update on public.import_sources for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy import_sources_delete on public.import_sources for delete to authenticated using (user_id = auth.uid());

create policy import_jobs_select on public.import_jobs for select to authenticated
  using (user_id = auth.uid());
create policy import_jobs_insert on public.import_jobs for insert to authenticated with check (user_id = auth.uid());
create policy import_jobs_update on public.import_jobs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy import_jobs_delete on public.import_jobs for delete to authenticated using (user_id = auth.uid());

create policy import_reviews_select on public.import_review_items for select to authenticated
  using (user_id = auth.uid());
create policy import_reviews_insert on public.import_review_items for insert to authenticated with check (user_id = auth.uid());
create policy import_reviews_update on public.import_review_items for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy import_reviews_delete on public.import_review_items for delete to authenticated using (user_id = auth.uid());

grant execute on function public.fn_apply_budget_template(text, date, bigint, text) to authenticated;
