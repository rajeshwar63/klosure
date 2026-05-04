// Phase 12.1 — real billing page with plan cards.
// Phase 12.3 — INR upgrade buttons go live via Razorpay.
// Phase A sprint 09 — 3-tier pricing (Coach / Closer / Command), seat counter
// with live total, trial banner, and a concierge form for USD / AED visitors
// while international card processing pends activation (Razorpay #18895606).
// Danger zone (account deletion) is preserved from the previous billing page;
// the spec doesn't address it but removing it would regress an existing
// shipped feature.

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { useAccountStatus } from '../hooks/useAccountStatus.jsx'
import {
  PLANS,
  priceDisplayFor,
  totalAmountForTeam,
  formatCurrencyAmount,
} from '../lib/plans.ts'
import { getRazorpayPlanId, RAZORPAY_KEY_ID } from '../lib/razorpay-plans.ts'
import { startUpgrade, verifySubscription } from '../services/billing.js'
import { requestIntlBillingLead } from '../services/intlBilling.js'
import { requestAccountDeletion } from '../services/accountDeletion.js'
import { Eyebrow, MonoKicker } from '../components/shared/index.js'
import CreateTeamSection from '../components/billing/CreateTeamSection.jsx'

// Phase A sprint 09: Coach + Closer + Command (renamed from klosure / enterprise).
const SHOWN_PLANS = ['coach', 'closer', 'command']
const CURRENCIES = ['USD', 'AED', 'INR']
// Razorpay only charges INR until international activation lands. Other
// currencies render display-only prices and route the Subscribe button to a
// concierge form instead of checkout.
const CHARGEABLE_CURRENCIES = new Set(['INR'])

const CURRENCY_LABELS = {
  USD: 'US Dollars',
  AED: 'UAE Dirhams',
  INR: 'Indian Rupees',
}

