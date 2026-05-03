-- =============================================================================
-- Klosure.ai — Phase B: Aurinko + Recall.ai migration
-- =============================================================================
-- Apply AFTER phase_a.sql + phase_a_calendar_pills.sql. Idempotent.
--
-- Replaces Nylas with a split-provider model the user never sees:
--   - Aurinko    : inbox + calendar (one OAuth grant per user, both bundled)
--   - Recall.ai  : meeting bot + transcription (server-to-server, no user OAuth)
--
-- The user-visible flow stays a single "Connect your inbox & calendar" button.
-- We POST meeting URLs from Aurinko's calendar webhooks to Recall behind the
-- scenes; the user sees only Klosure and (briefly) the Google/Microsoft
-- consent screen.
--
-- This migration:
--   1. Adds aurinko_grants (replaces nylas_grants)
--   2. Adds recall_bots (tracks every Recall bot we dispatch)
--   3. Extends email_events with aurinko_account_id / aurinko_message_id
--   4. Extends meeting_events with aurinko_account_id / aurinko_event_id /
--      recall_bot_id
--   5. Loosens the nylas_* columns to NULLable so old rows stay readable while
--      new rows go through the new columns
--   6. Adds RLS policies for the new tables and parallel read policies on
--      email_events / meeting_events for Aurinko-sourced rows
--
-- Existing Nylas data stays readable. New events flow through the new columns.
-- Drop nylas_grants once cutover is verified — that's a separate teardown
-- migration we'll write after the new pipeline has run for a week.
-- =============================================================================

-- ----- aurinko_grants -------------------------------------------------------
-- One row per Aurinko-connected mailbox. provider matches Aurinko's account
-- service types: 'google' (Gmail + Google Calendar), 'office365' (Outlook +
-- M365 Calendar), or 'imap' (generic IMAP — out of scope for v1 but the
-- column tolerates it).

create table if not exists public.aurinko_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  aurinko_account_id bigint not null unique,     -- Aurinko's numeric accountId
  provider text not null
    check (provider in ('google', 'office365', 'imap')),
  email_address text not null,
  scopes text[] not null default '{}',
  -- Aurinko returns short-lived access tokens. We cache the latest one + its
  -- expiry. aurinko-process-* helpers refresh inline on 401.
  access_token text,
  token_expires_at timestamptz,
  granted_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  sync_state text not null default 'active'
    check (sync_state in ('active', 'expired', 'revoked', 'error')),
  last_error text,
  -- Denormalised for cheap manager-dashboard joins:
  user_email text not null,
  created_at timestamptz not null default now()
);

create index if not exists aurinko_grants_user_idx
  on public.aurinko_grants(user_id);
create index if not exists aurinko_grants_team_idx
  on public.aurinko_grants(team_id, sync_state);
create index if not exists aurinko_grants_email_idx
  on public.aurinko_grants(email_address);

-- ----- recall_bots ----------------------------------------------------------
-- One row per Recall.ai bot we dispatch. Lifecycle is tracked separately from
-- meeting_events because (a) some bot dispatches fail before a meeting_event
-- has caught up, (b) we want to preserve bot history even if the meeting row
-- is later deleted, and (c) we may attempt multiple bots against a single
-- meeting (rejoin on disconnect).

