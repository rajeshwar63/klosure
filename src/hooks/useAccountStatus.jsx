// =============================================================================
// useAccountStatus — Phase 12.1
// =============================================================================
// Wraps the get_my_account_status RPC. Use this hook anywhere you need to
// know "can this user do X?" or display tier/trial info. Cached at provider
// level so /today, /deals, /billing all share one fetch.
// =============================================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from './useAuth.jsx'
import { PLANS } from '../lib/plans.ts'

const AccountStatusContext = createContext(null)

const READ_ONLY_STATUSES = new Set([
  'trial_expired_readonly',
  'cancelled_readonly',
  'pending_deletion',
])

const ACTIVE_STATUSES = new Set([
  'trial_active',
  'paid_active',
  'paid_grace',
  'overridden',
])

export function AccountStatusProvider({ children }) {
  const { user } = useAuth()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) {
      setStatus(null)
      setLoading(false)
      return
    }
    const { data, error } = await supabase.rpc('get_my_account_status')
    if (error) {
      console.warn('[useAccountStatus] failed', error.message)
      setStatus(null)
    } else {
      setStatus(data)
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  const value = useMemo(() => {
    const planSlug = status?.plan || 'trial'
    const planDef = PLANS[planSlug] ?? PLANS.trial
    const features = planDef.features
    return {
      status,
      planSlug,
      planDef,
      features,
      loading,
      refresh,
      isReadOnly: status ? READ_ONLY_STATUSES.has(status.status) : false,
      isActive: status ? ACTIVE_STATUSES.has(status.status) : false,
      isTrialing: status?.status === 'trial_active',
      daysLeftInTrial: status?.days_until_trial_end ?? null,
      seatsAvailable: status
        ? Math.max(0, (status.seat_cap ?? 0) - (status.seats_used ?? 0))
        : 0,
      // Add-on seat breakdown. seat_cap is base + extras; surface both so the
      // UI can render "5 base + 3 extras = 8 seats".
      baseSeatCap: status?.base_seat_cap ?? status?.seat_cap ?? 0,
      extraSeats: status?.extra_seats ?? 0,
      can(featureKey) {
        if (!status) return false
        if (READ_ONLY_STATUSES.has(status.status)) {
          // In read-only, only the realtime_buyer_link feature is honored
          // (the buyer didn't sign up for this — their link must keep working).
          return featureKey === 'realtime_buyer_link'
        }
        return features[featureKey] === true
      },
    }
  }, [status, loading, refresh])

  return <AccountStatusContext.Provider value={value}>{children}</AccountStatusContext.Provider>
}

export function useAccountStatus() {
  const ctx = useContext(AccountStatusContext)
  if (!ctx) {
    return {
      status: null,
      planSlug: 'trial',
      planDef: PLANS.trial,
      features: PLANS.trial.features,
      loading: true,
      refresh: () => {},
      isReadOnly: false,
      isActive: false,
      isTrialing: false,
      daysLeftInTrial: null,
      seatsAvailable: 0,
      baseSeatCap: 0,
      extraSeats: 0,
      can: () => false,
    }
  }
  return ctx
}
