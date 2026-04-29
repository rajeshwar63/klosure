import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { PLANS } from '../lib/plans.js'
import { startCheckout, openCustomerPortal } from '../services/billing.js'
import { requestAccountDeletion } from '../services/accountDeletion.js'

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
    <div className="min-h-screen bg-[#f5f6f8]">
      <header className="bg-navy text-white">
        <div
          className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <button onClick={() => navigate(-1)} className="text-white/70 hover:text-white text-lg">‹</button>
          <h1 className="font-bold text-lg">Billing & plans</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-6 pb-20">
        <div className="bg-white border border-navy/10 rounded-2xl p-4 mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-navy/50 font-semibold">Current plan</p>
            <p className="text-lg font-semibold text-navy">{PLANS[currentPlan]?.name || 'Free'}</p>
            {periodEnd && (
              <p className="text-xs text-navy/60">
                Renews {new Date(periodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
          {hasStripe && (
            <button
              onClick={handleManage}
              disabled={busy === 'manage'}
              className="text-sm bg-white border border-navy/15 hover:border-klo text-navy/80 hover:text-navy px-4 py-2 rounded-lg"
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

        <p className="text-[11px] text-navy/50 mt-6 text-center">
          Prices in USD. Gulf entities billed via Stripe; VAT applied where required.
          Cancel anytime — your archived deals stay forever.
        </p>

        <div className="mt-8 text-center">
          <Link to="/deals" className="text-sm text-klo hover:underline">
            ← Back to deals
          </Link>
        </div>

        <section className="mt-10 border border-red-200 bg-red-50 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-red-900">Danger zone — Delete account</h2>
          {!deleteDone ? (
            <>
              <p className="text-sm text-red-900/85 mt-2 leading-relaxed">
                Deleting your account is permanent and cannot be undone. You will lose access to all deals,
                messages, team history, and billing records tied to this account.
              </p>
              <p className="text-sm text-red-900/85 mt-2">
                Data deletion starts immediately after confirmation and follows our retention policy.
                {import.meta.env.VITE_ACCOUNT_DELETION_GRACE_DAYS
                  ? ` If your workspace has a ${import.meta.env.VITE_ACCOUNT_DELETION_GRACE_DAYS}-day grace period, data remains recoverable only during that window.`
                  : ' No grace period is configured for this workspace.'}
              </p>

              <form onSubmit={handleDeleteAccount} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-red-900/80 mb-1">
                    Re-authenticate (password or MFA)
                  </label>
                  <input
                    type="password"
                    value={deleteForm.password}
                    onChange={(e) => setDeleteForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="Password"
                    className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={deleteForm.mfaCode}
                    onChange={(e) => setDeleteForm((prev) => ({ ...prev, mfaCode: e.target.value }))}
                    placeholder="Or enter MFA code"
                    className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm mt-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-red-900/80 mb-1">
                    Type <span className="font-bold">{deleteToken}</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteForm.typed}
                    onChange={(e) => setDeleteForm((prev) => ({ ...prev, typed: e.target.value }))}
                    className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                {deleteError && <p className="text-sm text-red-700">{deleteError}</p>}
                <button
                  type="submit"
                  disabled={deleteBusy}
                  className="w-full sm:w-auto rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold px-4 py-2"
                >
                  {deleteBusy ? 'Deleting account…' : 'Delete my account permanently'}
                </button>
              </form>
            </>
          ) : (
            <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900">Your deletion request is confirmed.</p>
              <p className="text-sm text-emerald-900/90 mt-1">
                All sessions have been revoked and the account deletion workflow has started.
              </p>
              <p className="text-sm text-emerald-900/90 mt-1">
                Need help? Contact support at <a href="mailto:support@klosure.ai" className="underline">support@klosure.ai</a>.
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
      className={`bg-white border rounded-2xl p-5 flex flex-col ${
        featured ? 'border-klo shadow-lg' : 'border-navy/10'
      }`}
    >
      <p className="text-xs uppercase tracking-wider font-semibold text-klo">{plan.name}</p>
      <p className="text-2xl font-bold text-navy mt-1">{plan.priceLabel}</p>
      <p className="text-sm text-navy/60 mt-2 leading-snug">{plan.description}</p>
      <ul className="text-sm text-navy/70 mt-3 space-y-1.5 flex-1">
        <Feature ok={plan.activeDealLimit === Infinity}>
          {plan.activeDealLimit === Infinity ? 'Unlimited deals' : `${plan.activeDealLimit} active deal`}
        </Feature>
        <Feature ok={plan.canShare}>Shared rooms with buyers</Feature>
        <Feature ok={plan.canUseManagerView}>Manager view across reps</Feature>
        <Feature ok={plan.canUseManagerKlo}>Klo team-pipeline coaching</Feature>
      </ul>
      {isCurrent ? (
        <div className="mt-4 text-center text-sm font-semibold text-navy/60 border border-navy/10 rounded-xl py-2.5">
          Your plan
        </div>
      ) : plan.id === 'free' ? (
        <div className="mt-4 text-center text-sm text-navy/40 py-2.5">—</div>
      ) : (
        <button
          onClick={onUpgrade}
          disabled={busy}
          className={`mt-4 font-semibold py-2.5 rounded-xl ${
            featured ? 'bg-klo hover:bg-klo/90 text-white' : 'bg-white border border-klo text-klo hover:bg-klo/10'
          }`}
        >
          {busy ? 'Loading…' : `Upgrade to ${plan.name}`}
        </button>
      )}
    </div>
  )
}

function Feature({ ok, children }) {
  return (
    <li className={`flex items-start gap-2 ${ok ? '' : 'text-navy/30 line-through'}`}>
      <span className={ok ? 'text-emerald-500' : 'text-navy/30'}>{ok ? '✓' : '·'}</span>
      <span>{children}</span>
    </li>
  )
}
