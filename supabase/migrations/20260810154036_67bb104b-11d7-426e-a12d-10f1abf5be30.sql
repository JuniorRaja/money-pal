create or replace function public.fn_account_balance(p_account uuid)
returns bigint language sql stable security invoker set search_path = public as $$
  select (a.opening_balance + coalesce(sum(e.amount), 0))::bigint
  from public.accounts a
  left join public.transaction_entries e on e.account_id = a.id and e.deleted_at is null
  where a.id = p_account and a.deleted_at is null
  group by a.id, a.opening_balance;
$$;

create or replace function public.fn_convert(p_amount bigint, p_from text, p_to text, p_on date default current_date)
returns bigint language sql stable security invoker set search_path = public as $$
  select case
    when p_amount is null then null
    when p_from = p_to then p_amount
    else round(p_amount * (
      select r.rate from public.fx_rates r
      where r.base_code = p_from and r.quote_code = p_to and r.as_of <= p_on and r.deleted_at is null
      order by r.as_of desc limit 1))::bigint
  end;
$$;

create view public.v_account_balances with (security_invoker = true) as
select a.id as account_id, a.user_id, a.name, a.institution, a.kind,
       a.currency_code, c.symbol, c.minor_unit, a.credit_limit, a.is_primary,
       (a.opening_balance + coalesce(sum(e.amount), 0))::bigint as balance
from public.accounts a
join public.currencies c on c.code = a.currency_code
left join public.transaction_entries e on e.account_id = a.id and e.deleted_at is null
where a.deleted_at is null
group by a.id, c.symbol, c.minor_unit;

create view public.v_net_worth with (security_invoker = true) as
select b.user_id, p.base_currency,
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

create view public.v_monthly_cashflow with (security_invoker = true) as
select t.user_id,
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

create view public.v_category_spend with (security_invoker = true) as
select t.user_id,
       date_trunc('month', t.occurred_at)::date as period_month,
       t.category_id, e.currency_code,
       coalesce(-sum(e.amount), 0)::bigint as spent,
       count(distinct t.id) as txn_count
from public.transactions t
join public.transaction_entries e on e.transaction_id = t.id and e.deleted_at is null
where t.deleted_at is null and t.type = 'expense'
group by t.user_id, date_trunc('month', t.occurred_at)::date, t.category_id, e.currency_code;

create view public.v_budget_progress with (security_invoker = true) as
select bl.user_id, b.period_month, bl.category_id, cat.name as category_name,
       cat.color_token, b.currency_code, bl.planned,
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

create view public.v_goal_progress with (security_invoker = true) as
select g.id as goal_id, g.user_id, g.name, g.icon, g.blurb, g.target_amount,
       g.currency_code, g.target_date, g.monthly_contribution,
       coalesce(sum(gc.amount), 0)::bigint as saved,
       (g.target_amount - coalesce(sum(gc.amount), 0))::bigint as remaining,
       case when g.target_amount = 0 then 0
            else round(coalesce(sum(gc.amount), 0) * 10000.0 / g.target_amount)::int end as progress_bps
from public.goals g
left join public.goal_contributions gc on gc.goal_id = g.id and gc.deleted_at is null
where g.deleted_at is null
group by g.id;

create view public.v_holdings_valuation with (security_invoker = true) as
select h.id, h.user_id, h.account_id, h.name, h.asset_class, h.units,
       h.invested, h.last_price, h.priced_at, h.currency_code,
       round(h.units * h.last_price)::bigint as current_value,
       (round(h.units * h.last_price) - h.invested)::bigint as unrealised_gain
from public.holdings h
where h.deleted_at is null;

grant select on public.v_account_balances, public.v_net_worth, public.v_monthly_cashflow,
                public.v_category_spend, public.v_budget_progress, public.v_goal_progress,
                public.v_holdings_valuation to authenticated;
grant all on public.v_account_balances, public.v_net_worth, public.v_monthly_cashflow,
             public.v_category_spend, public.v_budget_progress, public.v_goal_progress,
             public.v_holdings_valuation to service_role;

create or replace function public.fn_apply_budget_template(
  p_template_name text, p_period_month date, p_monthly_income bigint, p_currency text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_month date := date_trunc('month', p_period_month::timestamp)::date;
  v_currency text := coalesce(p_currency, (select base_currency from public.profiles where user_id = v_uid), 'INR');
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

create or replace function public.fn_record_transaction(
  p_occurred_at timestamptz,
  p_type public.txn_type,
  p_from_account uuid,
  p_amount bigint,
  p_to_account uuid default null,
  p_category uuid default null,
  p_merchant text default null,
  p_descriptor text default null,
  p_label uuid default null,
  p_payment_method text default null,
  p_note text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_txn uuid;
  v_from_ccy text;
  v_to_ccy text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'p_amount must be positive; direction comes from p_type'; end if;

  select currency_code into v_from_ccy from public.accounts
   where id = p_from_account and user_id = v_uid and deleted_at is null;
  if v_from_ccy is null then raise exception 'account not found'; end if;

  insert into public.transactions
    (user_id, occurred_at, type, merchant, descriptor, note, category_id, label_id, payment_method)
  values (v_uid, p_occurred_at, p_type, p_merchant, p_descriptor, p_note, p_category, p_label, p_payment_method)
  returning id into v_txn;

  insert into public.transaction_entries (transaction_id, user_id, account_id, amount, currency_code)
  values (v_txn, v_uid, p_from_account,
          case when p_type = 'income' then p_amount else -p_amount end, v_from_ccy);

  if p_type = 'transfer' then
    if p_to_account is null then raise exception 'transfer needs p_to_account'; end if;
    select currency_code into v_to_ccy from public.accounts
     where id = p_to_account and user_id = v_uid and deleted_at is null;
    if v_to_ccy is null then raise exception 'destination account not found'; end if;
    insert into public.transaction_entries (transaction_id, user_id, account_id, amount, currency_code)
    values (v_txn, v_uid, p_to_account,
            public.fn_convert(p_amount, v_from_ccy, v_to_ccy, p_occurred_at::date), v_to_ccy);
  end if;

  return v_txn;
end $$;

grant execute on function public.fn_account_balance(uuid) to authenticated;
grant execute on function public.fn_convert(bigint, text, text, date) to authenticated;
grant execute on function public.fn_apply_budget_template(text, date, bigint, text) to authenticated;
grant execute on function public.fn_record_transaction(timestamptz, public.txn_type, uuid, bigint, uuid, uuid, text, text, uuid, text, text) to authenticated;