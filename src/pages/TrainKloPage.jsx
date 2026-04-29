// Phase 8 step 02 + Phase 9 step 05 — Train Klo settings page.
//
// Single-screen profile form. Saves seller_profiles for Klo coaching plus
// editable user basics, optional UI preferences (localStorage), and security
// actions (password reset, change password, sign out).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBeforeUnload, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { supabase } from '../lib/supabase.js'
import { getSellerProfile, upsertSellerProfile } from '../lib/sellerProfile.js'
import TrainKloFormFields, { EMPTY_FIELDS } from '../components/onboarding/TrainKloFormFields.jsx'
import { Eyebrow, MonoKicker, MonoTimestamp } from '../components/shared/index.js'

const FIELD_MIN = 3
const FIELD_MAX = 200
const PERSONAS_MIN = 1
const PERSONAS_MAX = 5
const AVATAR_MAX_BYTES = 1.5 * 1024 * 1024

const DEFAULT_PREFS = {
  avatarUrl: '',
  displayNameFormat: 'first-name',
  timezone: '',
  locale: '',
  emailNotifications: true,
  dealDigest: true,
  inAppMentions: true,
}

function prefsKey(userId) {
  return `klosure:profile-prefs:${userId || 'anon'}`
}

function loadPrefs(userId) {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS }
  try {
    const raw = window.localStorage.getItem(prefsKey(userId))
    if (!raw) return defaultPrefs()
    const parsed = JSON.parse(raw)
    return { ...defaultPrefs(), ...parsed }
  } catch {
    return defaultPrefs()
  }
}

function defaultPrefs() {
  return {
    ...DEFAULT_PREFS,
    timezone: Intl.DateTimeFormat?.().resolvedOptions?.().timeZone || 'UTC',
    locale: (typeof navigator !== 'undefined' && navigator.language) || 'en-US',
  }
}

function relativeFromNow(ts) {
  if (!ts) return null
  const d = new Date(ts)
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000)
  if (diffSec < 30) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  const days = Math.floor(diffSec / 86400)
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  return d.toLocaleDateString()
}

