import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import DealRoom from '../components/DealRoom.jsx'

const STORAGE_KEY = 'klosure.buyer.profile'

export default function BuyerJoinPage() {
  const { token } = useParams()
  const [deal, setDeal] = useState(null)
  const [dealContext, setDealContext] = useState(null)
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
    return <div className="min-h-screen flex items-center justify-center text-navy/50 text-sm">Opening room…</div>
  }
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-[#f5f6f8]">
        <p className="text-navy font-semibold mb-2">Link not found.</p>
        <p className="text-navy/60 text-sm">{error}</p>
      </div>
    )
  }

  if (!buyerName) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-navy to-[#0f0f1f] text-white flex flex-col">
        <header className="px-5 py-4 max-w-5xl w-full mx-auto">
          <span className="font-bold text-xl tracking-tight">
            klosure<span className="text-klo">.ai</span>
          </span>
        </header>
        <main className="flex-1 flex items-center justify-center px-5 pb-10">
          <div className="w-full max-w-sm bg-white text-navy rounded-2xl p-6 shadow-xl">
            <p className="text-xs uppercase tracking-wider text-klo font-semibold mb-2">
              You've been invited
            </p>
            <h1 className="text-2xl font-bold leading-tight mb-1">{deal.title}</h1>
            <p className="text-sm text-navy/60 mb-4">
              {deal.seller_company || 'The seller'} has shared this deal room with you. No signup —
              just enter your name and start.
            </p>
            <form onSubmit={handleJoin} className="space-y-3">
              <label className="block">
                <span className="block text-xs font-medium text-navy/70 mb-1">Your name</span>
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Ahmed"
                  className="w-full border border-navy/15 rounded-lg px-3 py-2.5 focus:outline-none focus:border-klo focus:ring-2 focus:ring-klo/20"
                  required
                />
              </label>
              <button
                type="submit"
                disabled={joining || !nameInput.trim()}
                className="w-full bg-klo hover:bg-klo/90 disabled:opacity-50 text-white font-semibold py-3 rounded-xl"
              >
                {joining ? 'Opening…' : 'Open the room'}
              </button>
            </form>
            <p className="text-[11px] text-navy/40 mt-3 text-center">
              Your deal data is never used to train any AI model.
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <DealRoom
      deal={deal}
      dealContext={dealContext}
      role="buyer"
      currentUserName={buyerName}
    />
  )
}
