// Per-rep rollup row for the manager home — mirrors the landing-page mock
// (avatar, name, active/red counts, pipeline value, at-risk amount). Each
// row links straight into the team-deals list filtered to that rep.

import { Link } from 'react-router-dom'
import { formatCurrency } from '../../lib/format.js'

function compactCurrency(amount) {
  const n = Number(amount) || 0
  if (n === 0) return '$0'
  if (Math.abs(n) >= 1_000_000) {
    const m = n / 1_000_000
    const fixed = m >= 10 ? m.toFixed(0) : m.toFixed(2)
    return `$${fixed.replace(/\.?0+$/, '')}M`
  }
  if (Math.abs(n) >= 1_000) {
    return `$${Math.round(n / 1000)}k`
  }
  return formatCurrency(n)
}

function initialOf(name) {
  const trimmed = (name || '').trim()
  if (!trimmed) return 'M'
  return trimmed.charAt(0).toUpperCase()
}

function RepRow({ rep, isLast }) {
  const warn = rep.redCount >= 2 || rep.valueAtRisk > 0
  return (
    <Link
      to={`/team/deals?rep=${rep.user_id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-navy/[0.02]"
      style={{
        background: warn ? 'rgba(196, 69, 47, 0.04)' : 'transparent',
        borderBottom: isLast ? 'none' : '1px solid var(--klo-line)',
        textDecoration: 'none',
      }}
      title={`Open ${rep.name}'s deals`}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0"
        style={{ background: 'var(--klo-accent-soft)', color: 'var(--klo-accent)' }}
      >
        {initialOf(rep.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-[14px] font-semibold truncate"
          style={{ color: 'var(--klo-text)', letterSpacing: '-0.01em' }}
        >
          {rep.name}
        </div>
        <div
          className="text-[11px] mt-0.5 kl-mono"
          style={{ color: 'var(--klo-text-mute)' }}
        >
          Active · {rep.activeCount}  ·  Red · {rep.redCount}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div
          className="text-[14px] font-semibold tabular-nums"
          style={{ color: 'var(--klo-text)' }}
        >
          {compactCurrency(rep.pipelineValue)}
        </div>
        {rep.valueAtRisk > 0 && (
          <div
            className="text-[11px] mt-0.5 kl-mono tabular-nums"
            style={{ color: 'var(--klo-danger)' }}
          >
            {compactCurrency(rep.valueAtRisk)} at risk
          </div>
        )}
      </div>
      <span className="text-navy/30 shrink-0" aria-hidden>
        ›
      </span>
    </Link>
  )
}

export default function ByRepRollup({ rollUp }) {
  const reps = (rollUp || []).filter((r) => r && r.user_id)
  if (reps.length === 0) return null

  return (
    <section className="mb-7">
      <div
        className="text-[11px] font-semibold uppercase mb-2 kl-mono"
        style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.1em' }}
      >
        By rep · this quarter
      </div>
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'var(--klo-bg-elev)',
          border: '1px solid var(--klo-line)',
        }}
      >
        {reps.map((r, idx) => (
          <RepRow key={r.user_id} rep={r} isLast={idx === reps.length - 1} />
        ))}
      </div>
    </section>
  )
}
