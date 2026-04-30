// Phase 11 — self-service team creation surface on the Billing page.
// Hidden for users who already own a team, or who have already been added
// to someone else's team as a rep — letting an invited member create their
// own team would silently detach them from their manager (and from the paid
// team plan they're seated under).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../../hooks/useProfile.jsx'
import { createTeamForCurrentUser } from '../../services/team.js'

export default function CreateTeamSection() {
  const { profile, team, refresh } = useProfile()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (team) return null
  if (profile?.team_id) return null

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Give your team a name.')
      return
    }
    setBusy(true)
    const res = await createTeamForCurrentUser({ teamName: name })
    setBusy(false)
    if (!res.ok) {
      setError(res.error || 'Could not create team.')
      return
    }
    await refresh?.()
    navigate('/team', { replace: true })
  }

  return (
    <section
      className="rounded-2xl p-5 mt-8"
      style={{
        background: 'var(--klo-bg-elev)',
        border: '1px solid var(--klo-line)',
      }}
    >
      <p
        className="kl-mono text-[11px] uppercase mb-2"
        style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.05em' }}
      >
        Run a team
      </p>
      <h2
        className="text-[18px] font-semibold"
        style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
      >
        Create a team and invite your reps
      </h2>
      <p className="mt-1.5 text-[14px]" style={{ color: 'var(--klo-text-dim)' }}>
        You'll become the manager. Reps you invite get their own coaching;
        their pipeline rolls up to you so you can coach where it counts.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--klo-accent)', color: 'white' }}
        >
          Create a team
        </button>
      ) : (
        <form onSubmit={handleCreate} className="mt-4 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Klosure Gulf, Acme Sales"
            maxLength={60}
            autoFocus
            className="flex-1 px-3 py-2 rounded-lg text-sm"
            style={{
              background: 'var(--klo-bg)',
              border: '1px solid var(--klo-line-strong)',
              color: 'var(--klo-text)',
            }}
          />
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--klo-accent)', color: 'white' }}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setError('')
            }}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ color: 'var(--klo-text-dim)' }}
          >
            Cancel
          </button>
        </form>
      )}
      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--klo-danger)' }}>
          {error}
        </p>
      )}
    </section>
  )
}
