-- Phase 2: header art pattern choice + notification read marker.
--
-- Both are per-user display state that previously had nowhere to live: the
-- pattern did not exist, and the timeline read marker was kept in localStorage,
-- so the bell reported every event as unread on each new device.

alter table public.profiles
  add column theme_pattern text not null default 'mountain'
    check (theme_pattern in ('mountain', 'forest', 'ocean')),
  add column timeline_seen_at timestamptz;
