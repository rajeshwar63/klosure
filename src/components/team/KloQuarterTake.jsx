// Phase 5: top-of-forecast quarter framing. Calls klo-manager with
// mode='quarter_take' on mount to get a Klo-narrated 3-5 sentence read of
// the team's pipeline; the commit/stretch numbers below come from the local
// bucket math. Cached client-side per teamId for the session.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { formatCurrency } from '../../lib/format.js'

const cache = new Map()

export default function KloQuarterTake({ teamId, commit, stretch, dealCount }) {
  const [take, setTake] = useState(() => cache.get(teamId)?.take ?? null)
  const [loading, setLoading] = useState(!cache.has(teamId))
  const [errored, setErrored] = useState(false)
  const requested = useRef(false)

  useEffect(() => {
    if (!teamId) return
    if (cache.has(teamId)) {
      setTake(cache.get(teamId).take)
      setLoading(false)
      return
    }
    if (requested.current) return
    requested.current = true

    let cancelled = false
    async function load() {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token
        const baseUrl = import.meta.env.VITE_SUPABASE_URL
        if (!token || !baseUrl) throw new Error('not configured')
        const res = await fetch(`${baseUrl}/functions/v1/klo-manager`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mode: 'quarter_take', team_id: teamId }),
        })
        if (!res.ok) throw new Error(`quarter take failed (${res.status})`)
        const json = await res.json()
        if (cancelled) return
        cache.set(teamId, { take: json.take ?? '' })
        setTake(json.take ?? '')
      } catch (err) {
        if (!cancelled) {
          console.warn('quarter take load failed', err)
          setErrored(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [teamId])

  return (
    <div className="bg-klo-bg border border-klo/20 rounded-xl px-4 py-3 mb-4">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-klo mb-2">
        ◆ Klo · this quarter
      </p>
      {loading ? (
        <div className="space-y-1.5 mb-3">
          <div className="h-3 w-full bg-klo/10 rounded animate-pulse" />
          <div className="h-3 w-5/6 bg-klo/10 rounded animate-pulse" />
          <div className="h-3 w-3/4 bg-klo/10 rounded animate-pulse" />
        </div>
      ) : errored ? null : (
        take && (
          <p className="text-[14px] leading-relaxed text-navy mb-3 whitespace-pre-line">
            {take}
          </p>
        )
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Number label="Realistic commit" value={commit} tone="text-emerald-700" />
        <Number label="Stretch" value={stretch} tone="text-navy" />
      </div>
      <p className="text-[11px] text-navy/50 mt-2">
        Weighted by Klo's read of each deal — not a calibrated forecast.
        {dealCount > 0 && ` Across ${dealCount} active ${dealCount === 1 ? 'deal' : 'deals'}.`}
      </p>
    </div>
  )
}

function Number({ label, value, tone }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-navy/50">
        {label}
      </p>
      <p className={`text-xl font-semibold leading-tight ${tone}`}>
        {formatCurrency(value)}
      </p>
    </div>
  )
}
