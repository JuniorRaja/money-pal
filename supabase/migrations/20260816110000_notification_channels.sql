-- P3-3 Part A: Telegram digest channel. One row per user (PK = user_id) — a
-- second channel (email) gets its own columns when it's actually built, not
-- reserved ahead of time.

create table public.notification_channels (
  user_id uuid primary key references auth.users(id) on delete cascade,
  telegram_bot_token text,
  telegram_chat_id text,
  telegram_enabled boolean not null default false,
  last_digest_sent_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  modified_at timestamptz not null default now(),
  modified_by uuid,
  deleted_at timestamptz,
  is_active boolean not null default true
);
create trigger trg_audit_notification_channels before insert or update on public.notification_channels
  for each row execute function public.fn_touch_audit();

grant select, insert, update, delete on public.notification_channels to authenticated;
grant all on public.notification_channels to service_role;

alter table public.notification_channels enable row level security;

create policy notification_channels_select on public.notification_channels for select to authenticated
  using (user_id = auth.uid());
create policy notification_channels_insert on public.notification_channels for insert to authenticated
  with check (user_id = auth.uid());
create policy notification_channels_update on public.notification_channels for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notification_channels_delete on public.notification_channels for delete to authenticated
  using (user_id = auth.uid());
