// Phase 10 — invite acceptance landing page.
// Routes: /join-team/:token
//
// Flow:
//   - Unauthenticated → stash the token in localStorage and bounce to
//     /signup?invite=<token>. AuthPage routes back here once the user is in.
//   - Authenticated → call accept_team_invite(token). On success, refresh the
//     profile (so team_id propagates) and send the user to their seller home.
//   - On email mismatch / revoked / invalid, show a clear error.

import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { acceptInvite } from '../services/team.js'

const PENDING_KEY = 'klo.pendingInviteToken'

export default function JoinTeamPage() {
  const { token } = useParams()
  const { user, loading: authLoading } = useAuth()
  const { refresh } = useProfile()
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'pending', message: '' })

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      try {
        localStorage.setItem(PENDING_KEY, token)
      } catch {
        // localStorage may be unavailable; the URL still carries the token.
      }
      navigate(`/signup?invite=${encodeURIComponent(token)}`, { replace: true })
      return
    }

    let mounted = true
    setState({ status: 'working', message: '' })
    acceptInvite({ token }).then(async (res) => {
      if (!mounted) return
      try {
        localStorage.removeItem(PENDING_KEY)
      } catch {
        // ignore
      }
      if (res?.ok) {
        await refresh?.()
        setState({ status: 'success', message: '' })
        setTimeout(() => navigate('/today', { replace: true }), 800)
      } else {
        setState({ status: 'error', message: errorCopy(res?.error) })
      }
    })
    return () => {
      mounted = false
    }
  }, [authLoading, user, token, navigate, refresh])

  if (!token) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy to-[#0f0f1f] text-white flex flex-col">
      <header className="px-5 py-4 max-w-5xl w-full mx-auto">
        <span className="font-bold text-xl tracking-tight">
          klosure<span className="text-klo">.ai</span>
        </span>
      </header>
      <main className="flex-1 flex items-center justify-center px-5 pb-10">
        <div className="w-full max-w-md bg-white text-navy rounded-2xl p-6 shadow-xl text-center">
          {state.status === 'working' || state.status === 'pending' ? (
            <>
              <h1 className="text-2xl font-bold mb-2">Joining your team…</h1>
              <p className="text-navy/60 text-sm">Hang tight, this only takes a moment.</p>
            </>
          ) : state.status === 'success' ? (
            <>
              <h1 className="text-2xl font-bold mb-2">You're in.</h1>
              <p className="text-navy/60 text-sm">
                Taking you to your home view…
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-2">We couldn't join the team.</h1>
              <p className="text-navy/70 text-sm mb-4">{state.message}</p>
              <button
                type="button"
                onClick={() => navigate('/today', { replace: true })}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-klo text-white"
              >
                Continue to Klosure
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function errorCopy(code) {
  switch (code) {
    case 'email_mismatch':
      return "This invite was sent to a different email. Sign in with the address that received the invite, or ask your manager to re-send it."
    case 'revoked':
      return 'This invite has been revoked. Ask your manager to send a new one.'
    case 'invalid':
      return "This invite link isn't valid. Ask your manager to send a new one."
    case 'not_authenticated':
      return 'You need to be signed in to accept this invite.'
    default:
      return code || 'Something went wrong accepting this invite.'
  }
}
