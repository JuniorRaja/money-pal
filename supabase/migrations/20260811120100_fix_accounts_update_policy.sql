-- Fix: the accounts_select policy requires deleted_at IS NULL, which causes
-- UPDATE (soft-delete) to fail because PostgreSQL requires the new row to also
-- pass SELECT policies. Remove the deleted_at filter from SELECT policies and
-- let views/application layer handle filtering archived rows.

-- Accounts: allow owner to see all their rows (views already filter deleted)
drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts for select to authenticated
  using (user_id = auth.uid());

-- Labels: same fix for soft-deleting slices during account archival
drop policy if exists labels_select on public.labels;
create policy labels_select on public.labels for select to authenticated
  using (user_id = auth.uid());

