import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { loadSellerDashboard } from '../services/dashboard.js'
import { formatCurrency, formatDeadline, formatRelativeDate } from '../lib/format.js'
import DailyFocusBanner from '../components/DailyFocusBanner.jsx'
import InstallPrompt from '../components/InstallPrompt.jsx'

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

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <header className="bg-navy text-white">
        <div
          className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <div className="min-w-0">
            <h1 className="font-bold text-lg truncate">
              {profile?.name ? `${profile.name.split(' ')[0]}'s deals` : 'Your deals'}
            </h1>
            <p className="text-white/60 text-xs">
              {loading
                ? 'Loading…'
                : stats?.activeCount === 0
                  ? 'No active deals — start one.'
                  : `${stats.activeCount} active · ${stats.redCount} at risk`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isManager && (
              <Link
                to="/team"
                className="text-xs px-3 py-1.5 rounded-lg bg-klo hover:bg-klo/90 font-medium"
              >
                Team
              </Link>
            )}
            <button
              onClick={async () => {
                await signOut()
                navigate('/', { replace: true })
              }}
              className="text-white/70 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-white/20"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-32 pt-4">
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
              <Section title={`Needs attention (${active.length})`}>
                <ul className="bg-white rounded-2xl border border-navy/10 divide-y divide-navy/5 overflow-hidden">
                  {active.map((d) => (
                    <DealRow key={d.id} deal={d} />
                  ))}
                </ul>
              </Section>
            )}

            {archived.length > 0 && (
              <Section
                title={`Archive (${archived.length})`}
                muted
                action={
                  <button
                    type="button"
                    onClick={() => setShowArchive((v) => !v)}
                    className="text-xs text-klo font-medium"
                  >
                    {showArchive ? 'Hide' : 'Show'}
                  </button>
                }
              >
                {showArchive && (
                  <ul className="bg-white rounded-2xl border border-navy/10 divide-y divide-navy/5 overflow-hidden">
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

      <Link
        to="/deals/new"
        className="fixed bottom-6 right-6 sm:right-[calc(50%-22rem)] bg-klo hover:bg-klo/90 text-white shadow-lg rounded-full px-5 py-3 font-semibold flex items-center gap-2"
        style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <span className="text-xl leading-none">+</span> New deal
      </Link>
    </div>
  )
}

function StatsStrip({ stats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
      <Stat
        label="Weighted pipeline"
        value={formatCurrency(stats.weightedPipeline)}
      />
      <Stat
        label="Likely this quarter"
        value={`${stats.highConfidenceCount} of ${stats.activeCount}`}
      />
      <Stat
        label="Need attention"
        value={String(stats.slippingCount)}
        tone={stats.slippingCount > 0 ? 'amber' : 'neutral'}
      />
      <Stat
        label="Closed"
        value={`${stats.wonCount}W · ${stats.lostCount}L`}
      />
    </div>
  )
}

function Stat({ label, value, tone = 'neutral' }) {
  const valueClass =
    tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-navy'
  return (
    <div className="bg-white border border-navy/10 rounded-xl px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-navy/50 font-semibold">{label}</p>
      <p className={`text-base font-semibold ${valueClass}`}>{value}</p>
    </div>
  )
}

function Section({ title, action, muted = false, children }) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className={`text-xs font-semibold uppercase tracking-wider ${muted ? 'text-navy/40' : 'text-navy/60'}`}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl border border-navy/10 p-8 text-center mt-6">
      <p className="text-3xl mb-1">◆</p>
      <h2 className="font-semibold text-navy">No deals yet.</h2>
      <p className="text-navy/60 text-sm mt-1 mb-5">
        Create a deal room and start talking to Klo. Solo mode works without a buyer.
      </p>
      <Link
        to="/onboarding"
        className="inline-block bg-klo hover:bg-klo/90 text-white font-semibold rounded-full px-5 py-2.5"
      >
        Get started
      </Link>
    </div>
  )
}

function DealRow({ deal, archived = false }) {
  const subline = archived
    ? `${deal.buyer_company || '—'} · ${formatCurrency(deal.value)}`
    : `${deal.buyer_company || '—'} · ${formatCurrency(deal.value)}`

  const closedTag = archived
    ? deal.status === 'won'
      ? { text: 'Won', tone: 'bg-emerald-100 text-emerald-800' }
      : deal.status === 'lost'
        ? { text: deal.closed_reason ? `Lost · ${prettyReason(deal.closed_reason)}` : 'Lost', tone: 'bg-red-100 text-red-800' }
        : { text: STATUS_LABEL[deal.status] || 'Closed', tone: 'bg-navy/10 text-navy/70' }
    : null

  const slippingBg = !archived && deal.slipping ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-navy/5 active:bg-navy/10'

  return (
    <li>
      <Link
        to={`/deals/${deal.id}`}
        className={`flex items-center gap-3 px-4 py-3 ${slippingBg}`}
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
          {!archived && (deal.overdueCount > 0 || deal.openCount > 0 || deal.summary) && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[11px]">
              {deal.overdueCount > 0 && (
                <Pill tone="red">{deal.overdueCount} overdue</Pill>
              )}
              {deal.openCount > 0 && <Pill tone="neutral">{deal.openCount} open</Pill>}
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
      <div className="shrink-0 w-12 text-center">
        <div className="text-[15px] font-medium leading-none text-navy/30">—</div>
      </div>
    )
  }
  const v = confidence.value
  const tone =
    v >= 60 ? 'text-emerald-700' : v >= 35 ? 'text-amber-700' : 'text-red-700'
  let arrow = ''
  if (confidence.trend === 'up' && confidence.delta) {
    arrow = `↑ ${Math.abs(confidence.delta)}`
  } else if (confidence.trend === 'down' && confidence.delta) {
    arrow = `↓ ${Math.abs(confidence.delta)}`
  } else if (confidence.trend === 'flat') {
    arrow = '→'
  }
  return (
    <div className="shrink-0 w-12 text-center" title="Klo's read">
      <div className={`text-[15px] font-medium leading-none ${tone}`}>{v}%</div>
      {arrow && <div className="text-[10px] text-navy/40 mt-0.5">{arrow}</div>}
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
