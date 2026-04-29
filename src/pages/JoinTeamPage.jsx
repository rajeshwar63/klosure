// Phase 11 — invite acceptance with preview.
// Routes: /join-team/:token
//
// New flow:
//   1. Always fetch invite preview first (works anonymously via
//      get_invite_preview RPC). Shows team name + inviter name + invitee email.
//   2. If unauthenticated → "Accept & create account" / "Log in" / "Decline".
//      Stash token, route to /signup or /login. AuthPage routes back here.
//   3. If authenticated → "Accept invite" / "Decline". On Accept we call
//      accept_team_invite(token).
//   4. Auto-claim trigger is still in the DB as belt-and-braces — if a brand-
//      new user signs up with a matching email, they're attached even before
//      this page finishes loading. In that case the accept call returns
//      `{ok: true, already: true}` and we route to /today.

import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { acceptInvite, getInvitePreview } from '../services/team.js'

const PENDING_KEY = 'klo.pendingInviteToken'

export default function JoinTeamPage() {
  const { token } = useParams()
  const { user, loading: authLoading } = useAuth()
  const { refresh } = useProfile()
  const navigate = useNavigate()

  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState('')
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    if (!token) return
    let mounted = true
    getInvitePreview({ token }).then((res) => {
      if (!mounted) return
      if (res?.ok) {
        setPreview(res)
      } else {
        setPreviewError(errorCopy(res?.error))
      }
    })
    return () => {
      mounted = false
    }
  }, [token])

  if (!token) return <Navigate to="/" replace />

  function stashToken() {
    try {
      localStorage.setItem(PENDING_KEY, token)
    } catch {
      // localStorage may be unavailable; the URL still carries the token.
    }
  }

  function handleSignup() {
    stashToken()
    navigate(`/signup?invite=${encodeURIComponent(token)}`)
  }

  function handleLogin() {
    stashToken()
    navigate(`/login?invite=${encodeURIComponent(token)}`)
  }

  function handleDecline() {
    try {
      localStorage.removeItem(PENDING_KEY)
    } catch {
      // ignore
    }
    navigate('/', { replace: true })
  }

  async function handleAccept() {
    if (accepting) return
    setAcceptError('')
    setAccepting(true)
    const res = await acceptInvite({ token })
    setAccepting(false)
    try {
      localStorage.removeItem(PENDING_KEY)
    } catch {
      // ignore
    }
    if (res?.ok) {
      await refresh?.()
      setAccepted(true)
      setTimeout(() => navigate('/today', { replace: true }), 1000)
    } else {
      setAcceptError(errorCopy(res?.error))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy to-[#0f0f1f] text-white flex flex-col">
      <header className="px-5 py-4 max-w-5xl w-full mx-auto">
        <span className="font-bold text-xl tracking-tight">
          klosure<span className="text-klo">.ai</span>
        </span>
      </header>
      <main className="flex-1 flex items-center justify-center px-5 pb-10">
        <div className="w-full max-w-md bg-white text-navy rounded-2xl p-6 shadow-xl">
          {previewError ? (
            <ErrorState message={previewError} onContinue={handleDecline} />
          ) : !preview ? (
            <LoadingState />
          ) : accepted ? (
            <SuccessState teamName={preview.team_name} />
          ) : authLoading ? (
            <LoadingState />
          ) : !user ? (
            <UnauthedPreview
              preview={preview}
              onSignup={handleSignup}
              onLogin={handleLogin}
              onDecline={handleDecline}
            />
          ) : (
            <AuthedPreview
              preview={preview}
              userEmail={user.email}
              accepting={accepting}
              error={acceptError}
              onAccept={handleAccept}
              onDecline={handleDecline}
            />
          )}
        </div>
      </main>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="text-center py-2">
      <h1 className="text-2xl font-bold mb-2">Loading invite…</h1>
      <p className="text-navy/60 text-sm">Hang tight, this only takes a moment.</p>
    </div>
  )
}

function SuccessState({ teamName }) {
  return (
    <div className="text-center py-2">
      <h1 className="text-2xl font-bold mb-2">You're in.</h1>
      <p className="text-navy/60 text-sm">
        {teamName ? `Welcome to ${teamName}. ` : ''}
        Taking you to your home view…
      </p>
    </div>
  )
}

function ErrorState({ message, onContinue }) {
  return (
    <div className="text-center py-2">
      <h1 className="text-2xl font-bold mb-2">We couldn't load this invite.</h1>
      <p className="text-navy/70 text-sm mb-4">{message}</p>
      <button
        type="button"
        onClick={onContinue}
        className="px-4 py-2 rounded-lg text-sm font-medium bg-klo text-white"
      >
        Continue
      </button>
    </div>
  )
}

function PreviewHeader({ preview }) {
  return (
    <>
      <p className="text-klo text-xs font-semibold uppercase tracking-wide mb-2">
        Team invite
      </p>
      <h1 className="text-2xl font-bold mb-3 leading-tight">
        Join <span className="text-klo">{preview.team_name || 'a Klosure team'}</span> on Klosure
      </h1>
      <div className="text-sm text-navy/70 space-y-1.5 mb-5">
        <p>
          <span className="font-medium text-navy">{preview.inviter_name}</span> invited{' '}
          <span className="font-medium text-navy">{preview.invitee_email}</span> to join
          their team.
        </p>
        <p className="text-navy/55 text-[13px]">
          You'll join as a seller. Your deals stay yours; your manager will see your
          pipeline at a glance to coach where it counts.
        </p>
      </div>
    </>
  )
}

function UnauthedPreview({ preview, onSignup, onLogin, onDecline }) {
  return (
    <>
      <PreviewHeader preview={preview} />
      <p className="text-[13px] text-navy/60 mb-3">
        Sign in to accept. Use the email this invite was sent to:{' '}
        <span className="font-medium text-navy">{preview.invitee_email}</span>
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onSignup}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-klo text-white"
        >
          Accept & create account
        </button>
        <button
          type="button"
          onClick={onLogin}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-medium border border-navy/15 text-navy"
        >
          Already have an account? Log in
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="w-full px-4 py-2 rounded-lg text-sm text-navy/60"
        >
          Decline
        </button>
      </div>
    </>
  )
}

function AuthedPreview({ preview, userEmail, accepting, error, onAccept, onDecline }) {
  const emailMismatch =
    userEmail && preview.invitee_email &&
    userEmail.toLowerCase() !== preview.invitee_email.toLowerCase()

  return (
    <>
      <PreviewHeader preview={preview} />
      {emailMismatch && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[13px]">
          You're signed in as <span className="font-medium">{userEmail}</span>, but this
          invite was sent to <span className="font-medium">{preview.invitee_email}</span>.
          Sign in with that email instead, or ask your manager to re-send the invite.
        </div>
      )}
      {error && (
        <p className="mb-3 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={accepting || emailMismatch}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-klo text-white disabled:opacity-50"
        >
          {accepting ? 'Joining team…' : 'Accept invite'}
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={accepting}
          className="w-full px-4 py-2 rounded-lg text-sm text-navy/60 disabled:opacity-50"
        >
          Decline
        </button>
      </div>
    </>
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
      return code || 'Something went wrong with this invite.'
  }
}
