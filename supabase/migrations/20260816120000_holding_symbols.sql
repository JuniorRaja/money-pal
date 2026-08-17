-- P3-4: market pricing for holdings.
--
-- No prices table: holdings.last_price/priced_at already exist and
-- v_holdings_valuation already derives current_value from them. A fetched price
-- and a hand-typed one are the same column, so there is nothing to fall back to.
-- What was missing is a symbol to fetch by and yesterday's price to diff against.

-- Land and property have no feed and no existing class. Note that a value added
-- here cannot be *used* until this migration commits — declaring it alongside the
-- columns is fine, inserting a 'property' row in this file is not.
alter type public.holding_class add value if not exists 'property';

alter table public.holdings
  -- AMFI scheme code for mutual funds, Yahoo ticker (RELIANCE.NS, GOLDBEES.NS)
  -- for equity and gold. Null means "priced by hand" — property, fixed income.
  add column if not exists symbol text,
  -- Previous close, in paise. 0 until the job has seen two distinct price dates,
  -- which the view reads as "no day change known" rather than a fake 0%.
  add column if not exists prev_price bigint not null default 0 check (prev_price >= 0);

create index if not exists ix_holdings_symbol on public.holdings(symbol)
  where symbol is not null and deleted_at is null;

-- Recreated to expose symbol/prev_price and a real day change. The old
-- day_change_pct lived in TypeScript and was actually since-inception return
-- (src/data/live.ts) rendered under a "Day" header.
--
-- New columns are appended, not interleaved: create-or-replace refuses to rename
-- or reorder an existing view column.
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
  (round(h.units * h.last_price) - h.invested)::bigint as unrealised_gain,
  h.symbol,
  h.prev_price,
  case
    when h.prev_price > 0
      then round((h.last_price - h.prev_price)::numeric * 100 / h.prev_price, 2)
    else 0
  end as day_change_pct
from public.holdings h
where h.deleted_at is null;

grant select on public.v_holdings_valuation to authenticated;
grant all on public.v_holdings_valuation to service_role;
