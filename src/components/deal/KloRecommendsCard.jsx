// Phase 6 step 09 — hero of the Overview tab.
//
// Pulls Klo's coaching paragraph from klo_state.klo_take_seller (or
// klo_take_buyer for buyer view), splits it into a big headline and a
// smaller body, highlights urgency words ("today", "now", "by Monday")
// in red, and shows three placeholder action buttons (Draft email,
// Snooze, Mark done) — all disabled with "Coming soon" tooltips. Wiring
// the real workflow is Phase 7.

import { Fragment } from 'react'

const URGENCY_PATTERN =
  /\b(today|now|this week|by\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|tomorrow|tonight|asap)\b/i

function splitTake(text) {
  const clean = (text ?? '').replace(/\*\*/g, '').trim()
  if (!clean) return { headline: '', body: '' }
  const parts = clean.split(/(?<=[.!?])\s+/)
  return {
    headline: parts[0] ?? clean,
    body: parts.slice(1).join(' ').trim(),
  }
}

function highlightUrgency(text) {
  if (!text) return null
  const match = text.match(URGENCY_PATTERN)
  if (!match) return text
  const idx = match.index
  const before = text.slice(0, idx)
  const hit = text.slice(idx, idx + match[0].length)
  const after = text.slice(idx + match[0].length)
  return (
    <Fragment>
      {before}
      <span style={{ color: '#A32D2D' }}>{hit}</span>
      {after}
    </Fragment>
  )
}

function CardFrame({ children }) {
  return (
    <div
      className="bg-white rounded-xl p-5 md:p-6"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
    >
      {children}
    </div>
  )
}

function HeaderRow({ label = 'KLO RECOMMENDS', subLabel = 'DO THIS NEXT' }) {
  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <span
        className="text-[10px] font-semibold tracking-wider px-2.5 py-1 rounded-full"
        style={{ background: '#FAEEDA', color: '#854F0B' }}
      >
        + {label}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-navy/40">
        {subLabel}
      </span>
    </div>
  )
}

function ComingSoonButton({ children, variant = 'primary' }) {
  const base =
    'rounded-md text-xs cursor-not-allowed opacity-50 px-3.5 py-1.5'
  if (variant === 'primary') {
    return (
      <button
        type="button"
        disabled
        title="Coming soon — Klo will draft this for you in a future update"
        className={`${base} font-medium text-white`}
        style={{ background: '#2C2C2A' }}
      >
        {children}
      </button>
    )
  }
  if (variant === 'tertiary') {
    return (
      <button
        type="button"
        disabled
        title="Coming soon"
        className="px-2 py-1.5 text-xs text-navy/45 cursor-not-allowed opacity-50"
      >
        {children}
      </button>
    )
  }
  return (
    <button
      type="button"
      disabled
      title="Coming soon"
      className={`${base} text-navy/65`}
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.18)' }}
    >
      {children}
    </button>
  )
}

function pickPrimaryActionLabel(headline) {
  const h = (headline || '').toLowerCase()
  if (h.includes('proposal') || h.includes('email') || h.includes('quote')) {
    return '✉ Draft proposal email'
  }
  if (h.includes('call') || h.includes('demo') || h.includes('meeting')) {
    return '✉ Draft meeting note'
  }
  return '✉ Take action'
}

function SellerRecommendsCard({ klo_state, onSwitchToChat }) {
  const text = klo_state?.klo_take_seller
  if (!text) {
    return (
      <CardFrame>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-2">
          + KLO RECOMMENDS
        </div>
        <p className="text-sm text-navy/65 leading-relaxed">
          Klo will recommend your next move once you've had your first
          conversation in this deal.
        </p>
        <button
          type="button"
          onClick={onSwitchToChat}
          className="mt-3 px-3 py-1.5 rounded-md text-xs text-navy/80"
          style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.18)' }}
        >
          Start chatting
        </button>
      </CardFrame>
    )
  }

  const { headline, body } = splitTake(text)
  const primaryLabel = pickPrimaryActionLabel(headline)

  return (
    <CardFrame>
      <HeaderRow label="KLO RECOMMENDS" subLabel="DO THIS NEXT" />

      <h2 className="text-lg md:text-xl font-medium text-navy leading-snug mb-2">
        {highlightUrgency(headline)}
      </h2>

      {body && (
        <p className="text-[15px] text-navy/65 leading-relaxed mb-4 whitespace-pre-line">
          {body}
        </p>
      )}

      <div className="flex gap-2 items-center flex-wrap">
        <ComingSoonButton variant="primary">{primaryLabel}</ComingSoonButton>
        <ComingSoonButton variant="secondary">⏰ Snooze · 1d</ComingSoonButton>
        <ComingSoonButton variant="tertiary">Mark done</ComingSoonButton>
      </div>
    </CardFrame>
  )
}

function BuyerRecommendsCard({ klo_state }) {
  const text = klo_state?.klo_take_buyer
  if (!text) return null
  const { headline, body } = splitTake(text)

  return (
    <CardFrame>
      <HeaderRow label="KLO SUGGESTS" subLabel="WHAT TO DO" />

      <h2 className="text-lg md:text-xl font-medium text-navy leading-snug mb-2">
        {highlightUrgency(headline)}
      </h2>

      {body && (
        <p className="text-[15px] text-navy/65 leading-relaxed whitespace-pre-line">
          {body}
        </p>
      )}
    </CardFrame>
  )
}

export default function KloRecommendsCard({
  klo_state,
  viewerRole = 'seller',
  onSwitchToChat,
}) {
  if (viewerRole === 'buyer') {
    return <BuyerRecommendsCard klo_state={klo_state} />
  }
  return (
    <SellerRecommendsCard
      klo_state={klo_state}
      onSwitchToChat={onSwitchToChat}
    />
  )
}
