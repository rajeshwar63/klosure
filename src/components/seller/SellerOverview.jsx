// Phase 9 step 07 — seller's Overview tab. Same component library as the
// buyer view, with seller voice and seller-only sections (confidence card,
// Klo's full take, confidence chart). Replaces the old three-card pattern
// (Klo Recommends / Klo's Confidence / Klo's Full Read) that repeated the
// same insight across the page.

import { useEffect, useMemo, useState } from 'react'
import BuyerKloBriefHero from '../buyer/BuyerKloBriefHero.jsx'
import BuyerStakeholderMap from '../buyer/BuyerStakeholderMap.jsx'
import BuyerTimelineStrip from '../buyer/BuyerTimelineStrip.jsx'
import BuyerRecentMomentsFeed from '../buyer/BuyerRecentMomentsFeed.jsx'
import PendingTasksTwoCol from '../shared/PendingTasksTwoCol.jsx'

function relativeTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const diff = Math.round((Date.now() - d.getTime()) / 1000)
  if (diff < 30) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  const days = Math.floor(diff / 86400)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

function KloBriefSeller({ klo_take_seller, computed_at }) {
  if (!klo_take_seller) return null
  return (
    <div className="relative bg-white border border-navy/10 rounded-2xl px-6 md:px-10 py-6 md:py-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full bg-klo/60" aria-hidden />
      <div className="flex items-center gap-2 mb-3">
        <span className="text-klo text-base leading-none" aria-hidden>◆</span>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-navy/45">
          Klo · Your deal coach
        </span>
      </div>
      <p className="text-[16px] md:text-[17px] leading-relaxed text-navy">
        {klo_take_seller}
      </p>
      {computed_at && (
        <p className="mt-4 text-[11px] text-navy/35 text-right">
          Updated {relativeTime(computed_at)}
        </p>
      )}
    </div>
  )
}

