-- Atomic pending/skipped/held transitions for staged import rows.
--
-- The skip / reopen / hold server functions were doing a read-modify-write on
-- import_jobs.rows_done from JS, while fn_commit_import_row updates the same
-- column atomically in SQL. A skip racing an accept loses an increment. This
-- moves the three JS paths onto one RPC that mirrors the commit function.
--
--   fn_set_import_row_status(p_row_id uuid, p_status import_row_status)
--     returns import_row_status  -- the status actually in effect afterwards
--
-- Only 'skipped' counts toward rows_done; 'held' and 'pending' leave a row open.

create or replace function public.fn_set_import_row_status(
  p_row_id uuid,
  p_status public.import_row_status
)
returns public.import_row_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.import_job_rows%rowtype;
  v_delta int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  if p_status not in ('pending', 'skipped', 'held') then
    raise exception 'status must be pending, skipped or held';
  end if;

  select * into v_row
    from public.import_job_rows
   where id = p_row_id
     and user_id = v_uid
     and deleted_at is null
   for update;

  if not found then raise exception 'import row not found'; end if;

  -- Resolved rows are terminal: a committed transaction exists behind them.
  if v_row.status in ('imported', 'skipped_duplicate') then
    raise exception 'import row is already resolved';
  end if;

  if v_row.status = p_status then
    return v_row.status;
  end if;

  update public.import_job_rows
     set status = p_status,
         modified_at = now()
   where id = v_row.id;

  v_delta := (p_status = 'skipped')::int - (v_row.status = 'skipped')::int;

  if v_delta <> 0 then
    perform 1 from public.import_jobs
     where id = v_row.job_id and user_id = v_uid and deleted_at is null
     for update;
    if not found then raise exception 'import job not found'; end if;

    update public.import_jobs
       set rows_done = greatest(0, rows_done + v_delta),
           finished_at = case
             when rows_total > 0 and greatest(0, rows_done + v_delta) >= rows_total then now()
             else null
           end,
           modified_at = now()
     where id = v_row.job_id;
  end if;

  return p_status;
end $$;

revoke execute on function public.fn_set_import_row_status(uuid, public.import_row_status)
  from public, anon;
grant execute on function public.fn_set_import_row_status(uuid, public.import_row_status)
  to authenticated;
