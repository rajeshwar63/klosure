// Phase 8 — the centerpiece card. Klo's brief, written TO the buyer.
// Uses the shared KloBriefCard so the buyer sees the same hero shape as
// the seller, with a buyer-perspective label.

import { KloBriefCard } from '../shared/index.js'

function relativeTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const diff = Math.round((Date.now() - d.getTime()) / 1000)
  if (diff < 30) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  const days = Math.floor(diff / 86400)
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export default function BuyerKloBriefHero({ buyerView }) {
  const text = buyerView?.klo_brief_for_buyer
  if (!text) return null
  const updated = relativeTime(buyerView?.generated_at)

  return (
    <KloBriefCard
      label="Klo · Your deal advisor"
      updatedAt={updated ? `Updated · ${updated}` : undefined}
    >
      {text}
    </KloBriefCard>
  )
}
