// Phase 6.1 step 07 — small recency strip near the top of Overview.
// Tells the silence story: when did each side last write, and when was
// the last meeting. Buyer-side silence ≥ 5 days renders red+bold because
// buyer silence is almost always a signal worth surfacing.

import { useEffect, useState } from 'react'
import { computeRecency } from '../../services/recency.js'

const BUYER_WARN_DAYS = 5

export default function RecencyStrip({ dealId, klo_state }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!dealId) {
      setData(null)
      return
    }
    let cancelled = false
    computeRecency(dealId, klo_state).then((result) => {
      if (!cancelled) setData(result)
    })
    return () => {
      cancelled = true
    }
  }, [dealId, klo_state?.last_meeting?.date])

  if (!data) return null

  const buyerWarn =
    typeof data.buyerSilenceDays === 'number' &&
    data.buyerSilenceDays >= BUYER_WARN_DAYS

  const items = [
    { label: 'Buyer last spoke', value: data.buyerLastSpoke, warn: buyerWarn },
    { label: 'You last sent', value: data.sellerLastSent, warn: false },
    { label: 'Last meeting', value: data.lastMeeting, warn: false },
  ]

  return (
    <div className="text-[12px] flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4 px-1 text-navy/70">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-baseline gap-1.5">
          <span className="text-navy/50">{item.label}</span>
          <span
            className={item.warn ? 'font-medium' : 'text-navy'}
            style={item.warn ? { color: '#A32D2D' } : undefined}
          >
            {item.value}
          </span>
          {i < items.length - 1 && (
            <span className="text-navy/30" aria-hidden>
              ·
            </span>
          )}
        </span>
      ))}
    </div>
  )
}