export default function BillingPage() {
  const { user, signOut } = useAuth()
  const { team } = useProfile()
  const { status, planSlug, isTrialing, daysLeftInTrial, isReadOnly, loading } = useAccountStatus()
  const navigate = useNavigate()

  // Default to INR — that's the only chargeable currency until Razorpay
  // international activation completes. USD/AED visitors can still toggle to
  // see prices in their currency, but the Subscribe button routes to the
  // concierge form rather than Razorpay checkout.
  const [currency, setCurrency] = useState(status?.currency || 'INR')

  // Concierge form (USD/AED leads) — opens when an international visitor
  // clicks the "Get an invoice" CTA on a plan card.
  const [intlPanel, setIntlPanel] = useState(null) // { plan, currency } | null

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

        {/* 14-day trial banner. Shown to anyone who isn't already paid_active —
            it's the safety net for international visitors who can't auto-debit
            yet, plus it nudges trialers to stay engaged. */}
        {(!status || status.status !== 'paid_active') && (
          <div
            className="mt-8 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap"
            style={{
              background: 'var(--klo-bg-elev)',
              border: '1px solid var(--klo-line)',
              color: 'var(--klo-text)',
            }}
            role="note"
          >
            <span
              className="kl-mono text-[11px] font-bold px-2 py-0.5 rounded"
              style={{
                background: 'var(--klo-accent)',
                color: 'white',
                letterSpacing: '0.06em',
              }}
            >
              14-DAY TRIAL
            </span>
            <span className="text-[13px]">
              Start free for 14 days. No card needed. Cancel anytime.
            </span>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between flex-wrap gap-3">
          <p className="text-[14px]" style={{ color: 'var(--klo-text-dim)' }}>
            Prices shown in {CURRENCY_LABELS[currency] ?? currency}.
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

        {/* Three-card grid: Coach (entry), Closer (featured), Command (enterprise). */}
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {SHOWN_PLANS.map((slug) => (
            <PlanCard
              key={slug}
              plan={PLANS[slug]}
              currency={currency}
              isCurrent={slug === effectivePlan}
              user={user}
              onIntlInvoice={(p) => setIntlPanel({ plan: p, currency })}
            />
          ))}
        </div>

        {intlPanel && (
          <IntlBillingPanel
            plan={intlPanel.plan}
            currency={intlPanel.currency}
            user={user}
            onClose={() => setIntlPanel(null)}
          />
        )}

        <p className="mt-8 text-[12px]" style={{ color: 'var(--klo-text-mute)' }}>
          Questions? Email{' '}
          <a href="mailto:support@klosure.ai" style={{ color: 'var(--klo-accent)' }}>
            support@klosure.ai
          </a>
          .
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

function PlanCard({ plan, currency, isCurrent, user, onIntlInvoice }) {
  const navigate = useNavigate()
  const isEnterprise = plan.slug === 'command'
  const isFeatured = plan.slug === 'closer'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [seatCount, setSeatCount] = useState(1)

  // Razorpay only charges INR right now. AED/USD are display-only — they
  // route to the concierge form so we don't lose the lead while international
  // activation pends.
  const isChargeable = CHARGEABLE_CURRENCIES.has(currency)
  const razorpayPlanId = isEnterprise ? null : getRazorpayPlanId(plan.slug, currency)
  const planAvailable = !isEnterprise && isChargeable && !!razorpayPlanId

  // Live total = per-seat × seat_count (only for paid plans with a price in
  // the selected currency).
  const totalAmount = useMemo(
    () => (isEnterprise ? null : totalAmountForTeam(plan.slug, currency, seatCount)),
    [isEnterprise, plan.slug, currency, seatCount],
  )

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
    const res = await startUpgrade({ planSlug: plan.slug, currency, seatCount })
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
  } else if (!isChargeable) {
    // Non-INR — route to concierge form rather than disable.
    buttonLabel = 'Start free trial'
  } else if (!razorpayPlanId) {
    buttonLabel = 'Talk to sales'
  } else if (busy) {
    buttonLabel = 'Opening checkout…'
  } else {
    buttonLabel = `Subscribe — ${formatCurrencyAmount(totalAmount ?? 0, currency)}/mo`
  }

  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{
        background: isCurrent
          ? 'var(--klo-accent-soft)'
          : isFeatured
          ? 'var(--klo-bg-elev)'
          : 'var(--klo-bg-elev)',
        border: isCurrent
          ? '2px solid var(--klo-accent)'
          : isFeatured
          ? '2px solid var(--klo-accent)'
          : '1px solid var(--klo-line)',
      }}
    >
      <div className="flex items-center justify-between">
        <MonoKicker>{plan.shortLabel}</MonoKicker>
        {isFeatured && !isCurrent && (
          <span
            className="kl-mono text-[10px] font-bold px-2 py-0.5 rounded"
            style={{
              background: 'var(--klo-accent)',
              color: 'white',
              letterSpacing: '0.06em',
            }}
          >
            MOST POPULAR
          </span>
        )}
      </div>
      <h3
        className="mt-2 text-[20px] font-semibold"
        style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
      >
        {plan.label}
      </h3>
      <p className="mt-1 text-[13px]" style={{ color: 'var(--klo-text-dim)' }}>
        {plan.description}
      </p>

      {!isEnterprise && (
        <div className="mt-4 flex items-baseline gap-2 flex-wrap">
          <span
            className="text-[28px] font-bold tabular-nums"
            style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
          >
            {priceDisplayFor(plan.slug, currency).primary}
          </span>
          <span className="text-[13px]" style={{ color: 'var(--klo-text-dim)' }}>
            /mo
          </span>
        </div>
      )}
      {isEnterprise && (
        <div className="mt-4 flex items-baseline gap-1">
          <span
            className="text-[28px] font-bold tabular-nums"
            style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
          >
            Contact sales
          </span>
        </div>
      )}
      {!isEnterprise && plan.isTeam && (
        <>
          <p className="text-[12px] kl-mono mt-1" style={{ color: 'var(--klo-text-mute)' }}>
            Per seat · pay only for who you onboard
          </p>
          <p className="text-[11px] kl-mono mt-0.5" style={{ color: 'var(--klo-text-mute)' }}>
            Exclusive of applicable taxes
          </p>
        </>
      )}

      <ul className="mt-4 space-y-1.5 flex-1">
        {plan.highlights.map((h, i) => (
          <li key={i} className="text-[13px] flex gap-2" style={{ color: 'var(--klo-text)' }}>
            <span style={{ color: 'var(--klo-accent)' }}>✓</span>
            <span>{h}</span>
          </li>
        ))}
      </ul>

      {/* Seat counter — only on paid tiers when chargeable in this currency.
          For non-INR or enterprise, hide (concierge / sales call sets seats). */}
      {!isEnterprise && isChargeable && razorpayPlanId && !isCurrent && (
        <div
          className="mt-5 rounded-lg p-3"
          style={{ background: 'var(--klo-bg)', border: '1px solid var(--klo-line)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div
                className="kl-mono text-[10px] font-semibold uppercase"
                style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.08em' }}
              >
                Seats
              </div>
              <div className="text-[13px]" style={{ color: 'var(--klo-text-dim)' }}>
                Pay only for who you onboard. Add more later.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSeatCount((n) => Math.max(1, n - 1))}
                aria-label="Decrease seats"
                disabled={seatCount <= 1}
                className="w-8 h-8 rounded-md text-[16px] font-semibold disabled:opacity-30"
                style={{
                  background: 'var(--klo-bg-elev)',
                  border: '1px solid var(--klo-line-strong)',
                  color: 'var(--klo-text)',
                }}
              >
                −
              </button>
              <span
                className="text-[16px] font-semibold tabular-nums w-8 text-center"
                style={{ color: 'var(--klo-text)' }}
              >
                {seatCount}
              </span>
              <button
                type="button"
                onClick={() => setSeatCount((n) => Math.min(200, n + 1))}
                aria-label="Increase seats"
                disabled={seatCount >= 200}
                className="w-8 h-8 rounded-md text-[16px] font-semibold disabled:opacity-30"
                style={{
                  background: 'var(--klo-bg-elev)',
                  border: '1px solid var(--klo-line-strong)',
                  color: 'var(--klo-text)',
                }}
              >
                +
              </button>
            </div>
          </div>
          {totalAmount !== null && (
            <div
              className="mt-2 pt-2 text-[12px] flex items-center justify-between"
              style={{ borderTop: '1px solid var(--klo-line)', color: 'var(--klo-text-dim)' }}
            >
              <span>
                {seatCount} × {formatCurrencyAmount(plan.monthlyPerSeat[currency] ?? 0, currency)}
              </span>
              <span style={{ color: 'var(--klo-text)' }}>
                <strong>{formatCurrencyAmount(totalAmount, currency)}</strong>/mo
              </span>
            </div>
          )}
        </div>
      )}

      {isEnterprise ? (
        <a
          href="mailto:support@klosure.ai"
          className="mt-5 px-4 py-2.5 rounded-lg text-sm font-semibold text-center"
          style={{
            background: 'var(--klo-text)',
            color: 'white',
            border: 'none',
          }}
        >
          {buttonLabel}
        </a>
      ) : !isChargeable ? (
        <>
          <button
            type="button"
            onClick={() => onIntlInvoice?.(plan)}
            disabled={isCurrent}
            className="mt-5 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isCurrent ? 'transparent' : 'var(--klo-text)',
              color: isCurrent ? 'var(--klo-text)' : 'white',
              border: isCurrent ? '1px solid var(--klo-line-strong)' : 'none',
            }}
          >
            {isCurrent ? 'Current plan' : 'Start 14-day free trial'}
          </button>
          {!isCurrent && (
            <button
              type="button"
              onClick={() => onIntlInvoice?.(plan)}
              className="mt-2 text-[12px] hover:underline"
              style={{ color: 'var(--klo-accent)', background: 'none', border: 'none' }}
            >
              Or get an invoice in 24 hrs →
            </button>
          )}
        </>
      ) : (
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
      )}
      {err && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--klo-danger)' }}>
          {err}
        </p>
      )}
    </div>
  )
}

