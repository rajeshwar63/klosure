// Phase 8 step 02 + Phase 9 step 05 — Train Klo settings page.
//
// Single-screen form, 7 fields. Saves to seller_profiles. Becomes live for
// the next chat turn — no app restart needed.

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { getSellerProfile, upsertSellerProfile } from '../lib/sellerProfile.js'
import TrainKloFormFields, { EMPTY_FIELDS } from '../components/onboarding/TrainKloFormFields.jsx'
import { supabase } from '../lib/supabase.js'

const FIELD_MIN = 3
const FIELD_MAX = 200
const PERSONAS_MIN = 1
const PERSONAS_MAX = 5

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
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [hadProfile, setHadProfile] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [serverError, setServerError] = useState('')

  const [fields, setFields] = useState({ ...EMPTY_FIELDS })
  const [errors, setErrors] = useState({})
  const [prefs, setPrefs] = useState({
    avatarUrl: '',
    displayNameFormat: 'first-name',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    locale: navigator?.language || 'en-US',
    emailNotifications: true,
    dealDigest: true,
    inAppMentions: true,
  })
  const [prefSavedFlash, setPrefSavedFlash] = useState(false)
  const [securityInfo, setSecurityInfo] = useState('')

  useEffect(() => {
    if (!user) return
    let mounted = true
    setLoading(true)
    getSellerProfile(user.id)
      .then((row) => {
        if (!mounted) return
        if (row) {
          setHadProfile(true)
          setFields({
            seller_company: row.seller_company || '',
            role: row.role || '',
            what_you_sell: row.what_you_sell || '',
            icp: row.icp || '',
            region: row.region || '',
            top_personas: Array.isArray(row.top_personas) ? row.top_personas : [],
            common_deal_killer: row.common_deal_killer || '',
          })
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

  const lastSavedLabel = useMemo(() => {
    if (!updatedAt) return null
    return `Last saved: ${relativeFromNow(updatedAt)}`
  }, [updatedAt])

  useEffect(() => {
    if (!user?.id) return
    const raw = localStorage.getItem(`klo.profilePrefs.${user.id}`)
    if (!raw) return
    try {
      setPrefs((prev) => ({ ...prev, ...JSON.parse(raw) }))
    } catch {
      // ignore parse errors for corrupted local cache
    }
  }, [user?.id])

  function updatePrefs(next) {
    setPrefs(next)
    if (user?.id) {
      localStorage.setItem(`klo.profilePrefs.${user.id}`, JSON.stringify(next))
    }
    setPrefSavedFlash(true)
    setTimeout(() => setPrefSavedFlash(false), 1200)
  }

  async function handleAvatarPick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => updatePrefs({ ...prefs, avatarUrl: String(reader.result || '') })
    reader.readAsDataURL(file)
  }

  async function sendPasswordReset() {
    if (!user?.email) return
    setSecurityInfo('')
    const { error } = await supabase.auth.resetPasswordForEmail(user.email)
    setSecurityInfo(error ? (error.message || 'Could not send reset email.') : 'Password reset email sent.')
  }

  function validate() {
    const next = {}
    const checkText = (key, value) => {
      const v = (value || '').trim()
      if (!v) next[key] = 'Required'
      else if (v.length < FIELD_MIN) next[key] = `Too short (min ${FIELD_MIN})`
      else if (v.length > FIELD_MAX) next[key] = `Too long (max ${FIELD_MAX})`
    }
    checkText('sellerCompany', fields.seller_company)
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
      const row = await upsertSellerProfile(user.id, {
        seller_company: fields.seller_company.trim(),
        role: fields.role.trim(),
        what_you_sell: fields.what_you_sell.trim(),
        icp: fields.icp.trim(),
        region: fields.region.trim(),
        top_personas: fields.top_personas.map((p) => p.trim()).filter(Boolean),
        common_deal_killer: fields.common_deal_killer.trim(),
      })
      setUpdatedAt(row?.updated_at || new Date().toISOString())
      setHadProfile(true)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } catch (err) {
      setServerError(err?.message || 'Failed to save')
    } finally {
      setSaving(false)
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
    <div className="px-4 md:px-8 py-8 md:py-12 max-w-[640px] mx-auto">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-[12px] text-navy/55 hover:text-navy"
        >
          ← Back
        </button>
      </div>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-navy mb-2">Train Klo</h1>
        <p className="text-sm text-navy/65 leading-relaxed">
          The more Klo knows about <em>you</em>, the less generic its coaching gets.
          Six questions. Two minutes. You can change these anytime.
        </p>
      </header>

      {!hadProfile && (
        <div className="mb-6 rounded-xl border border-klo/30 bg-klo/5 px-4 py-3 text-[13px] text-navy/80 leading-relaxed">
          <span aria-hidden className="mr-1">🎯</span>
          <strong>Klo is currently using generic coaching.</strong>{' '}
          Fill these in to get advice tailored to your role, market, and deal patterns.
        </div>
      )}

      {serverError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <TrainKloFormFields fields={fields} setFields={setFields} errors={errors} />

        <div className="flex items-center justify-end gap-3 pt-7">
          {lastSavedLabel && !savedFlash && (
            <span className="text-[12px] text-navy/45">{lastSavedLabel}</span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="bg-klo hover:bg-klo/90 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-xl"
          >
            {saving ? 'Saving…' : savedFlash ? 'Saved · Klo updated' : 'Save'}
          </button>
        </div>
      </form>

      <section className="mt-10 rounded-2xl border border-navy/10 bg-white p-5">
        <h2 className="text-lg font-semibold text-navy">Profile preferences (optional)</h2>
        <p className="text-sm text-navy/60 mt-1">Personalize how Klosure appears for you.</p>

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
              <button type="button" onClick={() => updatePrefs({ ...prefs, avatarUrl: '' })} className="text-sm text-navy/70 hover:text-navy">Remove</button>
            </div>
          </div>

          <label className="block">
            <span className="block text-xs font-medium text-navy/70 mb-1">Preferred display name format</span>
            <select value={prefs.displayNameFormat} onChange={(e) => updatePrefs({ ...prefs, displayNameFormat: e.target.value })} className="w-full border border-navy/15 rounded-lg px-3 py-2.5">
              <option value="first-name">First name only</option>
              <option value="full-name">Full name</option>
              <option value="first-last-initial">First name + last initial</option>
            </select>
          </label>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Time zone" type="text" value={prefs.timezone} onChange={(v) => updatePrefs({ ...prefs, timezone: v })} placeholder="America/Los_Angeles" />
            <Field label="Locale" type="text" value={prefs.locale} onChange={(v) => updatePrefs({ ...prefs, locale: v })} placeholder="en-US" />
          </div>

          <div>
            <p className="text-xs font-medium text-navy/70 mb-2">Notification preferences</p>
            <div className="space-y-2 text-sm text-navy/80">
              <Checkbox label="Email me when a buyer replies" checked={prefs.emailNotifications} onChange={(v) => updatePrefs({ ...prefs, emailNotifications: v })} />
              <Checkbox label="Weekly deal digest" checked={prefs.dealDigest} onChange={(v) => updatePrefs({ ...prefs, dealDigest: v })} />
              <Checkbox label="In-app mentions and reminders" checked={prefs.inAppMentions} onChange={(v) => updatePrefs({ ...prefs, inAppMentions: v })} />
            </div>
          </div>
          {prefSavedFlash && <p className="text-xs text-emerald-700">Preferences saved.</p>}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-navy/10 bg-slate-50 p-5">
        <h2 className="text-lg font-semibold text-navy">Security actions</h2>
        <p className="text-sm text-navy/60 mt-1">Manage password and active access separately from profile preferences.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={sendPasswordReset} className="text-sm px-3 py-2 rounded-lg border border-navy/15 hover:bg-white">Send password reset email</button>
          <button type="button" onClick={async () => { await signOut(); navigate('/login') }} className="text-sm px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50">Sign out</button>
        </div>
        {securityInfo && <p className="text-xs text-navy/70 mt-2">{securityInfo}</p>}
      </section>

      <div className="mt-10 text-center">
        <Link to="/today" className="text-sm text-klo hover:underline">
          ← Back to Today
        </Link>
      </div>
    </div>
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
