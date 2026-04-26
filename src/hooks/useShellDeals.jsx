// Phase 6 — single source of deals for the shell sidebar.
//
// Loads the seller's active deals once per auth session and shares them across
// every shell-wrapped page. Keeps the sidebar deal list consistent with the
// dashboard while avoiding a re-fetch on every route change.
//
// Managers also have their own deals (most managers also sell), so this is
// always the seller-side query. The manager-only views read team-wide data
// separately on the pages that need it.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { loadSellerDashboard } from '../services/dashboard.js'

const ShellDealsContext = createContext(null)

export function ShellDealsProvider({ children }) {
  const { user } = useAuth()
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!user) {
      setDeals([])
      setLoading(false)
      return
    }
    setLoading(true)
    const res = await loadSellerDashboard(user.id)
    if (res?.error) {
      setError(res.error)
      setDeals([])
    } else {
      setError('')
      setDeals(res.deals?.active ?? [])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    let mounted = true
    if (!user) {
      setDeals([])
      setLoading(false)
      return () => {
        mounted = false
      }
    }
    setLoading(true)
    loadSellerDashboard(user.id).then((res) => {
      if (!mounted) return
      if (res?.error) {
        setError(res.error)
        setDeals([])
      } else {
        setError('')
        setDeals(res.deals?.active ?? [])
      }
      setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [user])

  const value = useMemo(
    () => ({ deals, loading, error, reload }),
    [deals, loading, error, reload],
  )

  return (
    <ShellDealsContext.Provider value={value}>
      {children}
    </ShellDealsContext.Provider>
  )
}

export function useShellDeals() {
  const ctx = useContext(ShellDealsContext)
  if (!ctx) return { deals: [], loading: false, error: '', reload: () => {} }
  return ctx
}
