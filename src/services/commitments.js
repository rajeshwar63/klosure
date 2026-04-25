// =============================================================================
// Commitments service — Phase 3 (Week 5)
// =============================================================================
// A commitment is a tracked promise inside a deal room. Either party can
// PROPOSE one; the OTHER party CONFIRMS it. Once confirmed it locks as a
// card in the chat timeline. Solo mode auto-confirms (there's no other party).
//
// Status lifecycle:
//   proposed   → confirmed   → done
//                            ↓
//                          overdue (set by klo-watcher when due_date passes)
//   proposed   → declined
//
// Realtime: the `commitments` table is in the supabase_realtime publication
// (see phase3.sql) so DealRoom subscribes and renders the card live for both
// sides. RLS is also set up there.
// =============================================================================

import { supabase } from './../lib/supabase.js'

export async function listCommitments(dealId) {
  if (!dealId) return []
  const { data, error } = await supabase
    .from('commitments')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[commitments] list failed', error)
    return []
  }
  return data ?? []
}

// Propose a new commitment. In solo mode (no buyer in the room) the row is
// created already-confirmed so it locks straight away — there's no one else
// to confirm it.
export async function proposeCommitment({
  deal,
  role,
  proposerName,
  owner,
  ownerName,
  task,
  dueDate,
}) {
  if (!deal?.id) return { ok: false, error: 'no deal' }
  if (!task?.trim()) return { ok: false, error: 'task required' }
  if (!owner || !['seller', 'buyer'].includes(owner)) {
    return { ok: false, error: 'owner required' }
  }

  const isSolo = deal.mode !== 'shared'
  const nowIso = new Date().toISOString()

  const row = {
    deal_id: deal.id,
    owner,
    owner_name: ownerName?.trim() || null,
    task: task.trim(),
    due_date: dueDate || null,
    proposed_by: role,
    proposer_name: proposerName?.trim() || null,
    status: isSolo ? 'confirmed' : 'proposed',
    confirmed_by: isSolo ? role : null,
    confirmed_by_name: isSolo ? proposerName?.trim() || null : null,
    confirmed_at: isSolo ? nowIso : null,
  }

  const { data, error } = await supabase
    .from('commitments')
    .insert(row)
    .select()
    .single()
  if (error) {
    console.error('[commitments] propose failed', error)
    return { ok: false, error: error.message }
  }
  return { ok: true, commitment: data }
}

export async function confirmCommitment({ commitmentId, role, confirmerName }) {
  if (!commitmentId) return { ok: false, error: 'no commitment' }
  const { data, error } = await supabase
    .from('commitments')
    .update({
      status: 'confirmed',
      confirmed_by: role,
      confirmed_by_name: confirmerName?.trim() || null,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', commitmentId)
    .eq('status', 'proposed') // guard against double-confirm races
    .select()
    .single()
  if (error) {
    console.error('[commitments] confirm failed', error)
    return { ok: false, error: error.message }
  }
  return { ok: true, commitment: data }
}

export async function declineCommitment({ commitmentId, role, declinerName }) {
  if (!commitmentId) return { ok: false, error: 'no commitment' }
  const { data, error } = await supabase
    .from('commitments')
    .update({
      status: 'declined',
      confirmed_by: role,
      confirmed_by_name: declinerName?.trim() || null,
      declined_at: new Date().toISOString(),
    })
    .eq('id', commitmentId)
    .eq('status', 'proposed')
    .select()
    .single()
  if (error) {
    console.error('[commitments] decline failed', error)
    return { ok: false, error: error.message }
  }
  return { ok: true, commitment: data }
}

export async function markCommitmentDone({ commitmentId }) {
  if (!commitmentId) return { ok: false, error: 'no commitment' }
  const { data, error } = await supabase
    .from('commitments')
    .update({ status: 'done' })
    .eq('id', commitmentId)
    .in('status', ['confirmed', 'overdue'])
    .select()
    .single()
  if (error) {
    console.error('[commitments] done failed', error)
    return { ok: false, error: error.message }
  }
  return { ok: true, commitment: data }
}
