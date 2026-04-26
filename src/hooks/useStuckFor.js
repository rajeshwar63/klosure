// Phase 6.1 step 04 — async hook around computeStuckFor. Returns null while
// loading or when there is no signal; { weeks, since } once resolved.

import { useEffect, useState } from 'react'
import { computeStuckFor } from '../services/dealHealth.js'

export function useStuckFor(dealId, currentConfidence) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!dealId) {
      setData(null)
      return
    }
    let cancelled = false
    setData(null)
    computeStuckFor(dealId, currentConfidence)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
    return () => {
      cancelled = true
    }
  }, [dealId, currentConfidence?.value])

  return data
}