export default function TrainKloPage() {
  const { user, signOut } = useAuth()
  const { profile, refresh } = useProfile()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [hadProfile, setHadProfile] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [serverError, setServerError] = useState('')
  const [resendBusy, setResendBusy] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  const [fields, setFields] = useState({ ...EMPTY_FIELDS })
  const [initialFields, setInitialFields] = useState({ ...EMPTY_FIELDS })
  const [profileBasics, setProfileBasics] = useState({ firstName: '', lastName: '', companyName: '' })
  const initialBasicsRef = useRef({ firstName: '', lastName: '', companyName: '' })
  const [errors, setErrors] = useState({})

  const [prefs, setPrefs] = useState(() => loadPrefs(user?.id))
  const [prefSavedFlash, setPrefSavedFlash] = useState(false)
  const [securityInfo, setSecurityInfo] = useState('')
  const [securityBusy, setSecurityBusy] = useState(false)

  useEffect(() => {
    setPrefs(loadPrefs(user?.id))
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    let mounted = true
    setLoading(true)
    getSellerProfile(user.id)
      .then((row) => {
        if (!mounted) return
        if (row) {
          setHadProfile(true)
          const next = {
            seller_company: row.seller_company || '',
            role: row.role || '',
            what_you_sell: row.what_you_sell || '',
            icp: row.icp || '',
            region: row.region || '',
            top_personas: Array.isArray(row.top_personas) ? row.top_personas : [],
            common_deal_killer: row.common_deal_killer || '',
          }
          setFields(next)
          setInitialFields(next)
          setUpdatedAt(row.updated_at || null)
        } else {
          setHadProfile(false)
        }
      })
      .catch((err) => {
        if (mounted) setServerError(err?.message || 'Failed to load profile')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [user])

  useEffect(() => {
    const [first = '', ...rest] = (profile?.name || '').trim().split(/\s+/)
    const basics = {
      firstName: first,
      lastName: rest.join(' '),
      companyName: fields.seller_company || '',
    }
    setProfileBasics(basics)
    initialBasicsRef.current = basics
  }, [profile?.name, fields.seller_company])

  const isDirty = useMemo(() => {
    const initialFieldsStr = JSON.stringify(initialFields)
    const fieldsStr = JSON.stringify(fields)
    const basicsChanged =
      profileBasics.firstName.trim() !== initialBasicsRef.current.firstName.trim() ||
      profileBasics.lastName.trim() !== initialBasicsRef.current.lastName.trim() ||
      profileBasics.companyName.trim() !== initialBasicsRef.current.companyName.trim()
    return initialFieldsStr !== fieldsStr || basicsChanged
  }, [fields, initialFields, profileBasics])

  useBeforeUnload(
    useMemo(
      () => (event) => {
        if (!isDirty) return
        event.preventDefault()
        event.returnValue = ''
      },
      [isDirty]
    )
  )

  const lastSavedLabel = useMemo(() => {
    if (!updatedAt) return null
    return `Last saved: ${relativeFromNow(updatedAt)}`
  }, [updatedAt])

  const accountIdentifier = useMemo(
    () => user?.email || user?.user_metadata?.username || user?.phone || 'Unknown account',
    [user],
  )
  const isVerified = useMemo(() => {
    if (!user) return false
    if (user.email) return Boolean(user.email_confirmed_at)
    if (user.phone) return Boolean(user.phone_confirmed_at)
    return false
  }, [user])

  function persistPrefs(next) {
    setPrefs(next)
    try {
      window.localStorage.setItem(prefsKey(user?.id), JSON.stringify(next))
      setPrefSavedFlash(true)
      window.clearTimeout(persistPrefs._t)
      persistPrefs._t = window.setTimeout(() => setPrefSavedFlash(false), 1500)
    } catch {
      // Storage quota or private mode — silently ignore.
    }
  }

  function updatePrefs(next) {
    persistPrefs(next)
  }

  function handleAvatarPick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setSecurityInfo('Avatar must be an image file.')
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setSecurityInfo('Avatar must be under 1.5 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (dataUrl) updatePrefs({ ...prefs, avatarUrl: dataUrl })
    }
    reader.readAsDataURL(file)
  }

  async function handleResendVerification() {
    if (!user?.email || resendBusy) return
    setResendBusy(true)
    setResendMessage('')
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: user.email,
    })
    setResendMessage(error ? (error.message || 'Could not resend verification email.') : 'Verification email sent.')
    setResendBusy(false)
  }

  async function sendPasswordReset() {
    if (!user?.email || securityBusy) return
    setSecurityBusy(true)
    setSecurityInfo('')
    const redirectTo = `${window.location.origin}/settings/password`
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo })
    setSecurityInfo(
      error ? (error.message || 'Could not send reset email.') : 'Password reset email sent.'
    )
    setSecurityBusy(false)
  }

  function validate() {
    const next = {}
    const checkText = (key, value) => {
      const v = (value || '').trim()
      if (!v) next[key] = 'Required'
      else if (v.length < FIELD_MIN) next[key] = `Too short (min ${FIELD_MIN})`
      else if (v.length > FIELD_MAX) next[key] = `Too long (max ${FIELD_MAX})`
    }
    checkText('sellerCompany', profileBasics.companyName)
    checkText('firstName', profileBasics.firstName)
    checkText('lastName', profileBasics.lastName)
    checkText('role', fields.role)
    checkText('whatYouSell', fields.what_you_sell)
    checkText('icp', fields.icp)
    checkText('region', fields.region)
    checkText('commonDealKiller', fields.common_deal_killer)
    if (!Array.isArray(fields.top_personas) || fields.top_personas.length < PERSONAS_MIN) {
      next.topPersonas = `Add at least ${PERSONAS_MIN}`
    } else if (fields.top_personas.length > PERSONAS_MAX) {
      next.topPersonas = `At most ${PERSONAS_MAX}`
    } else {
      const bad = fields.top_personas.find((p) => !p || p.length < FIELD_MIN || p.length > FIELD_MAX)
      if (bad !== undefined) next.topPersonas = `Each role: ${FIELD_MIN}-${FIELD_MAX} chars`
    }
    setErrors(next)
    return next
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError('')
    const next = validate()
    if (Object.keys(next).length > 0) return
    if (!user) return
    setSaving(true)
    try {
      const fullName = `${profileBasics.firstName.trim()} ${profileBasics.lastName.trim()}`.trim()
      await supabase.from('users').update({ name: fullName }).eq('id', user.id)
      const trimmedCompany = profileBasics.companyName.trim()
      const row = await upsertSellerProfile(user.id, {
        seller_company: trimmedCompany,
        role: fields.role.trim(),
        what_you_sell: fields.what_you_sell.trim(),
        icp: fields.icp.trim(),
        region: fields.region.trim(),
        top_personas: fields.top_personas.map((p) => p.trim()).filter(Boolean),
        common_deal_killer: fields.common_deal_killer.trim(),
      })
      setUpdatedAt(row?.updated_at || new Date().toISOString())
      const savedFields = { ...fields, seller_company: trimmedCompany }
      setFields(savedFields)
      setInitialFields(savedFields)
      initialBasicsRef.current = {
        firstName: profileBasics.firstName.trim(),
        lastName: profileBasics.lastName.trim(),
        companyName: trimmedCompany,
      }
      await refresh?.()
      setHadProfile(true)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } catch (err) {
      setServerError(err?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setFields({ ...initialFields })
    setProfileBasics({ ...initialBasicsRef.current })
    setErrors({})
    setServerError('')
  }

  async function handleSignOut() {
    if (securityBusy) return
    setSecurityBusy(true)
    try {
      await signOut()
      navigate('/login')
    } finally {
      setSecurityBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="px-4 md:px-8 py-10 max-w-[640px] mx-auto text-navy/60 text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="px-4 md:px-8 py-8 md:py-12 max-w-[760px] mx-auto">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="kl-mono text-[12px]"
          style={{ color: 'var(--klo-text-mute)' }}
        >
          ← Back
        </button>
      </div>

      <header className="mb-10">
        <Eyebrow>Train Klo</Eyebrow>
        <h1
          className="mt-3"
          style={{
            fontSize: 'clamp(32px, 4vw, 44px)',
            fontWeight: 600,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            color: 'var(--klo-text)',
          }}
        >
          What should Klo know about how you sell?
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed" style={{ color: 'var(--klo-text-dim)' }}>
          Six questions. Two minutes. Then Klo stops being generic.
        </p>
      </header>

      {!hadProfile && (
        <div
          className="mb-6 rounded-2xl px-5 py-4 text-[14px] leading-relaxed"
          style={{
            background: 'var(--klo-accent-soft)',
            border: '1px solid var(--klo-accent-line)',
            color: 'var(--klo-text)',
          }}
        >
          <strong>Klo is currently using generic coaching.</strong>{' '}
          Fill these in to get advice tailored to your role, market, and deal patterns.
        </div>
      )}

      {serverError && (
        <div
          className="mb-4 rounded-lg px-3.5 py-2.5 text-[14px]"
          style={{
            background: 'var(--klo-bg-elev)',
            border: '1px solid var(--klo-line)',
            borderLeft: '3px solid var(--klo-danger)',
            color: 'var(--klo-danger)',
          }}
        >
          {serverError}
        </div>
      )}

      <section
        className="mb-6 rounded-2xl px-5 py-5"
        style={{
          background: 'var(--klo-bg-elev)',
          border: '1px solid var(--klo-line)',
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <MonoKicker>Account</MonoKicker>
          <span
            className="kl-mono inline-flex items-center rounded-full px-2.5 py-1 text-[11px] uppercase"
            style={{
              color: isVerified ? 'var(--klo-good)' : 'var(--klo-warn)',
              border: `1px solid ${
                isVerified ? 'rgba(30,138,82,0.24)' : 'rgba(181,120,30,0.24)'
              }`,
              letterSpacing: '0.05em',
            }}
          >
            {isVerified ? 'Verified' : 'Unverified'}
          </span>
        </div>
        <div className="text-[14px] break-all" style={{ color: 'var(--klo-text)' }}>
          {accountIdentifier}
        </div>
        {!isVerified && user?.email && (
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendBusy}
              className="text-[12px] font-medium hover:underline disabled:opacity-50"
              style={{ color: 'var(--klo-accent)' }}
            >
              {resendBusy ? 'Sending…' : 'Resend verification email'}
            </button>
            {resendMessage && (
              <span className="text-[12px]" style={{ color: 'var(--klo-text-dim)' }}>
                {resendMessage}
              </span>
            )}
          </div>
        )}
      </section>

      <form onSubmit={handleSubmit}>
        <div className="space-y-4 mb-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <BasicField
              label="First name"
              value={profileBasics.firstName}
              onChange={(v) => setProfileBasics((p) => ({ ...p, firstName: v }))}
              error={errors.firstName}
            />
            <BasicField
              label="Last name"
              value={profileBasics.lastName}
              onChange={(v) => setProfileBasics((p) => ({ ...p, lastName: v }))}
              error={errors.lastName}
            />
          </div>
          <BasicField
            label="Company name"
            value={profileBasics.companyName}
            onChange={(v) => setProfileBasics((p) => ({ ...p, companyName: v }))}
            error={errors.sellerCompany}
          />
        </div>
        <TrainKloFormFields fields={fields} setFields={setFields} errors={errors} />

        <div className="flex items-center justify-end gap-3 pt-8 flex-wrap">
          {lastSavedLabel && !savedFlash && (
            <MonoTimestamp>{lastSavedLabel}</MonoTimestamp>
          )}
          <button
            type="button"
            onClick={handleCancel}
            disabled={!isDirty || saving}
            className="font-medium text-[14px] px-5 py-2.5 rounded-lg disabled:opacity-50"
            style={{
              background: 'transparent',
              border: '1px solid var(--klo-line-strong)',
              color: 'var(--klo-text)',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !isDirty}
            className="font-medium text-[14px] px-5 py-2.5 rounded-lg disabled:opacity-50"
            style={{ background: 'var(--klo-text)', color: '#fff' }}
          >
            {saving ? 'Saving…' : savedFlash ? 'Saved · Klo updated' : 'Save changes'}
          </button>
        </div>
      </form>

      <section
        className="mt-10 rounded-2xl p-5"
        style={{ background: 'var(--klo-bg-elev)', border: '1px solid var(--klo-line)' }}
      >
        <Eyebrow dot={false}>Profile preferences · optional</Eyebrow>
        <p className="text-[14px] mt-2" style={{ color: 'var(--klo-text-dim)' }}>
          Personalize how Klosure appears for you. Saved on this device.
        </p>

        <div className="mt-5 grid gap-4">
          <div>
            <label className="text-xs font-medium text-navy/70">Avatar</label>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-navy/10 overflow-hidden flex items-center justify-center text-xs text-navy/60">
                {prefs.avatarUrl ? <img src={prefs.avatarUrl} alt="Avatar" className="h-full w-full object-cover" /> : 'No photo'}
              </div>
              <label className="text-sm px-3 py-1.5 rounded-lg border border-navy/15 cursor-pointer hover:bg-navy/5">
                Upload
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
              </label>
              <button
                type="button"
                onClick={() => updatePrefs({ ...prefs, avatarUrl: '' })}
                className="text-sm text-navy/70 hover:text-navy"
              >
                Remove
              </button>
            </div>
          </div>

          <label className="block">
            <span className="block text-xs font-medium text-navy/70 mb-1">Preferred display name format</span>
            <select
              value={prefs.displayNameFormat}
              onChange={(e) => updatePrefs({ ...prefs, displayNameFormat: e.target.value })}
              className="w-full border border-navy/15 rounded-lg px-3 py-2.5 text-sm"
            >
              <option value="first-name">First name only</option>
              <option value="full-name">Full name</option>
              <option value="first-last-initial">First name + last initial</option>
            </select>
          </label>

          <div className="grid sm:grid-cols-2 gap-3">
            <PrefField
              label="Time zone"
              value={prefs.timezone}
              onChange={(v) => updatePrefs({ ...prefs, timezone: v })}
              placeholder="America/Los_Angeles"
            />
            <PrefField
              label="Locale"
              value={prefs.locale}
              onChange={(v) => updatePrefs({ ...prefs, locale: v })}
              placeholder="en-US"
            />
          </div>

          <div>
            <p className="text-xs font-medium text-navy/70 mb-2">Notification preferences</p>
            <div className="space-y-2 text-sm text-navy/80">
              <Checkbox
                label="Email me when a buyer replies"
                checked={prefs.emailNotifications}
                onChange={(v) => updatePrefs({ ...prefs, emailNotifications: v })}
              />
              <Checkbox
                label="Weekly deal digest"
                checked={prefs.dealDigest}
                onChange={(v) => updatePrefs({ ...prefs, dealDigest: v })}
              />
              <Checkbox
                label="In-app mentions and reminders"
                checked={prefs.inAppMentions}
                onChange={(v) => updatePrefs({ ...prefs, inAppMentions: v })}
              />
            </div>
          </div>
          {prefSavedFlash && <p className="text-xs text-emerald-700">Preferences saved.</p>}
        </div>
      </section>

      <section
        className="mt-6 rounded-2xl p-5"
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
          Security actions
        </h2>
        <p className="text-[14px] mt-1" style={{ color: 'var(--klo-text-dim)' }}>
          Manage password and active access separately from profile preferences.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/settings/password"
            className="text-[13px] px-3.5 py-2 rounded-lg"
            style={{
              border: '1px solid var(--klo-line-strong)',
              color: 'var(--klo-text)',
            }}
          >
            Change password
          </Link>
          <button
            type="button"
            onClick={sendPasswordReset}
            disabled={securityBusy || !user?.email}
            className="text-[13px] px-3.5 py-2 rounded-lg disabled:opacity-50"
            style={{
              border: '1px solid var(--klo-line-strong)',
              color: 'var(--klo-text)',
            }}
          >
            Send password reset email
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={securityBusy}
            className="text-[13px] px-3.5 py-2 rounded-lg disabled:opacity-50"
            style={{
              border: '1px solid var(--klo-danger)',
              color: 'var(--klo-danger)',
            }}
          >
            Sign out
          </button>
          <Link
            to="/billing"
            className="text-[13px] px-3.5 py-2 rounded-lg"
            style={{
              border: '1px solid var(--klo-danger)',
              color: 'var(--klo-danger)',
            }}
          >
            Delete account
          </Link>
        </div>
        {securityInfo && (
          <p className="text-[12px] mt-2" style={{ color: 'var(--klo-text-dim)' }}>
            {securityInfo}
          </p>
        )}
      </section>

      <div className="mt-10 text-center">
        <Link
          to="/today"
          className="text-[14px] hover:underline"
          style={{ color: 'var(--klo-accent)' }}
        >
          ← Back to Today
        </Link>
      </div>
    </div>
  )
}

function BasicField({ label, value, onChange, error }) {
  return (
    <label className="block">
      <MonoKicker>{label}</MonoKicker>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-lg px-3 py-2.5 text-[14px]"
        style={{
          background: 'var(--klo-bg)',
          border: '1px solid var(--klo-line-strong)',
          color: 'var(--klo-text)',
        }}
      />
      {error && (
        <span className="text-[12px] mt-1 block" style={{ color: 'var(--klo-danger)' }}>
          {error}
        </span>
      )}
    </label>
  )
}

function PrefField({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <MonoKicker>{label}</MonoKicker>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-lg px-3 py-2.5 text-[14px]"
        style={{
          background: 'var(--klo-bg)',
          border: '1px solid var(--klo-line-strong)',
          color: 'var(--klo-text)',
        }}
      />
    </label>
  )
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
