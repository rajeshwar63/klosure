-- =============================================================================
-- Klosure.ai — Phase 14: Transactional Email Infrastructure
-- =============================================================================
-- Apply AFTER all earlier phase migrations. Idempotent.
--
-- Wires the database side of the new transactional email flows:
--
--   1. invoices_sent — idempotency log keyed by Razorpay payment_id. The
--      send-invoice edge function checks this table before mailing so a
--      retried webhook (or webhook + verify firing back-to-back on first
--      activation) can't double-bill the user with two receipts.
--
--   2. users.welcome_email_sent_at — single-shot flag so send-welcome-email
--      is safe to call on every signup without ever sending twice.
-- =============================================================================

-- ----- users: welcome-email gate -------------------------------------------
alter table public.users
  add column if not exists welcome_email_sent_at timestamptz;

-- ----- invoices_sent: per-payment idempotency log --------------------------
create table if not exists public.invoices_sent (
  id uuid primary key default gen_random_uuid(),
  payment_id text not null,
  subscription_id text,
  user_id uuid references public.users(id) on delete set null,
  email text not null,
  plan_slug text,
  amount_minor bigint,
  currency text,
  invoice_number text,
  provider_invoice_id text,
  sent_at timestamptz not null default now()
);

-- One row per payment_id. Duplicate insert returns 23505 and the edge
-- function treats that as a benign "already sent" race.
create unique index if not exists invoices_sent_payment_unique
  on public.invoices_sent(payment_id);

create index if not exists invoices_sent_user_idx
  on public.invoices_sent(user_id)
  where user_id is not null;

create index if not exists invoices_sent_subscription_idx
  on public.invoices_sent(subscription_id)
  where subscription_id is not null;

-- Internal-only — sellers shouldn't read this table from the app. Service
-- role bypasses RLS entirely; everyone else is denied.
alter table public.invoices_sent enable row level security;

drop policy if exists "invoices_sent deny all" on public.invoices_sent;
create policy "invoices_sent deny all" on public.invoices_sent
  for all using (false) with check (false);
