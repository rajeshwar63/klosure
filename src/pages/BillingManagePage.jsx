// =============================================================================
// BillingManagePage — Phase 12.3 (Chunk 4)
// =============================================================================
// Self-service "manage your subscription" page. Right now it only does one
// thing — cancel — because the Razorpay flow doesn't expose a card-update or
// plan-change UI we'd want to inline. (Plan changes are upgrade-cards on
// /billing; card updates are an email-rajeshwar route until we need otherwise.)
//
// Cancel semantics:
//   - cancel_at_cycle_end=1 server-side, so the user keeps paid access for
//     the rest of the billing period.
//   - The webhook fires subscription.cancelled at cycle end and flips the
//     user/team to read-only via update_subscription_state. This page does
//     not write anything to the DB itself.
//   - After a successful cancel we render a "Cancellation scheduled" panel
//     with the end date returned from Razorpay; we do not navigate away so
//     the user actually sees the confirmation.
// =============================================================================

import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAccountStatus } from '../hooks/useAccountStatus.jsx'
import { cancelSubscription, updateSubscriptionSeats } from '../services/billing.js'
import {
  PLANS,
  totalAmountForTeam,
  formatCurrencyAmount,
} from '../lib/plans.ts'
import { Eyebrow, MonoKicker } from '../components/shared/index.js'

const PAID_STATUSES = new Set(['paid_active', 'paid_grace'])

export default function BillingManagePage() {
  const { status, planSlug, refresh, loading } = useAccountStatus()
  const navigate = useNavigate()

  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [cancelResult, setCancelResult] = useState(null) // { scheduled_end, status }

  if (loading) {
    return (
      <div className="p-6 text-sm" style={{ color: 'var(--klo-text-mute)' }}>
        Loading…
      </div>
    )
  }

  // Overridden accounts (design partners, internal) don't have a Razorpay
  // subscription to cancel; admin manages those by hand. Send them to /billing
  // where the override banner does the explaining.
  if (status?.status === 'overridden') {
    return <Navigate to="/billing" replace />
  }

  // Anyone without a real paid subscription doesn't belong here.
  if (!status || !PAID_STATUSES.has(status.status)) {
    return <Navigate to="/billing" replace />
  }

  const planLabel = PLANS[planSlug]?.label ?? 'Unknown plan'
  const renewsOn = status.current_period_end
    ? new Date(status.current_period_end).toLocaleDateString()
    : null

  async function handleCancel() {
    setErr('')
    setBusy(true)
    const res = await cancelSubscription()
    if (!res.ok) {
      setErr(res.error || 'Could not cancel. Please email support@klosure.ai.')
      setBusy(false)
      return
    }
    // Refresh account status so the rest of the app sees up-to-date state
    // (period_end / status haven't changed yet — the webhook flips read-only
    // at cycle end — but it's cheap insurance against drift).
    await refresh()
    setCancelResult({
      scheduled_end: res.scheduled_end ?? status.current_period_end ?? null,
      status: res.status ?? null,
    })
    setBusy(false)
    setConfirming(false)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--klo-bg)' }}>
      <header style={{ borderBottom: '1px solid var(--klo-line)' }}>
        <div
          className="max-w-[800px] mx-auto px-4 md:px-6 pt-8 pb-6"
          style={{ paddingTop: 'max(2rem, calc(env(safe-area-inset-top) + 1rem))' }}
        >
          <button
            onClick={() => navigate('/billing')}
            className="kl-mono text-[12px] mb-2"
            style={{ color: 'var(--klo-text-mute)' }}
          >
            ← Back to billing
          </button>
          <Eyebrow>Billing · Manage</Eyebrow>
          <h1
            className="mt-3"
            style={{
              fontSize: 'clamp(28px, 3.4vw, 36px)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              color: 'var(--klo-text)',
            }}
          >
            Manage subscription
          </h1>
        </div>
      </header>

      <main className="max-w-[800px] mx-auto px-4 md:px-6 pt-8 pb-20">
        <section
          className="rounded-2xl p-5"
          style={{ background: 'var(--klo-bg-elev)', border: '1px solid var(--klo-line)' }}
        >
          <MonoKicker>Current plan</MonoKicker>
          <p
            className="mt-2 text-[20px] font-semibold"
            style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
          >
            {planLabel}
          </p>
          {renewsOn && !cancelResult && (
            <p className="mt-2 text-[14px]" style={{ color: 'var(--klo-text-dim)' }}>
              Renews on {renewsOn}.
            </p>
          )}
          {status.status === 'paid_grace' && !cancelResult && (
            <p className="mt-2 text-[13px]" style={{ color: 'var(--klo-warn)' }}>
              Your last payment didn't go through. Razorpay will retry — update your
              payment method on the email Razorpay sent, or cancel below if you'd
              rather not continue.
            </p>
          )}
        </section>

        <ManageSeatsPanel status={status} planSlug={planSlug} refresh={refresh} />

        {!cancelResult ? (
          <section
            className="rounded-2xl p-5 mt-4"
            style={{
              background: 'var(--klo-bg-elev)',
              border: '1px solid var(--klo-line)',
              borderLeft: '3px solid var(--klo-danger)',
            }}
          >
            <h2 className="text-[16px] font-semibold" style={{ color: 'var(--klo-text)' }}>
              Cancel subscription
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--klo-text-dim)' }}>
              You'll keep full access until the end of your current billing period
              {renewsOn ? ` (${renewsOn})` : ''}. After that, your account becomes
              read-only and your data is preserved for 90 days before deletion. You
              can resubscribe at any time during that window from /billing.
            </p>

            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="mt-4 px-4 py-2 rounded-lg text-sm"
                style={{
                  background: 'transparent',
                  color: 'var(--klo-danger)',
                  border: '1px solid var(--klo-danger)',
                }}
              >
                Cancel my subscription
              </button>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                  style={{ background: 'var(--klo-danger)', color: 'white' }}
                >
                  {busy ? 'Cancelling…' : 'Yes, cancel at cycle end'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className="px-4 py-2 rounded-lg text-sm"
                  style={{
                    background: 'transparent',
                    color: 'var(--klo-text-dim)',
                    border: '1px solid var(--klo-line-strong)',
                  }}
                >
                  Keep my subscription
                </button>
              </div>
            )}
            {err && (
              <p className="mt-3 text-[13px]" style={{ color: 'var(--klo-danger)' }}>
                {err}
              </p>
            )}
          </section>
        ) : (
          <section
            className="rounded-2xl p-5 mt-4"
            style={{
              background: 'var(--klo-bg-elev)',
              border: '1px solid var(--klo-line)',
              borderLeft: '3px solid var(--klo-good)',
            }}
          >
            <h2 className="text-[16px] font-semibold" style={{ color: 'var(--klo-text)' }}>
              Cancellation scheduled
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--klo-text-dim)' }}>
              {cancelResult.scheduled_end
                ? `You'll keep ${planLabel} access until ${new Date(cancelResult.scheduled_end).toLocaleDateString()}. After that your account becomes read-only.`
                : `Your subscription is scheduled to end at the end of the current cycle.`}
            </p>
            <p className="mt-2 text-[13px]" style={{ color: 'var(--klo-text-dim)' }}>
              Changed your mind? Email{' '}
              <a href="mailto:support@klosure.ai" style={{ color: 'var(--klo-accent)' }}>
                support@klosure.ai
              </a>{' '}
              before your end date and we'll undo it.
            </p>
            <div className="mt-4">
              <Link
                to="/billing"
                className="inline-block px-4 py-2 rounded-lg text-sm"
                style={{
                  background: 'transparent',
                  color: 'var(--klo-text)',
                  border: '1px solid var(--klo-line-strong)',
                }}
              >
                Back to billing
              </Link>
            </div>
          </section>
        )}

        <p className="mt-8 text-[12px]" style={{ color: 'var(--klo-text-mute)' }}>
          Need to update your card, change plans, get a refund, or pause for a
          month? Email{' '}
          <a href="mailto:support@klosure.ai" style={{ color: 'var(--klo-accent)' }}>
            support@klosure.ai
          </a>
          .
        </p>
      </main>
    </div>
  )
}

