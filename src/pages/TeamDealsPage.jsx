// All deals across the team, manager-only. Each row is labelled with the
// rep that owns it. Optional ?rep=<user_id> filter scopes the list to a
// single rep — used by the per-rep links on /team/reps.

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile.jsx'
import { loadTeamPipeline } from '../services/team.js'
import {
  formatCurrency,
  formatDeadline,
  formatRelativeDate,
} from '../lib/format.js'
import {
  Eyebrow,
  MonoTimestamp,
  ConfidencePill,
} from '../components/shared/index.js'

const HEALTH_DOT = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}

const HEALTH_LABEL = {
  green: 'On track',
  amber: 'Stuck',
  red: 'At risk',
}

const STATUS_LABEL = {
  won: 'Won',
  lost: 'Lost',
  archived: 'Archived',
}

function NoTeamPlaceholder() {
  const navigate = useNavigate()
  return (
    <div className="p-12 max-w-[640px] mx-auto text-center">
      <h2 className="text-xl font-medium text-navy mb-2">
        No team linked to your account
      </h2>
      <p className="text-navy/55 text-sm mb-4">
        Set up a team to see team deals, or switch back to your seller view.
      </p>
      <button
        type="button"
        onClick={() => navigate('/today')}
        className="px-4 py-2 rounded-md text-sm font-medium bg-klo text-white"
      >
        Go to seller view
      </button>
    </div>
  )
}

