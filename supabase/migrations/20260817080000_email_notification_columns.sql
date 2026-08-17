-- P3-3 Part B: Email report channel. Adds SMTP configuration columns to
-- notification_channels. The email address itself comes from auth.users.email.

alter table public.notification_channels
  add column email_enabled boolean not null default false,
  add column smtp_host text,
  add column smtp_port integer,
  add column smtp_user text,
  add column smtp_pass text,
  add column smtp_from text,
  add column last_email_sent_at timestamptz;

comment on column public.notification_channels.email_enabled is 'User has opted in to monthly email reports';
comment on column public.notification_channels.smtp_host is 'SMTP server hostname (e.g. smtp.gmail.com)';
comment on column public.notification_channels.smtp_port is 'SMTP port (typically 587 for TLS, 465 for SSL)';
comment on column public.notification_channels.smtp_user is 'SMTP authentication username';
comment on column public.notification_channels.smtp_pass is 'SMTP authentication password (encrypted at rest by Supabase)';
comment on column public.notification_channels.smtp_from is 'From address for outgoing emails';
comment on column public.notification_channels.last_email_sent_at is 'Timestamp of last monthly email report sent';
