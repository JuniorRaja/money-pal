-- Harden ledger grants: RPC-only writes (SELECT for authenticated).
-- Supabase default privileges grant ALL to anon/authenticated on new tables.

revoke all on table public.transactions from anon, authenticated, public;
revoke all on table public.transaction_entries from anon, authenticated, public;
grant select on table public.transactions to authenticated;
grant select on table public.transaction_entries to authenticated;
grant all on table public.transactions to service_role;
grant all on table public.transaction_entries to service_role;
