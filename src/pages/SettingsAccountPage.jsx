// =============================================================================
// SettingsAccountPage — danger zone
// =============================================================================
// Account deletion flow, lifted from BillingPage's "Danger zone" section.
// BillingPage still keeps its copy for now to avoid breaking the existing
// /billing flow; a Phase B cleanup can drop it from BillingPage once we've
// verified the new path works.
// =============================================================================

import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { requestAccountDeletion } from '../services/accountDeletion.js'

export default function SettingsAccountPage() {
  const { user, signOut } = useAuth()
  const [form, setForm] = useState({ password: '', mfaCode: '', typed: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const confirmToken = user?.email || 'DELETE'

  async function handleDelete(e) {
    e.preventDefault()
    setError('')
    if (!user?.email) {
      setError('Could not verify your account email.')
      return
    }
    if (!form.password.trim() && !form.mfaCode.trim()) {
      setError('Confirm your identity with either password or MFA code.')
      return
    }
    if (form.typed.trim() !== confirmToken) {
      setError(`Type ${confirmToken} exactly to continue.`)
      return
    }

    setBusy(true)
    try {
      if (form.password.trim()) {
        const { error: reauthErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: form.password,
        })
        if (reauthErr) throw new Error(reauthErr.message || 'Password verification failed.')
      } else {
        const { data: factors, error: factorsErr } = await supabase.auth.mfa.listFactors()
        if (factorsErr) throw new Error(factorsErr.message || 'Could not load MFA factors.')
        const factor = factors?.totp?.[0]
        if (!factor) throw new Error('No MFA factor found. Use password instead.')
        const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
          factorId: factor.id,
        })
        if (challengeErr) throw new Error(challengeErr.message || 'Could not start MFA challenge.')
        const { error: verifyErr } = await supabase.auth.mfa.verify({
          factorId: factor.id,
          challengeId: challenge.id,
          code: form.mfaCode.trim(),
        })
        if (verifyErr) throw new Error(verifyErr.message || 'Invalid MFA code.')
      }

      const result = await requestAccountDeletion()
      await signOut()
      setDone(result)
    } catch (err) {
      setError(err?.message || 'Account deletion failed.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="bg-white rounded-2xl p-5 border border-emerald-200 border-l-4 border-l-emerald-500 max-w-2xl">
        <p className="text-[14px] font-medium text-emerald-700">
          Your deletion request is confirmed.
        </p>
        <p className="text-[14px] text-navy/65 mt-1">
          All sessions have been revoked and the account deletion workflow has started.
        </p>
        <p className="text-[14px] text-navy/65 mt-1">
          Need help? Contact support at{' '}
          <a href="mailto:support@klosure.ai" className="underline text-klo">
            support@klosure.ai
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <section className="bg-white rounded-2xl p-5 border border-red-200 border-l-4 border-l-red-500">
        <h2 className="text-[13px] font-semibold tracking-wider text-red-700 uppercase">
          Danger zone
        </h2>
        <h3 className="mt-2 text-[18px] font-semibold text-navy">Delete account</h3>

        <p className="text-[14px] mt-3 leading-relaxed text-navy/65">
          Deleting your account is permanent and cannot be undone. You will lose access to all
          deals, messages, team history, and billing records tied to this account.
        </p>
        <p className="text-[14px] mt-2 leading-relaxed text-navy/65">
          Data deletion starts immediately after confirmation and follows our retention policy.
          {import.meta.env.VITE_ACCOUNT_DELETION_GRACE_DAYS
            ? ` If your workspace has a ${import.meta.env.VITE_ACCOUNT_DELETION_GRACE_DAYS}-day grace period, data remains recoverable only during that window.`
            : ' No grace period is configured for this workspace.'}
        </p>

        <form onSubmit={handleDelete} className="mt-5 space-y-3">
          <div>
            <label className="text-[11px] font-semibold tracking-wider uppercase text-navy/55 kl-mono">
              Re-authenticate · password or MFA
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="Password"
              className="mt-2 w-full rounded-lg px-3 py-2.5 text-[14px] border border-navy/20 bg-white"
            />
            <input
              type="text"
              value={form.mfaCode}
              onChange={(e) => setForm((p) => ({ ...p, mfaCode: e.target.value }))}
              placeholder="Or enter MFA code"
              className="mt-2 w-full rounded-lg px-3 py-2.5 text-[14px] border border-navy/20 bg-white"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold tracking-wider uppercase text-navy/55 kl-mono">
              Type {confirmToken} to confirm
            </label>
            <input
              type="text"
              value={form.typed}
              onChange={(e) => setForm((p) => ({ ...p, typed: e.target.value }))}
              className="mt-2 w-full rounded-lg px-3 py-2.5 text-[14px] border border-navy/20 bg-white"
            />
          </div>
          {error && <p className="text-[13px] text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full sm:w-auto rounded-lg text-[14px] px-5 py-2.5 disabled:opacity-50 text-red-700 border border-red-500 bg-transparent hover:bg-red-50"
          >
            {busy ? 'Deleting account…' : 'Delete my account permanently'}
          </button>
        </form>
      </section>
    </div>
  )
}