create table if not exists public.recall_bots (
  id uuid primary key default gen_random_uuid(),
  recall_bot_id text not null unique,            -- Recall's bot ID (UUID-like)
  meeting_event_id uuid references public.meeting_events(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  meeting_url text not null,                     -- what we passed to Recall
  bot_state text not null default 'dispatched'
    check (bot_state in (
      'dispatched',         -- POST /api/v1/bot succeeded
      'joining',
      'in_call',
      'recording',
      'done',               -- call ended, transcript pending
      'transcript_ready',
      'failed',
      'cancelled'
    )),
  transcript_text text,
  recording_url text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recall_bots_meeting_idx
  on public.recall_bots(meeting_event_id);
create index if not exists recall_bots_user_idx
  on public.recall_bots(user_id);
create index if not exists recall_bots_state_idx
  on public.recall_bots(bot_state, updated_at);

-- ----- email_events: extend for Aurinko ------------------------------------
-- Make the legacy nylas columns NULLable so new Aurinko-sourced rows don't
-- have to fill them. Add aurinko_account_id + aurinko_message_id with their
-- own dedupe key.

alter table public.email_events
  alter column nylas_grant_id drop not null;
alter table public.email_events
  alter column nylas_message_id drop not null;

alter table public.email_events
  add column if not exists aurinko_account_id bigint
    references public.aurinko_grants(aurinko_account_id) on delete set null;
alter table public.email_events
  add column if not exists aurinko_message_id text;

create unique index if not exists email_events_aurinko_unique
  on public.email_events(aurinko_account_id, aurinko_message_id)
  where aurinko_message_id is not null;

create index if not exists email_events_aurinko_account_idx
  on public.email_events(aurinko_account_id, received_at desc);

-- ----- meeting_events: extend for Aurinko + Recall -------------------------
-- aurinko_account_id replaces nylas_grant_id as the source-of-record for the
-- calendar grant. recall_bot_id replaces nylas_notetaker_id and links to
-- public.recall_bots for the bot lifecycle.

alter table public.meeting_events
  alter column nylas_grant_id drop not null;
alter table public.meeting_events
  alter column nylas_event_id drop not null;

alter table public.meeting_events
  add column if not exists aurinko_account_id bigint
    references public.aurinko_grants(aurinko_account_id) on delete set null;
alter table public.meeting_events
  add column if not exists aurinko_event_id text;
alter table public.meeting_events
  add column if not exists recall_bot_id text
    references public.recall_bots(recall_bot_id) on delete set null;

create unique index if not exists meeting_events_aurinko_unique
  on public.meeting_events(aurinko_account_id, aurinko_event_id)
  where aurinko_event_id is not null;

create index if not exists meeting_events_aurinko_account_idx
  on public.meeting_events(aurinko_account_id, starts_at desc);

-- ----- RLS for new tables --------------------------------------------------

alter table public.aurinko_grants  enable row level security;
alter table public.recall_bots     enable row level security;

-- aurinko_grants: user sees own; team manager sees team members'.
drop policy if exists "aurinko_grants self all" on public.aurinko_grants;
create policy "aurinko_grants self all" on public.aurinko_grants
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "aurinko_grants manager read" on public.aurinko_grants;
create policy "aurinko_grants manager read" on public.aurinko_grants
  for select using (public.manages_seller(user_id));

-- recall_bots: bot owner + team manager can read; service role writes.
drop policy if exists "recall_bots owner read" on public.recall_bots;
create policy "recall_bots owner read" on public.recall_bots
  for select using (
    user_id = auth.uid() or public.manages_seller(user_id)
  );

-- ----- Parallel RLS on email_events / meeting_events for Aurinko paths -----
-- The existing nylas-grant-scoped policies keep working for legacy rows;
-- these add the same scoping for rows that arrive via Aurinko.

drop policy if exists "email_events aurinko owner read" on public.email_events;
create policy "email_events aurinko owner read" on public.email_events
  for select using (
    aurinko_account_id is not null and exists (
      select 1 from public.aurinko_grants g
       where g.aurinko_account_id = email_events.aurinko_account_id
         and (g.user_id = auth.uid() or public.manages_seller(g.user_id))
    )
  );

drop policy if exists "meeting_events aurinko owner read" on public.meeting_events;
create policy "meeting_events aurinko owner read" on public.meeting_events
  for select using (
    aurinko_account_id is not null and exists (
      select 1 from public.aurinko_grants g
       where g.aurinko_account_id = meeting_events.aurinko_account_id
         and (g.user_id = auth.uid() or public.manages_seller(g.user_id))
    )
  );
