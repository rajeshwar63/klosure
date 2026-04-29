// Phase 6 step 03 — placeholder for the per-rep view. The "by rep" rollup
// already exists inside the legacy TeamPage; future work will surface it
// here as a dedicated page with rep filters.
//
// Per §5.4: design is "your team's deal coach" — a hairline grid of
// seller cards, mono-numbered counts, no leaderboard ranking.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile.jsx'
import { loadTeamPipeline } from '../services/team.js'
import { formatCurrency } from '../lib/format.js'
import {
  Eyebrow,
  HairlineGrid,
  MonoKicker,
  MonoTimestamp,
} from '../components/shared/index.js'

export default function RepsPlaceholderPage() {
  const { team, loading: profileLoading } = useProfile()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profileLoading || !team) {
      setLoading(false)
      return
    }
    let mounted = true
    loadTeamPipeline({ teamId: team.id }).then((res) => {
      if (!mounted) return
      setData(res)
      setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [team, profileLoading])

  if (profileLoading || loading) {
    return (
      <div
        className="p-6 md:p-8 max-w-[960px] mx-auto text-sm"
        style={{ color: 'var(--klo-text-mute)' }}
      >
        Loading reps…
      </div>
    )
  }
  if (!team) {
    return (
      <div className="p-6 md:p-8 max-w-[960px] mx-auto">
        <Eyebrow>Team</Eyebrow>
        <h1
          className="mt-3 text-[22px] font-semibold"
          style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
        >
          No team linked to your account.
        </h1>
      </div>
    )
  }

  const rollUp = data?.rollUp ?? []

  return (
    <div className="p-6 md:p-8 max-w-[960px] mx-auto">
      <header className="mb-8">
        <Eyebrow>Team · {rollUp.length} seller{rollUp.length === 1 ? '' : 's'}</Eyebrow>
        <h1
          className="mt-3"
          style={{
            fontSize: 'clamp(32px, 4vw, 44px)',
            fontWeight: 600,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            color: 'var(--klo-text)',
          }}
        >
          Your team's deal coach.
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: 'var(--klo-text-dim)' }}>
          {team.name}
        </p>
      </header>

      {rollUp.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{
            background: 'var(--klo-bg-elev)',
            border: '1px solid var(--klo-line)',
          }}
        >
          <p className="text-[15px]" style={{ color: 'var(--klo-text-dim)' }}>
            No reps yet.
          </p>
        </div>
      ) : (
        <HairlineGrid cols={2}>
          {rollUp.map((r, idx) => (
            <RepCell key={r.user_id} index={String(idx + 1).padStart(2, '0')} rep={r} />
          ))}
        </HairlineGrid>
      )}

      <p className="kl-mono uppercase mt-5 text-[11px]" style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.05em' }}>
        Per-rep filters come in a future phase. For now, open a deal from the{' '}
        <Link to="/deals" className="underline" style={{ color: 'var(--klo-accent)' }}>
          deals list
        </Link>
        .
      </p>
    </div>
  )
}

function RepCell({ index, rep }) {
  const initial = (rep.name || 'M').charAt(0).toUpperCase()
  return (
    <HairlineGrid.Cell>
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
          style={{ background: 'var(--klo-accent-soft)', color: 'var(--klo-accent)' }}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <MonoKicker>
            {index} / {rep.role === 'manager' ? 'Manager' : 'Seller'}
          </MonoKicker>
          <p
            className="mt-1 text-[17px] font-semibold truncate"
            style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
          >
            {rep.name}
          </p>
          <MonoTimestamp className="mt-1 block">
            Active · {rep.activeCount}  ·  Red · {rep.redCount}  ·  Overdue · {rep.overdueCount}
          </MonoTimestamp>
        </div>
      </div>
      <div
        className="mt-4 pt-4 flex items-baseline justify-between"
        style={{ borderTop: '1px dashed var(--klo-line-strong)' }}
      >
        <span
          className="kl-mono text-[11px] uppercase"
          style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.05em' }}
        >
          Pipeline
        </span>
        <div className="text-right">
          <p
            className="text-[16px] font-semibold tabular-nums"
            style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
          >
            {formatCurrency(rep.pipelineValue)}
          </p>
          {rep.valueAtRisk > 0 && (
            <p
              className="kl-mono text-[11px] uppercase tabular-nums"
              style={{ color: 'var(--klo-danger)', letterSpacing: '0.02em' }}
            >
              {formatCurrency(rep.valueAtRisk)} at risk
            </p>
          )}
        </div>
      </div>
    </HairlineGrid.Cell>
  )
}
