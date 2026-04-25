// =============================================================================
// Klo — AI deal coach service abstraction
// =============================================================================
// In Phase 1 we ship a stub that returns canned coaching messages so the chat
// UI works end-to-end without an Anthropic key. Phase 2 (Section 8) replaces
// the body of `getKloResponse` with a real Claude Sonnet 4.6 call using prompt
// caching, while keeping this exact public signature.
//
// Public API:
//   getKloResponse({ deal, dealContext, messages, role, mode }) -> Promise<string>
//   greetingForRole({ role, deal })                            -> string
//
// Phase 2 will add:
//   - buildKloSystemPrompt(deal, role, mode)
//   - real Anthropic API call with model from VITE_KLO_MODEL
// =============================================================================

import { daysUntil } from '../lib/format'

const MODEL = import.meta.env.VITE_KLO_MODEL ?? 'claude-sonnet-4-6'

export function greetingForRole({ role, deal }) {
  if (role === 'buyer') {
    return `Hi — I'm Klo, the deal coach in this room. ${deal?.seller_company ?? 'The seller'} has shared this with you. I'll keep both sides moving. What do you need to get aligned on this week?`
  }
  if (deal?.mode === 'shared') {
    return `Welcome back. I'll coach both sides as the deal unfolds. Want me to scan what's open and tell you what to do next?`
  }
  return `I'm Klo. Solo mode — I'm your private coach for ${deal?.title ?? 'this deal'}. Tell me where it stands and I'll tell you what to do next.`
}

// Phase 1 stub — heuristic coaching that feels like Klo without calling an LLM.
// Replace the body of this function in Phase 2 with the Anthropic call.
export async function getKloResponse({ deal, messages = [], role = 'seller', mode = 'solo' }) {
  // Simulate a small think delay so the UI shows the "Klo is thinking" affordance.
  await new Promise((r) => setTimeout(r, 600))

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

export function getModelLabel() {
  return MODEL
}
