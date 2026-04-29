import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { PLANS } from '../lib/plans.js'
import { startCheckout, openCustomerPortal } from '../services/billing.js'
import { requestAccountDeletion } from '../services/accountDeletion.js'
import { Eyebrow, MonoKicker, MonoTimestamp } from '../components/shared/index.js'
import CreateTeamSection from '../components/billing/CreateTeamSection.jsx'

export default function BillingPage() {
  const { user, signOut } = useAuth()
  const { plan, profile, team } = useProfile()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [deleteForm, setDeleteForm] = useState({ password: '', mfaCode: '', typed: '' })
  const [deleteError, setDeleteError] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteDone, setDeleteDone] = useState(null)

  async function handleUpgrade(targetPlan) {
    setError('')
    setBusy(targetPlan)
    const res = await startCheckout({
      plan: targetPlan,
      successUrl: window.location.origin + '/deals?billing=ok',
      cancelUrl: window.location.origin + '/billing',
    })
    setBusy(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    window.location.href = res.url
  }

  async function handleManage() {
    setError('')
    setBusy('manage')
    const res = await openCustomerPortal({ returnUrl: window.location.origin + '/billing' })
    setBusy(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    window.location.href = res.url
  }

  const currentPlan = plan || 'free'
  const periodEnd = team?.current_period_end || profile?.current_period_end
  const hasStripe = Boolean(profile?.stripe_customer_id)
  const deleteToken = user?.email || 'DELETE'

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
          className="max-w-3xl mx-auto px-4 md:px-6 pt-8 pb-6"
          style={{ paddingTop: 'max(2rem, calc(env(safe-area-inset-top) + 1rem))' }}
        >
          <button
            onClick={() => navigate(-1)}
            className="kl-mono text-[12px] mb-2"
            style={{ color: 'var(--klo-text-mute)' }}
          >
            ← Back
          </button>
          <Eyebrow>Settings · Billing</Eyebrow>
          <h1
            className="mt-3"
            style={{
              fontSize: 'clamp(28px, 3.4vw, 36px)',
              fontWeight: 600,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              color: 'var(--klo-text)',
            }}
          >
            Billing &amp; plans.
          </h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 pt-8 pb-20">
        <div
          className="rounded-2xl p-5 mb-6 flex items-center justify-between gap-3"
          style={{
            background: 'var(--klo-bg-elev)',
            border: '1px solid var(--klo-line)',
          }}
        >
          <div>
            <MonoKicker>Current plan</MonoKicker>
            <p
              className="mt-2 text-[20px] font-semibold"
              style={{ color: 'var(--klo-text)', letterSpacing: '-0.02em' }}
            >
              {PLANS[currentPlan]?.name || 'Free'}
            </p>
            {periodEnd && (
              <MonoTimestamp className="mt-1 block">
                Renews · {new Date(periodEnd).toLocaleDateString()}
              </MonoTimestamp>
            )}
          </div>
          {hasStripe && (
            <button
              onClick={handleManage}
              disabled={busy === 'manage'}
              className="text-[13px] rounded-lg px-4 py-2"
              style={{
                background: 'transparent',
                border: '1px solid var(--klo-line-strong)',
                color: 'var(--klo-text)',
              }}
            >
              {busy === 'manage' ? 'Opening…' : 'Manage payment'}
            </button>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        <CreateTeamSection />

        <div className="grid sm:grid-cols-3 gap-3">
          {Object.values(PLANS).map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              isCurrent={currentPlan === p.id}
              onUpgrade={() => handleUpgrade(p.id)}
              busy={busy === p.id}
            />
          ))}
        </div>

        <p
          className="kl-mono text-[11px] mt-6 text-center uppercase"
          style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.05em' }}
        >
          Prices in USD · Gulf entities billed via Stripe · Cancel anytime
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

function PlanCard({ plan, isCurrent, onUpgrade, busy }) {
  const featured = plan.id === 'pro'
  return (
    <div
      className="rounded-2xl p-5 flex flex-col"
      style={{
        background: featured
          ? 'linear-gradient(180deg, var(--klo-accent-soft), transparent 200px), var(--klo-bg-elev)'
          : 'var(--klo-bg-elev)',
        border: featured ? '1px solid var(--klo-accent-line)' : '1px solid var(--klo-line)',
      }}
    >
      <p
        className="kl-mono text-[12px] uppercase"
        style={{
          color: featured ? 'var(--klo-accent)' : 'var(--klo-text-mute)',
          letterSpacing: '0.12em',
        }}
      >
        {plan.name}
      </p>
      <p
        className="mt-2 tabular-nums"
        style={{
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: '-0.03em',
          color: 'var(--klo-text)',
        }}
      >
        {plan.priceLabel}
      </p>
      <p className="text-[14px] mt-2 leading-snug" style={{ color: 'var(--klo-text-dim)' }}>
        {plan.description}
      </p>
      <ul
        className="text-[14px] mt-4 space-y-2 flex-1 pt-4"
        style={{ borderTop: '1px solid var(--klo-line)' }}
      >
        <Feature ok={plan.activeDealLimit === Infinity}>
          {plan.activeDealLimit === Infinity ? 'Unlimited deals' : `${plan.activeDealLimit} active deal`}
        </Feature>
        <Feature ok={plan.canShare}>Shared rooms with buyers</Feature>
        <Feature ok={plan.canUseManagerView}>Manager view across reps</Feature>
        <Feature ok={plan.canUseManagerKlo}>Klo team-pipeline coaching</Feature>
      </ul>
      {isCurrent ? (
        <div
          className="mt-4 text-center kl-mono text-[12px] uppercase rounded-lg py-2.5"
          style={{
            color: 'var(--klo-text-mute)',
            border: '1px solid var(--klo-line)',
            letterSpacing: '0.12em',
          }}
        >
          Your plan
        </div>
      ) : plan.id === 'free' ? (
        <div
          className="mt-4 text-center kl-mono text-[12px] py-2.5"
          style={{ color: 'var(--klo-text-mute)' }}
        >
          —
        </div>
      ) : (
        <button
          onClick={onUpgrade}
          disabled={busy}
          className="mt-4 font-medium text-[14px] py-2.5 rounded-lg disabled:opacity-50"
          style={{
            background: featured ? 'var(--klo-text)' : 'transparent',
            color: featured ? '#fff' : 'var(--klo-text)',
            border: featured ? '1px solid var(--klo-text)' : '1px solid var(--klo-line-strong)',
          }}
        >
          {busy ? 'Loading…' : `Upgrade to ${plan.name}`}
        </button>
      )}
    </div>
  )
}

function Feature({ ok, children }) {
  return (
    <li
      className="flex items-start gap-2"
      style={ok ? {} : { color: 'var(--klo-text-mute)', textDecoration: 'line-through' }}
    >
      <span style={{ color: ok ? 'var(--klo-good)' : 'var(--klo-text-mute)' }}>
        {ok ? '✓' : '·'}
      </span>
      <span style={{ color: ok ? 'var(--klo-text-dim)' : 'inherit' }}>{children}</span>
    </li>
  )
}
