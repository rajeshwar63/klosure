// Phase 8 — buyer dashboard header. Minimal type-driven row at the top of
// the page. Deal title, deal value (ARR / one-time), target go-live, and a
// live countdown. Mobile collapses to a single column.

import { useEffect, useState } from 'react'
import { formatCurrency } from '../../lib/format.js'

function diffDays(targetISO) {
  if (!targetISO) return null
  const target = new Date(targetISO)
  if (Number.isNaN(target.getTime())) return null
  const now = new Date()
  target.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.round((target - now) / 86400000)
}

function formatGoLive(dateISO) {
  if (!dateISO) return null
  const d = new Date(dateISO)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function BuyerDealHeader({ deal }) {
  const ks = deal?.klo_state ?? {}
  const valueAmount = ks.deal_value?.amount ?? deal?.value ?? null
  const goLive = ks.deadline?.date ?? deal?.deadline ?? null

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!goLive) return undefined
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [goLive])

  const daysLeft = diffDays(goLive)
  const goLiveLabel = formatGoLive(goLive)

  const title = deal?.title || 'Deal'

  // Use `now` so the formatted countdown re-renders every minute.
  const countdownLabel = (() => {
    if (daysLeft === null) return null
    if (daysLeft === 0) return 'today'
    if (daysLeft < 0) return `${Math.abs(daysLeft)}d overdue`
    return `${daysLeft} days`
  })()
  // Mark `now` as used so eslint doesn't warn — the value drives re-renders.
  void now

  return (
    <div className="border-b border-navy/10 bg-white">
      <div className="max-w-[1080px] mx-auto px-6 py-5 flex flex-col md:flex-row md:items-baseline md:justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl md:text-2xl font-semibold text-navy tracking-tight">
            {title}
          </h1>
          {valueAmount != null && (
            <>
              <span className="text-navy/30 text-sm">·</span>
              <span className="text-sm text-navy/70">
                {formatCurrency(valueAmount)}
              </span>
            </>
          )}
          {goLiveLabel ? (
            <>
              <span className="text-navy/30 text-sm">·</span>
              <span className="text-sm text-navy/70">Go-live {goLiveLabel}</span>
              {countdownLabel && (
                <>
                  <span className="text-navy/30 text-sm">·</span>
                  <span className="text-sm text-navy/55">{countdownLabel}</span>
                </>
              )}
            </>
          ) : (
            <>
              <span className="text-navy/30 text-sm">·</span>
              <span className="text-sm text-navy/45">No go-live date set</span>
            </>
          )}
        </div>
        <a
          href="https://klosure.ai"
          target="_blank"
          rel="noreferrer"
          className="hidden md:inline text-[11px] uppercase tracking-wider text-navy/30 hover:text-navy/60"
        >
          Powered by Klosure
        </a>
      </div>
    </div>
  )
}
