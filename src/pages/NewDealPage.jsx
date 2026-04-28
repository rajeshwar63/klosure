import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.jsx'
import { canCreateDeal, planConfig, nextPlanFor } from '../lib/plans.js'
import { requestKloCoaching } from '../services/klo.js'

const EMPTY_STAKEHOLDER = { name: '', role: '', company: '' }

export default function NewDealPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const wantsShare = params.get('share') === '1'
  const { user } = useAuth()
  const { plan, profile } = useProfile()
  const [activeCount, setActiveCount] = useState(null)

  useEffect(() => {
    if (!user) return
    let mounted = true
    async function load() {
      const { count } = await supabase
        .from('deals')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', user.id)
        .eq('status', 'active')
      if (mounted) setActiveCount(count ?? 0)
    }
    load()
    return () => {
      mounted = false
    }
  }, [user])

  const cfg = planConfig(plan)
  const overLimit = activeCount !== null && !canCreateDeal({ plan, activeCount })
  const upsell = nextPlanFor('unlimited_deals')

  const [form, setForm] = useState({
    title: '',
    seller_company: '',
    buyer_company: '',
    value: '',
    deadline: '',
    what_needs_to_happen: '',
    notes: ''
  })
  const [stakeholders, setStakeholders] = useState([{ ...EMPTY_STAKEHOLDER }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function updateStakeholder(idx, key, value) {
    setStakeholders((s) => s.map((row, i) => (i === idx ? { ...row, [key]: value } : row)))
  }

  function addStakeholder() {
    setStakeholders((s) => [...s, { ...EMPTY_STAKEHOLDER }])
  }

  function removeStakeholder(idx) {
    setStakeholders((s) => s.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (overLimit) {
      setError(`The Free plan limits you to ${cfg.activeDealLimit} active deal. Upgrade to ${upsell.name} for unlimited.`)
      return
    }
    setSubmitting(true)

    const cleanStakeholders = stakeholders
      .map((s) => ({ name: s.name.trim(), role: s.role.trim(), company: s.company.trim() }))
      .filter((s) => s.name)

    try {
      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .insert({
          seller_id: user.id,
          title: form.title.trim(),
          seller_company: form.seller_company.trim() || null,
          buyer_company: form.buyer_company.trim() || null,
          value: form.value === '' ? null : Number(form.value),
          deadline: form.deadline || null,
          stage: 'discovery',
          status: 'active',
          mode: 'solo'
        })
        .select()
        .single()

      if (dealError) throw dealError

      const whatNeeds = form.what_needs_to_happen.trim()
      const notes = form.notes.trim()

      const { error: contextError } = await supabase.from('deal_context').insert({
        deal_id: deal.id,
        stakeholders: cleanStakeholders,
        what_needs_to_happen: whatNeeds || null,
        notes: notes || null
      })
      if (contextError) throw contextError

      // Seed the chat with the seller's context as the first message so Klo
      // responds to it instead of opening with a generic greeting. If both
      // fields are empty, fall through to the existing greeting in
      // DealRoomPage.
      const seedParts = []
      if (whatNeeds) seedParts.push(`What needs to happen:\n${whatNeeds}`)
      if (notes) seedParts.push(`Notes:\n${notes}`)
      if (seedParts.length > 0) {
        const sellerName = profile?.name || user?.email || 'Seller'
        const { data: seedMsg, error: seedError } = await supabase
          .from('messages')
          .insert({
            deal_id: deal.id,
            sender_type: 'seller',
            sender_name: sellerName,
            content: seedParts.join('\n\n'),
          })
          .select()
          .single()
        if (seedError) {
          console.warn('[NewDeal] failed to seed chat from context', seedError)
        } else {
          requestKloCoaching({
            deal,
            dealContext: {
              stakeholders: cleanStakeholders,
              what_needs_to_happen: whatNeeds || null,
              notes: notes || null,
            },
            messages: [seedMsg],
            role: 'seller',
            mode: 'solo',
          }).catch((err) => {
            console.warn('[NewDeal] Klo coaching kickoff failed', err)
          })
        }
      }

      navigate(`/deals/${deal.id}${wantsShare ? '?share=1' : ''}`, { replace: true })
    } catch (err) {
      setError(err?.message ?? 'Could not create the deal.')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <header className="bg-navy text-white">
        <div
          className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <Link to="/deals" className="text-white/70 hover:text-white text-lg leading-none">‹</Link>
          <div>
            <h1 className="font-bold text-lg">New deal</h1>
            <p className="text-white/60 text-xs">Fill in the context. Klo reads it before you say a word.</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 pb-32">
        {overLimit && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 flex items-start gap-3">
            <span className="text-lg">⚠</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">You've hit the Free plan limit.</p>
              <p className="text-xs mt-0.5">
                Free includes {cfg.activeDealLimit} active deal. Close or archive an existing deal,
                or upgrade to {upsell.name} for unlimited.
              </p>
            </div>
            <Link
              to="/billing"
              className="bg-klo hover:bg-klo/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0"
            >
              Upgrade
            </Link>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <Card>
            <Field label="Deal title" required value={form.title} onChange={(v) => update('title', v)} placeholder="DIB — Learning Experience Platform" />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Your company" value={form.seller_company} onChange={(v) => update('seller_company', v)} placeholder="Acme Learning" />
              <Field label="Buyer company" value={form.buyer_company} onChange={(v) => update('buyer_company', v)} placeholder="Dubai Islamic Bank" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Deal value (USD)" type="number" min="0" value={form.value} onChange={(v) => update('value', v)} placeholder="120000" />
              <Field label="Deadline" type="date" value={form.deadline} onChange={(v) => update('deadline', v)} />
            </div>
          </Card>

          <Card title="Stakeholders" subtitle="Who's involved on the buyer side? Klo uses this to coach you on whom to pull in.">
            <div className="space-y-2">
              {stakeholders.map((s, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    className="col-span-4 border border-navy/15 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-klo"
                    placeholder="Name"
                    value={s.name}
                    onChange={(e) => updateStakeholder(i, 'name', e.target.value)}
                  />
                  <input
                    className="col-span-4 border border-navy/15 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-klo"
                    placeholder="Role"
                    value={s.role}
                    onChange={(e) => updateStakeholder(i, 'role', e.target.value)}
                  />
                  <input
                    className="col-span-3 border border-navy/15 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-klo"
                    placeholder="Company"
                    value={s.company}
                    onChange={(e) => updateStakeholder(i, 'company', e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeStakeholder(i)}
                    className="col-span-1 text-navy/40 hover:text-red-500 text-lg"
                    aria-label="Remove stakeholder"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addStakeholder}
                className="text-klo hover:text-klo/80 text-sm font-medium"
              >
                + Add stakeholder
              </button>
            </div>
          </Card>

          <Card title="Context for Klo">
            <TextArea
              label="What needs to happen"
              value={form.what_needs_to_happen}
              onChange={(v) => update('what_needs_to_happen', v)}
              placeholder="Procurement approval by May 15. Champion needs internal sign-off from Head of TM."
            />
            <TextArea
              label="Notes"
              value={form.notes}
              onChange={(v) => update('notes', v)}
              placeholder="Anything else Klo should know."
            />
          </Card>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="flex gap-2 sticky bottom-0 bg-[#f5f6f8] py-3">
            <Link
              to="/deals"
              className="px-4 py-3 rounded-xl text-navy bg-white border border-navy/10 font-medium"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting || !form.title.trim() || overLimit}
              className="flex-1 bg-klo hover:bg-klo/90 disabled:opacity-50 text-white font-semibold py-3 rounded-xl"
            >
              {submitting ? 'Creating…' : 'Create deal & open Klo'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

function Card({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-2xl border border-navy/10 p-4 space-y-3">
      {title && (
        <div>
          <h2 className="font-semibold text-navy">{title}</h2>
          {subtitle && <p className="text-xs text-navy/60 mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

function Field({ label, value, onChange, ...props }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-navy/70 mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-navy/15 rounded-lg px-3 py-2.5 focus:outline-none focus:border-klo focus:ring-2 focus:ring-klo/20"
        {...props}
      />
    </label>
  )
}

function TextArea({ label, value, onChange, ...props }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-navy/70 mb-1">{label}</span>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-navy/15 rounded-lg px-3 py-2 focus:outline-none focus:border-klo focus:ring-2 focus:ring-klo/20 resize-y"
        {...props}
      />
    </label>
  )
}
