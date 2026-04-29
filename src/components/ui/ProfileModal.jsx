import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useProfile } from '../../hooks/useProfile.jsx'
import { getSellerProfile, upsertSellerProfile } from '../../lib/sellerProfile.js'

export default function ProfileModal({ open, onClose }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { profile, refresh } = useProfile()

  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [initialFullName, setInitialFullName] = useState('')
  const [initialCompanyName, setInitialCompanyName] = useState('')
  const [saving, setSaving] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function hydrate() {
      const initialName = profile?.name || ''
      setFullName(initialName)
      setInitialFullName(initialName)
      setInfo('')
      setError('')
      if (user?.id) {
        try {
          const sp = await getSellerProfile(user.id)
          if (cancelled) return
          const c = sp?.seller_company || ''
          setCompanyName(c)
          setInitialCompanyName(c)
        } catch {
          if (cancelled) return
          setCompanyName('')
          setInitialCompanyName('')
        }
      }
    }
    hydrate()
    return () => {
      cancelled = true
    }
  }, [open, user?.id, profile?.name])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape' && !saving && !resetBusy) onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, saving, resetBusy, onClose])

  if (!open) return null

  const dirty =
    fullName.trim() !== initialFullName.trim() ||
    companyName.trim() !== initialCompanyName.trim()

  async function handleSave(e) {
    e.preventDefault()
    if (!user?.id || saving) return
    const trimmedName = fullName.trim()
    const trimmedCompany = companyName.trim()
    if (!trimmedName) {
      setError('Full name is required.')
      return
    }
    setSaving(true)
    setError('')
    setInfo('')
    try {
      if (trimmedName !== initialFullName.trim()) {
        const { error: nameErr } = await supabase
          .from('users')
          .update({ name: trimmedName })
          .eq('id', user.id)
        if (nameErr) throw nameErr
      }
      if (trimmedCompany !== initialCompanyName.trim()) {
        await upsertSellerProfile(user.id, { seller_company: trimmedCompany })
      }
      setInitialFullName(trimmedName)
      setInitialCompanyName(trimmedCompany)
      await refresh?.()
      setInfo('Saved.')
    } catch (err) {
      setError(err?.message || 'Could not save profile.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSendPasswordReset() {
    if (!user?.email || resetBusy) return
    setResetBusy(true)
    setInfo('')
    setError('')
    const redirectTo = `${window.location.origin}/settings/password`
    const { error: rpErr } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo })
    if (rpErr) {
      setError(rpErr.message || 'Could not send reset email.')
    } else {
      setInfo('Password reset email sent. Check your inbox.')
    }
    setResetBusy(false)
  }

  function handleDeleteAccount() {
    onClose?.()
    navigate('/billing')
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <form
        onSubmit={handleSave}
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-navy/10"
      >
        <div className="px-5 pt-5 pb-3">
          <p className="text-[11px] font-semibold tracking-wider text-klo uppercase mb-1">◆ Klosure</p>
          <h2 id="profile-modal-title" className="text-base font-semibold text-navy">
            Your profile
          </h2>
          <p className="mt-1 text-xs text-navy/60">
            {user?.email}
          </p>
        </div>

        <div className="px-5 pb-4 flex flex-col gap-4">
          <label className="block">
            <span className="text-[12px] font-medium text-navy/75">Full name</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
              className="mt-1 w-full rounded-md border border-navy/15 bg-white px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-klo/20 focus:border-klo/35"
            />
          </label>

          <label className="block">
            <span className="text-[12px] font-medium text-navy/75">Company name</span>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              maxLength={120}
              className="mt-1 w-full rounded-md border border-navy/15 bg-white px-3 py-2 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-klo/20 focus:border-klo/35"
            />
          </label>

          <div className="border-t border-navy/10 pt-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-navy">Change password</p>
              <p className="text-[11px] text-navy/60">We’ll email you a secure reset link.</p>
            </div>
            <button
              type="button"
              onClick={handleSendPasswordReset}
              disabled={resetBusy}
              className="px-3 py-1.5 rounded-md border border-navy/15 text-[12px] text-navy/80 hover:bg-navy/5 disabled:opacity-50"
            >
              {resetBusy ? 'Sending…' : 'Email me a link'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-red-600">Delete account</p>
              <p className="text-[11px] text-navy/60">Permanently remove your data.</p>
            </div>
            <button
              type="button"
              onClick={handleDeleteAccount}
              className="px-3 py-1.5 rounded-md border border-red-200 text-[12px] text-red-600 hover:bg-red-50"
            >
              Delete…
            </button>
          </div>

          {(info || error) && (
            <p className={`text-[12px] ${error ? 'text-red-600' : 'text-emerald-700'}`}>
              {error || info}
            </p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-navy/10 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl border border-navy/15 text-navy/75 hover:bg-navy/5 disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="submit"
            disabled={saving || !dirty}
            className="px-4 py-2 rounded-xl font-semibold bg-klo hover:bg-klo/90 text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