export default function TeamDealsPage() {
  const { team, isManager, loading: profileLoading } = useProfile()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showArchive, setShowArchive] = useState(false)

  const repFilter = searchParams.get('rep') || ''

  useEffect(() => {
    if (profileLoading || !team?.id) {
      setLoading(false)
      return
    }
    let mounted = true
    setLoading(true)
    loadTeamPipeline({ teamId: team.id }).then((res) => {
      if (!mounted) return
      setData(res)
      setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [team?.id, profileLoading])

  if (profileLoading || loading) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto text-sm text-navy/55">
        Loading team deals…
      </div>
    )
  }
  if (!team) return <NoTeamPlaceholder />
  if (!isManager) {
    return (
      <div className="p-6 md:p-8 max-w-[640px] mx-auto">
        <Eyebrow>Team deals</Eyebrow>
        <h1
          className="mt-3 text-[22px] font-semibold"
          style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
        >
          Manager view only.
        </h1>
        <p className="mt-2 text-[14px]" style={{ color: 'var(--klo-text-dim)' }}>
          Team-wide deals are visible to managers. Open your own pipeline from{' '}
          <Link to="/deals" className="underline">
            Deals
          </Link>
          .
        </p>
      </div>
    )
  }

  const deals = data?.deals ?? []
  const rollUp = data?.rollUp ?? []

  const filtered = repFilter
    ? deals.filter((d) => d.seller_id === repFilter)
    : deals
  const active = filtered.filter((d) => d.status === 'active')
  const archived = filtered.filter((d) => d.status !== 'active')

  const selectedRep = repFilter
    ? rollUp.find((r) => r.user_id === repFilter)
    : null

  function clearFilter() {
    const next = new URLSearchParams(searchParams)
    next.delete('rep')
    setSearchParams(next, { replace: true })
  }

  function pickRep(userId) {
    const next = new URLSearchParams(searchParams)
    if (userId) next.set('rep', userId)
    else next.delete('rep')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="min-h-full" style={{ background: 'var(--klo-bg)' }}>
      <header
        style={{
          background: 'var(--klo-bg)',
          borderBottom: '1px solid var(--klo-line)',
        }}
      >
        <div
          className="max-w-3xl mx-auto px-4 md:px-6 pt-8 pb-6 flex items-end justify-between gap-3 flex-wrap"
          style={{ paddingTop: 'max(2rem, calc(env(safe-area-inset-top) + 1rem))' }}
        >
          <div className="min-w-0">
            <Eyebrow>
              Team deals · {active.length} active{' '}
              {selectedRep ? `· ${selectedRep.name}` : `· ${rollUp.length} reps`}
            </Eyebrow>
            <h1
              className="mt-3 truncate"
              style={{
                fontSize: 'clamp(28px, 3.4vw, 36px)',
                fontWeight: 600,
                letterSpacing: '-0.03em',
                color: 'var(--klo-text)',
                lineHeight: 1.1,
              }}
            >
              {selectedRep
                ? `${selectedRep.name.split(' ')[0]}'s pipeline.`
                : `${team.name || 'Team'} pipeline.`}
            </h1>
            <MonoTimestamp className="mt-2 block">
              {selectedRep
                ? `${selectedRep.activeCount} active · ${selectedRep.redCount} red · ${formatCurrency(
                    selectedRep.pipelineValue,
                  )} pipeline`
                : 'Every deal across every rep — sorted by Klo confidence.'}
            </MonoTimestamp>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/team"
              className="inline-flex items-center rounded-lg text-[13px] px-3.5 py-2"
              style={{
                color: 'var(--klo-text)',
                border: '1px solid var(--klo-line-strong)',
              }}
            >
              ← Team home
            </Link>
            <Link
              to="/team/reps"
              className="inline-flex items-center rounded-lg text-[13px] px-3.5 py-2"
              style={{
                color: 'var(--klo-text)',
                border: '1px solid var(--klo-line-strong)',
              }}
            >
              Reps
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 pb-12 pt-6">
        {rollUp.length > 0 && (
          <RepFilterBar
            reps={rollUp}
            selected={repFilter}
            onPick={pickRep}
            onClear={clearFilter}
          />
        )}

        {active.length === 0 && archived.length === 0 ? (
          <EmptyState filtered={Boolean(repFilter)} onClear={clearFilter} />
        ) : (
          <>
            {active.length > 0 && (
              <Section
                title={
                  selectedRep
                    ? `${selectedRep.name.split(' ')[0]}'s active · ${active.length}`
                    : `Active across the team · ${active.length}`
                }
              >
                <ul className="kl-list">
                  {active.map((d) => (
                    <DealRow
                      key={d.id}
                      deal={d}
                      hideRep={Boolean(repFilter)}
                    />
                  ))}
                </ul>
              </Section>
            )}

            {archived.length > 0 && (
              <Section
                title={`Archive · ${archived.length}`}
                muted
                action={
                  <button
                    type="button"
                    onClick={() => setShowArchive((v) => !v)}
                    className="kl-mono text-[12px]"
                    style={{ color: 'var(--klo-accent)' }}
                  >
                    {showArchive ? 'Hide' : 'Show'}
                  </button>
                }
              >
                {showArchive && (
                  <ul className="kl-list">
                    {archived.map((d) => (
                      <DealRow
                        key={d.id}
                        deal={d}
                        archived
                        hideRep={Boolean(repFilter)}
                      />
                    ))}
                  </ul>
                )}
              </Section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function RepFilterBar({ reps, selected, onPick, onClear }) {
  return (
    <div
      className="rounded-2xl p-3 mb-5 flex items-center gap-2 flex-wrap"
      style={{
        background: 'var(--klo-bg-elev)',
        border: '1px solid var(--klo-line)',
      }}
    >
      <span
        className="kl-mono text-[11px] uppercase pl-1.5 pr-1"
        style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.08em' }}
      >
        Filter
      </span>
      <button
        type="button"
        onClick={onClear}
        className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
          selected ? '' : 'is-active'
        }`}
        style={{
          background: selected ? 'transparent' : 'var(--klo-accent)',
          color: selected ? 'var(--klo-text)' : '#fff',
          border: '1px solid',
          borderColor: selected ? 'var(--klo-line-strong)' : 'var(--klo-accent)',
        }}
      >
        All reps
      </button>
      {reps.map((r) => {
        const isActive = selected === r.user_id
        return (
          <button
            key={r.user_id}
            type="button"
            onClick={() => onPick(r.user_id)}
            className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors"
            style={{
              background: isActive ? 'var(--klo-accent)' : 'transparent',
              color: isActive ? '#fff' : 'var(--klo-text)',
              border: '1px solid',
              borderColor: isActive
                ? 'var(--klo-accent)'
                : 'var(--klo-line-strong)',
            }}
          >
            {r.name}
            {r.redCount > 0 && (
              <span
                className="ml-1.5 kl-mono text-[10px]"
                style={{ color: isActive ? '#fff' : 'var(--klo-danger)' }}
              >
                ({r.redCount} red)
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function Section({ title, action, muted = false, children }) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <Eyebrow dot={!muted}>{title}</Eyebrow>
        {action}
      </div>
      {children}
    </section>
  )
}

function EmptyState({ filtered, onClear }) {
  return (
    <div
      className="rounded-2xl p-10 text-center mt-6"
      style={{
        background: 'var(--klo-bg-elev)',
        border: '1px solid var(--klo-line)',
      }}
    >
      <h2
        className="text-[20px] font-semibold"
        style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
      >
        {filtered ? 'No deals for this rep yet.' : 'No team deals yet.'}
      </h2>
      <p className="text-[15px] mt-2 mb-5" style={{ color: 'var(--klo-text-dim)' }}>
        {filtered
          ? 'Once they create a deal, it will roll up here.'
          : 'Once your reps create deals, every one shows up here.'}
      </p>
      {filtered && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center rounded-lg text-[14px] font-medium px-5 py-2.5"
          style={{ background: 'var(--klo-text)', color: '#fff' }}
        >
          Show all reps
        </button>
      )}
    </div>
  )
}

function buyerViewBadgeFor(deal) {
  const generatedAt = deal?.klo_state?.buyer_view?.generated_at
  if (!generatedAt) return false
  try {
    const lastViewed = window.localStorage.getItem(
      `klosure:lastViewedBuyerView:${deal.id}`,
    )
    if (!lastViewed) return true
    return new Date(generatedAt).getTime() > new Date(lastViewed).getTime()
  } catch {
    return false
  }
}

function DealRow({ deal, archived = false, hideRep = false }) {
  const subline = `${deal.buyer_company || '—'} · ${formatCurrency(deal.value)}`
  const showBuyerViewBadge = !archived && buyerViewBadgeFor(deal)

  const closedTag = archived
    ? deal.status === 'won'
      ? { text: 'Won', tone: 'bg-emerald-100 text-emerald-800' }
      : deal.status === 'lost'
        ? {
            text: deal.closed_reason
              ? `Lost · ${prettyReason(deal.closed_reason)}`
              : 'Lost',
            tone: 'bg-red-100 text-red-800',
          }
        : { text: STATUS_LABEL[deal.status] || 'Closed', tone: 'bg-navy/10 text-navy/70' }
    : null

  const slippingBg = !archived && deal.slipping ? 'kl-row-warn' : 'kl-row'

  return (
    <li>
      <Link
        to={`/deals/${deal.id}`}
        className={`flex items-center gap-3 px-4 py-3.5 ${slippingBg}`}
      >
        {!archived && <ConfidenceCell confidence={deal.klo_state?.confidence} />}
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            HEALTH_DOT[deal.health] ?? 'bg-emerald-500'
          }`}
          title={HEALTH_LABEL[deal.health] ?? 'On track'}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={`font-semibold truncate ${
                archived ? 'text-navy/70' : 'text-navy'
              }`}
            >
              {deal.title}
            </p>
            <span className="text-xs text-navy/50 shrink-0">
              {formatRelativeDate(deal.archived_at || deal.created_at)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-navy/60 mt-0.5 flex-wrap">
            {!hideRep && deal.seller_name && (
              <span
                className="kl-mono text-[11px] px-1.5 py-0.5 rounded-full shrink-0"
                style={{
                  background: 'var(--klo-accent-soft)',
                  color: 'var(--klo-accent)',
                  letterSpacing: '0.02em',
                }}
                title="Owning rep"
              >
                {deal.seller_name}
              </span>
            )}
            <span className="truncate">{subline}</span>
            {!archived && (
              <>
                <span className="text-navy/30">·</span>
                <span className="shrink-0">{formatDeadline(deal.deadline)}</span>
              </>
            )}
          </div>
          {!archived &&
            (deal.overdueCount > 0 ||
              deal.openCount > 0 ||
              deal.summary ||
              showBuyerViewBadge) && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[11px]">
                {deal.overdueCount > 0 && (
                  <Pill tone="red">{deal.overdueCount} overdue</Pill>
                )}
                {deal.openCount > 0 && <Pill tone="neutral">{deal.openCount} open</Pill>}
                {showBuyerViewBadge && (
                  <span className="px-1.5 py-0.5 rounded-full font-semibold bg-klo/10 text-klo">
                    ✨ Buyer view updated
                  </span>
                )}
                {deal.summary && (
                  <span className="text-navy/50 truncate flex-1 min-w-0">
                    {deal.summary}
                  </span>
                )}
              </div>
            )}
          {archived && closedTag && (
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px]">
              <span
                className={`px-1.5 py-0.5 rounded-full font-semibold ${closedTag.tone}`}
              >
                {closedTag.text}
              </span>
              {deal.locked && <span className="text-navy/40">Read-only</span>}
            </div>
          )}
        </div>
        <span className="text-navy/30">›</span>
      </Link>
    </li>
  )
}

function ConfidenceCell({ confidence }) {
  if (!confidence) {
    return (
      <div className="shrink-0 w-14 text-center">
        <span className="kl-mono text-[14px]" style={{ color: 'var(--klo-text-mute)' }}>
          —
        </span>
      </div>
    )
  }
  return (
    <div className="shrink-0" title="Klo's read">
      <ConfidencePill value={confidence.value} delta={confidence.delta} />
    </div>
  )
}

function Pill({ children, tone = 'neutral' }) {
  const cls =
    tone === 'red'
      ? 'bg-red-100 text-red-700'
      : tone === 'amber'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-navy/10 text-navy/70'
  return (
    <span className={`px-1.5 py-0.5 rounded-full font-semibold ${cls}`}>
      {children}
    </span>
  )
}

function prettyReason(r) {
  return (
    {
      budget: 'Budget',
      timing: 'Timing',
      competitor: 'Competitor',
      no_decision: 'No decision',
      other: 'Other',
      won: 'Won',
    }[r] || r
  )
}
