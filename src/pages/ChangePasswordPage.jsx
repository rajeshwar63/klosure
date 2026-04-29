import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'

const MIN_PASSWORD_LENGTH = 12
const STRENGTH_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/

function validatePasswordStrength(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (!STRENGTH_PATTERN.test(password)) {
    return 'Password must include uppercase, lowercase, number, and symbol.'
  }
  return ''
}

export default function ChangePasswordPage() {
  const { changePassword, signOutOthers, signOut } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [invalidateOtherSessions, setInvalidateOtherSessions] = useState(true)
  const [requireFreshLogin, setRequireFreshLogin] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const strengthError = useMemo(() => validatePasswordStrength(newPassword), [newPassword])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!currentPassword) return setError('Enter your current password.')
    if (newPassword !== confirmNewPassword) return setError('New password and confirmation must match.')
    if (strengthError) return setError(strengthError)
    if (currentPassword === newPassword) return setError('New password must be different from your current password.')

    setSubmitting(true)
    try {
      const { error: updateError } = await changePassword({ newPassword })
      if (updateError) {
        const msg = updateError?.message || 'Unable to change password.'
        const reuseSignal = /(reuse|same password|previous password|history)/i.test(msg)
        if (reuseSignal) {
          throw new Error('This password cannot be reused. Please pick a new password.')
        }
        throw updateError
      }

      let sessionNote = ''
      if (invalidateOtherSessions) {
        const { error: signOutOthersError, supported } = await signOutOthers()
        if (!supported) {
          sessionNote = ' Password updated. Session invalidation for other devices is not supported in this environment.'
        } else if (signOutOthersError) {
          sessionNote = ' Password updated, but we could not invalidate all other sessions.'
        } else {
          sessionNote = ' Other active sessions were invalidated.'
        }
      }

      if (requireFreshLogin) {
        setSuccess('Password updated. You must log in again to continue.')
        await signOut()
        return
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setSuccess(`Password changed successfully.${sessionNote}`)
    } catch (err) {
      setError(err?.message || 'Unable to change password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-navy">Change password</h1>
      <p className="mt-1 text-sm text-navy/60">Update your password and secure active sessions.</p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <Field label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" required />
        <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" required />
        <Field label="Confirm new password" type="password" value={confirmNewPassword} onChange={setConfirmNewPassword} autoComplete="new-password" required />

        <div className="text-xs text-navy/70 bg-slate-50 border border-slate-200 rounded-lg p-3">
          Password policy: minimum {MIN_PASSWORD_LENGTH} characters with uppercase, lowercase, number, and symbol.
        </div>

        <label className="flex items-start gap-2 text-sm text-navy">
          <input type="checkbox" checked={invalidateOtherSessions} onChange={(e) => setInvalidateOtherSessions(e.target.checked)} className="mt-0.5" />
          Invalidate other active sessions after password change (if supported)
        </label>

        <label className="flex items-start gap-2 text-sm text-navy">
          <input type="checkbox" checked={requireFreshLogin} onChange={(e) => setRequireFreshLogin(e.target.checked)} className="mt-0.5" />
          Require fresh login immediately after password change
        </label>

        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}
        {success && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{success}</div>}

        <button type="submit" disabled={submitting} className="bg-klo text-white font-semibold rounded-xl px-4 py-2.5 disabled:opacity-50">
          {submitting ? 'Updating…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, ...props }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-navy mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-navy/15 rounded-lg px-3 py-2.5 focus:outline-none focus:border-klo focus:ring-2 focus:ring-klo/20"
        {...props}
      />
    </label>
  )
}
