// Phase A — upcoming meeting awareness on the deal page.
//
// Surfaces every relevant upcoming meeting on the deal in the KloMeetingBand
// — including those Klo's notetaker can't or won't join (no recognized
// provider, quota full). Cancelled and finished states stay out so the band
// reflects only what's actually still upcoming.
//
// Reads meeting_events directly via Supabase; RLS gates access by grant
// ownership.

import { supabase } from '../lib/supabase.js'

const VISIBLE_STATES = [
  'not_dispatched',
  'scheduled',
  'joined',
  'recording',
  'media_processing',
  'skipped_quota',
]
const GRACE_HOURS = 4

export async function loadActiveMeetingsForDeal(dealId) {
  if (!dealId) return []
  const cutoff = new Date(Date.now() - GRACE_HOURS * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('meeting_events')
    .select(
      'id, title, starts_at, ends_at, notetaker_state, meeting_provider, participants, matched_stakeholder, processing_error',
    )
    .eq('deal_id', dealId)
    .in('notetaker_state', VISIBLE_STATES)
    .gte('starts_at', cutoff)
    .order('starts_at', { ascending: true })
    .limit(5)

  if (error) {
    console.warn('[upcomingMeetings] load failed', error)
    return []
  }
  return data ?? []
}

export function subscribeMeetingEventsForDeal(dealId, onChange) {
  if (!dealId) return () => {}
  const channel = supabase
    .channel(`meeting-events-${dealId}`)
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