// Concierge form for USD / AED visitors. Captures their email + plan choice
// to a Supabase `intl_billing_leads` table and (best-effort) emails the
// founder via Resend so we can hand-craft a payment link within 24 hours.
function IntlBillingPanel({ plan, currency, user, onClose }) {
  const [email, setEmail] = useState(user?.email ?? '')
  const [seats, setSeats] = useState(1)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setErr('')
    if (!email.trim()) {
      setErr('Email is required.')
      return
    }
    setBusy(true)
    const res = await requestIntlBillingLead({
      email: email.trim(),
      planSlug: plan.slug,
      currency,
      seats,
      notes: notes.trim(),
    })
    setBusy(false)
    if (!res.ok) {
      setErr(res.error || 'Something went wrong. Please email support@klosure.ai.')
      return
    }
    setDone(true)
  }

  return (
    <div
      className="mt-6 rounded-2xl p-5"
      style={{
        background: 'var(--klo-bg-elev)',
        border: '1px solid var(--klo-accent)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <MonoKicker>International billing · {plan.shortLabel}</MonoKicker>
          <h3
            className="mt-1 text-[18px] font-semibold"
            style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
          >
            We'll send you an invoice in 24 hours
          </h3>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--klo-text-dim)' }}>
            Auto-debit for international cards activates in early June. In the
            meantime, drop your email and we'll send a Razorpay payment link
            sized for your team. You can also start your 14-day trial right now
            — no payment required.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-[18px]"
          style={{ color: 'var(--klo-text-mute)', background: 'none', border: 'none' }}
        >
          ×
        </button>
      </div>

      {done ? (
        <div
          className="mt-4 rounded-lg p-3 text-[13px]"
          style={{
            background: 'var(--klo-bg)',
            border: '1px solid var(--klo-line)',
            color: 'var(--klo-text)',
          }}
        >
          Got it — we'll be in touch within 24 hours at <strong>{email}</strong>.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="kl-mono text-[11px] uppercase" style={{ color: 'var(--klo-text-mute)' }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="mt-1 w-full rounded-lg px-3 py-2.5 text-[14px]"
              style={{
                background: 'var(--klo-bg)',
                border: '1px solid var(--klo-line-strong)',
                color: 'var(--klo-text)',
              }}
            />
          </div>
          <div>
            <label className="kl-mono text-[11px] uppercase" style={{ color: 'var(--klo-text-mute)' }}>
              Seats (estimated)
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={seats}
              onChange={(e) => setSeats(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 w-32 rounded-lg px-3 py-2.5 text-[14px]"
              style={{
                background: 'var(--klo-bg)',
                border: '1px solid var(--klo-line-strong)',
                color: 'var(--klo-text)',
              }}
            />
          </div>
          <div>
            <label className="kl-mono text-[11px] uppercase" style={{ color: 'var(--klo-text-mute)' }}>
              Notes (optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything we should know? Payment preference (wire / card), preferred currency, billing entity, etc."
              className="mt-1 w-full rounded-lg px-3 py-2.5 text-[13px]"
              style={{
                background: 'var(--klo-bg)',
                border: '1px solid var(--klo-line-strong)',
                color: 'var(--klo-text)',
              }}
            />
          </div>
          {err && (
            <p className="text-[12px]" style={{ color: 'var(--klo-danger)' }}>
              {err}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--klo-text)', color: 'white', border: 'none' }}
          >
            {busy ? 'Sending…' : 'Send me an invoice'}
          </button>
        </form>
      )}
    </div>
  )
}
