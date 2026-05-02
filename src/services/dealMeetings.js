// Deal calendar tab — load all meeting_events tied to a deal, subscribe to
// changes, and write back the per-meeting Notes (Deal Moments).
//
// Reads are gated by the existing meeting_events RLS in phase_a.sql.
// Note writes are gated by the seller-update policy added in
// phase_a_calendar_pills.sql.

import { supabase } from '../lib/supabase.js'

const MEETING_FIELDS =
  'id, title, starts_at, ends_at, notetaker_state, meeting_provider, ' +
  'participants, matched_stakeholder, meeting_url, transcript_text, ' +
  'duration_minutes, notes, processing_error, created_at, updated_at'

export async function loadAllMeetingsForDeal(dealId) {
  if (!dealId) return []
  const { data, error } = await supabase
    .from('meeting_events')
    .select(MEETING_FIELDS)
    .eq('deal_id', dealId)
    .order('starts_at', { ascending: false })
  if (error) {
    console.warn('[dealMeetings] load failed', error)
    return []
  }
  return data ?? []
}

export function subscribeAllMeetingsForDeal(dealId, onChange) {
  if (!dealId) return () => {}
  const channel = supabase
    .channel(`deal-meetings-${dealId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'meeting_events',
        filter: `deal_id=eq.${dealId}`,
      },
      () => onChange(),
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

export async function updateMeetingNotes(meetingId, notes) {
  if (!meetingId) return { ok: false, error: 'missing_id' }
  const { error } = await supabase
    .from('meeting_events')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', meetingId)
  if (error) {
    console.warn('[dealMeetings] notes update failed', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
