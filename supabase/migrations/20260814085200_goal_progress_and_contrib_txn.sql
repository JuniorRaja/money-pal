-- Goal progress: account + this-month saved.
-- One live contribution per transaction; deleting a txn unlinks, does not wipe saved.

alter table public.goal_contributions
  drop constraint if exists goal_contributions_transaction_id_fkey;

alter table public.goal_contributions
  add constraint goal_contributions_transaction_id_fkey
  foreign key (transaction_id) references public.transactions(id) on delete set null;

create unique index if not exists ux_goal_contrib_live_txn
  on public.goal_contributions (transaction_id)
  where deleted_at is null and transaction_id is not null;

drop view if exists public.v_goal_progress;

create view public.v_goal_progress
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
  g.account_id,
  coalesce(sum(gc.amount), 0)::bigint as saved,
  (g.target_amount - coalesce(sum(gc.amount), 0))::bigint as remaining,
  case when g.target_amount = 0 then 0
       else round(coalesce(sum(gc.amount), 0) * 10000.0 / g.target_amount)::int end as progress_bps,
  coalesce(sum(gc.amount) filter (
    where date_trunc('month', gc.contributed_on::timestamp) = date_trunc('month', current_date::timestamp)
  ), 0)::bigint as saved_this_month
from public.goals g
left join public.goal_contributions gc on gc.goal_id = g.id and gc.deleted_at is null
where g.deleted_at is null
group by g.id;

grant select on public.v_goal_progress to authenticated;
grant all on public.v_goal_progress to service_role;
