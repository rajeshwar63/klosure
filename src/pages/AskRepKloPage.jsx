// Phase 17 — dedicated rep-scoped Ask Klo page. Reachable from the sidebar
// tab next to "Today" and "Deals". Mounts RepKloPanel which scopes
// conversation context to this user's own deals.

import { useAuth } from '../hooks/useAuth.jsx'
import RepKloPanel from '../components/RepKloPanel.jsx'
import { Eyebrow } from '../components/shared/index.js'

export default function AskRepKloPage() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div
        className="p-6 md:p-8 max-w-[960px] mx-auto text-sm"
        style={{ color: 'var(--klo-text-mute)' }}
      >
        Loading…
      </div>
    )
  }
  if (!user) {
    return (
      <div className="p-6 md:p-8 max-w-[960px] mx-auto">
        <Eyebrow>Ask Klo</Eyebrow>
        <h1
          className="mt-3 text-[22px] font-semibold"
          style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
        >
          Sign in to ask Klo about your pipeline.
        </h1>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-[960px] mx-auto">
      <header className="mb-8">
        <Eyebrow>Ask Klo</Eyebrow>
        <h1
          className="mt-3"
          style={{
            fontSize: 'clamp(32px, 4vw, 44px)',
            fontWeight: 600,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            color: 'var(--klo-text)',
          }}
        >
          Ask anything about your pipeline.
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: 'var(--klo-text-dim)' }}>
          Klo reads every active deal you own — no need to open each room.
        </p>
      </header>
      <RepKloPanel />
    </div>
  )
}
