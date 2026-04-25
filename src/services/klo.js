// =============================================================================
// Klo — AI deal coach service abstraction
// =============================================================================
// Phase 2: this module talks to the `klo-respond` Supabase Edge Function, which
// calls Claude Sonnet 4.6 with prompt caching, JSON-schema output, and writes
// back a role-aware Klo message + updated deal summary + detected stage.
//
// We keep a Phase 1 heuristic stub as a fallback so the app still works in
// local dev when the edge function isn't deployed (or when ANTHROPIC_API_KEY
// isn't set yet). Detection is best-effort: if the invoke errors, we fall back.
//
// Public API:
//   greetingForRole({ role, deal })                                -> string
//   requestKloCoaching({ deal, dealContext, messages, role, mode }) -> Promise<{ ok, ...}>
//
// `requestKloCoaching` is the Phase 2 entry point — it triggers Klo's reply.
// In the edge-function path the function inserts the Klo message itself and
// the client picks it up over Supabase realtime. In the stub path this module
// inserts the message client-side so the UX is identical.
// =============================================================================

import { supabase } from '../lib/supabase.js'
import { daysUntil } from '../lib/format.js'

const MODEL = import.meta.env.VITE_KLO_MODEL ?? 'claude-sonnet-4-6'
// Force-disable the edge call (keep using stub) by setting VITE_KLO_USE_STUB=true.
const FORCE_STUB = String(import.meta.env.VITE_KLO_USE_STUB ?? '').toLowerCase() === 'true'

export function getModelLabel() {
  return MODEL
}

export function greetingForRole({ role, deal }) {
  if (role === 'buyer') {
    return `Hi — I'm Klo, the deal coach in this room. ${deal?.seller_company ?? 'The seller'} has shared this with you. I'll keep both sides moving. What do you need to get aligned on this week?`
  }
  if (deal?.mode === 'shared') {
    return `Welcome back. I'll coach both sides as the deal unfolds. Want me to scan what's open and tell you what to do next?`
  }
  return `I'm Klo. Solo mode — I'm your private coach for ${deal?.title ?? 'this deal'}. Tell me where it stands and I'll tell you what to do next.`
}

// -----------------------------------------------------------------------------
// Phase 2 entry point. Triggers Klo to coach the speaker (the role passed in).
// -----------------------------------------------------------------------------
export async function requestKloCoaching({ deal, dealContext, messages, role, mode }) {
  if (!deal?.id) return { ok: false, error: 'no deal' }

  if (!FORCE_STUB) {
    try {
      const { data, error } = await supabase.functions.invoke('klo-respond', {
        body: { deal_id: deal.id },
      })
      if (error) throw error
      if (data?.ok) {
        return { ok: true, viaEdge: true, ...data }
      }
      // Edge function returned a non-ok body — fall through to stub.
      console.warn('[Klo] edge function returned non-ok body, using stub', data)
    } catch (err) {
      console.warn('[Klo] edge function unavailable, using Phase 1 stub.', err?.message ?? err)
    }
  }

  // ---- Phase 1 fallback: heuristic reply, visible only to the speaker. -----
  const reply = await stubReply({ deal, messages, role, mode })
  const { error } = await supabase.from('messages').insert({
    deal_id: deal.id,
    sender_type: 'klo',
    sender_name: 'Klo',
    content: reply,
    visible_to: role,
  })
  if (error) {
    console.error('[Klo] stub insert failed', error)
    return { ok: false, error: error.message }
  }
  return { ok: true, viaStub: true, reply, recipient: role }
}

// -----------------------------------------------------------------------------
// Heuristic Phase 1 stub. Used when the edge function is unreachable.
// -----------------------------------------------------------------------------
async function stubReply({ deal, messages = [], role = 'seller', mode = 'solo' }) {
  await new Promise((r) => setTimeout(r, 400))

  const days = daysUntil(deal?.deadline)
  const lastUserMessage = [...messages].reverse().find((m) => m.sender_type !== 'klo')
  const text = (lastUserMessage?.content || '').toLowerCase()

  if (role === 'buyer') {
    return `Noted. The seller will see this. If procurement or legal is involved on your side, name them now — I'll help you keep them moving.`
  }
  if (text.includes('budget') || text.includes('approval')) {
    return `Budget approvals stall deals more than anything else. Don't wait — get the economic buyer on a 20-minute call this week. Ask for a specific date, not "soon".`
  }
  if (text.includes('quiet') || text.includes('silent') || text.includes("hasn't") || text.includes('no reply')) {
    return `Silence isn't neutral — it's drift. Call, don't email. If they don't pick up, leave a voicemail with one specific question and a deadline.`
  }
  if (text.includes('proposal') || text.includes('quote') || text.includes('document')) {
    return `Send the proposal today with a clear next step — ask for a 30-minute review call, not open-ended feedback. Open-ended feedback is where deals die.`
  }
  if (text.includes('meeting') || text.includes('call') || text.includes('demo')) {
    return `Confirm the meeting in writing with the agenda and the decision you need at the end. Meetings without a decision are just conversations.`
  }
  if (days !== null && days <= 14 && days >= 0) {
    return `${days} days to deadline. This is the danger zone — every commitment from here needs a date and an owner. Tell me what's still open and I'll help you sequence it.`
  }
  if (days !== null && days < 0) {
    return `The deadline has passed. Don't pretend it hasn't. Reset it explicitly with the buyer today — a new date with a clear reason rebuilds momentum.`
  }
  if (mode === 'solo') {
    return `Tell me three things: who's the economic buyer, what's the next commitment on the table, and when it's due. I'll tell you the move.`
  }
  return `Got it. I'll watch the room. When either side commits to something with a date, I'll lock it.`
}
