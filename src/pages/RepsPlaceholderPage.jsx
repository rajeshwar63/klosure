// Phase 6 step 03 — per-rep view + Phase 10 team invites surface.
// The "by rep" rollup already exists in loadTeamPipeline; we render the
// hairline grid of seller cards plus an invite form and pending-invite list
// so a manager can grow the team without leaving the page.
//
// Per §5.4: design is "your team's deal coach" — a hairline grid of
// seller cards, mono-numbered counts, no leaderboard ranking.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { useAccountStatus } from '../hooks/useAccountStatus.jsx'
import {
  buildInviteLink,
  inviteMember,
  loadTeamPipeline,
  removeMember,
  revokeInvite,
} from '../services/team.js'
import { formatCurrency } from '../lib/format.js'
import {
  Eyebrow,
  HairlineGrid,
  MonoKicker,
  MonoTimestamp,
} from '../components/shared/index.js'

export default function RepsPlaceholderPage() {
  const { user } = useAuth()
  const { team, loading: profileLoading } = useProfile()
  const { refresh: refreshStatus } = useAccountStatus()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profileLoading || !team) {
      setLoading(false)
      return
    }
    let mounted = true
    loadTeamPipeline({ teamId: team.id }).then((res) => {
      if (!mounted) return
      setData(res)
      setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [team, profileLoading])

  async function refresh() {
    if (!team) return
    const res = await loadTeamPipeline({ teamId: team.id })
    setData(res)
  }

  // Use after a mutation that also changes seat usage (remove / accept) so
  // the seat counter chip in InvitePanel updates without a page reload.
  async function refreshAll() {
    await Promise.all([refresh(), refreshStatus?.()])
  }

  if (profileLoading || loading) {
    return (
      <div
        className="p-6 md:p-8 max-w-[960px] mx-auto text-sm"
        style={{ color: 'var(--klo-text-mute)' }}
      >
        Loading reps…
      </div>
    )
  }
  if (!team) {
    return (
      <div className="p-6 md:p-8 max-w-[960px] mx-auto">
        <Eyebrow>Team</Eyebrow>
        <h1
          className="mt-3 text-[22px] font-semibold"
          style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
        >
          No team linked to your account.
        </h1>
      </div>
    )
  }

  const rollUp = data?.rollUp ?? []
  const invites = data?.invites ?? []

  return (
    <div className="p-6 md:p-8 max-w-[960px] mx-auto">
      <header className="mb-8">
        <Eyebrow>Team · {rollUp.length} rep{rollUp.length === 1 ? '' : 's'}</Eyebrow>
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
          Your team's deal coach.
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: 'var(--klo-text-dim)' }}>
          {team.name}
        </p>
      </header>

      <InvitePanel
        teamId={team.id}
        invitedBy={user?.id}
        onInvited={refresh}
      />

      {rollUp.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center mt-6"
          style={{
            background: 'var(--klo-bg-elev)',
            border: '1px solid var(--klo-line)',
          }}
        >
          <p className="text-[15px]" style={{ color: 'var(--klo-text-dim)' }}>
            No reps yet. Invite a teammate above to fill the team.
          </p>
        </div>
      ) : (
        <HairlineGrid cols={2}>
          {rollUp.map((r, idx) => (
            <RepCell
              key={r.user_id}
              index={String(idx + 1).padStart(2, '0')}
              rep={r}
              teamOwnerId={team.owner_id}
              onRemoved={refreshAll}
            />
          ))}
        </HairlineGrid>
      )}

      {invites.length > 0 && (
        <PendingInvitesList invites={invites} onChange={refresh} />
      )}

      <p className="kl-mono uppercase mt-5 text-[11px]" style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.05em' }}>
        Tap “View deals” on any rep, or open the full{' '}
        <Link to="/team/deals" className="underline" style={{ color: 'var(--klo-accent)' }}>
          team deals
        </Link>{' '}
        list.
      </p>
    </div>
  )
}

