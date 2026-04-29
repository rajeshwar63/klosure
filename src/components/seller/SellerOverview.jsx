import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { daysUntil, formatCurrency } from '../../lib/format.js'
import BuyerStakeholderMap from '../buyer/BuyerStakeholderMap.jsx'
import BuyerRecentMomentsFeed from '../buyer/BuyerRecentMomentsFeed.jsx'
import PendingTasksTwoCol from '../shared/PendingTasksTwoCol.jsx'
import {
  Eyebrow,
  HairlineGrid,
  KloBriefCard,
  MonoKicker,
  MonoTimestamp,
  ConfidencePill,
} from '../shared/index.js'
import SellerTimelineStrip from './SellerTimelineStrip.jsx'

const MIN_CONFIDENCE_TREND_POINTS = 3

const STAGE_OPTIONS = [
  { value: 'discovery', label: 'Discovery', idx: 1 },
  { value: 'proposal', label: 'Proposal', idx: 2 },
  { value: 'negotiation', label: 'Negotiation', idx: 3 },
  { value: 'legal', label: 'Legal', idx: 4 },
  { value: 'closed', label: 'Closed', idx: 5 },
]

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

function formatShortDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatConfidencePointDate(point) {
  return point?.date || point?.at || point?.created_at || point?.computed_at || null
}

function trackConfidenceTrendMetric(eventName, payload = {}) {
  if (typeof window === 'undefined') return
  try {
    const key = `klosure:metrics:confidence_trend:${eventName}`
    const current = Number(window.localStorage.getItem(key) || '0')
    window.localStorage.setItem(key, String(current + 1))
  } catch {
    // Ignore storage errors; CustomEvent tracking still fires.
  }
  window.dispatchEvent(
    new CustomEvent('klosure:analytics', {
      detail: {
        event: eventName,
        ts: new Date().toISOString(),
        ...payload,
      },
    }),
  )
}

function snapshotPlaceholders(field) {
  const map = {
    stage: 'Set stage',
    value: 'Add value',
    deadline: 'Set close date',
    rating: 'Waiting for Klo rating',
    probability: 'No probability yet',
  }
  return map[field] ?? '—'
}

function KloBriefSeller({ klo_take_seller, computed_at }) {
  if (!klo_take_seller) return null
  return (
    <KloBriefCard
      label="Klo · Your deal coach"
      updatedAt={computed_at ? `Updated · ${relativeTime(computed_at)}` : undefined}
    >
      {klo_take_seller}
    </KloBriefCard>
  )
}

