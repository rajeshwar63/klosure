// Phase 12.1 — real billing page with plan cards.
// Phase 12.3 — INR upgrade buttons go live via Razorpay. AED still says
// "Contact sales — AED billing soon" (Phase 12.3.1).
// Danger zone (account deletion) is preserved from the previous billing page;
// the spec doesn't address it but removing it would regress an existing
// shipped feature.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { useAccountStatus } from '../hooks/useAccountStatus.jsx'
import { PLANS, formatPrice } from '../lib/plans.ts'
import { getRazorpayPlanId, RAZORPAY_KEY_ID } from '../lib/razorpay-plans.ts'
import { startUpgrade, verifySubscription } from '../services/billing.js'
import { requestAccountDeletion } from '../services/accountDeletion.js'
import { Eyebrow, MonoKicker } from '../components/shared/index.js'
import CreateTeamSection from '../components/billing/CreateTeamSection.jsx'

const SHOWN_PLANS = ['pro', 'team_starter', 'team_growth', 'team_scale', 'enterprise']
const CURRENCIES = ['INR', 'AED']

export default function BillingPage() {
  const { user, signOut } = useAuth()
  const { team } = useProfile()
  const { status, planSlug, isTrialing, daysLeftInTrial, isReadOnly, loading } = useAccountStatus()
  const navigate = useNavigate()

  const [currency, setCurrency] = useState(status?.currency || 'INR')

  // Account-deletion form state (preserved from previous BillingPage).
  const [deleteForm, setDeleteForm] = useState({ password: '', mfaCode: '', typed: '' })
  const [deleteError, setDeleteError] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteDone, setDeleteDone] = useState(null)
  const deleteToken = user?.email || 'DELETE'

  // Effective plan: prefer the team's plan if the user is on a paid team,
  // otherwise fall back to whatever get_account_status returned.
  const currentTeamPlan = team?.plan
  const effectivePlan =
    currentTeamPlan && currentTeamPlan !== 'trial' ? currentTeamPlan : planSlug

  if (loading) {
    return (
      <div className="p-6 text-sm" style={{ color: 'var(--klo-text-mute)' }}>
        Loading…
      </div>
    )
  }

  async function handleDeleteAccount(e) {
    e.preventDefault()
    setDeleteError('')
    if (!user?.email) {
      setDeleteError('Could not verify your account email.')
      return
    }
    if (!deleteForm.password.trim() && !deleteForm.mfaCode.trim()) {
      setDeleteError('Confirm your identity with either password or MFA code.')
      return
    }
    if (deleteForm.typed.trim() !== deleteToken) {
      setDeleteError(`Type ${deleteToken} exactly to continue.`)
      return
    }

    setDeleteBusy(true)
    try {
      if (deleteForm.password.trim()) {
        const { error: reauthErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: deleteForm.password,
        })
        if (reauthErr) throw new Error(reauthErr.message || 'Password verification failed.')
      } else {
        const { data: factors, error: factorsErr } = await supabase.auth.mfa.listFactors()
        if (factorsErr) throw new Error(factorsErr.message || 'Could not load MFA factors.')
        const factor = factors?.totp?.[0]
        if (!factor) throw new Error('No MFA factor found. Use password instead.')
        const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: factor.id })
        if (challengeErr) throw new Error(challengeErr.message || 'Could not start MFA challenge.')
        const { error: verifyErr } = await supabase.auth.mfa.verify({
          factorId: factor.id,
          challengeId: challenge.id,
          code: deleteForm.mfaCode.trim(),
        })
        if (verifyErr) throw new Error(verifyErr.message || 'Invalid MFA code.')
      }

      const result = await requestAccountDeletion()
      await signOut()
      setDeleteDone(result)
    } catch (err) {
      setDeleteError(err?.message || 'Account deletion failed.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--klo-bg)' }}>
      <header style={{ borderBottom: '1px solid var(--klo-line)' }}>
        <div
          className="max-w-[1100px] mx-auto px-4 md:px-6 pt-8 pb-6"
          style={{ paddingTop: 'max(2rem, calc(env(safe-area-inset-top) + 1rem))' }}
        >
          <button
            onClick={() => navigate(-1)}
            className="kl-mono text-[12px] mb-2"
            style={{ color: 'var(--klo-text-mute)' }}
          >
            ← Back
          </button>
          <Eyebrow>Billing</Eyebrow>
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
            Plans &amp; licenses
          </h1>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 md:px-6 pt-8 pb-20">
        <StatusBanner
          status={status}
          planSlug={effectivePlan}
          isTrialing={isTrialing}
          daysLeftInTrial={daysLeftInTrial}
          isReadOnly={isReadOnly}
        />

        <CreateTeamSection />

        <div className="mt-8 flex items-center justify-between flex-wrap gap-3">
          <p className="text-[14px]" style={{ color: 'var(--klo-text-dim)' }}>
            Prices shown in {currency === 'INR' ? 'Indian Rupees' : 'UAE Dirhams'}.
          </p>
          <div
            className="inline-flex rounded-lg p-1"
            style={{ background: 'var(--klo-bg-elev)', border: '1px solid var(--klo-line)' }}
          >
            {CURRENCIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold"
                style={{
                  background: currency === c ? 'var(--klo-accent)' : 'transparent',
                  color: currency === c ? 'white' : 'var(--klo-text-dim)',
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SHOWN_PLANS.map((slug) => (
            <PlanCard
              key={slug}
              plan={PLANS[slug]}
              currency={currency}
              isCurrent={slug === effectivePlan}
              user={user}
            />
          ))}
        </div>

        <p className="mt-8 text-[12px]" style={{ color: 'var(--klo-text-mute)' }}>
          Upgrade flow ships next. Until then, contact{' '}
          <a href="mailto:support@klosure.ai" style={{ color: 'var(--klo-accent)' }}>
            support@klosure.ai
          </a>{' '}
          for early access pricing.
        </p>

        <div className="mt-8 text-center">
          <Link
            to="/deals"
            className="text-[14px] hover:underline"
            style={{ color: 'var(--klo-accent)' }}
          >
            ← Back to deals
          </Link>
        </div>

        <section
          className="mt-10 rounded-2xl p-5"
          style={{
            background: 'var(--klo-bg-elev)',
            border: '1px solid var(--klo-line)',
            borderLeft: '3px solid var(--klo-danger)',
          }}
        >
          <MonoKicker>Danger zone</MonoKicker>
          <h2
            className="mt-2 text-[18px] font-semibold"
            style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
          >
            Delete account
          </h2>
          {!deleteDone ? (
            <>
              <p
                className="text-[14px] mt-3 leading-relaxed"
                style={{ color: 'var(--klo-text-dim)' }}
              >
                Deleting your account is permanent and cannot be undone. You will lose access
                to all deals, messages, team history, and billing records tied to this account.
              </p>
              <p
                className="text-[14px] mt-2 leading-relaxed"
                style={{ color: 'var(--klo-text-dim)' }}
              >
                Data deletion starts immediately after confirmation and follows our retention policy.
                {import.meta.env.VITE_ACCOUNT_DELETION_GRACE_DAYS
                  ? ` If your workspace has a ${import.meta.env.VITE_ACCOUNT_DELETION_GRACE_DAYS}-day grace period, data remains recoverable only during that window.`
                  : ' No grace period is configured for this workspace.'}
              </p>

              <form onSubmit={handleDeleteAccount} className="mt-5 space-y-3">
                <div>
                  <MonoKicker>Re-authenticate · password or MFA</MonoKicker>
                  <input
                    type="password"
                    value={deleteForm.password}
                    onChange={(e) => setDeleteForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="Password"
                    className="mt-2 w-full rounded-lg px-3 py-2.5 text-[14px]"
                    style={{
                      background: 'var(--klo-bg)',
                      border: '1px solid var(--klo-line-strong)',
                      color: 'var(--klo-text)',
                    }}
                  />
                  <input
                    type="text"
                    value={deleteForm.mfaCode}
                    onChange={(e) => setDeleteForm((prev) => ({ ...prev, mfaCode: e.target.value }))}
                    placeholder="Or enter MFA code"
                    className="mt-2 w-full rounded-lg px-3 py-2.5 text-[14px]"
                    style={{
                      background: 'var(--klo-bg)',
                      border: '1px solid var(--klo-line-strong)',
                      color: 'var(--klo-text)',
                    }}
                  />
                </div>
                <div>
                  <MonoKicker>Type {deleteToken} to confirm</MonoKicker>
                  <input
                    type="text"
                    value={deleteForm.typed}
                    onChange={(e) => setDeleteForm((prev) => ({ ...prev, typed: e.target.value }))}
                    className="mt-2 w-full rounded-lg px-3 py-2.5 text-[14px]"
                    style={{
                      background: 'var(--klo-bg)',
                      border: '1px solid var(--klo-line-strong)',
                      color: 'var(--klo-text)',
                    }}
                  />
                </div>
                {deleteError && (
                  <p className="text-[13px]" style={{ color: 'var(--klo-danger)' }}>
                    {deleteError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={deleteBusy}
                  className="w-full sm:w-auto rounded-lg text-[14px] px-5 py-2.5 disabled:opacity-50"
                  style={{
                    background: 'transparent',
                    color: 'var(--klo-danger)',
                    border: '1px solid var(--klo-danger)',
                  }}
                >
                  {deleteBusy ? 'Deleting account…' : 'Delete my account permanently'}
                </button>
              </form>
            </>
          ) : (
            <div
              className="mt-4 rounded-xl p-4"
              style={{
                background: 'var(--klo-bg)',
                border: '1px solid var(--klo-line)',
                borderLeft: '3px solid var(--klo-good)',
              }}
            >
              <p className="text-[14px] font-medium" style={{ color: 'var(--klo-good)' }}>
                Your deletion request is confirmed.
              </p>
              <p className="text-[14px] mt-1" style={{ color: 'var(--klo-text-dim)' }}>
                All sessions have been revoked and the account deletion workflow has started.
              </p>
              <p className="text-[14px] mt-1" style={{ color: 'var(--klo-text-dim)' }}>
                Need help? Contact support at{' '}
                <a
                  href="mailto:support@klosure.ai"
                  className="underline"
                  style={{ color: 'var(--klo-accent)' }}
                >
                  support@klosure.ai
                </a>
                .
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function StatusBanner({ status, planSlug, isTrialing, daysLeftInTrial, isReadOnly }) {
  if (!status) return null
  const planLabel = PLANS[planSlug]?.label ?? 'Trial'

  let title
  let body
  let tone
  if (isReadOnly) {
    title = 'Your account is read-only.'
    body = 'Klosure is paused — upgrade to resume coaching deals. Data is preserved for 90 days.'
    tone = 'danger'
  } else if (isTrialing) {
    const days = Math.max(0, Math.ceil(daysLeftInTrial ?? 0))
    title = `${days} day${days === 1 ? '' : 's'} left in your trial.`
    body =
      "You're on the full Pro experience until your trial ends. Pick a plan now to keep going without interruption."
    tone = days <= 3 ? 'warning' : 'info'
  } else if (status.status === 'paid_active' || status.status === 'overridden') {
    title = `You're on ${planLabel}.`
    body = status.current_period_end
      ? `Renews on ${new Date(status.current_period_end).toLocaleDateString()}.`
      : 'Active license.'
    tone = 'success'
  } else if (status.status === 'paid_grace') {
    title = `${planLabel} — payment retry in progress.`
    body = "Razorpay is retrying your last charge. Update your card or cancel from Manage subscription if you'd rather not continue."
    tone = 'warning'
  } else {
    title = `Plan: ${planLabel}`
    body = ''
    tone = 'info'
  }

  const bg =
    tone === 'danger' ? 'var(--klo-danger-soft)' :
    tone === 'warning' ? 'var(--klo-warning-soft)' :
    'var(--klo-bg-elev)'

  // Manage link: only for real paid subs (not overridden — those are admin-
  // granted and have no Razorpay subscription to cancel).
  const showManage = status.status === 'paid_active' || status.status === 'paid_grace'

  return (
    <div
      className="rounded-2xl p-5 mt-5"
      style={{ background: bg, border: '1px solid var(--klo-line)' }}
    >
      <p className="text-[15px] font-semibold" style={{ color: 'var(--klo-text)' }}>
        {title}
      </p>
      {body && (
        <p className="mt-1 text-[13px]" style={{ color: 'var(--klo-text-dim)' }}>
          {body}
        </p>
      )}
      {showManage && (
        <p className="mt-3 text-[13px]">
          <Link
            to="/billing/manage"
            className="hover:underline"
            style={{ color: 'var(--klo-accent)' }}
          >
            Manage subscription →
          </Link>
        </p>
      )}
    </div>
  )
}

// Razorpay Checkout JS — loaded on demand on the first Upgrade click.
// Returns a promise that resolves once window.Razorpay is available.
function loadRazorpayCheckout() {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.Razorpay) return resolve()
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('checkout_script_load_failed'))
    document.head.appendChild(script)
  })
}

function PlanCard({ plan, currency, isCurrent, user }) {
  const navigate = useNavigate()
  const isEnterprise = plan.slug === 'enterprise'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // null Razorpay plan ID means: not buyable in this currency yet (AED) or
  // not a paid tier (trial/enterprise). Enterprise routes to a sales conversation.
  const planAvailable = !isEnterprise && !!getRazorpayPlanId(plan.slug, currency)

  async function handleUpgrade() {
    setErr('')
    setBusy(true)

    // Load Razorpay's checkout script first — small (~50KB) and CDN-cached.
    try {
      await loadRazorpayCheckout()
    } catch {
      setBusy(false)
      setErr('Could not load the payment widget. Please reload and try again.')
      return
    }

    // Create the subscription on Razorpay (via our edge function). This
    // returns a subscription_id; Razorpay's checkout modal authenticates
    // the mandate against that id.
    const res = await startUpgrade({ planSlug: plan.slug, currency })
    if (!res.ok || !res.subscription_id) {
      setBusy(false)
      setErr(res.error || 'Upgrade failed. Please try again.')
      return
    }

    // Open the in-app modal. Razorpay handles all UI; on successful mandate
    // auth, the handler fires. We then call verifySubscription to sync paid
    // state to Supabase synchronously (so the user lands on paid_active
    // without depending on the webhook), then route to /billing/return which
    // also polls as a backup.
    const rzp = new window.Razorpay({
      key: RAZORPAY_KEY_ID,
      subscription_id: res.subscription_id,
      name: 'Klosure',
      description: `${plan.label} subscription`,
      prefill: {
        email: user?.email ?? '',
        name: user?.user_metadata?.name ?? '',
      },
      theme: { color: '#000000' },
      handler: async function () {
        // Best-effort sync. If verify fails (network blip, edge function
        // cold-start hiccup), still navigate so polling on /billing/return
        // and the webhook backstop still flip the user.
        try {
          await verifySubscription()
        } catch (e) {
          console.warn('verify after checkout failed', e)
        }
        navigate('/billing/return')
      },
      modal: {
        ondismiss: function () {
          setBusy(false)
        },
      },
    })
    rzp.open()
  }

  let buttonLabel
  if (isCurrent) {
    buttonLabel = 'Current plan'
  } else if (isEnterprise) {
    buttonLabel = 'Talk to sales'
  } else if (!planAvailable) {
    buttonLabel = currency === 'AED' ? 'Contact sales — AED billing soon' : 'Talk to sales'
  } else if (busy) {
    buttonLabel = 'Opening checkout…'
  } else {
    buttonLabel = 'Upgrade'
  }

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{
        background: isCurrent ? 'var(--klo-accent-soft)' : 'var(--klo-bg-elev)',
        border: isCurrent ? '2px solid var(--klo-accent)' : '1px solid var(--klo-line)',
      }}
    >
      <MonoKicker>{plan.shortLabel}</MonoKicker>
      <h3
        className="mt-2 text-[20px] font-semibold"
        style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
      >
        {plan.label}
      </h3>
      <p className="mt-1 text-[13px]" style={{ color: 'var(--klo-text-dim)' }}>
        {plan.description}
      </p>

      <div className="mt-4 flex items-baseline gap-1">
        <span
          className="text-[28px] font-bold tabular-nums"
          style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
        >
          {formatPrice(plan.slug, currency)}
        </span>
        {!isEnterprise && (
          <span className="text-[13px]" style={{ color: 'var(--klo-text-dim)' }}>
            /mo
          </span>
        )}
      </div>
      {!isEnterprise && plan.seatCap > 1 && (
        <p className="text-[12px] kl-mono mt-1" style={{ color: 'var(--klo-text-mute)' }}>
          Up to {plan.seatCap} seats
        </p>
      )}

      <ul className="mt-4 space-y-1.5 flex-1">
        {plan.highlights.map((h, i) => (
          <li key={i} className="text-[13px] flex gap-2" style={{ color: 'var(--klo-text)' }}>
            <span style={{ color: 'var(--klo-accent)' }}>✓</span>
            <span>{h}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={planAvailable && !isCurrent ? handleUpgrade : undefined}
        disabled={busy || isCurrent || !planAvailable}
        className="mt-5 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: isCurrent ? 'transparent' : 'var(--klo-text)',
          color: isCurrent ? 'var(--klo-text)' : 'white',
          border: isCurrent ? '1px solid var(--klo-line-strong)' : 'none',
        }}
      >
        {buttonLabel}
      </button>
      {err && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--klo-danger)' }}>
          {err}
        </p>
      )}
      {!planAvailable && !isCurrent && !isEnterprise && currency === 'AED' && (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--klo-text-mute)' }}>
          Email{' '}
          <a href="mailto:support@klosure.ai" style={{ color: 'var(--klo-accent)' }}>
            support@klosure.ai
          </a>{' '}
          for AED billing.
        </p>
      )}
    </div>
  )
}