// Manage Seats — admin-only block to add/remove seats on the team
// subscription. Add-seats charges immediately (prorated); reduce-seats
// schedules at next cycle (industry standard).
function ManageSeatsPanel({ status, planSlug, refresh }) {
  const plan = PLANS[planSlug]
  const isTeamPaid = plan?.isTeam && (planSlug === 'coach' || planSlug === 'closer')
  const currentSeats = status?.seat_cap ?? 1
  const pendingSeats = status?.pending_seat_cap ?? null
  const memberCount = status?.seats_used ?? 1
  const currency = status?.currency ?? 'INR'
  const renewsOn = status?.current_period_end
    ? new Date(status.current_period_end).toLocaleDateString()
    : null

  const [target, setTarget] = useState(currentSeats)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)

  useEffect(() => {
    setTarget(currentSeats)
  }, [currentSeats])

  if (!isTeamPaid) return null

  const minTarget = Math.max(1, memberCount)
  const isIncrease = target > currentSeats
  const isDecrease = target < currentSeats
  const isNoop = target === currentSeats
  const totalNow = totalAmountForTeam(planSlug, currency, currentSeats)
  const totalAfter = totalAmountForTeam(planSlug, currency, target)

  async function handleApply() {
    setErr('')
    setDone(null)
    if (target < minTarget) {
      setErr(
        memberCount > 1
          ? `You have ${memberCount} active members. Remove members first or pick at least ${memberCount} seats.`
          : 'Minimum 1 seat.',
      )
      return
    }
    setBusy(true)
    const res = await updateSubscriptionSeats({ seatCount: target })
    setBusy(false)
    if (!res.ok) {
      setErr(res.error || 'Update failed. Please email support@klosure.ai.')
      return
    }
    await refresh()
    setDone(res)
  }

  return (
    <section
      className="rounded-2xl p-5 mt-4"
      style={{ background: 'var(--klo-bg-elev)', border: '1px solid var(--klo-line)' }}
    >
      <MonoKicker>Seats</MonoKicker>
      <h2 className="mt-2 text-[16px] font-semibold" style={{ color: 'var(--klo-text)' }}>
        Manage seats
      </h2>
      <p className="mt-1 text-[13px]" style={{ color: 'var(--klo-text-dim)' }}>
        You have <strong>{currentSeats}</strong> seat{currentSeats === 1 ? '' : 's'} —{' '}
        {memberCount} in use.
        {totalNow !== null && (
          <>
            {' '}
            Today's bill:{' '}
            <strong>{formatCurrencyAmount(totalNow, currency)}</strong>/mo.
          </>
        )}
      </p>
      {pendingSeats != null && (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--klo-warn)' }}>
          Scheduled change: drops to <strong>{pendingSeats}</strong> seat
          {pendingSeats === 1 ? '' : 's'}
          {renewsOn ? ` on ${renewsOn}` : ' at the next billing cycle'}.
        </p>
      )}

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <label className="kl-mono text-[11px] uppercase" style={{ color: 'var(--klo-text-mute)' }}>
          New seat count
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTarget((n) => Math.max(minTarget, n - 1))}
            disabled={target <= minTarget || busy}
            aria-label="Decrease seats"
            className="w-8 h-8 rounded-md text-[16px] font-semibold disabled:opacity-30"
            style={{
              background: 'var(--klo-bg)',
              border: '1px solid var(--klo-line-strong)',
              color: 'var(--klo-text)',
            }}
          >
            −
          </button>
          <span
            className="text-[16px] font-semibold tabular-nums w-10 text-center"
            style={{ color: 'var(--klo-text)' }}
          >
            {target}
          </span>
          <button
            type="button"
            onClick={() => setTarget((n) => Math.min(200, n + 1))}
            disabled={target >= 200 || busy}
            aria-label="Increase seats"
            className="w-8 h-8 rounded-md text-[16px] font-semibold disabled:opacity-30"
            style={{
              background: 'var(--klo-bg)',
              border: '1px solid var(--klo-line-strong)',
              color: 'var(--klo-text)',
            }}
          >
            +
          </button>
        </div>
        {totalAfter !== null && (
          <span className="text-[13px]" style={{ color: 'var(--klo-text-dim)' }}>
            → <strong>{formatCurrencyAmount(totalAfter, currency)}</strong>/mo
          </span>
        )}
      </div>

      {!isNoop && (
        <p
          className="mt-3 text-[12px] leading-relaxed"
          style={{ color: 'var(--klo-text-dim)' }}
        >
          {isIncrease ? (
            <>
              <strong>Add {target - currentSeats} seat{target - currentSeats === 1 ? '' : 's'}.</strong>{' '}
              Billed immediately, prorated for the rest of this cycle. Your monthly
              bill becomes {totalAfter !== null && formatCurrencyAmount(totalAfter, currency)} from the
              next cycle{renewsOn ? ` (${renewsOn})` : ''}.
            </>
          ) : (
            <>
              <strong>Reduce to {target} seat{target === 1 ? '' : 's'}.</strong>{' '}
              Takes effect at the next billing cycle{renewsOn ? ` (${renewsOn})` : ''}.
              You keep all {currentSeats} seats until then; no mid-cycle refund.
            </>
          )}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleApply}
          disabled={busy || isNoop}
          className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--klo-text)', color: 'white' }}
        >
          {busy
            ? 'Updating…'
            : isNoop
            ? 'No change'
            : isIncrease
            ? 'Add seats now'
            : 'Schedule reduction'}
        </button>
        {!isNoop && (
          <button
            type="button"
            onClick={() => setTarget(currentSeats)}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm"
            style={{
              background: 'transparent',
              color: 'var(--klo-text-dim)',
              border: '1px solid var(--klo-line-strong)',
            }}
          >
            Reset
          </button>
        )}
      </div>
      {err && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--klo-danger)' }}>
          {err}
        </p>
      )}
      {done && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--klo-good)' }}>
          {done.change === 'increased_immediately'
            ? `Done — your team now has ${done.seat_cap} seats.`
            : done.change === 'decrease_scheduled_at_cycle_end'
            ? `Scheduled — drops to ${done.pending_seat_cap} seat${done.pending_seat_cap === 1 ? '' : 's'} at the next billing cycle.`
            : 'Updated.'}
        </p>
      )}
    </section>
  )
}