function DealSnapshotPanel({ deal, klo, viewerRole, onDealUpdate }) {
  const isSeller = viewerRole === 'seller'
  const stage = klo?.stage ?? deal?.stage ?? null
  const stageMeta = STAGE_OPTIONS.find((s) => s.value === stage) ?? null
  const deadline = klo?.deadline?.date ?? deal?.deadline ?? null
  const valueAmount = klo?.deal_value?.amount ?? deal?.value ?? null
  const valueConfidence = klo?.deal_value?.confidence
  const confidence = klo?.confidence?.value ?? null
  const ratingTrend = klo?.confidence?.trend ?? 'flat'
  const trendArrow = ratingTrend === 'up' ? '↑' : ratingTrend === 'down' ? '↓' : '→'

  const risksCount = Array.isArray(klo?.risks) ? klo.risks.length : 0
  const blockersCount = Array.isArray(klo?.blockers) ? klo.blockers.length : 0
  const openActionsCount = (klo?.next_actions ?? []).filter((a) => a?.status !== 'done').length

  const lastUpdated = relativeTime(klo?.confidence?.computed_at ?? deal?.updated_at ?? deal?.created_at)
  const daysInStage = (() => {
    const source = deal?.updated_at ?? deal?.created_at
    if (!source) return null
    const diff = Math.floor((Date.now() - new Date(source).getTime()) / 86400000)
    return Number.isNaN(diff) ? null : Math.max(0, diff)
  })()
  const daysToDeadline = daysUntil(deadline)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState({ stage: stage ?? '', value: valueAmount ?? '', deadline: deadline ?? '' })

  useEffect(() => {
    setDraft({
      stage: stage ?? '',
      value: valueAmount ?? '',
      deadline: deadline ?? '',
    })
  }, [stage, valueAmount, deadline])

  async function saveQuickEdit() {
    if (!isSeller || !deal?.id || saving) return
    setSaving(true)
    setError('')

    const valueNumber = draft.value === '' ? null : Number(draft.value)
    if (draft.value !== '' && Number.isNaN(valueNumber)) {
      setError('Deal value must be a number.')
      setSaving(false)
      return
    }

    const updates = {
      stage: draft.stage || null,
      value: valueNumber,
      deadline: draft.deadline || null,
      updated_at: new Date().toISOString(),
    }

    const { data, error: updateError } = await supabase
      .from('deals')
      .update(updates)
      .eq('id', deal.id)
      .select('*')
      .single()

    if (updateError) {
      setError(updateError.message || 'Could not save changes.')
      setSaving(false)
      return
    }

    onDealUpdate?.(data)
    setEditing(false)
    setSaving(false)
  }

  return (
    <section className="bg-white border border-navy/10 rounded-2xl p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="flex flex-col gap-2">
          <Eyebrow>Deal snapshot</Eyebrow>
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--klo-text)]">
            {stageMeta ? `${stageMeta.label} · ${stageMeta.idx}/5` : 'Set stage'}
          </h2>
        </div>
        <div className="flex flex-col items-end gap-1">
          <MonoTimestamp>
            {daysInStage == null ? 'SLA · add stage history' : `${daysInStage}d in stage`}
          </MonoTimestamp>
          <MonoTimestamp dim>
            {lastUpdated ? `Updated · ${lastUpdated}` : 'Updated recently'}
          </MonoTimestamp>
        </div>
      </div>

      <HairlineGrid cols={4}>
        <SnapshotCell
          index="01"
          label="Deal value"
          value={valueAmount != null ? formatCurrency(valueAmount) : snapshotPlaceholders('value')}
          hint={
            valueConfidence === 'tentative'
              ? 'Confidence range · tentative'
              : valueConfidence
                ? `Confidence range · ${valueConfidence}`
                : valueAmount == null
                  ? 'Add expected contract value'
                  : null
          }
        />
        <SnapshotCell
          index="02"
          label="Target close"
          value={formatShortDate(deadline) || snapshotPlaceholders('deadline')}
          hint={
            daysToDeadline == null
              ? 'Set expected close deadline'
              : daysToDeadline < 0
                ? `${Math.abs(daysToDeadline)}d overdue`
                : daysToDeadline === 0
                  ? 'Due today'
                  : `${daysToDeadline} days left`
          }
          hintTone={
            daysToDeadline == null
              ? null
              : daysToDeadline < 0
                ? 'bad'
                : daysToDeadline <= 7
                  ? 'warn'
                  : null
          }
        />
        <SnapshotCell
          index="03"
          label="Klo rating"
          value={
            confidence == null ? (
              snapshotPlaceholders('rating')
            ) : (
              <span className="inline-flex items-center gap-2">
                <ConfidencePill value={confidence} />
                <span className="text-[var(--klo-text-mute)] text-sm">{trendArrow}</span>
              </span>
            )
          }
          hint={confidence == null ? 'Ask Klo for an updated read' : `Trend · ${ratingTrend}`}
        />
        <SnapshotCell
          index="04"
          label="Open work"
          value={
            <span className="tabular-nums">
              {risksCount} risks · {blockersCount} blockers · {openActionsCount} actions
            </span>
          }
          hint="Counts come from Klo's read of this deal"
        />
      </HairlineGrid>

      {isSeller && (
        <div className="mt-4 border-t border-navy/10 pt-3">
          {!editing ? (
            <button
              type="button"
              className="text-xs font-semibold text-klo hover:underline"
              onClick={() => setEditing(true)}
            >
              Quick edit stage / value / deadline
            </button>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <label className="text-xs text-navy/70">
                  Stage
                  <select
                    value={draft.stage}
                    onChange={(e) => setDraft((p) => ({ ...p, stage: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-navy/15 px-2.5 py-2 text-sm"
                  >
                    <option value="">Select stage</option>
                    {STAGE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-navy/70">
                  Value (USD)
                  <input
                    type="number"
                    min="0"
                    value={draft.value}
                    onChange={(e) => setDraft((p) => ({ ...p, value: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-navy/15 px-2.5 py-2 text-sm"
                    placeholder="120000"
                  />
                </label>
                <label className="text-xs text-navy/70">
                  Close date
                  <input
                    type="date"
                    value={draft.deadline}
                    onChange={(e) => setDraft((p) => ({ ...p, deadline: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-navy/15 px-2.5 py-2 text-sm"
                  />
                </label>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveQuickEdit}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-klo text-white hover:bg-klo/90 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditing(false)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold border border-navy/15 text-navy"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function SnapshotCell({ index, label, value, hint, hintTone }) {
  const hintToneClass =
    hintTone === 'bad'
      ? 'text-[var(--klo-danger)]'
      : hintTone === 'warn'
        ? 'text-[var(--klo-warn)]'
        : hintTone === 'good'
          ? 'text-[var(--klo-good)]'
          : 'text-[var(--klo-text-mute)]'
  return (
    <HairlineGrid.Cell>
      <MonoKicker>
        {index} / {label}
      </MonoKicker>
      <p className="mt-3 text-[18px] font-semibold tracking-[-0.02em] text-[var(--klo-text)] leading-tight">
        {value}
      </p>
      {hint && (
        <p className={`mt-2 text-[12px] leading-snug ${hintToneClass}`}>{hint}</p>
      )}
    </HairlineGrid.Cell>
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
  const trendLabel = trend === 'flat' ? 'stable' : `${delta > 0 ? '+' : ''}${delta} pts`

  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5">
        <h3 className="text-sm font-semibold text-navy">Confidence</h3>
      </div>
      <div className="p-5 space-y-5">
        <section
          className="rounded-xl border px-4 py-3.5"
          style={{
            backgroundColor: 'var(--confidence-neutral-bg)',
            borderColor: 'var(--confidence-neutral-border)',
          }}
        >
          <p className="text-[11px] uppercase tracking-wider font-semibold text-navy/70 mb-2">Score</p>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-semibold text-navy tabular-nums">
              {value ?? '—'}
              <span className="text-base text-navy/60">%</span>
            </span>
            <span className={`text-sm font-medium ${trendTone}`}>
              {trendArrow} {trendLabel}
            </span>
          </div>
        </section>
        {factorsDown.length > 0 && (
          <section
            className="rounded-xl border px-4 py-3.5"
            style={{
              backgroundColor: 'var(--confidence-negative-bg)',
              borderColor: 'var(--confidence-negative-border)',
            }}
          >
            <p className="text-[11px] uppercase tracking-wider font-semibold mb-2.5 text-navy/80">
              Dragging it down
            </p>
            <ul className="space-y-2.5">
              {factorsDown.map((f, i) => (
                <li key={i} className="text-[13px] text-navy flex items-start gap-2.5">
                  <span
                    className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[11px] font-semibold shrink-0 mt-0.5"
                    style={{ color: 'var(--confidence-negative-text)', backgroundColor: 'rgba(178, 64, 32, 0.15)' }}
                    aria-hidden
                  >
                    −
                  </span>
                  <span
                    className="font-mono text-[11px] shrink-0 w-14 text-right tabular-nums"
                    style={{ color: 'var(--confidence-negative-text)' }}
                  >
                    -{Math.abs(f.impact)}%
                  </span>
                  <span className="leading-snug">{f.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {factorsUp.length > 0 && (
          <section
            className="rounded-xl border px-4 py-3.5"
            style={{
              backgroundColor: 'var(--confidence-positive-bg)',
              borderColor: 'var(--confidence-positive-border)',
            }}
          >
            <p className="text-[11px] uppercase tracking-wider font-semibold mb-2.5 text-navy/80">
              Would raise it
            </p>
            <ul className="space-y-2.5">
              {factorsUp.map((f, i) => (
                <li key={i} className="text-[13px] text-navy flex items-start gap-2.5">
                  <span
                    className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[11px] font-semibold shrink-0 mt-0.5"
                    style={{ color: 'var(--confidence-positive-text)', backgroundColor: 'rgba(34, 122, 59, 0.16)' }}
                    aria-hidden
                  >
                    +
                  </span>
                  <span
                    className="font-mono text-[11px] shrink-0 w-14 text-right tabular-nums"
                    style={{ color: 'var(--confidence-positive-text)' }}
                  >
                    +{Math.abs(f.impact)}%
                  </span>
                  <span className="leading-snug">{f.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {confidence.rationale && (
          <section
            className="rounded-xl border px-4 py-3.5"
            style={{
              backgroundColor: 'var(--confidence-neutral-bg)',
              borderColor: 'var(--confidence-neutral-border)',
            }}
          >
            <p className="text-[11px] uppercase tracking-wider font-semibold text-navy/70 mb-2">
              Insight summary
            </p>
            <p className="text-[13px] text-navy/85 leading-relaxed">{confidence.rationale}</p>
          </section>
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
        <h3 className="text-sm font-semibold text-navy">Your company team</h3>
      </div>
      <div className="p-5">
        <p className="text-sm text-navy">{company}</p>
        <p className="text-[12px] text-navy/55 mt-1">
          Add teammates from your company in the share menu.
        </p>
      </div>
    </div>
  )
}

function ConfidenceChart({ history, confidence, dealId }) {
  const points = history ?? []
  const datedPoints = points.filter((p) => {
    const pointDate = new Date(formatConfidencePointDate(p) || '')
    return typeof p?.value === 'number' && !Number.isNaN(pointDate.getTime())
  })
  const pointCount = datedPoints.length
  const viewMode = pointCount === 0 ? 'empty' : pointCount === 1 ? 'single' : pointCount === 2 ? 'delta' : 'chart'

  useEffect(() => {
    trackConfidenceTrendMetric('confidence_trend_card_viewed', {
      deal_id: dealId ?? null,
      mode: viewMode,
      dated_points: pointCount,
    })
    if (pointCount < MIN_CONFIDENCE_TREND_POINTS) {
      trackConfidenceTrendMetric('confidence_trend_insufficient_data', {
        deal_id: dealId ?? null,
        mode: viewMode,
        dated_points: pointCount,
      })
    }
  }, [dealId, pointCount, viewMode])

  const lastPoint = datedPoints[datedPoints.length - 1] ?? null
  const currentValue = Math.round(confidence?.value ?? lastPoint?.value ?? 0)
  const lastUpdatedText = formatShortDate(confidence?.computed_at || formatConfidencePointDate(lastPoint)) || 'recently'
  const secondaryText = `Current confidence: ${currentValue}% (last updated ${lastUpdatedText})`

  function onFallbackCtaClick(kind) {
    trackConfidenceTrendMetric('confidence_trend_fallback_cta_clicked', {
      deal_id: dealId ?? null,
      mode: viewMode,
      cta_kind: kind,
      dated_points: pointCount,
    })
  }

  if (pointCount === 0) {
    return (
      <div className="bg-white border border-navy/10 rounded-2xl">
        <div className="px-5 py-4 border-b border-navy/5">
          <h3 className="text-sm font-semibold text-navy">Confidence trend</h3>
        </div>
        <div className="p-5">
          <p className="text-sm text-navy/65">We need more updates to show a trend.</p>
          <p className="text-[12px] text-navy/50 mt-1">{secondaryText}</p>
          <button
            type="button"
            className="mt-3 text-[12px] font-medium text-klo hover:text-klo/80"
            onClick={() => onFallbackCtaClick('log_update')}
          >
            Log update
          </button>
        </div>
      </div>
    )
  }

  if (pointCount === 1) {
    return (
      <div className="bg-white border border-navy/10 rounded-2xl">
        <div className="px-5 py-4 border-b border-navy/5">
          <h3 className="text-sm font-semibold text-navy">Confidence trend</h3>
        </div>
        <div className="p-5">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-navy/55">Current confidence</p>
          <p className="text-3xl font-semibold text-navy mt-1 tabular-nums">{currentValue}%</p>
          <p className="text-[12px] text-navy/50 mt-1">{secondaryText}</p>
          <button
            type="button"
            className="mt-3 text-[12px] font-medium text-klo hover:text-klo/80"
            onClick={() => onFallbackCtaClick('refresh_confidence_inputs')}
          >
            Refresh confidence inputs
          </button>
        </div>
      </div>
    )
  }

  if (pointCount === 2) {
    const delta = Math.round((datedPoints[1]?.value ?? 0) - (datedPoints[0]?.value ?? 0))
    const deltaPrefix = delta > 0 ? '+' : ''
    const deltaTone = delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-700' : 'text-navy/70'
    return (
      <div className="bg-white border border-navy/10 rounded-2xl">
        <div className="px-5 py-4 border-b border-navy/5">
          <h3 className="text-sm font-semibold text-navy">Confidence trend</h3>
        </div>
        <div className="p-5">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-navy/55">Directional delta</p>
          <p className={`text-3xl font-semibold mt-1 tabular-nums ${deltaTone}`}>{deltaPrefix}{delta}%</p>
          <p className="text-[12px] text-navy/50 mt-1">{secondaryText}</p>
          <button
            type="button"
            className="mt-3 text-[12px] font-medium text-klo hover:text-klo/80"
            onClick={() => onFallbackCtaClick('refresh_confidence_inputs')}
          >
            Refresh confidence inputs
          </button>
        </div>
      </div>
    )
  }

  const max = Math.max(...datedPoints.map((p) => p.value ?? 0), 100)
  const min = 0
  const W = 240
  const H = 80
  const stepX = datedPoints.length > 1 ? W / (datedPoints.length - 1) : 0
  const yFor = (v) => H - ((v - min) / (max - min)) * H
  const pathD = datedPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${i * stepX},${yFor(p.value ?? 0)}`)
    .join(' ')
  const firstValue = Math.round(datedPoints[0]?.value ?? 0)
  const lastValue = Math.round(datedPoints[datedPoints.length - 1]?.value ?? 0)
  const trendAlt = `Confidence trend from ${firstValue}% to ${lastValue}% across ${datedPoints.length} updates.`
  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5">
        <h3 className="text-sm font-semibold text-navy">Confidence trend</h3>
      </div>
      <div className="p-5">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" role="img" aria-label={trendAlt}>
          <path d={pathD} fill="none" stroke="#4F8EF7" strokeWidth="2" />
          {datedPoints.map((p, i) => (
            <circle key={i} cx={i * stepX} cy={yFor(p.value ?? 0)} r="2" fill="#4F8EF7" />
          ))}
        </svg>
        <p className="sr-only">{trendAlt}</p>
        <p className="text-[11px] text-navy/45 mt-2">{datedPoints.length} points</p>
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

export default function SellerOverview({ deal, viewerRole = 'seller', onDealUpdate }) {
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
      <DealSnapshotPanel deal={deal} klo={klo} viewerRole={viewerRole} onDealUpdate={onDealUpdate} />

      <KloBriefSeller
        klo_take_seller={klo.klo_take_seller}
        computed_at={klo.confidence?.computed_at}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ConfidenceCard confidence={klo.confidence} />
        <NextActionsCard actions={actions} dealId={deal?.id} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <BuyerStakeholderMap
          stakeholders={stakeholders}
          title="Buyer-side stakeholders"
          emptyCopy="Klo will surface buyer-side stakeholders from your deal conversations."
        />
        <VendorTeamCard deal={deal} />
      </div>

      <SellerTimelineStrip kloState={klo} />

      <PendingTasksTwoCol kloState={klo} perspective="seller" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ConfidenceChart history={momentumHistory} confidence={klo?.confidence} dealId={deal?.id} />
        <RisksList blockers={klo.blockers} />
      </div>

      <BuyerRecentMomentsFeed
        moments={klo.buyer_view?.recent_moments}
        title="Deal moments"
        emptyCopy="No key moments captured yet — Klo will add them as this deal progresses."
      />
    </div>
  )
}
