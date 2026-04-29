import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    loading,
    signUp: async ({ email, password, name }) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } }
      })
      return { data, error }
    },
    signIn: async ({ email, password }) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      return { data, error }
    },
    signOut: async ({ allDevices = false } = {}) => {
      if (allDevices) {
        // Best-effort: invalidate other sessions first, then end this one.
        try {
          await supabase.auth.signOut({ scope: 'others' })
        } catch {
          // 'others' scope may be unsupported on older Supabase clients; fall through.
        }
      }
      await supabase.auth.signOut()
    },
    changePassword: async ({ newPassword }) => {
      const { data, error } = await supabase.auth.updateUser({ password: newPassword })
      return { data, error }
    },
    signOutOthers: async () => {
      try {
        const { error } = await supabase.auth.signOut({ scope: 'others' })
        return { supported: true, error }
      } catch (error) {
        return { supported: false, error }
      }
    }
  }), [session, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
