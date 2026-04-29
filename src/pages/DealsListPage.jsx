import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { loadSellerDashboard } from '../services/dashboard.js'
import { formatCurrency, formatDeadline, formatRelativeDate } from '../lib/format.js'
import DailyFocusBanner from '../components/DailyFocusBanner.jsx'
import InstallPrompt from '../components/InstallPrompt.jsx'
import {
  Eyebrow,
  HairlineGrid,
  MonoKicker,
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

export default function DealsListPage() {
  const { user, signOut } = useAuth()
  const { profile, isManager } = useProfile()
  const navigate = useNavigate()
  const [data, setData] = useState({ deals: { active: [], archived: [] }, stats: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showArchive, setShowArchive] = useState(false)

  useEffect(() => {
    if (!user) return
    let mounted = true
    async function load() {
      const res = await loadSellerDashboard(user.id)
      if (!mounted) return
      if (res.error) setError(res.error)
      setData({ deals: { active: res.deals.active, archived: res.deals.archived }, stats: res.stats })
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [user])

  const { active, archived } = data.deals
  const stats = data.stats

  const subline = loading
    ? 'Loading…'
    : stats?.activeCount === 0
      ? 'No active deals — start one.'
      : `${stats.activeCount} active · ${stats.redCount} at risk`

  return (
    <div className="min-h-screen" style={{ background: 'var(--klo-bg)' }}>
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
            <Eyebrow>Deals · {stats?.activeCount ?? 0} active</Eyebrow>
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
              {profile?.name ? `${profile.name.split(' ')[0]}'s pipeline, by reality.` : 'Your pipeline, by reality.'}
            </h1>
            <MonoTimestamp className="mt-2 block">{subline}</MonoTimestamp>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/deals/new"
              className="inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium px-3.5 py-2"
              style={{ background: 'var(--klo-text)', color: '#fff' }}
            >
              <span className="text-base leading-none">+</span> New deal
            </Link>
            {isManager && (
              <Link
                to="/team"
                className="inline-flex items-center rounded-lg text-[13px] px-3.5 py-2"
                style={{
                  color: 'var(--klo-text)',
                  border: '1px solid var(--klo-line-strong)',
                }}
              >
                Team
              </Link>
            )}
            <button
              onClick={async () => {
                await signOut()
                navigate('/', { replace: true })
              }}
              className="inline-flex items-center rounded-lg text-[13px] px-3.5 py-2"
              style={{
                color: 'var(--klo-text-dim)',
                border: '1px solid var(--klo-line-strong)',
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 pb-12 pt-6">
        <InstallPrompt />

        {loading ? (
          <div className="text-navy/50 text-sm py-10 text-center">Loading dashboard…</div>
        ) : error ? (
          <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
            {error}
          </div>
        ) : active.length === 0 && archived.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {stats && stats.activeCount > 0 && <DailyFocusBanner />}
            {stats && stats.activeCount > 0 && <StatsStrip stats={stats} />}

            {active.length > 0 && (
              <Section title={`Needs attention · ${active.length}`}>
                <ul className="kl-list">
                  {active.map((d) => (
                    <DealRow key={d.id} deal={d} />
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
                      <DealRow key={d.id} deal={d} archived />
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

function StatsStrip({ stats }) {
  return (
    <div className="mb-6">
      <HairlineGrid cols={4}>
        <StatCell
          index="01"
          label="Weighted pipeline"
          value={formatCurrency(stats.weightedPipeline)}
        />
        <StatCell
          index="02"
          label="Likely this quarter"
          value={`${stats.highConfidenceCount} of ${stats.activeCount}`}
        />
        <StatCell
          index="03"
          label="Need attention"
          value={String(stats.slippingCount)}
          tone={stats.slippingCount > 0 ? 'warn' : null}
        />
        <StatCell
          index="04"
          label="Closed"
          value={`${stats.wonCount}W · ${stats.lostCount}L`}
        />
      </HairlineGrid>
    </div>
  )
}

function StatCell({ index, label, value, tone }) {
  const valueColor =
    tone === 'bad'
      ? 'var(--klo-danger)'
      : tone === 'warn'
        ? 'var(--klo-warn)'
        : tone === 'good'
          ? 'var(--klo-good)'
          : 'var(--klo-text)'
  return (
    <HairlineGrid.Cell>
      <MonoKicker>
        {index} / {label}
      </MonoKicker>
      <p
        className="mt-3 tabular-nums"
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: valueColor,
          lineHeight: 1.15,
        }}
      >
        {value}
      </p>
    </HairlineGrid.Cell>
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

function EmptyState() {
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
        No deals yet.
      </h2>
      <p className="text-[15px] mt-2 mb-5" style={{ color: 'var(--klo-text-dim)' }}>
        Create a deal room and start talking to Klo. Solo mode works without a buyer.
      </p>
      <Link
        to="/onboarding"
        className="inline-flex items-center rounded-lg text-[14px] font-medium px-5 py-2.5"
        style={{ background: 'var(--klo-text)', color: '#fff' }}
      >
        Get started
      </Link>
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

function DealRow({ deal, archived = false }) {
  const subline = archived
    ? `${deal.buyer_company || '—'} · ${formatCurrency(deal.value)}`
    : `${deal.buyer_company || '—'} · ${formatCurrency(deal.value)}`
  const showBuyerViewBadge = !archived && buyerViewBadgeFor(deal)

  const closedTag = archived
    ? deal.status === 'won'
      ? { text: 'Won', tone: 'bg-emerald-100 text-emerald-800' }
      : deal.status === 'lost'
        ? { text: deal.closed_reason ? `Lost · ${prettyReason(deal.closed_reason)}` : 'Lost', tone: 'bg-red-100 text-red-800' }
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
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${HEALTH_DOT[deal.health] ?? 'bg-emerald-500'}`}
          title={HEALTH_LABEL[deal.health] ?? 'On track'}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`font-semibold truncate ${archived ? 'text-navy/70' : 'text-navy'}`}>
              {deal.title}
            </p>
            <span className="text-xs text-navy/50 shrink-0">
              {formatRelativeDate(deal.archived_at || deal.created_at)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-navy/60 mt-0.5">
            <span className="truncate">{subline}</span>
            {!archived && (
              <>
                <span className="text-navy/30">·</span>
                <span className="shrink-0">{formatDeadline(deal.deadline)}</span>
              </>
            )}
          </div>
          {!archived && (deal.overdueCount > 0 || deal.openCount > 0 || deal.summary || showBuyerViewBadge) && (
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
                <span className="text-navy/50 truncate flex-1 min-w-0">{deal.summary}</span>
              )}
            </div>
          )}
          {archived && closedTag && (
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px]">
              <span className={`px-1.5 py-0.5 rounded-full font-semibold ${closedTag.tone}`}>
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
  return <span className={`px-1.5 py-0.5 rounded-full font-semibold ${cls}`}>{children}</span>
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
