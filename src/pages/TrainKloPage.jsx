// Phase 8 step 02 — Train Klo settings page.
//
// Single-screen form, 6 fields. Saves to seller_profiles. Becomes live for
// the next chat turn — no app restart needed. The header copy is the value
// prop; resist adding marketing.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { getSellerProfile, upsertSellerProfile } from '../lib/sellerProfile.js'

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
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [hadProfile, setHadProfile] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [serverError, setServerError] = useState('')

  const [role, setRole] = useState('')
  const [whatYouSell, setWhatYouSell] = useState('')
  const [icp, setIcp] = useState('')
  const [region, setRegion] = useState('')
  const [topPersonas, setTopPersonas] = useState([])
  const [commonDealKiller, setCommonDealKiller] = useState('')

  const [errors, setErrors] = useState({})

  const refs = {
    role: useRef(null),
    whatYouSell: useRef(null),
    icp: useRef(null),
    region: useRef(null),
    topPersonas: useRef(null),
    commonDealKiller: useRef(null),
  }

  useEffect(() => {
    if (!user) return
    let mounted = true
    setLoading(true)
    getSellerProfile(user.id)
      .then((row) => {
        if (!mounted) return
        if (row) {
          setHadProfile(true)
          setRole(row.role || '')
          setWhatYouSell(row.what_you_sell || '')
          setIcp(row.icp || '')
          setRegion(row.region || '')
          setTopPersonas(Array.isArray(row.top_personas) ? row.top_personas : [])
          setCommonDealKiller(row.common_deal_killer || '')
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

  function validate() {
    const next = {}
    const checkText = (key, value) => {
      const v = (value || '').trim()
      if (!v) next[key] = 'Required'
      else if (v.length < FIELD_MIN) next[key] = `Too short (min ${FIELD_MIN})`
      else if (v.length > FIELD_MAX) next[key] = `Too long (max ${FIELD_MAX})`
    }
    checkText('role', role)
    checkText('whatYouSell', whatYouSell)
    checkText('icp', icp)
    checkText('region', region)
    checkText('commonDealKiller', commonDealKiller)
    if (!Array.isArray(topPersonas) || topPersonas.length < PERSONAS_MIN) {
      next.topPersonas = `Add at least ${PERSONAS_MIN}`
    } else if (topPersonas.length > PERSONAS_MAX) {
      next.topPersonas = `At most ${PERSONAS_MAX}`
    } else {
      const bad = topPersonas.find((p) => !p || p.length < FIELD_MIN || p.length > FIELD_MAX)
      if (bad !== undefined) next.topPersonas = `Each role: ${FIELD_MIN}-${FIELD_MAX} chars`
    }
    setErrors(next)
    return next
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError('')
    const next = validate()
    const firstKey = Object.keys(next)[0]
    if (firstKey) {
      refs[firstKey]?.current?.focus()
      return
    }
    if (!user) return
    setSaving(true)
    try {
      const row = await upsertSellerProfile(user.id, {
        role: role.trim(),
        what_you_sell: whatYouSell.trim(),
        icp: icp.trim(),
        region: region.trim(),
        top_personas: topPersonas.map((p) => p.trim()).filter(Boolean),
        common_deal_killer: commonDealKiller.trim(),
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
          Five questions. Two minutes. You can change these anytime.
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

      <form onSubmit={handleSubmit} className="space-y-7">
        <Field
          label="What's your role?"
          helper="Examples: Founder & CEO · Account Executive · VP Sales · Head of Growth"
          error={errors.role}
        >
          <input
            ref={refs.role}
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Account Executive"
            maxLength={FIELD_MAX}
            className={inputClass(errors.role)}
          />
        </Field>

        <Field
          label="What do you sell, in one sentence?"
          helper="Klo will use this to ground every piece of advice. Be specific."
          error={errors.whatYouSell}
        >
          <input
            ref={refs.whatYouSell}
            type="text"
            value={whatYouSell}
            onChange={(e) => setWhatYouSell(e.target.value)}
            placeholder="AI sales deal coaching SaaS for B2B revenue teams"
            maxLength={FIELD_MAX}
            className={inputClass(errors.whatYouSell)}
          />
        </Field>

        <Field
          label="Who's your ideal buyer, in one sentence?"
          helper="Industry, company size, stage. Klo coaches differently for SMB vs enterprise."
          error={errors.icp}
        >
          <input
            ref={refs.icp}
            type="text"
            value={icp}
            onChange={(e) => setIcp(e.target.value)}
            placeholder="Mid-market B2B SaaS revenue teams (50-500 reps) in the Gulf and India"
            maxLength={FIELD_MAX}
            className={inputClass(errors.icp)}
          />
        </Field>

        <Field
          label="Which market do you sell into?"
          helper="Gulf, India SMB, US, EU. Sales cycles differ massively by region."
          error={errors.region}
        >
          <input
            ref={refs.region}
            type="text"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Gulf (UAE / KSA / Qatar) primary, India secondary"
            maxLength={FIELD_MAX}
            className={inputClass(errors.region)}
          />
        </Field>

        <Field
          label="Which 2–5 roles do you typically sell to?"
          helper="Type a role and press Enter. Klo prioritizes coaching around these stakeholders."
          error={errors.topPersonas}
        >
          <PersonaTagInput
            inputRef={refs.topPersonas}
            value={topPersonas}
            onChange={setTopPersonas}
            invalid={Boolean(errors.topPersonas)}
          />
        </Field>

        <Field
          label="What most often kills your deals?"
          helper="One sentence. Klo will watch for this on every deal."
          error={errors.commonDealKiller}
        >
          <input
            ref={refs.commonDealKiller}
            type="text"
            value={commonDealKiller}
            onChange={(e) => setCommonDealKiller(e.target.value)}
            placeholder="Procurement timelines drag past quarter-end and budget gets reallocated"
            maxLength={FIELD_MAX}
            className={inputClass(errors.commonDealKiller)}
          />
        </Field>

        <div className="flex items-center justify-end gap-3 pt-2">
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

      <div className="mt-10 text-center">
        <Link to="/today" className="text-sm text-klo hover:underline">
          ← Back to Today
        </Link>
      </div>
    </div>
  )
}

function inputClass(hasError) {
  const base =
    'w-full rounded-lg bg-white border px-3 py-2.5 text-sm text-navy placeholder:text-navy/35 outline-none transition'
  return hasError
    ? `${base} border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100`
    : `${base} border-navy/15 focus:border-klo focus:ring-2 focus:ring-klo/20`
}

function Field({ label, helper, error, children }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-navy mb-1">{label}</label>
      {helper && <p className="text-[12px] text-navy/50 mb-2 leading-snug">{helper}</p>}
      {children}
      {error && <p className="text-[12px] text-red-600 mt-1">{error}</p>}
    </div>
  )
}

function PersonaTagInput({ value, onChange, inputRef, invalid }) {
  const [draft, setDraft] = useState('')

  function commit() {
    const v = draft.trim()
    if (!v) return
    if (value.length >= PERSONAS_MAX) return
    if (value.includes(v)) {
      setDraft('')
      return
    }
    onChange([...value, v])
    setDraft('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
      return
    }
    if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  function removeAt(idx) {
    onChange(value.filter((_, i) => i !== idx))
  }

  const wrapperClass = `w-full rounded-lg bg-white border px-2 py-1.5 flex flex-wrap items-center gap-1.5 transition ${
    invalid
      ? 'border-red-300 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100'
      : 'border-navy/15 focus-within:border-klo focus-within:ring-2 focus-within:ring-klo/20'
  }`

  return (
    <div className={wrapperClass}>
      {value.map((tag, idx) => (
        <span
          key={`${tag}-${idx}`}
          className="inline-flex items-center gap-1 bg-klo/10 text-klo text-[12px] font-medium rounded-md px-2 py-0.5"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeAt(idx)}
            aria-label={`Remove ${tag}`}
            className="text-klo/70 hover:text-klo"
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={value.length === 0 ? 'Type a role and press Enter' : ''}
        maxLength={FIELD_MAX}
        disabled={value.length >= PERSONAS_MAX}
        className="flex-1 min-w-[120px] bg-transparent text-sm text-navy placeholder:text-navy/35 px-1 py-1 outline-none disabled:opacity-50"
      />
    </div>
  )
}
