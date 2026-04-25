import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile.jsx'
import { PLANS } from '../lib/plans.js'
import { startCheckout, openCustomerPortal } from '../services/billing.js'

export default function BillingPage() {
  const { plan, profile, team } = useProfile()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

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

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <header className="bg-navy text-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
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
