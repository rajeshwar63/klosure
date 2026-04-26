// Phase 6 step 10 — compact confidence panel that sits beside the
// KloRecommendsCard. The Phase 5.5 KloReadPanel was the whole hero; in
// Phase 6 it moves to the side as supporting evidence.
//
// Differences vs KloReadPanel:
//   - Smaller (it's secondary, not the hero)
//   - Score and label only — no rationale paragraph (now in Klo recommends)
//   - Top 3 factors only — the rest live in KloFullReadCollapsed below

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

function formatDeadline(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
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

function EmptyConfidence() {
  return (
    <div
      className="bg-white rounded-xl p-4 md:p-5"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
    >
      <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-2">
        CONFIDENCE TO CLOSE
      </div>
      <p className="text-sm text-navy/55 leading-relaxed">
        Klo will read this deal after the next chat turn. The confidence
        score appears as soon as Klo has enough signal.
      </p>
    </div>
  )
}

export default function ConfidenceSidePanel({ klo_state }) {
  const confidence = klo_state?.confidence
  if (!confidence || typeof confidence.value !== 'number') {
    return <EmptyConfidence />
  }

  const tone = toneFor(confidence.value)
  const toneColor = TONE[tone]
  const factors = (confidence.factors_to_raise ?? []).slice(0, 3)

  return (
    <div
      className="bg-white rounded-xl p-4 md:p-5"
      style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
    >
      <div className="flex justify-between items-baseline mb-2 gap-2">
        <span className="text-[10px] font-semibold tracking-wider text-navy/55">
          CONFIDENCE TO CLOSE
        </span>
        {klo_state?.deadline?.date && (
          <span className="text-[10px] text-navy/40 truncate">
            by {formatDeadline(klo_state.deadline.date)}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span
          className="text-3xl md:text-4xl font-medium leading-none"
          style={{ color: toneColor }}
        >
          {Math.round(confidence.value)}
          <span className="text-base text-navy/40">%</span>
        </span>
        <TrendChip trend={confidence.trend} delta={confidence.delta} />
      </div>

      <div
        className="h-1 rounded-full bg-navy/10 mb-3 overflow-hidden"
        aria-hidden
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, confidence.value))}%`,
            background: toneColor,
          }}
        />
      </div>

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
  )
}
