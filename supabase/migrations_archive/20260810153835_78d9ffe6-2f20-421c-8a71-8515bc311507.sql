create table public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null,
  kind public.timeline_kind not null,
  title text not null,
  detail text,
  amount bigint,
  currency_code text references public.currencies(code),
  account_id uuid references public.accounts(id),
  transaction_id uuid references public.transactions(id),
  action_label text,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_timeline before insert or update on public.timeline_events
  for each row execute function public.fn_touch_audit();
create index ix_timeline_user_time on public.timeline_events(user_id, occurred_at desc) where deleted_at is null;
create index ix_timeline_kind on public.timeline_events(user_id, kind) where deleted_at is null;

create table public.import_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.import_kind not null,
  name text not null,
  status text not null default 'idle',
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_import_sources before insert or update on public.import_sources
  for each row execute function public.fn_touch_audit();
create index ix_import_sources_user on public.import_sources(user_id) where deleted_at is null;

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.import_sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  rows_total int not null default 0 check (rows_total >= 0),
  rows_done int not null default 0 check (rows_done >= 0),
  imported int not null default 0 check (imported >= 0),
  duplicates int not null default 0 check (duplicates >= 0),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_import_jobs before insert or update on public.import_jobs
  for each row execute function public.fn_touch_audit();
create index ix_import_jobs_user on public.import_jobs(user_id, created_at desc) where deleted_at is null;

create table public.import_review_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.import_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.review_kind not null,
  title text,
  detail text,
  action_label text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_import_reviews before insert or update on public.import_review_items
  for each row execute function public.fn_touch_audit();
create index ix_import_reviews_user on public.import_review_items(user_id) where deleted_at is null and resolved_at is null;

grant select, insert, update, delete on public.timeline_events to authenticated;
grant all on public.timeline_events to service_role;
grant select, insert, update, delete on public.import_sources to authenticated;
grant all on public.import_sources to service_role;
grant select, insert, update, delete on public.import_jobs to authenticated;
grant all on public.import_jobs to service_role;
grant select, insert, update, delete on public.import_review_items to authenticated;
grant all on public.import_review_items to service_role;

alter table public.timeline_events enable row level security;
alter table public.import_sources enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_review_items enable row level security;

create policy timeline_select on public.timeline_events for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy timeline_insert on public.timeline_events for insert to authenticated with check (user_id = auth.uid());
create policy timeline_update on public.timeline_events for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy timeline_delete on public.timeline_events for delete to authenticated using (user_id = auth.uid());

create policy import_sources_select on public.import_sources for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy import_sources_insert on public.import_sources for insert to authenticated with check (user_id = auth.uid());
create policy import_sources_update on public.import_sources for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy import_sources_delete on public.import_sources for delete to authenticated using (user_id = auth.uid());

create policy import_jobs_select on public.import_jobs for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy import_jobs_insert on public.import_jobs for insert to authenticated with check (user_id = auth.uid());
create policy import_jobs_update on public.import_jobs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy import_jobs_delete on public.import_jobs for delete to authenticated using (user_id = auth.uid());

create policy import_reviews_select on public.import_review_items for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);
create policy import_reviews_insert on public.import_review_items for insert to authenticated with check (user_id = auth.uid());
create policy import_reviews_update on public.import_review_items for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy import_reviews_delete on public.import_review_items for delete to authenticated using (user_id = auth.uid());