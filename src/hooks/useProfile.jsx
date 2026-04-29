// =============================================================================
// useProfile — Phase 4 (Week 8/9)
// =============================================================================
// Loads the public.users row for the signed-in user plus team membership.
// `plan` and `team_id` drive feature gating across the app — manager view,
// Klo team-pipeline chat, Razorpay upgrade buttons. Cached at the provider
// level so every page that needs it doesn't re-query Supabase.
// =============================================================================

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from './useAuth.jsx'

const ProfileContext = createContext(null)

export function ProfileProvider({ children }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [team, setTeam] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setProfile(null)
      setTeam(null)
      setLoading(false)
      return
    }
    let mounted = true
    async function load() {
      setLoading(true)
      const { data: prof } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
      if (!mounted) return
      setProfile(prof)
      // The user is a manager of any team they own.
      const { data: ownedTeam } = await supabase
        .from('teams')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle()
      if (!mounted) return
      setTeam(ownedTeam || null)
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [user])

  async function refresh() {
    if (!user) return
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle()
    setProfile(prof)
    const { data: ownedTeam } = await supabase
      .from('teams')
      .select('*')
      .eq('owner_id', user.id)
      .maybeSingle()
    setTeam(ownedTeam || null)
  }

  const value = useMemo(
    () => ({
      profile,
      team,
      loading,
      isManager: Boolean(team),
      plan: team?.plan || profile?.plan || 'free',
      refresh,
    }),
    [profile, team, loading]
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) {
    // Allow components to call this even when the provider isn't mounted yet
    // (e.g. during a route transition). Returns a benign default.
    return { profile: null, team: null, loading: true, isManager: false, plan: 'free', refresh: () => {} }
  }
  return ctx
}
