import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { Eyebrow, MonoKicker } from '../components/shared/index.js'

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
    <div className="max-w-xl mx-auto px-6 py-10">
      <Eyebrow>Settings · Security</Eyebrow>
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
        Change password.
      </h1>
      <p className="mt-2 text-[15px]" style={{ color: 'var(--klo-text-dim)' }}>
        Update your password and secure active sessions.
      </p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit}>
        <Field label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" required />
        <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" required />
        <Field label="Confirm new password" type="password" value={confirmNewPassword} onChange={setConfirmNewPassword} autoComplete="new-password" required />

        <div
          className="text-[13px] rounded-lg px-3.5 py-3"
          style={{
            background: 'var(--klo-surface)',
            border: '1px solid var(--klo-line)',
            color: 'var(--klo-text-dim)',
          }}
        >
          Password policy: minimum {MIN_PASSWORD_LENGTH} characters with uppercase, lowercase, number, and symbol.
        </div>

        <label
          className="flex items-start gap-2 text-[14px]"
          style={{ color: 'var(--klo-text)' }}
        >
          <input
            type="checkbox"
            checked={invalidateOtherSessions}
            onChange={(e) => setInvalidateOtherSessions(e.target.checked)}
            className="mt-0.5"
          />
          Invalidate other active sessions after password change (if supported)
        </label>

        <label
          className="flex items-start gap-2 text-[14px]"
          style={{ color: 'var(--klo-text)' }}
        >
          <input
            type="checkbox"
            checked={requireFreshLogin}
            onChange={(e) => setRequireFreshLogin(e.target.checked)}
            className="mt-0.5"
          />
          Require fresh login immediately after password change
        </label>

        {error && (
          <div
            className="text-[14px] rounded-lg px-3 py-2"
            style={{
              background: 'var(--klo-bg-elev)',
              border: '1px solid var(--klo-line)',
              borderLeft: '3px solid var(--klo-danger)',
              color: 'var(--klo-danger)',
            }}
          >
            {error}
          </div>
        )}
        {success && (
          <div
            className="text-[14px] rounded-lg px-3 py-2"
            style={{
              background: 'var(--klo-bg-elev)',
              border: '1px solid var(--klo-line)',
              borderLeft: '3px solid var(--klo-good)',
              color: 'var(--klo-good)',
            }}
          >
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="font-medium text-[14px] rounded-lg px-5 py-2.5 disabled:opacity-50"
          style={{ background: 'var(--klo-text)', color: '#fff' }}
        >
          {submitting ? 'Updating…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, ...props }) {
  return (
    <label className="block">
      <MonoKicker>{label}</MonoKicker>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-lg px-3 py-2.5 text-[14px] focus:outline-none"
        style={{
          background: 'var(--klo-bg)',
          border: '1px solid var(--klo-line-strong)',
          color: 'var(--klo-text)',
        }}
        {...props}
      />
    </label>
  )
}
