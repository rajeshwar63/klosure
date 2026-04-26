import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import {
  loadTeamPipeline,
  createTeam,
  inviteMember,
  revokeInvite,
  removeMember,
} from '../services/team.js'
import { formatCurrency, formatDeadline } from '../lib/format.js'
import ManagerKloPanel from '../components/ManagerKloPanel.jsx'
import ForecastTab from '../components/team/ForecastTab.jsx'

const HEALTH_DOT = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}

export default function TeamPage() {
  const { user } = useAuth()
  const { team, profile, refresh, loading: profileLoading } = useProfile()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('pipeline')

  useEffect(() => {
    if (profileLoading) return
    if (!team) {
      setLoading(false)
      return
    }
    let mounted = true
    async function load() {
      const res = await loadTeamPipeline({ teamId: team.id })
      if (!mounted) return
      if (res?.error) setError(res.error)
      else setData(res)
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [team, profileLoading])

  if (profileLoading) {
    return <div className="min-h-screen flex items-center justify-center text-navy/50 text-sm">Loading…</div>
  }

  if (!team) {
    return (
      <CreateTeamCard
        user={user}
        profile={profile}
        onCreated={async () => {
          await refresh()
        }}
        onCancel={() => navigate('/deals')}
      />
    )
  }

  const totalActive = data?.deals?.active.length ?? 0
  const stuck = (data?.deals?.active ?? []).filter((d) => d.health !== 'green')

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <header className="bg-navy text-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white/50 text-[11px] uppercase tracking-wider font-semibold">Team</p>
            <h1 className="font-bold text-lg truncate">{team.name || 'My team'}</h1>
          </div>
          <Link to="/deals" className="text-xs px-3 py-1.5 rounded-lg border border-white/20 text-white/80 hover:text-white">
            ← My deals
          </Link>
        </div>
        <div className="max-w-4xl mx-auto px-4 pb-3 flex gap-1">
          {['pipeline', 'forecast', 'people', 'klo'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md transition ${
                tab === t ? 'bg-white text-navy' : 'text-white/60 hover:text-white'
              }`}
            >
              {t === 'pipeline'
                ? 'Pipeline'
                : t === 'forecast'
                  ? 'Forecast'
                  : t === 'people'
                    ? 'People'
                    : 'Ask Klo'}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pb-32 pt-4">
        {error && (
          <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-navy/50 text-sm py-10 text-center">Loading team data…</div>
        ) : tab === 'pipeline' ? (
          <PipelineTab data={data} totalActive={totalActive} stuck={stuck} />
        ) : tab === 'forecast' ? (
          <ForecastTab teamId={team.id} />
        ) : tab === 'people' ? (
          <PeopleTab data={data} team={team} user={user} onChanged={async () => {
            const res = await loadTeamPipeline({ teamId: team.id })
            if (!res?.error) setData(res)
          }} />
        ) : (
          <ManagerKloPanel team={team} pipeline={data} />
        )}
      </main>
    </div>
  )
}

function PipelineTab({ data, totalActive, stuck }) {
  const rollUp = data?.rollUp ?? []
  const totalValueAtRisk = rollUp.reduce((sum, r) => sum + r.valueAtRisk, 0)
  const totalOverdue = rollUp.reduce((sum, r) => sum + r.overdueCount, 0)

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Stat label="Active deals" value={String(totalActive)} />
        <Stat label="At risk" value={String(stuck.filter((d) => d.health === 'red').length)} tone="red" />
        <Stat label="Overdue" value={String(totalOverdue)} tone={totalOverdue > 0 ? 'red' : 'neutral'} />
        <Stat label="Value at risk" value={formatCurrency(totalValueAtRisk)} tone={totalValueAtRisk > 0 ? 'red' : 'neutral'} />
      </div>

      <h2 className="text-xs font-semibold uppercase tracking-wider text-navy/60 mb-2">
        By rep ({rollUp.length})
      </h2>
      <div className="bg-white rounded-2xl border border-navy/10 divide-y divide-navy/5 overflow-hidden mb-6">
        {rollUp.map((r) => (
          <div key={r.user_id} className="px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-klo/15 text-klo flex items-center justify-center text-sm font-bold shrink-0">
              {(r.name || 'M').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-navy truncate">
                {r.name}
                {r.role === 'manager' && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-klo font-semibold">Mgr</span>
                )}
              </p>
              <p className="text-xs text-navy/60 truncate">
                {r.activeCount} active · {r.redCount} red · {r.overdueCount} overdue
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-navy">{formatCurrency(r.pipelineValue)}</p>
              {r.valueAtRisk > 0 && (
                <p className="text-[11px] text-red-600">{formatCurrency(r.valueAtRisk)} at risk</p>
              )}
            </div>
          </div>
        ))}
        {rollUp.length === 0 && (
          <div className="px-4 py-6 text-sm text-navy/60 text-center">
            No reps yet. Invite sellers in the People tab.
          </div>
        )}
      </div>

      <h2 className="text-xs font-semibold uppercase tracking-wider text-navy/60 mb-2">
        Stuck deals ({stuck.length})
      </h2>
      <div className="bg-white rounded-2xl border border-navy/10 divide-y divide-navy/5 overflow-hidden">
        {stuck.length === 0 ? (
          <div className="px-4 py-6 text-sm text-navy/60 text-center">
            Nothing in red or amber. Pipeline looks healthy.
          </div>
        ) : (
          stuck.map((d) => (
            <Link
              key={d.id}
              to={`/deals/${d.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-navy/5 active:bg-navy/10"
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${HEALTH_DOT[d.health] ?? 'bg-emerald-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-navy truncate">{d.title}</p>
                <p className="text-xs text-navy/60 truncate">
                  {d.seller_name} · {d.buyer_company || '—'} · {formatCurrency(d.value)} · {formatDeadline(d.deadline)}
                </p>
                {d.summary && <p className="text-[11px] text-navy/50 truncate mt-0.5">{d.summary}</p>}
              </div>
              <span className="text-navy/30">›</span>
            </Link>
          ))
        )}
      </div>
    </>
  )
}

function PeopleTab({ data, team, user, onChanged }) {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleInvite(e) {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    setError('')
    const res = await inviteMember({ teamId: team.id, email, invitedBy: user.id })
    setSubmitting(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setEmail('')
    onChanged?.()
  }

  return (
    <>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-navy/60 mb-2">
        Members ({data?.members?.length ?? 0})
      </h2>
      <ul className="bg-white rounded-2xl border border-navy/10 divide-y divide-navy/5 overflow-hidden mb-6">
        {(data?.members ?? []).map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <div className="w-9 h-9 rounded-full bg-klo/15 text-klo flex items-center justify-center text-sm font-bold shrink-0">
              {(m.users?.name || m.users?.email || 'M').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-navy truncate">
                {m.users?.name || m.users?.email}
                {m.role === 'manager' && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-klo font-semibold">
                    Manager
                  </span>
                )}
              </p>
              <p className="text-xs text-navy/50 truncate">{m.users?.email}</p>
            </div>
            {m.user_id !== team.owner_id && (
              <button
                onClick={async () => {
                  if (!confirm(`Remove ${m.users?.name || m.users?.email} from the team?`)) return
                  const res = await removeMember({ memberRowId: m.id })
                  if (!res.ok) alert(res.error)
                  else onChanged?.()
                }}
                className="text-xs text-navy/40 hover:text-red-600"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      <h2 className="text-xs font-semibold uppercase tracking-wider text-navy/60 mb-2">
        Invite a seller
      </h2>
      <form onSubmit={handleInvite} className="bg-white rounded-2xl border border-navy/10 p-4 mb-6 space-y-3">
        <label className="block">
          <span className="block text-xs font-medium text-navy/70 mb-1">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ahmed@yourcompany.com"
            required
            className="w-full border border-navy/15 rounded-lg px-3 py-2.5 focus:outline-none focus:border-klo focus:ring-2 focus:ring-klo/20"
          />
        </label>
        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}
        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="bg-klo hover:bg-klo/90 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-xl"
        >
          {submitting ? 'Sending…' : 'Send invite'}
        </button>
      </form>

      {(data?.invites ?? []).length > 0 && (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-navy/60 mb-2">
            Pending invites ({data.invites.length})
          </h2>
          <ul className="bg-white rounded-2xl border border-navy/10 divide-y divide-navy/5 overflow-hidden">
            {data.invites.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-navy truncate">{inv.email}</p>
                  <p className="text-[11px] text-navy/50">
                    Invite link: /invite/{inv.token}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const res = await revokeInvite({ inviteId: inv.id })
                    if (!res.ok) alert(res.error)
                    else onChanged?.()
                  }}
                  className="text-xs text-navy/40 hover:text-red-600"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
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

function CreateTeamCard({ user, profile, onCreated, onCancel }) {
  const [name, setName] = useState(profile?.name ? `${profile.name.split(' ')[0]}'s team` : '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const res = await createTeam({
      name,
      ownerId: user.id,
      ownerName: profile?.name,
      ownerEmail: profile?.email || user.email,
    })
    if (!res.ok) {
      setError(res.error)
      setSubmitting(false)
      return
    }
    await onCreated?.()
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <header className="bg-navy text-white">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={onCancel} className="text-white/70 hover:text-white text-lg">‹</button>
          <h1 className="font-bold text-lg">Create your team</h1>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-4 pt-6 pb-20">
        <p className="text-sm text-navy/70 mb-4">
          Team plan unlocks a manager view of every deal in your pipeline plus the ability to ask
          Klo about the whole book ("which deals are at risk?", "where is my pipeline stuck?").
        </p>
        <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-navy/10 p-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-medium text-navy/70 mb-1">Team name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Sales"
              required
              className="w-full border border-navy/15 rounded-lg px-3 py-2.5 focus:outline-none focus:border-klo focus:ring-2 focus:ring-klo/20"
            />
          </label>
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="bg-klo hover:bg-klo/90 disabled:opacity-50 text-white font-semibold py-3 rounded-xl w-full"
          >
            {submitting ? 'Creating…' : 'Create team'}
          </button>
        </form>
        <p className="text-[11px] text-navy/50 mt-3 text-center">
          You can add the Stripe Team subscription from the Billing page after.
        </p>
      </main>
    </div>
  )
}
