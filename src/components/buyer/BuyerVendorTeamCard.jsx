// Phase 8 — small card showing the vendor team members assigned to this
// deal. v1 just renders the seller; future phases can add multiple reps.

import { useEffect, useState } from 'react'
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

export default function BuyerVendorTeamCard({ deal }) {
  const [vendor, setVendor] = useState(null)
  const [lastReplyAt, setLastReplyAt] = useState(null)

  useEffect(() => {
    if (!deal?.seller_id) return undefined
    let mounted = true
    async function load() {
      const { data: user } = await supabase
        .from('users')
        .select('id, name, email')
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

  const name = vendor?.name || vendor?.email || 'Vendor'
  const company = deal?.seller_company || 'the vendor'
  const lastReplyLabel = relativeTime(lastReplyAt)

  return (
    <div className="bg-white border border-navy/10 rounded-2xl">
      <div className="px-5 py-4 border-b border-navy/5">
        <h3 className="text-sm font-semibold text-navy">Vendor team</h3>
      </div>
      <div className="p-5 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full bg-klo/15 text-klo text-sm font-semibold flex items-center justify-center shrink-0"
          aria-hidden
        >
          {initialsFor(vendor?.name, vendor?.email)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-navy truncate">{name}</p>
          <p className="text-[12px] text-navy/55 truncate">at {company}</p>
          <p className="text-[11px] text-navy/45 mt-0.5">
            {lastReplyLabel ? `Last reply: ${lastReplyLabel}` : 'No replies yet'}
          </p>
        </div>
      </div>
    </div>
  )
}
