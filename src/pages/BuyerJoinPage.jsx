import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import BuyerDashboardPage from './BuyerDashboardPage.jsx'
import BuyerDealHeader from '../components/buyer/BuyerDealHeader.jsx'

const STORAGE_KEY = 'klosure.buyer.profile'

export default function BuyerJoinPage() {
  const { token } = useParams()
  const [deal, setDeal] = useState(null)
  // dealContext is loaded for compatibility with the legacy chat fallback,
  // even though Phase 8's dashboard does not use it directly.
  const [, setDealContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [joining, setJoining] = useState(false)

  // Restore buyer name from localStorage so refreshes don't re-prompt.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      if (saved.token === token && saved.name) {
        setBuyerName(saved.name)
      }
    } catch {
      // ignore
    }
  }, [token])

  // Load the deal by buyer_token.
  useEffect(() => {
    if (!token) return
    let mounted = true
    async function load() {
      const { data: dealData, error: dealErr } = await supabase
        .from('deals')
        .select('*')
        .eq('buyer_token', token)
        .maybeSingle()
      if (!mounted) return
      if (dealErr || !dealData) {
        setError('This link is invalid or expired.')
        setLoading(false)
        return
      }
      const { data: ctx } = await supabase
        .from('deal_context')
        .select('*')
        .eq('deal_id', dealData.id)
        .maybeSingle()
      setDeal(dealData)
      setDealContext(ctx)
      setLoading(false)
    }
    load()

    // Subscribe to klo_state updates (including buyer_view regenerations)
    // for as long as this page is open.
    const channel = supabase
      .channel(`buyer-token-${token}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deals',
          filter: `buyer_token=eq.${token}`,
        },
        (payload) => {
          setDeal((d) => (d ? { ...d, ...payload.new } : payload.new))
        },
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [token])

  async function handleJoin(e) {
    e.preventDefault()
    if (!nameInput.trim() || !deal) return
    setJoining(true)

    const trimmed = nameInput.trim()
    try {
      // Promote deal to shared mode and record the buyer's join.
      const updates = []
      if (deal.mode !== 'shared') {
        updates.push(supabase.from('deals').update({ mode: 'shared' }).eq('id', deal.id))
      }
      updates.push(
        supabase.from('deal_access').insert({
          deal_id: deal.id,
          role: 'buyer',
          buyer_name: trimmed
        })
      )
      await Promise.all(updates)

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, name: trimmed }))
      setBuyerName(trimmed)
      setDeal((d) => ({ ...d, mode: 'shared' }))
    } catch (err) {
      console.error(err)
      // Continue anyway — buyer can still chat. Phase 4 will harden this.
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, name: trimmed }))
      setBuyerName(trimmed)
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-sm"
        style={{ background: 'var(--klo-bg)', color: 'var(--klo-text-mute)' }}
      >
        Opening room…
      </div>
    )
  }
  if (error) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
        style={{ background: 'var(--klo-bg)' }}
      >
        <p className="font-semibold mb-2" style={{ color: 'var(--klo-text)' }}>
          Link not found.
        </p>
        <p className="text-sm" style={{ color: 'var(--klo-text-dim)' }}>{error}</p>
      </div>
    )
  }

  if (!buyerName) {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ background: 'var(--klo-bg)' }}
      >
        <header
          className="px-5 py-4 max-w-5xl w-full mx-auto"
          style={{ borderBottom: '1px solid var(--klo-line)' }}
        >
          <span className="inline-flex flex-col leading-tight">
            <span
              className="font-semibold text-[16px] tracking-[-0.02em]"
              style={{ color: 'var(--klo-text)' }}
            >
              Klosure
            </span>
            <span
              className="text-[11px] mt-0.5"
              style={{ color: 'var(--klo-muted)', letterSpacing: '0.01em' }}
            >
              Stop guessing. Start closing.
            </span>
          </span>
        </header>
        <main className="flex-1 flex items-center justify-center px-5 pb-10 pt-10">
          <div
            className="w-full max-w-md rounded-2xl px-7 py-7"
            style={{
              background: 'var(--klo-bg-elev)',
              border: '1px solid var(--klo-line)',
            }}
          >
            <span
              className="kl-mono text-[12px] uppercase"
              style={{ color: 'var(--klo-accent)', letterSpacing: '0.12em' }}
            >
              Your deal with {deal.seller_company || 'the seller'}
            </span>
            <h1
              className="mt-3 mb-3"
              style={{
                fontSize: 'clamp(26px, 3.4vw, 32px)',
                fontWeight: 600,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                color: 'var(--klo-text)',
              }}
            >
              {deal.title}
            </h1>
            <p className="text-[15px] mb-5" style={{ color: 'var(--klo-text-dim)' }}>
              Track status in real time, see what's blocking progress, and get Klo guidance
              to keep this deal moving.
            </p>
            <form onSubmit={handleJoin} className="space-y-3">
              <label className="block">
                <span
                  className="kl-mono block text-[12px] uppercase mb-2"
                  style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.05em' }}
                >
                  Your name
                </span>
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Ahmed"
                  className="w-full rounded-lg px-3 py-3 text-[15px] focus:outline-none"
                  style={{
                    border: '1px solid var(--klo-line-strong)',
                    background: 'var(--klo-bg)',
                    color: 'var(--klo-text)',
                  }}
                  required
                />
              </label>
              <button
                type="submit"
                disabled={joining || !nameInput.trim()}
                className="w-full font-medium py-3 rounded-lg disabled:opacity-50"
                style={{ background: 'var(--klo-text)', color: '#fff', fontSize: 14 }}
              >
                {joining ? 'Opening…' : 'Open my deal workspace'}
              </button>
            </form>
            <p
              className="kl-mono text-[11px] mt-4 text-center uppercase"
              style={{ color: 'var(--klo-text-mute)', letterSpacing: '0.05em' }}
            >
              Private · No signup · Shared by {deal.seller_company || 'the seller'}
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--klo-bg)' }}>
      <BuyerDealHeader deal={deal} />
      <BuyerDashboardPage deal={deal} embedded />
    </div>
  )
}
