-- P3-2 Part A: derive amount_paid from transfer entries instead of storing it.
-- Window: previous cycle's statement_date (exclusive) → this cycle's statement_date (inclusive).
-- A CC payment is a transfer where the CC account receives a positive entry.

drop view if exists public.v_credit_card_current;

alter table public.credit_card_cycles drop column amount_paid;

-- All cycles with derived amount_paid (used by app instead of the raw table).
create or replace view public.v_credit_card_cycles
with (security_invoker = true) as
select
  cy.id,
  cy.user_id,
  cy.account_id,
  cy.statement_date,
  cy.due_date,
  cy.credit_limit,
  cy.statement_balance,
  cy.payment_due_amount,
  cy.minimum_due,
  cy.is_current,
  cy.notes,
  cy.created_at,
  cy.modified_at,
  coalesce((
    select sum(e.amount)
    from public.transaction_entries e
    join public.transactions t on t.id = e.transaction_id
    where e.account_id = cy.account_id
      and e.deleted_at is null
      and t.deleted_at is null
      and t.type = 'transfer'
      and e.amount > 0
      and t.occurred_at::date > coalesce(
        (select max(prev.statement_date)
         from public.credit_card_cycles prev
         where prev.account_id = cy.account_id
           and prev.statement_date < cy.statement_date
           and prev.deleted_at is null),
        '1970-01-01'::date
      )
      and t.occurred_at::date <= cy.statement_date
  ), 0)::bigint as amount_paid
from public.credit_card_cycles cy
where cy.deleted_at is null;

grant select on public.v_credit_card_cycles to authenticated;

-- Recreate v_credit_card_current to pull amount_paid from the new view.
create or replace view public.v_credit_card_current
with (security_invoker = true) as
select
  a.id                     as account_id,
  a.user_id,
  a.name,
  a.institution,
  a.currency_code,
  a.credit_limit           as account_credit_limit,
  a.bill_generation_day,
  a.due_day,
  b.balance,
  b.used_amount,
  cy.id                    as cycle_id,
  cy.statement_date,
  cy.due_date              as cycle_due_date,
  cy.credit_limit          as cycle_credit_limit,
  cy.statement_balance,
  cy.payment_due_amount,
  cy.minimum_due,
  cy.amount_paid,
  cy.is_current
from public.accounts a
join public.v_account_balances b on b.account_id = a.id
left join public.v_credit_card_cycles cy
  on cy.account_id = a.id and cy.is_current
where a.deleted_at is null and a.kind = 'credit_card';
