-- Drop the global unique index on (user_id, lower(name)) for labels.
-- This constraint prevents creating slices with the same name (e.g. "Mine")
-- across different accounts for the same user. The per-account uniqueness is
-- already enforced by labels_slice_name_uq on (account_id, lower(name)).
drop index if exists public.ux_labels_name;
