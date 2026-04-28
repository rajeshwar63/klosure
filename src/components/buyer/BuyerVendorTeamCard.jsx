import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'

function relativeTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const diff = Math.round((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  const days = Math.floor(diff / 86400)
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function initialsFor(name, fallback) {
  const source = (name || fallback || '?').trim()
  if (!source) return '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?'
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function IconButton({ label, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-navy/15 text-navy/70 hover:text-klo hover:border-klo/40 hover:bg-klo/5 transition"
    >
      {children}
    </button>
  )
}

function TeamMemberCard({ vendor, company, lastReplyAt }) {
  const name = vendor?.name || vendor?.email || 'Vendor'
  const title = vendor?.title || `Account team · ${company}`

  return (
    <article className="rounded-xl border border-navy/15 bg-white px-4 py-3 flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-navy/30 focus-within:-translate-y-0.5 focus-within:shadow-md focus-within:border-navy/30" tabIndex={0}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <div className="w-9 h-9 rounded-full bg-klo/15 text-klo text-xs font-semibold flex items-center justify-center shrink-0" aria-hidden>
            {initialsFor(vendor?.name, vendor?.email)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy truncate" title={name}>{name}</p>
            <p className="text-[12px] text-navy/60 line-clamp-2" title={title}>{title}</p>
          </div>
        </div>
        <span className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full border bg-sky-50 text-sky-700 border-sky-200">Engaged</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {['Signer', 'Influencer'].map((tag) => (
          <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-navy/5 border border-navy/10 text-navy/70">{tag}</span>
        ))}
      </div>

      <div className="rounded-lg border border-navy/10 bg-[#f8f9fc] px-2.5 py-2">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-navy/55">Next action</p>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">medium</span>
        </div>
        <p className="text-[12px] text-navy/80 line-clamp-2" title="Share final pricing revision and mutual close plan.">
          Share final pricing revision and mutual close plan.
        </p>
        <div className="mt-1 text-[11px] text-navy/55 flex items-center gap-1.5">
          <span className="font-medium">{name}</span>
          <span aria-hidden>•</span>
          <span>{lastReplyAt ? `Last reply ${relativeTime(lastReplyAt)}` : 'No reply yet'}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <IconButton label="Message teammate">
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" aria-hidden>
            <path d="M3.5 5.5h13v7h-8l-3.5 3v-3h-1.5z" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </IconButton>
        <IconButton label="Assign task">
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" aria-hidden>
            <path d="M5 10l3 3 7-7" stroke="currentColor" strokeWidth="1.5" />
            <rect x="3.5" y="3.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </IconButton>
        <IconButton label="Log note">
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" aria-hidden>
            <path d="M5 4.5h10v11H5z" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7 8h6M7 11h6" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </IconButton>
      </div>
    </article>
  )
}

function VendorEmptyState({ company }) {
  return (
    <div className="rounded-xl border border-dashed border-klo/35 bg-klo/5 px-4 py-6 text-center">
      <p className="text-sm font-medium text-navy">No vendor teammates are connected yet.</p>
      <p className="text-[12px] text-navy/60 mt-1">
        Invite collaborators from {company || 'the vendor team'} so actions and follow-ups stay visible.
      </p>
      <button
        type="button"
        className="mt-4 inline-flex items-center justify-center rounded-lg bg-klo text-white text-sm font-semibold px-4 py-2 hover:bg-klo/90 transition"
      >
        Invite teammate
      </button>
    </div>
  )
}

export default function BuyerVendorTeamCard({ deal }) {
  const [vendor, setVendor] = useState(null)
  const [lastReplyAt, setLastReplyAt] = useState(null)

  useEffect(() => {
    if (!deal?.seller_id) {
      setVendor(null)
      setLastReplyAt(null)
      return undefined
    }

    let mounted = true
    async function load() {
      const { data: user } = await supabase
        .from('users')
        .select('id, name, email, title')
        .eq('id', deal.seller_id)
        .maybeSingle()
      if (!mounted) return
      setVendor(user || null)

      const { data: msgs } = await supabase
        .from('messages')
        .select('created_at')
        .eq('deal_id', deal.id)
        .eq('sender_type', 'seller')
        .order('created_at', { ascending: false })
        .limit(1)
      if (!mounted) return
      setLastReplyAt(msgs?.[0]?.created_at ?? null)
    }
    load()
    return () => {
      mounted = false
    }
  }, [deal?.id, deal?.seller_id])

  const company = useMemo(() => deal?.seller_company || 'the vendor', [deal?.seller_company])

  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5">
        <h3 className="text-sm font-semibold text-navy">Vendor team</h3>
      </div>
      <div className="p-5">
        {vendor ? (
          <TeamMemberCard vendor={vendor} company={company} lastReplyAt={lastReplyAt} />
        ) : (
          <VendorEmptyState company={company} />
        )}
      </div>
    </div>
  )
}
