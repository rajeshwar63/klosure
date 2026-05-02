// Phase A — upcoming notetaker reads.
//
// Surfaces "Klo will join your call" awareness on the deal page. Reads
// meeting_events directly via Supabase; RLS gates access by grant ownership.
// We treat any non-finished, recent-or-future meeting as "live awareness" so
// the band can transition through scheduled → joined → recording → media_processing
// without flickering.

import { supabase } from '../lib/supabase.js'

const ACTIVE_STATES = ['scheduled', 'joined', 'recording', 'media_processing']
const GRACE_HOURS = 4

export async function loadActiveMeetingsForDeal(dealId) {
  if (!dealId) return []
  const cutoff = new Date(Date.now() - GRACE_HOURS * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('meeting_events')
    .select(
      'id, title, starts_at, ends_at, notetaker_state, meeting_provider, participants, matched_stakeholder',
    )
    .eq('deal_id', dealId)
    .in('notetaker_state', ACTIVE_STATES)
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
