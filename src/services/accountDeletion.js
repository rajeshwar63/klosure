import { supabase } from '../lib/supabase.js'

export async function requestAccountDeletion() {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('not signed in')

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  if (!baseUrl) throw new Error('VITE_SUPABASE_URL not configured')

  const res = await fetch(`${baseUrl}/functions/v1/account-delete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Account deletion failed (${res.status})`)
  }
  return res.json()
}
