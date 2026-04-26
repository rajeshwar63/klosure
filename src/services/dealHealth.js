// Phase 6.1 step 04 — derive how long a deal has been "stuck" from
// klo_state_history. A deal is stuck while its confidence is below 60.
// We look back through history for the most recent good→not-good transition
// and measure from there. If there is no such transition (deal has been
// below 60 since we have history), we use the oldest history entry as a
// lower bound. Returns { weeks, since } or null when we have no signal.

import { supabase } from '../lib/supabase.js'

const GOOD_THRESHOLD = 60
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

function toNumber(value) {
  if (value == null) return null
  if (typeof value === 'number') return value
  if (typeof value === 'object') {
    if (typeof value.value === 'number') return value.value
    return null
  }
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : null
}

export async function computeStuckFor(dealId, currentConfidence) {
  if (!dealId) return null

  const currentValue = toNumber(currentConfidence?.value ?? currentConfidence)
  if (currentValue != null && currentValue >= GOOD_THRESHOLD) {
    return { weeks: 0, since: null }
  }

  const { data: history, error } = await supabase
    .from('klo_state_history')
    .select('changed_at, before_value, after_value')
    .eq('deal_id', dealId)
    .eq('field_path', 'confidence.value')
    .order('changed_at', { ascending: false })
    .limit(20)

  if (error || !history || history.length === 0) {
    return null
  }

  for (const row of history) {
    const before = toNumber(row.before_value)
    const after = toNumber(row.after_value)
    if (before != null && after != null && before >= GOOD_THRESHOLD && after < GOOD_THRESHOLD) {
      const since = new Date(row.changed_at)
      const weeks = Math.max(0, Math.floor((Date.now() - since.getTime()) / MS_PER_WEEK))
      return { weeks, since: row.changed_at }
    }
  }

  const oldest = history[history.length - 1]
  const since = new Date(oldest.changed_at)
  const weeks = Math.max(0, Math.floor((Date.now() - since.getTime()) / MS_PER_WEEK))
  return { weeks, since: oldest.changed_at }
}
