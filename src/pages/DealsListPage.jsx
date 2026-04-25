import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { formatCurrency, formatDeadline, formatRelativeDate } from '../lib/format.js'

const HEALTH_DOT = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500'
}

export default function DealsListPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    let mounted = true
    async function load() {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false })
      if (!mounted) return
      if (error) setError(error.message)
      setDeals(data ?? [])
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [user])

  const active = deals.filter((d) => d.status === 'active')
  const archived = deals.filter((d) => d.status !== 'active')

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <header className="bg-navy text-white">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg">Your deals</h1>
            <p className="text-white/60 text-xs">Klosure — get closure on every deal.</p>
          </div>
          <div className="flex items-center gap-2">
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

      <main className="max-w-2xl mx-auto px-4 pb-32 pt-4">
        {loading ? (
          <div className="text-navy/50 text-sm py-10 text-center">Loading deals…</div>
        ) : error ? (
          <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
            {error}
          </div>
        ) : deals.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <Section title={`Active (${active.length})`} deals={active} />
            {archived.length > 0 && (
              <Section title={`Archive (${archived.length})`} deals={archived} muted />
            )}
          </>
        )}
      </main>

      <Link
        to="/deals/new"
        className="fixed bottom-6 right-6 sm:right-[calc(50%-18rem)] bg-klo hover:bg-klo/90 text-white shadow-lg rounded-full px-5 py-3 font-semibold flex items-center gap-2"
      >
        <span className="text-xl leading-none">+</span> New deal
      </Link>
    </div>
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
        to="/deals/new"
        className="inline-block bg-klo hover:bg-klo/90 text-white font-semibold rounded-full px-5 py-2.5"
      >
        Create your first deal
      </Link>
    </div>
  )
}

function Section({ title, deals, muted = false }) {
  return (
    <section className="mb-6">
      <h2 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${muted ? 'text-navy/40' : 'text-navy/60'}`}>
        {title}
      </h2>
      <ul className="bg-white rounded-2xl border border-navy/10 divide-y divide-navy/5 overflow-hidden">
        {deals.map((d) => (
          <li key={d.id}>
            <Link
              to={`/deals/${d.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-navy/5 active:bg-navy/10"
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${HEALTH_DOT[d.health] ?? 'bg-emerald-500'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-navy truncate">{d.title}</p>
                  <span className="text-xs text-navy/50 shrink-0">
                    {formatRelativeDate(d.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-navy/60 mt-0.5">
                  <span className="truncate">
                    {d.buyer_company || '—'} · {formatCurrency(d.value)}
                  </span>
                  <span className="text-navy/30">·</span>
                  <span className="shrink-0">{formatDeadline(d.deadline)}</span>
                </div>
              </div>
              <span className="text-navy/30">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