function InvitePanel({ teamId, invitedBy, onInvited }) {
  const { status, planDef, seatsAvailable } = useAccountStatus()
  const seatsUsed = status?.seats_used ?? 0
  const seatCap = status?.seat_cap ?? 1
  const atCapacity = seatsAvailable === 0

  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lastInvite, setLastInvite] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim()) return
    setBusy(true)
    const res = await inviteMember({ teamId, email, invitedBy })
    setBusy(false)
    if (!res.ok) {
      setError(res.error || 'Could not send invite.')
      return
    }
    setLastInvite(res.invite)
    setEmail('')
    onInvited?.()
  }

  return (
    <section
      className="rounded-2xl p-5 mb-6"
      style={{ background: 'var(--klo-bg-elev)', border: '1px solid var(--klo-line)' }}
    >
      <div className="text-[13px] mb-3" style={{ color: 'var(--klo-text-dim)' }}>
        Seats:{' '}
        <span style={{ color: 'var(--klo-text)' }}>
          {seatsUsed} of {seatCap}
        </span>{' '}
        used on {planDef.label}
        {atCapacity && (
          <>
            {' '}
            ·{' '}
            <Link to="/billing" style={{ color: 'var(--klo-danger)' }}>
              Upgrade to add more
            </Link>
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <MonoKicker>Grow the team</MonoKicker>
          <p className="mt-1 text-[15px] font-medium" style={{ color: 'var(--klo-text)' }}>
            Invite a teammate
          </p>
          <p className="text-[13px]" style={{ color: 'var(--klo-text-dim)' }}>
            They join as a rep. Their deals roll up here automatically.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={atCapacity}
            title={atCapacity ? 'Seat cap reached — upgrade to add more.' : undefined}
            className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--klo-accent)', color: 'white' }}
          >
            Invite teammate
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@company.com"
            className="flex-1 px-3 py-2 rounded-lg text-sm"
            style={{
              background: 'var(--klo-bg)',
              border: '1px solid var(--klo-line-strong)',
              color: 'var(--klo-text)',
            }}
          />
          <button
            type="submit"
            disabled={busy || atCapacity}
            title={atCapacity ? 'Seat cap reached — upgrade to add more.' : undefined}
            className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--klo-accent)', color: 'white' }}
          >
            {busy ? 'Sending…' : 'Send invite'}
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

      {lastInvite && (
        <InviteLinkChip
          invite={lastInvite}
          onDismiss={() => setLastInvite(null)}
        />
      )}
    </section>
  )
}

