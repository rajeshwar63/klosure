// Hero — title + meta + 4-stat strip. All values pulled from deal + messages,
// no edge-function dependency.

import { useMemo } from 'react'
import { formatCurrency, daysUntil } from '../../../lib/format.js'

const STAGE_LABEL = {
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  legal: 'Legal',
  closed: 'Closed',
}

const STATUS_PALETTE = {
  stuck: { bg: 'var(--dr-warn-soft)', fg: 'var(--dr-warn)' },
  at_risk: { bg: 'var(--dr-bad-soft)', fg: 'var(--dr-bad)' },
  active: { bg: 'var(--dr-good-soft)', fg: 'var(--dr-good)' },
  won: { bg: 'var(--dr-good-soft)', fg: 'var(--dr-good)' },
  lost: { bg: 'var(--dr-bad-soft)', fg: 'var(--dr-bad)' },
}

function statusLabel(status) {
  if (!status) return null
  return status
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function daysSilent(messages) {
  if (!messages || messages.length === 0) return null
  // Latest non-Klo message (Klo doesn't count as buyer/seller activity).
  const recent = [...messages]
    .filter((m) => m.sender_type === 'buyer' || m.sender_type === 'seller')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
  if (!recent) return null
  const days = Math.floor(
    (Date.now() - new Date(recent.created_at).getTime()) / (1000 * 60 * 60 * 24),
  )
  return Math.max(0, days)
}

function formatCreatedAt(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function StatusInline({ status }) {
  if (!status) return null
  const palette = STATUS_PALETTE[status] ?? STATUS_PALETTE.stuck
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-[3px]"
      style={{
        background: palette.bg,
        color: palette.fg,
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: 0.01,
      }}
    >
      <span
        className="w-[5px] h-[5px] rounded-full"
        style={{ background: palette.fg }}
      />
      {statusLabel(status)}
    </span>
  )
}

function Stat({ label, value, unit, tone }) {
  const colorByTone = {
    warn: 'var(--dr-warn)',
    bad: 'var(--dr-bad)',
    good: 'var(--dr-good)',
  }
  return (
    <div
      className="px-4 py-3.5"
      style={{ borderLeft: '1px solid var(--dr-line)' }}
    >
      <div className="dr-mono" style={{ fontSize: 10, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
        {label}
      </div>
      <div
        className="font-medium leading-none"
        style={{
          fontSize: 22,
          letterSpacing: '-0.025em',
          color: tone ? colorByTone[tone] : 'var(--dr-ink)',
        }}
      >
        {value ?? '—'}
        {unit && (
          <span
            className="font-normal"
            style={{ fontSize: 12, marginLeft: 4, color: 'var(--dr-ink-3)' }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}

export default function HeroBlock({ deal, messages }) {
  const ks = deal?.klo_state ?? {}
  const stage = STAGE_LABEL[ks.stage ?? deal?.stage] ?? null
  const value = ks.deal_value?.amount ?? deal?.value ?? null
  const days = daysUntil(deal?.deadline)
  const silent = useMemo(() => daysSilent(messages), [messages])
  const probability = ks.confidence?.value
  const created = formatCreatedAt(deal?.created_at)

  const deadlineLabel =
    days === null ? '—' : days < 0 ? `${Math.abs(days)}` : `${days}`
  const deadlineUnit = days === null ? null : days < 0 ? 'days overdue' : 'days left'
  const deadlineTone = days === null ? null : days < 0 ? 'bad' : days <= 14 ? 'warn' : null

  const silentTone = silent === null ? null : silent >= 7 ? 'warn' : silent >= 14 ? 'bad' : null

  return (
    <section className="mb-5">
      <div
        className="flex items-center gap-2 mb-3 dr-mono"
        style={{ fontSize: 11, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}
      >
        <StatusInline status={deal?.status} />
        {stage && (
          <>
            <span style={{ color: 'var(--dr-ink-4)' }}>·</span>
            <span>{stage} stage</span>
          </>
        )}
        {created && (
          <>
            <span style={{ color: 'var(--dr-ink-4)' }}>·</span>
            <span>Created {created}</span>
          </>
        )}
      </div>

      <h1
        className="font-semibold m-0"
        style={{
          fontSize: 32,
          lineHeight: 1.15,
          letterSpacing: '-0.025em',
          color: 'var(--dr-ink)',
        }}
      >
        {deal?.title}
      </h1>
      {(deal?.seller_company || deal?.buyer_company) && (
        <p className="mt-1.5 mb-0" style={{ fontSize: 14, color: 'var(--dr-ink-2)' }}>
          {deal?.seller_company || 'You'}
          <span className="mx-2" style={{ color: 'var(--dr-ink-4)' }}>→</span>
          {deal?.buyer_company || 'Buyer'}
        </p>
      )}

      <div
        className="mt-6 grid grid-cols-2 md:grid-cols-4"
        style={{
          background: 'var(--dr-surface)',
          border: '1px solid var(--dr-line)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <div className="px-4 py-3.5">
          <div className="dr-mono" style={{ fontSize: 10, color: 'var(--dr-ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            Deal value
          </div>
          <div
            className="font-medium leading-none"
            style={{ fontSize: 22, letterSpacing: '-0.025em', color: 'var(--dr-ink)' }}
          >
            {formatCurrency(value)}
          </div>
        </div>
        <Stat
          label="Deadline"
          value={deadlineLabel}
          unit={deadlineUnit}
          tone={deadlineTone}
        />
        <Stat
          label="Days silent"
          value={silent === null ? '—' : silent}
          tone={silentTone}
        />
        <Stat
          label="Probability"
          value={probability == null ? '—' : Math.round(probability * (probability <= 1 ? 100 : 1))}
          unit={probability == null ? null : '%'}
        />
      </div>
    </section>
  )
}
