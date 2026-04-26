// Phase 6.1 step 05 — collapsed-strip version of ConfidenceSidePanel.
// Now that Commitments has the secondary hero slot, confidence collapses
// to a single horizontal bar below the two-column hero. Click to expand
// for rationale + factors.

import { useState } from 'react'

const TONE = {
  good: '#3B6D11',
  caution: '#BA7517',
  risk: '#A32D2D',
}

function toneFor(value) {
  if (value >= 60) return 'good'
  if (value >= 35) return 'caution'
  return 'risk'
}

function TrendChip({ trend, delta }) {
  if (!trend || trend === 'flat' || !delta) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-navy/10 text-navy/60">
        stable
      </span>
    )
  }
  const arrow = trend === 'up' ? '↑' : '↓'
  const cls =
    trend === 'up'
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-red-100 text-red-700'
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${cls}`}>
      {arrow} {Math.abs(delta)} pts
    </span>
  )
}

export default function ConfidenceCompactStrip({ klo_state, viewerRole = 'seller' }) {
  const [open, setOpen] = useState(false)

  if (viewerRole !== 'seller') return null
  const c = klo_state?.confidence
  if (!c || typeof c.value !== 'number') return null

  const tone = toneFor(c.value)
  const toneColor = TONE[tone]
  const factors = c.factors_to_raise ?? []

  return (
    <div
      className="bg-white rounded-xl mb-4"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 flex justify-between items-center text-left gap-3"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <span className="text-[10px] font-semibold tracking-wider text-navy/55">
            + KLO'S CONFIDENCE
          </span>
          <span
            className="text-2xl font-medium leading-none"
            style={{ color: toneColor }}
          >
            {Math.round(c.value)}
            <span className="text-base text-navy/40">%</span>
          </span>
          <TrendChip trend={c.trend} delta={c.delta} />
        </div>
        <span className="text-navy/40 shrink-0" aria-hidden>
          {open ? '⌃' : '⌄'}
        </span>
      </button>

      {open && (
        <div
          className="px-4 pb-4"
          style={{
            borderTop: '0.5px solid rgba(26,26,46,0.12)',
          }}
        >
          {c.rationale && (
            <p className="text-sm leading-relaxed pt-3 mb-3 text-navy/75">
              {c.rationale}
            </p>
          )}
          {factors.length > 0 && (
            <>
              <div className="text-[10px] font-semibold tracking-wider text-navy/45 mb-1.5">
                WHAT WOULD MOVE IT UP
              </div>
              <div className="flex flex-col gap-1">
                {factors.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md"
                    style={{ background: '#EAF3DE' }}
                  >
                    <span
                      className="text-[11px] font-semibold shrink-0"
                      style={{ color: '#3B6D11' }}
                    >
                      +{f.impact}%
                    </span>
                    <span
                      className="text-[12px] leading-snug"
                      style={{ color: '#173404' }}
                    >
                      {f.label}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
