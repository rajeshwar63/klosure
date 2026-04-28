// Phase 9 step 05 — first-visit onboarding modal at the dashboard.
// Skippable. Once dismissed (skip OR save), the localStorage flag prevents
// it from re-appearing for that user. The dashboard banner persists as the
// gentler nag.

import { useState } from 'react'
import { upsertSellerProfile } from '../../lib/sellerProfile.js'
import TrainKloFormFields, { EMPTY_FIELDS } from './TrainKloFormFields.jsx'

export const ONBOARDING_SEEN_KEY = (userId) => `klosure:onboarding:seen:${userId}`

export default function OnboardingModal({ open, onClose, user }) {
  const [fields, setFields] = useState({ ...EMPTY_FIELDS })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  function markSeen() {
    if (!user?.id) return
    try {
      window.localStorage.setItem(ONBOARDING_SEEN_KEY(user.id), 'true')
    } catch {
      // ignore
    }
  }

  async function handleSave() {
    if (!user?.id || saving) return
    setError('')
    setSaving(true)
    try {
      const payload = {
        seller_company: fields.seller_company.trim(),
        role: fields.role.trim(),
        what_you_sell: fields.what_you_sell.trim(),
        icp: fields.icp.trim(),
        region: fields.region.trim(),
        top_personas: fields.top_personas.map((p) => p.trim()).filter(Boolean),
        common_deal_killer: fields.common_deal_killer.trim(),
      }
      // Only persist non-empty fields so a partly-filled form doesn't blow
      // away anything that already exists.
      const filtered = {}
      for (const [k, v] of Object.entries(payload)) {
        if (Array.isArray(v) ? v.length > 0 : v) filtered[k] = v
      }
      if (Object.keys(filtered).length > 0) {
        await upsertSellerProfile(user.id, filtered)
      }
      markSeen()
      onClose?.({ saved: true })
    } catch (err) {
      setError(err?.message || 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  function handleSkip() {
    markSeen()
    onClose?.({ saved: false })
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="bg-white w-full max-w-[520px] rounded-2xl shadow-2xl my-4">
        <div className="flex items-start justify-between p-5 pb-3 border-b border-navy/5">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-klo uppercase mb-1">
              ◆ Welcome to Klosure
            </p>
            <h2 id="onboarding-title" className="text-lg font-semibold text-navy leading-tight">
              The more Klo knows about you, the less generic its coaching gets.
            </h2>
            <p className="text-[13px] text-navy/55 mt-1">Six fields. Two minutes.</p>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            aria-label="Close"
            className="text-navy/40 hover:text-navy text-xl leading-none px-2"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          <p className="text-[12px] text-navy/55 mb-4 italic">
            At minimum: Company, Role, ICP — these are the most useful for Klo.
          </p>
          <TrainKloFormFields fields={fields} setFields={setFields} />
          {error && (
            <p className="mt-3 text-[12px] text-red-600">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-navy/5">
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm text-navy/60 hover:text-navy font-medium"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-klo hover:bg-klo/90 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-xl"
          >
            {saving ? 'Saving…' : 'Save & continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
