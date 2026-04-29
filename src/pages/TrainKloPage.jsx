// Phase 8 step 02 + Phase 9 step 05 — Train Klo settings page.
//
// Single-screen form, 7 fields. Saves to seller_profiles. Becomes live for
// the next chat turn — no app restart needed.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBeforeUnload, useNavigate, useBlocker } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import { getSellerProfile, upsertSellerProfile } from '../lib/sellerProfile.js'
import { supabase } from '../lib/supabase.js'
import TrainKloFormFields, { EMPTY_FIELDS } from '../components/onboarding/TrainKloFormFields.jsx'

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
  const { user } = useAuth()
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
  const initialBasicsRef = useRef({ firstName: '', lastName: '', companyName: '' })
  const [errors, setErrors] = useState({})

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
          setInitialFields({
            seller_company: row.seller_company || '',
            role: row.role || '',
            what_you_sell: row.what_you_sell || '',
            icp: row.icp || '',
            region: row.region || '',
            top_personas: Array.isArray(row.top_personas) ? row.top_personas : [],
            common_deal_killer: row.common_deal_killer || '',
          })
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

  const blocker = useBlocker(isDirty)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    const leave = window.confirm('You have unsaved changes. Leave this page and discard them?')
    if (leave) blocker.proceed()
    else blocker.reset()
  }, [blocker])

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

  function validate() {
    const next = {}
    const checkText = (key, value) => {
      const v = (value || '').trim()
      if (!v) next[key] = 'Required'
      else if (v.length < FIELD_MIN) next[key] = `Too short (min ${FIELD_MIN})`
      else if (v.length > FIELD_MAX) next[key] = `Too long (max ${FIELD_MAX})`
    }
    checkText('sellerCompany', fields.seller_company)
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
      const row = await upsertSellerProfile(user.id, {
        seller_company: profileBasics.companyName.trim(),
        role: fields.role.trim(),
        what_you_sell: fields.what_you_sell.trim(),
        icp: fields.icp.trim(),
        region: fields.region.trim(),
        top_personas: fields.top_personas.map((p) => p.trim()).filter(Boolean),
        common_deal_killer: fields.common_deal_killer.trim(),
      })
      setUpdatedAt(row?.updated_at || new Date().toISOString())
      setFields((prev) => ({ ...prev, seller_company: profileBasics.companyName.trim() }))
      setInitialFields((prev) => ({ ...prev, ...fields, seller_company: profileBasics.companyName.trim() }))
      initialBasicsRef.current = {
        firstName: profileBasics.firstName.trim(),
        lastName: profileBasics.lastName.trim(),
        companyName: profileBasics.companyName.trim(),
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

      <section className="mb-6 rounded-2xl border border-navy/10 bg-white px-4 py-4 md:px-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-navy">Account</h2>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              isVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {isVerified ? 'Verified' : 'Unverified'}
          </span>
        </div>
        <div className="text-sm text-navy/80 break-all">{accountIdentifier}</div>
        {!isVerified && user?.email && (
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendBusy}
              className="text-[12px] font-medium text-klo hover:underline disabled:opacity-50"
            >
              {resendBusy ? 'Sending…' : 'Resend verification email'}
            </button>
            {resendMessage && <span className="text-[12px] text-navy/60">{resendMessage}</span>}
          </div>
        )}
      </section>

      <form onSubmit={handleSubmit}>
        <div className="space-y-4 mb-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-[12px] font-semibold tracking-wide text-navy/75 uppercase mb-1">First Name</span>
              <input
                value={profileBasics.firstName}
                onChange={(e) => setProfileBasics((p) => ({ ...p, firstName: e.target.value }))}
                className="w-full rounded-xl border border-navy/15 px-3 py-2.5 text-sm text-navy"
              />
              {errors.firstName && <span className="text-[12px] text-red-600 mt-1 block">{errors.firstName}</span>}
            </label>
            <label className="block">
              <span className="block text-[12px] font-semibold tracking-wide text-navy/75 uppercase mb-1">Last Name</span>
              <input
                value={profileBasics.lastName}
                onChange={(e) => setProfileBasics((p) => ({ ...p, lastName: e.target.value }))}
                className="w-full rounded-xl border border-navy/15 px-3 py-2.5 text-sm text-navy"
              />
              {errors.lastName && <span className="text-[12px] text-red-600 mt-1 block">{errors.lastName}</span>}
            </label>
          </div>
          <label className="block">
            <span className="block text-[12px] font-semibold tracking-wide text-navy/75 uppercase mb-1">Company Name</span>
            <input
              value={profileBasics.companyName}
              onChange={(e) => setProfileBasics((p) => ({ ...p, companyName: e.target.value }))}
              className="w-full rounded-xl border border-navy/15 px-3 py-2.5 text-sm text-navy"
            />
            {errors.sellerCompany && <span className="text-[12px] text-red-600 mt-1 block">{errors.sellerCompany}</span>}
          </label>
        </div>
        <TrainKloFormFields fields={fields} setFields={setFields} errors={errors} />

        <div className="flex items-center justify-end gap-3 pt-7">
          {lastSavedLabel && !savedFlash && (
            <span className="text-[12px] text-navy/45">{lastSavedLabel}</span>
          )}
          <button
            type="button"
            onClick={handleCancel}
            disabled={!isDirty || saving}
            className="border border-navy/15 hover:border-navy/30 disabled:opacity-50 text-navy font-semibold text-sm px-5 py-2.5 rounded-xl"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !isDirty}
            className="bg-klo hover:bg-klo/90 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-xl"
          >
            {saving ? 'Saving…' : savedFlash ? 'Saved · Klo updated' : 'Save changes'}
          </button>
        </div>
      </form>

      <div className="mt-10 text-center">
        <Link to="/today" className="text-sm text-klo hover:underline">
          ← Back to Today
        </Link>
      </div>
    </div>
  )
}
