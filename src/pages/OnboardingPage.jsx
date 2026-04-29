import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { supabase } from '../lib/supabase.js'

// Two-path onboarding called out in the Phase 4 §10 deliverable:
//   - "Use Klo solo" → straight into the new-deal flow, no buyer required.
//   - "Invite my buyer" → same flow but the seller knows the share screen
//     opens after the deal is created.
// We mark users.onboarded_at on either choice so we never re-show this page
// to a returning seller.
export default function OnboardingPage() {
  const { user } = useAuth()
  const { profile, refresh, loading } = useProfile()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    if (loading) return
    if (profile?.onboarded_at) {
      navigate('/deals', { replace: true })
    }
  }, [profile, loading, navigate])

  async function chooseSolo() {
    setBusy('solo')
    await markOnboarded()
    navigate('/deals/new')
  }

  async function chooseInvite() {
    setBusy('invite')
    await markOnboarded()
    // We hand the new-deal page a query flag so it auto-opens the Share
    // modal as soon as the deal exists.
    navigate('/deals/new?share=1')
  }

  async function chooseTeam() {
    setBusy('team')
    await markOnboarded()
    navigate('/team')
  }

  async function markOnboarded() {
    if (!user) return
    try {
      await supabase
        .from('users')
        .update({ onboarded_at: new Date().toISOString() })
        .eq('id', user.id)
    } catch (err) {
      console.warn('[onboarding] mark', err)
    }
    await refresh?.()
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy to-[#0f0f1f] text-white flex flex-col">
      <header className="px-5 py-4 max-w-5xl w-full mx-auto flex justify-between items-center">
        <span className="inline-flex flex-col leading-tight">
          <span className="font-bold text-xl tracking-tight">
            klosure<span className="text-klo">.ai</span>
          </span>
          <span className="text-[11px] text-white/55 tracking-wide mt-0.5">
            Stop guessing. Start closing.
          </span>
        </span>
        <button
          onClick={async () => {
            await markOnboarded()
            navigate('/deals')
          }}
          className="text-xs text-white/60 hover:text-white"
        >
          Skip
        </button>
      </header>
      <main className="flex-1 flex items-center justify-center px-5 pb-10">
        <div className="w-full max-w-2xl">
          <p className="text-klo text-sm font-medium tracking-wide uppercase mb-2 text-center">
            Welcome to Klosure
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight text-center">
            How do you want to start?
          </h1>
          <p className="mt-3 text-white/70 text-center">
            Klo coaches both sides of a deal. You can start solo or pull your buyer in from day one.
          </p>

          <div className="mt-8 grid sm:grid-cols-2 gap-3">
            <PathCard
              title="Use Klo solo"
              body="Create a deal room just for you. Klo reads your context and tells you the next move. No buyer needed."
              cta={busy === 'solo' ? 'Loading…' : 'Start solo'}
              accent
              onClick={chooseSolo}
              disabled={busy !== null}
            />
            <PathCard
              title="Invite my buyer"
              body="Same room, but Klo coaches both sides once your buyer joins. Send a link — no signup, no app."
              cta={busy === 'invite' ? 'Loading…' : 'Invite a buyer'}
              onClick={chooseInvite}
              disabled={busy !== null}
            />
          </div>

          <div className="mt-4 text-center text-sm text-white/60">
            Managing a sales team?{' '}
            <button onClick={chooseTeam} className="text-klo hover:underline">
              Set up the manager view
            </button>
          </div>

          <div className="mt-12 text-center">
            <Link to="/deals" className="text-sm text-white/50 hover:text-white">
              I'll explore on my own →
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

function PathCard({ title, body, cta, onClick, disabled, accent = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left p-5 rounded-2xl border transition group disabled:opacity-50 ${
        accent
          ? 'bg-klo/15 border-klo hover:bg-klo/20'
          : 'bg-white/5 border-white/10 hover:bg-white/10'
      }`}
    >
      <h3 className="font-semibold text-white text-lg">{title}</h3>
      <p className="text-sm text-white/70 mt-2 leading-relaxed">{body}</p>
      <span
        className={`inline-block mt-4 text-sm font-semibold ${
          accent ? 'text-white' : 'text-klo'
        }`}
      >
        {cta} →
      </span>
    </button>
  )
}