function InviteLinkChip({ invite, onDismiss }) {
  const link = buildInviteLink(invite.token)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard may be blocked; the link is visible in the UI as a fallback.
    }
  }

  return (
    <div
      className="mt-4 p-3 rounded-lg flex flex-col sm:flex-row gap-2 sm:items-center"
      style={{ background: 'var(--klo-bg)', border: '1px dashed var(--klo-line-strong)' }}
    >
      <div className="flex-1 min-w-0">
        <MonoKicker>Invite ready · {invite.email}</MonoKicker>
        <p
          className="mt-1 text-[12px] truncate kl-mono"
          style={{ color: 'var(--klo-text-dim)' }}
          title={link}
        >
          {link}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="px-3 py-1.5 rounded-md text-xs font-medium"
          style={{ background: 'var(--klo-accent)', color: 'white' }}
        >
          {copied ? 'Copied!' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs"
          style={{ color: 'var(--klo-text-mute)' }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

function PendingInvitesList({ invites, onChange }) {
  return (
    <section className="mt-8">
      <MonoKicker>Pending invites · {invites.length}</MonoKicker>
      <div
        className="mt-3 rounded-2xl overflow-hidden"
        style={{ border: '1px solid var(--klo-line)' }}
      >
        {invites.map((inv, idx) => (
          <PendingInviteRow
            key={inv.id}
            invite={inv}
            isLast={idx === invites.length - 1}
            onChange={onChange}
          />
        ))}
      </div>
    </section>
  )
}

function PendingInviteRow({ invite, isLast, onChange }) {
  const link = buildInviteLink(invite.token)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  async function revoke() {
    if (!window.confirm(`Revoke invite for ${invite.email}?`)) return
    setBusy(true)
    await revokeInvite({ inviteId: invite.id })
    setBusy(false)
    onChange?.()
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{
        background: 'var(--klo-bg-elev)',
        borderBottom: isLast ? 'none' : '1px solid var(--klo-line)',
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium truncate" style={{ color: 'var(--klo-text)' }}>
          {invite.email}
        </p>
        <MonoTimestamp className="block">
          Sent {new Date(invite.created_at).toLocaleDateString()}
        </MonoTimestamp>
      </div>
      <button
        type="button"
        onClick={copy}
        className="px-2.5 py-1.5 rounded-md text-xs font-medium"
        style={{ background: 'var(--klo-bg)', border: '1px solid var(--klo-line-strong)', color: 'var(--klo-text)' }}
      >
        {copied ? 'Copied!' : 'Copy link'}
      </button>
      <button
        type="button"
        onClick={revoke}
        disabled={busy}
        className="px-2.5 py-1.5 rounded-md text-xs font-medium disabled:opacity-50"
        style={{ color: 'var(--klo-danger)' }}
      >
        {busy ? '…' : 'Revoke'}
      </button>
    </div>
  )
}

function RepCell({ index, rep, teamOwnerId, onRemoved }) {
  const initial = (rep.name || 'M').charAt(0).toUpperCase()
  const canRemove = Boolean(teamOwnerId) && rep.user_id !== teamOwnerId && Boolean(rep.member_row_id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    if (busy) return
    if (
      !window.confirm(
        `Remove ${rep.name} from the team? Their deals stay with them; you'll lose visibility and the seat will free up.`,
      )
    ) {
      return
    }
    setError('')
    setBusy(true)
    const res = await removeMember({ memberRowId: rep.member_row_id })
    setBusy(false)
    if (!res?.ok) {
      setError(removalErrorCopy(res?.error))
      return
    }
    onRemoved?.()
  }

  return (
    <HairlineGrid.Cell>
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
          style={{ background: 'var(--klo-accent-soft)', color: 'var(--klo-accent)' }}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <MonoKicker>
            {index} / {rep.role === 'manager' ? 'Manager' : 'Rep'}
          </MonoKicker>
          <p
            className="mt-1 text-[17px] font-semibold truncate"
            style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
          >
            {rep.name}
          </p>
          <MonoTimestamp className="mt-1 block">
            Active · {rep.activeCount}  ·  Red · {rep.redCount}  ·  Overdue · {rep.overdueCount}
          </MonoTimestamp>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="kl-mono text-[11px] uppercase tracking-wider disabled:opacity-50"
            style={{ color: 'var(--klo-danger)', letterSpacing: '0.05em' }}
            title={`Remove ${rep.name} from team`}
          >
            {busy ? '…' : 'Remove'}
          </button>
        )}
      </div>
      {error && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--klo-danger)' }}>
          {error}
        </p>
      )}
      <div
        className="mt-4 pt-4 flex items-baseline justify-between"
        style={{ borderTop: '1px dashed var(--klo-line-strong)' }}
      >
        <span
          className="kl-mono text-[11px] uppercase"
          style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.05em' }}
        >
          Pipeline
        </span>
        <div className="text-right">
          <p
            className="text-[16px] font-semibold tabular-nums"
            style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
          >
            {formatCurrency(rep.pipelineValue)}
          </p>
          {rep.valueAtRisk > 0 && (
            <p
              className="kl-mono text-[11px] uppercase tabular-nums"
              style={{ color: 'var(--klo-danger)', letterSpacing: '0.02em' }}
            >
              {formatCurrency(rep.valueAtRisk)} at risk
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end">
        <Link
          to={`/team/deals?rep=${rep.user_id}`}
          className="kl-mono text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--klo-accent)', letterSpacing: '0.05em' }}
          title={`View ${rep.name}'s deals`}
        >
          View deals →
        </Link>
      </div>
    </HairlineGrid.Cell>
  )
}

function removalErrorCopy(code) {
  switch (code) {
    case 'not_authenticated':
      return 'You need to be signed in to remove a member.'
    case 'not_manager':
      return 'Only the team owner can remove members.'
    case 'cannot_remove_owner':
      return "The team owner can't be removed."
    case 'not_found':
      return 'That member is no longer on the team — refreshing.'
    default:
      return code || 'Could not remove member.'
  }
}
