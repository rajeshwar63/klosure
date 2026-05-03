// =============================================================================
// Rep <> Klo service — Phase 17
// =============================================================================
// The third Klo surface, after per-deal `messages` and team-level
// `manager_messages`. A rep with 20+ deals shouldn't have to enter every Deal
// Room to ask "which deals are slipping?" — this powers the dedicated
// /askklo page they reach from the sidebar.
//
// One persistent thread per rep (get-or-create). Multi-thread is a future
// enhancement; the manager flow uses the same shape and hasn't needed it yet.
//
// Stub fallback mirrors managerKlo.js so the UI works in dev when the
// klo-rep edge function isn't deployed.
// =============================================================================

import { supabase } from '../lib/supabase.js'

const FORCE_STUB = String(import.meta.env.VITE_KLO_USE_STUB ?? '').toLowerCase() === 'true'

export async function ensureRepThread({ userId }) {
  if (!userId) return null
  const { data: existing } = await supabase
    .from('rep_threads')
    .select('*')
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing) return existing

  const { data: created, error } = await supabase
    .from('rep_threads')
    .insert({ user_id: userId, title: 'My pipeline questions' })
    .select()
    .single()
  if (error) {
    console.error('[repKlo] create thread', error)
    return null
  }
  return created
}

export async function listThreadMessages(threadId) {
  if (!threadId) return []
  const { data, error } = await supabase
    .from('rep_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[repKlo] list', error)
    return []
  }
  return data ?? []
}

export async function askRepKlo({ thread, question }) {
  if (!thread?.id || !question?.trim()) return { ok: false, error: 'missing args' }

  // Persist the rep's turn first so the UI shows it instantly.
  const { data: repMsg, error: mErr } = await supabase
    .from('rep_messages')
    .insert({ thread_id: thread.id, sender: 'rep', content: question.trim() })
    .select()
    .single()
  if (mErr) return { ok: false, error: mErr.message }

  await supabase
    .from('rep_threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', thread.id)

  if (!FORCE_STUB) {
    try {
      const { data, error } = await supabase.functions.invoke('klo-rep', {
        body: { thread_id: thread.id, question: question.trim() },
      })
      if (error) throw error
      if (data?.ok) return { ok: true, viaEdge: true, repMsg, ...data }
      console.warn('[repKlo] edge non-ok', data)
    } catch (err) {
      console.warn('[repKlo] edge unavailable, using stub.', err?.message ?? err)
    }
  }

  // Stub fallback so the UI still works in dev when klo-rep isn't deployed.
  const reply = `I can't reach my coaching brain right now. Try again in a moment.`
  const { data: kloMsg, error: kErr } = await supabase
    .from('rep_messages')
    .insert({ thread_id: thread.id, sender: 'klo', content: reply })
    .select()
    .single()
  if (kErr) return { ok: false, error: kErr.message }
  return { ok: true, viaStub: true, repMsg, kloMsg, reply }
}