function ConfidenceCard({ confidence }) {
  if (!confidence) return null
  const value = confidence.value ?? null
  const trend = confidence.trend ?? 'flat'
  const delta = confidence.delta ?? 0
  const factorsDown = (confidence.factors_dragging_down ?? []).slice(0, 3)
  const factorsUp = (confidence.factors_to_raise ?? []).slice(0, 3)

  const trendArrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'
  const trendTone = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-navy/55'

  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5">
        <h3 className="text-sm font-semibold text-navy">Confidence</h3>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold text-navy">{value ?? '—'}<span className="text-base text-navy/45">%</span></span>
          <span className={`text-sm font-medium ${trendTone}`}>
            {trendArrow} {trend === 'flat' ? 'stable' : `${delta > 0 ? '+' : ''}${delta} pts`}
          </span>
        </div>
        {factorsDown.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-navy/45 mb-1">
              Factors dragging it down
            </p>
            <ul className="space-y-1">
              {factorsDown.map((f, i) => (
                <li key={i} className="text-[13px] text-navy flex items-baseline gap-2">
                  <span className="text-red-500 font-mono text-[11px] shrink-0 w-12">{f.impact}%</span>
                  <span>{f.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {factorsUp.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-navy/45 mb-1">
              Would raise it
            </p>
            <ul className="space-y-1">
              {factorsUp.map((f, i) => (
                <li key={i} className="text-[13px] text-navy flex items-baseline gap-2">
                  <span className="text-emerald-600 font-mono text-[11px] shrink-0 w-12">+{f.impact}%</span>
                  <span>{f.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {confidence.rationale && (
          <p className="text-[12px] text-navy/65 italic leading-snug border-t border-navy/5 pt-3">
            {confidence.rationale}
          </p>
        )}
      </div>
    </div>
  )
}

function NextActionsCard({ actions, dealId }) {
  const items = actions ?? []
  const STATUS_ORDER = ['not_started', 'in_flight', 'done']
  const STATUS_DOT = {
    not_started: { glyph: '○', color: 'text-navy/40' },
    in_flight: { glyph: '◐', color: 'text-amber-500' },
    done: { glyph: '●', color: 'text-emerald-500' },
  }

  const [overrides, setOverrides] = useState({})
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`klosure:seller:next_actions-status:${dealId}`)
      setOverrides(raw ? JSON.parse(raw) : {})
    } catch {
      setOverrides({})
    }
  }, [dealId])

  function cycleStatus(item) {
    const id = item?.id || (item?.action || '').toLowerCase()
    const current = overrides[id] ?? item?.status ?? 'not_started'
    const idx = STATUS_ORDER.indexOf(current)
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]
    const newOverrides = { ...overrides, [id]: next }
    setOverrides(newOverrides)
    try {
      window.localStorage.setItem(
        `klosure:seller:next_actions-status:${dealId}`,
        JSON.stringify(newOverrides),
      )
    } catch {
      // ignore
    }
  }

  function formatDeadline(iso) {
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5 flex items-center gap-2">
        <span className="text-klo text-base leading-none" aria-hidden>✦</span>
        <h3 className="text-sm font-semibold text-navy">This week's moves</h3>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-6 text-sm text-navy/55">
          No new moves yet — Klo will surface them as the deal evolves.
        </div>
      ) : (
        <ul className="divide-y divide-navy/5">
          {items.map((item, idx) => {
            const id = item?.id || (item?.action || '').toLowerCase()
            const status = overrides[id] ?? item?.status ?? 'not_started'
            const dot = STATUS_DOT[status] ?? STATUS_DOT.not_started
            const deadline = formatDeadline(item?.deadline)
            return (
              <li key={`${id}-${idx}`} className="flex gap-3 px-5 py-4">
                <button
                  type="button"
                  onClick={() => cycleStatus(item)}
                  aria-label={`Status: ${status.replace('_', ' ')}. Click to change.`}
                  className={`shrink-0 mt-0.5 text-lg leading-none ${dot.color} hover:opacity-70`}
                >
                  {dot.glyph}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] font-medium text-navy leading-snug ${status === 'done' ? 'line-through text-navy/45' : ''}`}>
                    {item?.action}
                  </p>
                  {item?.why_it_matters && (
                    <p className="text-[12px] text-navy/55 mt-0.5 leading-snug">
                      {item.why_it_matters}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-navy/50">
                    {item?.who && (
                      <span>
                        Who: <span className="text-navy/75">{item.who}</span>
                      </span>
                    )}
                    {deadline && (
                      <span>
                        By: <span className="text-navy/75">{deadline}</span>
                      </span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function VendorTeamCard({ deal }) {
  const company = deal?.seller_company || 'Your team'
  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5">
        <h3 className="text-sm font-semibold text-navy">Vendor team</h3>
      </div>
      <div className="p-5">
        <p className="text-sm text-navy">{company}</p>
        <p className="text-[12px] text-navy/55 mt-1">
          Bring teammates into the room from the share menu.
        </p>
      </div>
    </div>
  )
}

function ConfidenceChart({ history }) {
  const points = history ?? []
  if (points.length === 0) {
    return (
      <div className="bg-white border border-navy/10 rounded-2xl">
        <div className="px-5 py-4 border-b border-navy/5">
          <h3 className="text-sm font-semibold text-navy">Confidence trend</h3>
        </div>
        <div className="p-5 text-sm text-navy/55">
          The trend line will fill in as Klo updates its read across more chat turns.
        </div>
      </div>
    )
  }
  const max = Math.max(...points.map((p) => p.value ?? 0), 100)
  const min = 0
  const W = 240
  const H = 80
  const stepX = points.length > 1 ? W / (points.length - 1) : 0
  const yFor = (v) => H - ((v - min) / (max - min)) * H
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${i * stepX},${yFor(p.value ?? 0)}`)
    .join(' ')
  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5">
        <h3 className="text-sm font-semibold text-navy">Confidence trend</h3>
      </div>
      <div className="p-5">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20">
          <path d={pathD} fill="none" stroke="#4F8EF7" strokeWidth="2" />
          {points.map((p, i) => (
            <circle key={i} cx={i * stepX} cy={yFor(p.value ?? 0)} r="2" fill="#4F8EF7" />
          ))}
        </svg>
        <p className="text-[11px] text-navy/45 mt-2">{points.length} points</p>
      </div>
    </div>
  )
}

function RisksList({ blockers }) {
  const items = blockers ?? []
  if (items.length === 0) {
    return (
      <div className="bg-white border border-navy/10 rounded-2xl">
        <div className="px-5 py-4 border-b border-navy/5">
          <h3 className="text-sm font-semibold text-navy">Risks</h3>
        </div>
        <div className="p-5 text-sm text-navy/55">No blockers right now.</div>
      </div>
    )
  }
  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5">
        <h3 className="text-sm font-semibold text-navy">Risks</h3>
      </div>
      <ul className="divide-y divide-navy/5">
        {items.map((b, i) => (
          <li key={i} className="px-5 py-3 text-[13px] text-navy">
            <div className="flex items-start gap-2">
              <span className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${b.severity === 'red' ? 'bg-red-500' : b.severity === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <span>{b.text}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function deriveStakeholdersForSeller(klo) {
  // Prefer buyer_view.stakeholder_takes (richer with klo_note + engagement);
  // fall back to klo_state.people if buyer_view hasn't been generated yet.
  const fromView = klo?.buyer_view?.stakeholder_takes ?? []
  if (fromView.length > 0) return fromView
  return (klo?.people ?? []).map((p) => ({
    name: p.name,
    role: p.role,
    engagement: 'unknown',
    klo_note: null,
  }))
}

function deriveActions(klo) {
  if (Array.isArray(klo?.next_actions) && klo.next_actions.length > 0) {
    return klo.next_actions
  }
  // Fallback: synthesize from confidence.factors_to_raise so the section
  // never renders empty for older klo_state rows that predate next_actions.
  const factors = klo?.confidence?.factors_to_raise ?? []
  return factors.map((f, i) => ({
    id: `fallback-${i}`,
    action: f.label,
    why_it_matters: `Estimated +${f.impact}% to confidence.`,
    who: 'you',
    deadline: null,
    status: 'not_started',
  }))
}

export default function SellerOverview({ deal }) {
  const klo = deal?.klo_state ?? null

  const stakeholders = useMemo(() => deriveStakeholdersForSeller(klo), [klo])
  const actions = useMemo(() => deriveActions(klo), [klo])
  const momentumHistory = klo?.buyer_view?.momentum_history ?? []

  if (!klo) {
    return (
      <div className="p-6 md:p-8 max-w-[1080px] mx-auto">
        <div className="bg-white border border-navy/10 border-dashed rounded-2xl px-6 py-12 text-center">
          <div className="text-klo text-2xl mb-2">◆</div>
          <p className="text-[14px] text-navy/70 max-w-md mx-auto">
            Klo hasn't read this deal yet. Send a message in chat — Klo will catch up
            on the conversation and start tracking.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-[1080px] mx-auto space-y-5">
      <KloBriefSeller
        klo_take_seller={klo.klo_take_seller}
        computed_at={klo.confidence?.computed_at}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ConfidenceCard confidence={klo.confidence} />
        <NextActionsCard actions={actions} dealId={deal?.id} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <BuyerStakeholderMap stakeholders={stakeholders} />
        <VendorTeamCard deal={deal} />
      </div>

      <BuyerTimelineStrip
        stage={klo.stage}
        deadline={klo.deadline}
        blockers={klo.blockers}
      />

      <PendingTasksTwoCol kloState={klo} perspective="seller" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ConfidenceChart history={momentumHistory} />
        <RisksList blockers={klo.blockers} />
      </div>

      <BuyerRecentMomentsFeed moments={klo.buyer_view?.recent_moments} />
    </div>
  )
}
