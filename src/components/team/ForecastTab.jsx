// Phase 5: manager forecast tab. Loads team deals via getTeamForecast,
// buckets them by Klo's confidence, computes the by-rep rollup, and renders
// the quarter framing on top.

import { useEffect, useState } from 'react'
import {
  getTeamForecast,
  bucketDeals,
  computeQuarterCommit,
  computeQuarterStretch,
  rollupByRep,
} from '../../services/teamForecast.js'
import KloQuarterTake from './KloQuarterTake.jsx'
import ConfidenceBuckets from './ConfidenceBuckets.jsx'
import ByRepRollup from './ByRepRollup.jsx'

export default function ForecastTab({ teamId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!teamId) return
    let mounted = true
    setLoading(true)
    getTeamForecast(teamId).then((res) => {
      if (!mounted) return
      if (res?.error) setError(res.error)
      else setData(res)
      setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [teamId])

  if (loading) {
    return <div className="text-navy/50 text-sm py-10 text-center">Loading forecast…</div>
  }
  if (error) {
    return (
      <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
        {error}
      </div>
    )
  }
  if (!data || !data.deals || data.deals.length === 0) {
    return (
      <div className="bg-white border border-navy/10 rounded-2xl p-8 text-center">
        <p className="text-navy/70 text-sm">
          No active deals in this team yet. Forecasts will appear once your reps create deals.
        </p>
      </div>
    )
  }

  const buckets = bucketDeals(data.deals)
  const reps = rollupByRep(data.deals, data.members ?? [])
  const commit = computeQuarterCommit(buckets)
  const stretch = computeQuarterStretch(buckets)

  return (
    <>
      <KloQuarterTake
        teamId={teamId}
        commit={commit}
        stretch={stretch}
        dealCount={data.deals.length}
      />
      <ConfidenceBuckets buckets={buckets} />
      <ByRepRollup reps={reps} />
    </>
  )
}
