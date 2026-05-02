-- =============================================================================
-- Calendar pills + Deal Moment notes
-- =============================================================================
-- Promotes calendar events to first-class chat signals (📅 SignalPill in chat)
-- and gives each meeting a freeform Notes field surfaced in the new
-- Calendar tab + the expanded chat pill.
--
-- Idempotency anchor lives on meeting_events.calendar_pill_message_id so the
-- Nylas webhook can fire event.created and event.updated without dupes.
--
-- Cancellation is a new notetaker_state value; webhook flips the row to
-- 'cancelled' and the processor marks the existing pill content with a
-- [CANCELLED] prefix.

alter table public.meeting_events
  add column if not exists calendar_pill_message_id uuid
    references public.messages(id) on delete set null;

alter table public.meeting_events
  add column if not exists notes text;

alter table public.meeting_events
  drop constraint if exists meeting_events_notetaker_state_check;
alter table public.meeting_events
  add constraint meeting_events_notetaker_state_check
  check (notetaker_state in (
    'not_dispatched',
    'scheduled',
    'joined',
    'recording',
    'media_processing',
    'ready',
    'failed',
    'skipped_quota',
    'cancelled'
  ));

create index if not exists meeting_events_deal_upcoming_idx
  on public.meeting_events(deal_id, starts_at desc)
  where notetaker_state in (
    'not_dispatched',
    'scheduled',
    'joined',
    'recording',
    'media_processing',
    'ready',
    'skipped_quota'
  );

-- Seller of the deal can update meeting_events (used for notes editing).
-- Reads are already covered by the existing "meeting_events grant owner read"
-- policy in phase_a.sql.
drop policy if exists "meeting_events seller update" on public.meeting_events;
create policy "meeting_events seller update" on public.meeting_events
  for update to authenticated
  using (
    exists (
      select 1 from public.deals d
      where d.id = meeting_events.deal_id
        and d.seller_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.deals d
      where d.id = meeting_events.deal_id
        and d.seller_id = auth.uid()
    )
  );
