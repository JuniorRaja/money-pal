create view public.v_transactions_flat with (security_invoker = true) as
select t.id, t.user_id, t.occurred_at, t.type, t.merchant, t.descriptor, t.note,
       t.category_id, cat.name as category_name, cat.color_token as category_color,
       t.label_id, t.payment_method, t.source, t.confidence, t.attachments,
       e.id as entry_id, e.account_id, e.amount, e.currency_code,
       cur.symbol as currency_symbol, cur.minor_unit,
       a.name as account_name, a.kind as account_kind
from public.transactions t
join public.transaction_entries e on e.transaction_id = t.id and e.deleted_at is null
join public.accounts a on a.id = e.account_id
join public.currencies cur on cur.code = e.currency_code
left join public.categories cat on cat.id = t.category_id
where t.deleted_at is null;

create view public.v_account_monthly_flow with (security_invoker = true) as
select e.user_id, e.account_id,
       date_trunc('month', t.occurred_at)::date as period_month,
       coalesce(sum(e.amount), 0)::bigint as delta,
       max(t.occurred_at) as last_activity_at,
       count(*) as entry_count
from public.transaction_entries e
join public.transactions t on t.id = e.transaction_id and t.deleted_at is null
where e.deleted_at is null
group by e.user_id, e.account_id, date_trunc('month', t.occurred_at)::date;

grant select on public.v_transactions_flat, public.v_account_monthly_flow to authenticated;
grant all on public.v_transactions_flat, public.v_account_monthly_flow to service_role;