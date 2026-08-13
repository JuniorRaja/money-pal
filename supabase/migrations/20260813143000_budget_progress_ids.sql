-- Expose budget_line_id and budget_id so the app can edit/archive lines.

drop view if exists public.v_budget_progress;

create view public.v_budget_progress
with (security_invoker = true) as
select
  bl.id as budget_line_id,
  b.id as budget_id,
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

grant select on public.v_budget_progress to authenticated;
grant all on public.v_budget_progress to service_role;
