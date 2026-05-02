// =============================================================================
// Team pool service — Phase A sprint 10
// =============================================================================
import { supabase } from '../lib/supabase.js'

export async function loadTeamPool(teamId) {
  if (!teamId) return null

  const { data: poolData, error: poolErr } = await supabase.rpc('get_team_pool', {
    p_team_id: teamId,
  })

  if (poolErr) {
    console.error('get_team_pool failed', poolErr)
    return null
  }
  const pool = (poolData ?? [])[0] ?? null
  if (!pool) return null

  const { data: byRepData, error: repErr } = await supabase.rpc(
    'get_team_usage_by_rep',
    { p_team_id: teamId },
  )

  if (repErr) {
    console.warn('get_team_usage_by_rep failed', repErr)
  }

  return {
    pool: {
      teamId: pool.team_id,
      seatCount: pool.seat_count,
      meetingMinutesTotal: pool.meeting_minutes_total,
      meetingMinutesUsed: pool.meeting_minutes_used,
      meetingMinutesPct: Number(pool.meeting_minutes_pct ?? 0),
      voiceMinutesTotal: pool.voice_minutes_total,
      voiceMinutesUsed: pool.voice_minutes_used,
      chatMessagesTotal: pool.chat_messages_total,
      chatMessagesUsed: pool.chat_messages_used,
      notified80At: pool.notified_80_at,
      notified100At: pool.notified_100_at,
      currentPeriodEnd: pool.current_period_end,
    },
    byRep: byRepData ?? [],
  }
}
