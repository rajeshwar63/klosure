// Phase 5 — Klo's confidence-to-close panel.
// Renders the structured assessment from klo_state.confidence. Always
// labelled "Klo's read" — never "probability" or "forecast".

const TONE = {
  good: {
    panel: 'bg-emerald-50 border-emerald-200',
    accent: 'text-emerald-700',
    bar: 'bg-emerald-500',
    pill: 'bg-emerald-100 text-emerald-700',
  },
  caution: {
    panel: 'bg-amber-50 border-amber-200',
    accent: 'text-amber-700',
    bar: 'bg-amber-500',
    pill: 'bg-amber-100 text-amber-700',
  },
  risk: {
    panel: 'bg-red-50 border-red-200',
    accent: 'text-red-700',
    bar: 'bg-red-500',
    pill: 'bg-red-100 text-red-700',
  },
}

function toneFor(value) {
  if (value >= 60) return 'good'
  if (value >= 35) return 'caution'
  return 'risk'
}

export default function ConfidencePanel({ confidence }) {
  if (!confidence) {
    return (
      <div className="bg-white border border-navy/10 border-dashed rounded-xl px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-1">
          ◆ Klo's read
        </div>
        <p className="text-[13px] text-navy/60">
          Klo is still reading this deal — confidence will appear after the next message.
        </p>
      </div>
    )
  }

  const { value, trend, delta, factors_to_raise, rationale } = confidence
  const tone = toneFor(value)
  const t = TONE[tone]

  return (
    <div className={`border rounded-xl px-4 py-3 ${t.panel}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-navy/50">
          ◆ Klo's read
        </span>
        <span className="text-[11px] text-navy/50">
          Confidence to close by deadline
        </span>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <span className={`text-[36px] font-medium leading-none ${t.accent}`}>
          {value}%
        </span>
        <div className="flex-1">
          <div className="w-full h-2 bg-navy/10 rounded-full overflow-hidden">
            <div
              className={`h-full ${t.bar}`}
              style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
            />
          </div>
          <div className="mt-1.5">
            <TrendChip trend={trend} delta={delta} />
          </div>
        </div>
      </div>

      {rationale && (
        <p className="text-[13px] leading-snug text-navy mb-3">{rationale}</p>
      )}

      {factors_to_raise && factors_to_raise.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-navy/40 mb-1.5">
            What would move this score up
          </div>
          <ul className="space-y-1.5 mb-3">
            {factors_to_raise.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-navy">
                <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${t.pill}`}>
                  +{f.impact}%
                </span>
                <span className="leading-snug">{f.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="text-[11px] italic text-navy/40">
        Klo's structured assessment, recomputed every turn — not a calibrated probability
      </div>
    </div>
  )
}

function TrendChip({ trend, delta }) {
  if (trend === 'flat' || !delta) {
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
