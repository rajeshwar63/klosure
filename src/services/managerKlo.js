// =============================================================================
// Manager <> Klo service — Phase 4 (Week 9)
// =============================================================================
// Pipeline-level Q&A for the manager. The conversation lives in
// public.manager_threads + public.manager_messages, separate from per-deal
// `messages`, so questions like "which deals are at risk?" don't pollute any
// individual room. The edge function `klo-manager` builds Klo a digest of the
// whole pipeline (every active deal + recent activity) and hands it to Claude
// Sonnet 4.6 with a manager-flavoured persona.
//
// As with the seller flow we keep a heuristic stub here as a fallback so the
// UI works in dev when the function isn't deployed yet.
// =============================================================================

import { supabase } from '../lib/supabase.js'
import { formatCurrency } from '../lib/format.js'

const FORCE_STUB = String(import.meta.env.VITE_KLO_USE_STUB ?? '').toLowerCase() === 'true'

export async function ensureManagerThread({ teamId, managerId }) {
  if (!teamId || !managerId) return null
  const { data: existing } = await supabase
    .from('manager_threads')
    .select('*')
    .eq('team_id', teamId)
    .eq('manager_id', managerId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing) return existing

  const { data: created, error } = await supabase
    .from('manager_threads')
    .insert({ team_id: teamId, manager_id: managerId, title: 'Pipeline questions' })
    .select()
    .single()
  if (error) {
    console.error('[managerKlo] create thread', error)
    return null
  }
  return created
}

export async function listThreadMessages(threadId) {
  if (!threadId) return []
  const { data, error } = await supabase
    .from('manager_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[managerKlo] list', error)
    return []
  }
  return data ?? []
}

export async function askManagerKlo({ thread, question, pipeline }) {
  if (!thread?.id || !question?.trim()) return { ok: false, error: 'missing args' }

  // Persist the manager's turn first so the UI shows it instantly.
  const { data: managerMsg, error: mErr } = await supabase
    .from('manager_messages')
    .insert({ thread_id: thread.id, sender: 'manager', content: question.trim() })
    .select()
    .single()
  if (mErr) return { ok: false, error: mErr.message }

  await supabase
    .from('manager_threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', thread.id)

  if (!FORCE_STUB) {
    try {
      const { data, error } = await supabase.functions.invoke('klo-manager', {
        body: { thread_id: thread.id, question: question.trim() },
      })
      if (error) throw error
      if (data?.ok) return { ok: true, viaEdge: true, managerMsg, ...data }
      console.warn('[managerKlo] edge non-ok', data)
    } catch (err) {
      console.warn('[managerKlo] edge unavailable, using stub.', err?.message ?? err)
    }
  }

  // ---- Stub fallback: rule-based answer drawn from the loaded pipeline. ----
  const reply = stubReply({ question, pipeline })
  const { data: kloMsg, error: kErr } = await supabase
    .from('manager_messages')
    .insert({ thread_id: thread.id, sender: 'klo', content: reply })
    .select()
    .single()
  if (kErr) return { ok: false, error: kErr.message }
  return { ok: true, viaStub: true, managerMsg, kloMsg, reply }
}

function stubReply({ question, pipeline }) {
  const q = question.toLowerCase()
  const active = pipeline?.deals?.active ?? []
  const red = active.filter((d) => d.health === 'red')
  const amber = active.filter((d) => d.health === 'amber')
  const valueAtRisk = red.reduce((s, d) => s + (Number(d.value) || 0), 0)

  if (q.includes('risk') || q.includes('red') || q.includes('losing')) {
    if (red.length === 0) return `Nothing in red right now. ${amber.length} deals are stuck — check ${amber[0]?.title || 'them'} first.`
    const top = red[0]
    return `${red.length} deal${red.length === 1 ? '' : 's'} red — ${formatCurrency(valueAtRisk)} at risk. Top: ${top.title} (${top.seller_name}). Push there today.`
  }
  if (q.includes('stuck') || q.includes('silent') || q.includes('quiet')) {
    if (amber.length === 0 && red.length === 0) return `Pipeline is moving. Nothing flagged stuck.`
    const sample = amber[0] || red[0]
    return `${amber.length} amber, ${red.length} red. Start with ${sample.title} (${sample.seller_name}) — ${sample.summary || 'no recent movement'}.`
  }
  if (q.includes('forecast') || q.includes('close') || q.includes('quarter')) {
    const totalValue = active.reduce((s, d) => s + (Number(d.value) || 0), 0)
    return `${active.length} active deals · ${formatCurrency(totalValue)} pipeline. ${red.length + amber.length} need attention. Forecast is only as good as your worst-managed deal.`
  }
  return `${active.length} active · ${red.length} red · ${amber.length} amber. Tell me what to dig into — risk, a specific rep — and I'll point you at the move.`
}
