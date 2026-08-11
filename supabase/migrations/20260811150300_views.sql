-- Baseline 4/4: reporting views (security_invoker) + grants

create or replace view public.v_account_balances
with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.name,
  a.institution,
  a.kind,
  a.currency_code,
  c.symbol,
  c.minor_unit,
  a.credit_limit,
  a.bill_generation_day,
  a.due_day,
  a.interest_rate_bps,
  a.emi_amount,
  a.tenure_months,
  a.lender,
  a.is_primary,
  (a.opening_balance + coalesce(sum(e.amount), 0))::bigint as balance,
  -- outstanding / "used" for credit cards (ledger-derived)
  case
    when a.kind = 'credit_card'
      then greatest(-(a.opening_balance + coalesce(sum(e.amount), 0)), 0)::bigint
    else null
  end as used_amount
from public.accounts a
join public.currencies c on c.code = a.currency_code
left join public.transaction_entries e on e.account_id = a.id and e.deleted_at is null
where a.deleted_at is null
group by a.id, c.symbol, c.minor_unit;

create or replace view public.v_credit_card_current
with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.name,
  a.institution,
  a.currency_code,
  a.credit_limit as account_credit_limit,
  a.bill_generation_day,
  a.due_day,
  b.balance,
  b.used_amount,
  cy.id as cycle_id,
  cy.statement_date,
  cy.due_date as cycle_due_date,
  cy.credit_limit as cycle_credit_limit,
  cy.statement_balance,
  cy.payment_due_amount,
  cy.minimum_due,
  cy.amount_paid,
  cy.is_current
from public.accounts a
join public.v_account_balances b on b.account_id = a.id
left join public.credit_card_cycles cy
  on cy.account_id = a.id and cy.is_current and cy.deleted_at is null
where a.deleted_at is null and a.kind = 'credit_card';

create or replace view public.v_net_worth
with (security_invoker = true) as
select
  b.user_id,
  p.base_currency,
  coalesce(sum(public.fn_convert(b.balance, b.currency_code, p.base_currency))
    filter (where b.kind in ('bank','cash')), 0) as cash,
  coalesce(sum(public.fn_convert(b.balance, b.currency_code, p.base_currency))
    filter (where b.kind = 'investment'), 0) as investments,
  coalesce(sum(public.fn_convert(b.balance, b.currency_code, p.base_currency))
    filter (where b.kind in ('credit_card','loan')), 0) as liabilities,
  coalesce(sum(public.fn_convert(b.balance, b.currency_code, p.base_currency)), 0) as net_worth
from public.v_account_balances b
join public.profiles p on p.user_id = b.user_id
group by b.user_id, p.base_currency;

create or replace view public.v_monthly_cashflow
with (security_invoker = true) as
select
  t.user_id,
  date_trunc('month', t.occurred_at)::date as period_month,
  e.currency_code,
  coalesce(sum(e.amount) filter (where e.amount > 0), 0)::bigint as income,
  coalesce(-sum(e.amount) filter (where e.amount < 0), 0)::bigint as expense,
  coalesce(sum(e.amount), 0)::bigint as net,
  count(distinct t.id) as txn_count
from public.transactions t
join public.transaction_entries e on e.transaction_id = t.id and e.deleted_at is null
where t.deleted_at is null and t.type <> 'transfer'
group by t.user_id, date_trunc('month', t.occurred_at)::date, e.currency_code;

create or replace view public.v_category_spend
with (security_invoker = true) as
select
  t.user_id,
  date_trunc('month', t.occurred_at)::date as period_month,
  t.category_id,
  e.currency_code,
  coalesce(-sum(e.amount), 0)::bigint as spent,
  count(distinct t.id) as txn_count
from public.transactions t
join public.transaction_entries e on e.transaction_id = t.id and e.deleted_at is null
where t.deleted_at is null and t.type = 'expense'
group by t.user_id, date_trunc('month', t.occurred_at)::date, t.category_id, e.currency_code;

create or replace view public.v_budget_progress
with (security_invoker = true) as
select
  bl.user_id,
  b.period_month,
  bl.category_id,
  cat.name as category_name,
  cat.color_token,
  b.currency_code,
  bl.planned,
  coalesce(cs.spent, 0)::bigint as spent,
  (bl.planned - coalesce(cs.spent, 0))::bigint as remaining,
  case when bl.planned = 0 then 0
       else round(coalesce(cs.spent, 0) * 10000.0 / bl.planned)::int end as used_bps
from public.budget_lines bl
join public.budgets b on b.id = bl.budget_id and b.deleted_at is null
join public.categories cat on cat.id = bl.category_id
left join public.v_category_spend cs
  on cs.user_id = bl.user_id
 and cs.category_id = bl.category_id
 and cs.period_month = b.period_month
 and cs.currency_code = b.currency_code
where bl.deleted_at is null;

create or replace view public.v_goal_progress
with (security_invoker = true) as
select
  g.id as goal_id,
  g.user_id,
  g.name,
  g.icon,
  g.blurb,
  g.target_amount,
  g.currency_code,
  g.target_date,
  g.monthly_contribution,
  coalesce(sum(gc.amount), 0)::bigint as saved,
  (g.target_amount - coalesce(sum(gc.amount), 0))::bigint as remaining,
  case when g.target_amount = 0 then 0
       else round(coalesce(sum(gc.amount), 0) * 10000.0 / g.target_amount)::int end as progress_bps
