import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import DealRoom from '../components/DealRoom.jsx'

export default function DealRoomPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const autoShare = params.get('share') === '1'
  const { user } = useAuth()
  const [deal, setDeal] = useState(null)
  const [dealContext, setDealContext] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user || !id) return
    let mounted = true
    async function load() {
      const [{ data: dealData, error: dealErr }, { data: ctx }, { data: prof }] = await Promise.all([
        supabase.from('deals').select('*').eq('id', id).single(),
        supabase.from('deal_context').select('*').eq('deal_id', id).maybeSingle(),
        supabase.from('users').select('*').eq('id', user.id).maybeSingle()
      ])
      if (!mounted) return
      if (dealErr) {
        setError(dealErr.message)
        setLoading(false)
        return
      }
      setDeal(dealData)
      setDealContext(ctx)
      setProfile(prof)
      setLoading(false)
    }
    load()
  }, [user, id])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-navy/50 text-sm">Loading deal…</div>
  }
  if (error || !deal) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="text-navy font-semibold mb-2">Couldn't open this deal.</p>
        <p className="text-navy/60 text-sm mb-4">{error || 'Deal not found.'}</p>
        <button onClick={() => navigate('/deals')} className="text-klo font-medium">
          Back to deals
        </button>
      </div>
    )
  }

  const sellerName = profile?.name || user?.email || 'Seller'
  return (
    <DealRoom
      deal={deal}
      dealContext={dealContext}
      role="seller"
      currentUserName={sellerName}
      onBack={() => navigate('/deals')}
      autoShare={autoShare}
    />
  )
}
