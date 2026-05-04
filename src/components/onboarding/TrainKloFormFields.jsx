// Phase 9 step 05 — shared profile-field set used by both TrainKloPage and
// OnboardingModal. Pure controlled inputs; the parent owns state and submit.

import { useRef, useState } from 'react'

const FIELD_MAX = 200
const PERSONAS_MAX = 5

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

function PersonaTagInput({ value, onChange, invalid }) {
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

export const EMPTY_FIELDS = {
  seller_company: '',
  role: '',
  what_you_sell: '',
  icp: '',
  region: '',
  top_personas: [],
  common_deal_killer: '',
}

export default function TrainKloFormFields({ fields, setFields, errors = {}, refs = {} }) {
  const fallbackRefs = {
    sellerCompany: useRef(null),
    role: useRef(null),
    whatYouSell: useRef(null),
    icp: useRef(null),
    region: useRef(null),
    topPersonas: useRef(null),
    commonDealKiller: useRef(null),
  }
  const r = { ...fallbackRefs, ...refs }

  function set(key, value) {
    setFields((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="space-y-7">
      <Field
        label="What's your company called?"
        helper="This is the vendor name your buyers see in deal headers and the buyer dashboard."
        error={errors.sellerCompany}
      >
        <input
          ref={r.sellerCompany}
          type="text"
          value={fields.seller_company}
          onChange={(e) => set('seller_company', e.target.value)}
          placeholder="Acme Inc."
          maxLength={FIELD_MAX}
          className={inputClass(errors.sellerCompany)}
        />
      </Field>

      <Field
        label="What's your role?"
        helper="Examples: Founder & CEO · Account Executive · VP Sales · Head of Growth"
        error={errors.role}
      >
        <input
          ref={r.role}
          type="text"
          value={fields.role}
          onChange={(e) => set('role', e.target.value)}
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
          ref={r.whatYouSell}
          type="text"
          value={fields.what_you_sell}
          onChange={(e) => set('what_you_sell', e.target.value)}
          placeholder="Cloud-based project management software for small teams"
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
          ref={r.icp}
          type="text"
          value={fields.icp}
          onChange={(e) => set('icp', e.target.value)}
          placeholder="Mid-market SaaS companies (100-500 employees) in North America"
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
          ref={r.region}
          type="text"
          value={fields.region}
          onChange={(e) => set('region', e.target.value)}
          placeholder="North America primary, Europe secondary"
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
          value={fields.top_personas}
          onChange={(next) => set('top_personas', next)}
          invalid={Boolean(errors.topPersonas)}
        />
      </Field>

      <Field
        label="What most often kills your deals?"
        helper="One sentence. Klo will watch for this on every deal."
        error={errors.commonDealKiller}
      >
        <input
          ref={r.commonDealKiller}
          type="text"
          value={fields.common_deal_killer}
          onChange={(e) => set('common_deal_killer', e.target.value)}
          placeholder="Procurement timelines drag past quarter-end and budget gets reallocated"
          maxLength={FIELD_MAX}
          className={inputClass(errors.commonDealKiller)}
        />
      </Field>
    </div>
  )
}
