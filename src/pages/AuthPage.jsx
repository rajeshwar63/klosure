import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { hasSupabaseConfig } from '../lib/supabase.js'

const PENDING_INVITE_KEY = 'klo.pendingInviteToken'

function readPendingInvite(searchParams) {
  const fromUrl = searchParams.get('invite')
  if (fromUrl) return fromUrl
  try {
    return localStorage.getItem(PENDING_INVITE_KEY) || ''
  } catch {
    return ''
  }
}

export default function AuthPage({ mode = 'login' }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { signIn, signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isSignup = mode === 'signup'
  const inviteToken = readPendingInvite(searchParams)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setSubmitting(true)
    try {
      if (isSignup) {
        const { data, error } = await signUp({ email, password, name })
        if (error) throw error
        if (data?.session) {
          navigate(postAuthDestination(inviteToken, '/onboarding'), { replace: true })
        } else {
          setInfo('Check your email to confirm your account, then log in.')
        }
      } else {
        const { error } = await signIn({ email, password })
        if (error) throw error
        navigate(postAuthDestination(inviteToken, '/deals'), { replace: true })
      }
    } catch (err) {
      setError(err?.message ?? 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy to-[#0f0f1f] text-white flex flex-col">
      <header className="px-5 py-4 max-w-5xl w-full mx-auto">
        <Link to="/" className="inline-flex flex-col leading-tight">
          <span className="font-bold text-xl tracking-tight">
            klosure<span className="text-klo">.ai</span>
          </span>
          <span className="text-[11px] text-white/55 tracking-wide mt-0.5">
            Stop guessing. Start closing.
          </span>
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-5 pb-10">
        <div className="w-full max-w-sm bg-white text-navy rounded-2xl p-6 shadow-xl">
          <h1 className="text-2xl font-bold mb-1">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="text-navy/60 text-sm mb-6">
            {isSignup ? 'Start running deals with Klo.' : 'Log in to your deal rooms.'}
          </p>

          {inviteToken && (
            <div className="mb-4 text-xs p-3 rounded-lg bg-klo/10 border border-klo/30 text-navy">
              You're joining a team on Klosure. {isSignup ? 'Sign up' : 'Log in'} with the email that received the invite.
            </div>
          )}

          {!hasSupabaseConfig && (
            <div className="mb-4 text-xs p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
              Supabase isn't configured. Add your URL and anon key to <code>.env.local</code>.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {isSignup && (
              <Field
                label="Your name"
                type="text"
                value={name}
                onChange={setName}
                required
                autoComplete="name"
                placeholder="Raja"
              />
            )}
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              required
              autoComplete="email"
              placeholder="you@company.com"
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              required
              minLength={8}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                {error}
              </div>
            )}
            {info && (
              <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-klo hover:bg-klo/90 disabled:opacity-50 text-white font-semibold py-3 rounded-xl"
            >
              {submitting ? 'Working…' : isSignup ? 'Create account' : 'Log in'}
            </button>
          </form>

          <p className="text-sm text-navy/60 mt-5 text-center">
            {isSignup ? (
              <>
                Already have an account?{' '}
                <Link to="/login" className="text-klo font-medium">
                  Log in
                </Link>
              </>
            ) : (
              <>
                New to Klosure?{' '}
                <Link to="/signup" className="text-klo font-medium">
                  Create account
                </Link>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  )
}

function postAuthDestination(inviteToken, fallback) {
  if (!inviteToken) return fallback
  try {
    localStorage.removeItem(PENDING_INVITE_KEY)
  } catch {
    // ignore
  }
  return `/join-team/${inviteToken}`
}

function Field({ label, value, onChange, ...props }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-navy/70 mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-navy/15 rounded-lg px-3 py-2.5 focus:outline-none focus:border-klo focus:ring-2 focus:ring-klo/20"
        {...props}
      />
    </label>
  )
}
