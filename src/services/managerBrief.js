// Phase 6 — manager weekly brief client wrapper.
//
// Reuses the existing klo-manager Edge Function (mode: 'quarter_take') —
// no Edge Function changes in Phase 6. The text returned is quarter-take-
// flavored, which works as a stand-in until Phase 7 introduces a dedicated
// 'weekly_brief' mode with a tighter prompt.

import { supabase } from '../lib/supabase.js'

export async function fetchManagerWeeklyBrief(teamId) {
  if (!teamId) return null
  try {
    const { data, error } = await supabase.functions.invoke('klo-manager', {
      body: { mode: 'quarter_take', team_id: teamId },
    })
    if (error) throw error
    if (!data) return null
    return {
      brief_text: data.take ?? data.brief_text ?? '',
      generated_at: data.generated_at ?? null,
    }
  } catch (err) {
    console.warn('[managerBrief] edge unavailable', err?.message ?? err)
    return null
  }
}
