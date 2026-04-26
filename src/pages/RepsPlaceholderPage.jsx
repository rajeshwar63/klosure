// Phase 6 step 03 — placeholder for the per-rep view. The "by rep" rollup
// already exists inside the legacy TeamPage; future work will surface it
// here as a dedicated page with rep filters.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile.jsx'
import { loadTeamPipeline } from '../services/team.js'
import { formatCurrency } from '../lib/format.js'

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
      <div className="p-6 md:p-8 max-w-[960px] mx-auto text-sm text-navy/50">
        Loading reps…
      </div>
    )
  }
  if (!team) {
    return (
      <div className="p-6 md:p-8 max-w-[960px] mx-auto">
        <h1 className="text-xl font-medium text-navy mb-2">Reps</h1>
        <p className="text-sm text-navy/60">No team linked to your account.</p>
      </div>
    )
  }

  const rollUp = data?.rollUp ?? []

  return (
    <div className="p-6 md:p-8 max-w-[960px] mx-auto">
      <h1 className="text-xl font-medium text-navy mb-1">Reps</h1>
      <p className="text-sm text-navy/55 mb-5">
        {team.name} · {rollUp.length} member{rollUp.length === 1 ? '' : 's'}
      </p>

      <div
        className="bg-white rounded-xl divide-y divide-navy/5 overflow-hidden"
        style={{ boxShadow: 'inset 0 0 0 0.5px rgba(26,26,46,0.12)' }}
      >
        {rollUp.length === 0 ? (
          <div className="px-4 py-6 text-sm text-navy/60 text-center">
            No reps yet.
          </div>
        ) : (
          rollUp.map((r) => (
            <div key={r.user_id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-klo/15 text-klo flex items-center justify-center text-sm font-bold shrink-0">
                {(r.name || 'M').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-navy truncate">
                  {r.name}
                  {r.role === 'manager' && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-klo font-semibold">
                      Mgr
                    </span>
                  )}
                </p>
                <p className="text-xs text-navy/60 truncate">
                  {r.activeCount} active · {r.redCount} red · {r.overdueCount} overdue
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-navy">
                  {formatCurrency(r.pipelineValue)}
                </p>
                {r.valueAtRisk > 0 && (
                  <p className="text-[11px] text-red-600">
                    {formatCurrency(r.valueAtRisk)} at risk
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <p className="text-[11px] text-navy/45 mt-3">
        Per-rep filters and pipelines come in a future phase. For now, open a deal
        from the <Link to="/deals" className="underline">deals list</Link>.
      </p>
    </div>
  )
}