from public.goals g
left join public.goal_contributions gc on gc.goal_id = g.id and gc.deleted_at is null
where g.deleted_at is null
group by g.id;

create or replace view public.v_holdings_valuation
with (security_invoker = true) as
select
  h.id,
  h.user_id,
  h.account_id,
  h.name,
  h.asset_class,
  h.units,
  h.invested,
  h.last_price,
  h.priced_at,
  h.currency_code,
  round(h.units * h.last_price)::bigint as current_value,
  (round(h.units * h.last_price) - h.invested)::bigint as unrealised_gain
from public.holdings h
where h.deleted_at is null;

create or replace view public.v_account_slices
with (security_invoker = true) as
select
  l.id as slice_id,
  l.user_id,
  l.account_id,
  a.name as account_name,
  a.currency_code,
  l.name,
  l.kind,
  l.color_token,
  l.is_default,
  l.target_amount,
  l.target_date,
  (l.opening_amount + coalesce(sum(e.amount), 0))::bigint as amount,
  l.opening_amount
from public.labels l
join public.accounts a on a.id = l.account_id and a.deleted_at is null
left join public.transaction_entries e
  on e.label_id = l.id
 and e.account_id = l.account_id
 and e.deleted_at is null
where l.account_id is not null and l.deleted_at is null
group by l.id, l.user_id, l.account_id, a.name, a.currency_code,
         l.name, l.kind, l.color_token, l.is_default, l.target_amount, l.target_date, l.opening_amount;

create or replace view public.v_account_allocation
with (security_invoker = true) as
select
  b.account_id,
  b.user_id,
  b.name,
  b.kind as account_kind,
  b.currency_code,
  b.balance,
  coalesce(s.slice_count, 0) as slice_count,
  coalesce(s.allocated, 0)::bigint as allocated,
  (b.balance - coalesce(s.allocated, 0))::bigint as unallocated,
  coalesce(s.owned, 0)::bigint as owned_amount,
  coalesce(s.custodial, 0)::bigint as custodial_amount,
  coalesce(s.earmarked, 0)::bigint as earmarked_amount
from public.v_account_balances b
left join (
  select
    account_id,
    count(*) as slice_count,
    sum(amount) as allocated,
    sum(amount) filter (where kind = 'owned') as owned,
    sum(amount) filter (where kind = 'custodial') as custodial,
    sum(amount) filter (where kind = 'earmark') as earmarked
  from public.v_account_slices
  group by account_id
) s on s.account_id = b.account_id;

create or replace view public.v_net_worth_owned
with (security_invoker = true) as
select
  a.user_id,
  sum(a.balance)::bigint as net_worth,
  coalesce(sum(a.custodial_amount), 0)::bigint as custodial_total,
  coalesce(sum(a.earmarked_amount), 0)::bigint as earmarked_total,
  (sum(a.balance) - coalesce(sum(a.custodial_amount), 0))::bigint as owned_net_worth
from public.v_account_allocation a
group by a.user_id;

create or replace view public.v_transactions_flat
with (security_invoker = true) as
select
  t.id,
  t.user_id,
  t.occurred_at,
  t.type,
  t.merchant,
  t.descriptor,
  t.note,
  t.category_id,
  cat.name as category_name,
  cat.color_token as category_color,
  e.label_id,
  t.payment_method,
  t.source,
  t.confidence,
  t.attachments,
  e.id as entry_id,
  e.account_id,
  e.amount,
  e.currency_code,
  cur.symbol as currency_symbol,
  cur.minor_unit,
  a.name as account_name,
  a.kind as account_kind,
  t.id as transaction_id
from public.transactions t
join public.transaction_entries e on e.transaction_id = t.id and e.deleted_at is null
join public.accounts a on a.id = e.account_id
join public.currencies cur on cur.code = e.currency_code
left join public.categories cat on cat.id = t.category_id
where t.deleted_at is null;

create or replace view public.v_account_monthly_flow
with (security_invoker = true) as
select
  e.user_id,
  e.account_id,
  date_trunc('month', t.occurred_at)::date as period_month,
  coalesce(sum(e.amount), 0)::bigint as delta,
  max(t.occurred_at) as last_activity_at,
  count(*) as entry_count
from public.transaction_entries e
join public.transactions t on t.id = e.transaction_id and t.deleted_at is null
where e.deleted_at is null
group by e.user_id, e.account_id, date_trunc('month', t.occurred_at)::date;

grant select on public.v_account_balances,
                public.v_credit_card_current,
                public.v_net_worth,
                public.v_monthly_cashflow,
                public.v_category_spend,
                public.v_budget_progress,
                public.v_goal_progress,
                public.v_holdings_valuation,
                public.v_account_slices,
                public.v_account_allocation,
                public.v_net_worth_owned,
                public.v_transactions_flat,
                public.v_account_monthly_flow
  to authenticated;

grant all on public.v_account_balances,
             public.v_credit_card_current,
             public.v_net_worth,
             public.v_monthly_cashflow,
             public.v_category_spend,
             public.v_budget_progress,
             public.v_goal_progress,
             public.v_holdings_valuation,
             public.v_account_slices,
             public.v_account_allocation,
             public.v_net_worth_owned,
             public.v_transactions_flat,
             public.v_account_monthly_flow
  to service_role;
