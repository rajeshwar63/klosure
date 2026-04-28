// Phase 8 — momentum chart. Inline SVG so we don't pull in a chart library.
// Reads buyer_view.momentum_history; renders a small line with subtle fill
// and a trend arrow on the current score.

const TREND_GLYPH = { up: '↑', down: '↓', flat: '→' }
const TREND_COLOR = {
  up: 'text-emerald-600',
  down: 'text-red-600',
  flat: 'text-navy/55',
}

function formatLabelDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function MomentumLine({ history }) {
  const points = (history || []).filter((p) => typeof p?.score === 'number')
  if (points.length < 2) return null

  const W = 320
  const H = 96
  const PAD_X = 6
  const PAD_Y = 8

  const min = Math.min(...points.map((p) => p.score))
  const max = Math.max(...points.map((p) => p.score))
  const range = Math.max(1, max - min)
  const innerW = W - PAD_X * 2
  const innerH = H - PAD_Y * 2

  const xs = points.map((_, idx) =>
    PAD_X + (points.length === 1 ? innerW / 2 : (idx / (points.length - 1)) * innerW),
  )
  const ys = points.map((p) => PAD_Y + (1 - (p.score - min) / range) * innerH)

  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const fillPath = `${linePath} L${xs[xs.length - 1].toFixed(1)},${(H - PAD_Y).toFixed(1)} L${xs[0].toFixed(1)},${(H - PAD_Y).toFixed(1)} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[96px]">
      <defs>
        <linearGradient id="momentumFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} className="text-klo" fill="url(#momentumFill)" />
      <path d={linePath} className="text-klo" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export default function BuyerMomentumChart({ buyerView }) {
  const score = buyerView?.momentum_score ?? null
  const trend = buyerView?.momentum_trend ?? null
  const history = buyerView?.momentum_history ?? []

  const startLabel = formatLabelDate(history[0]?.date)
  const endLabel = formatLabelDate(history[history.length - 1]?.date)

  const enoughData = history.length >= 2

  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5">
        <h3 className="text-sm font-semibold text-navy">Closure confidence</h3>
      </div>
      <div className="p-5 flex flex-col gap-3">
        {enoughData ? (
          <>
            <MomentumLine history={history} />
            <div className="flex items-center justify-between text-[11px] text-navy/45">
              <span>{startLabel}</span>
              <span>{endLabel}</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-navy/55">
            Not enough trend data yet—confirm the next vendor checkpoint and log the outcome to establish confidence.
          </p>
        )}
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold text-navy">
            {score == null ? '—' : score}
          </span>
          {trend && (
            <span className={`text-sm font-semibold ${TREND_COLOR[trend] || ''}`}>
              {TREND_GLYPH[trend]} {trend === 'flat' ? 'flat' : `vs last update`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
