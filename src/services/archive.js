// =============================================================================
// Archive service — Phase 4 (Week 8)
// =============================================================================
// Won / Lost / Reopen flow. The trigger in phase4.sql flips `locked` and
// `archived_at` based on status, and refuses any future writes to messages /
// context once locked. We never delete a deal — closed rooms stay searchable
// forever.
// =============================================================================

import { supabase } from '../lib/supabase.js'

export const LOSS_REASONS = [
  { value: 'budget', label: 'Budget' },
  { value: 'timing', label: 'Timing — wrong moment' },
  { value: 'competitor', label: 'Lost to competitor' },
  { value: 'no_decision', label: 'No decision made' },
  { value: 'other', label: 'Other' },
]

export async function markDealWon({ dealId }) {
  if (!dealId) return { ok: false, error: 'no deal' }
  const { data, error } = await supabase
    .from('deals')
    .update({
      status: 'won',
      stage: 'closed',
      closed_reason: 'won',
    })
    .eq('id', dealId)
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, deal: data }
}

export async function markDealLost({ dealId, reason }) {
  if (!dealId) return { ok: false, error: 'no deal' }
  if (!reason) return { ok: false, error: 'reason required' }
  const { data, error } = await supabase
    .from('deals')
    .update({
      status: 'lost',
      stage: 'closed',
      closed_reason: reason,
    })
    .eq('id', dealId)
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, deal: data }
}

export async function reopenDeal({ dealId }) {
  if (!dealId) return { ok: false, error: 'no deal' }
  // The trigger clears `locked` automatically when status returns to 'active'.
  const { data, error } = await supabase
    .from('deals')
    .update({
      status: 'active',
      closed_reason: null,
    })
    .eq('id', dealId)
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, deal: data }
}

export async function archiveDeal({ dealId }) {
  if (!dealId) return { ok: false, error: 'no deal' }
  const { data, error } = await supabase
    .from('deals')
    .update({
      status: 'archived',
      stage: 'closed',
      closed_reason: null,
    })
    .eq('id', dealId)
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, deal: data }
}

// Hard delete. The guard_locked_deal trigger blocks cascade-deletes on child
// rows when the parent is locked, so we unlock first by flipping status back
// to 'active', then issue the delete. Both writes are gated by RLS.
export async function deleteDeal({ dealId, locked = false }) {
  if (!dealId) return { ok: false, error: 'no deal' }
  if (locked) {
    const { error: unlockError } = await supabase
      .from('deals')
      .update({ status: 'active', closed_reason: null })
      .eq('id', dealId)
    if (unlockError) return { ok: false, error: unlockError.message }
  }
  const { error } = await supabase.from('deals').delete().eq('id', dealId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
