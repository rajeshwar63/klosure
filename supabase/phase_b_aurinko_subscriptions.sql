-- =============================================================================
-- Phase B follow-up: Aurinko subscription tracking
-- =============================================================================
-- Aurinko webhooks are created per-account at runtime (no dashboard URL),
-- so each connected account gets two subscriptions: one for /email/messages
-- and one for /calendars/primary/events. We track the subscription IDs so
-- we can clean them up on disconnect.
-- =============================================================================

alter table public.aurinko_grants
  add column if not exists email_subscription_id bigint;
alter table public.aurinko_grants
  add column if not exists calendar_subscription_id bigint;
