// =============================================================================
// BillingReturnPage — Phase 12.3
// =============================================================================
// Razorpay redirects users here after they authorise a mandate on the hosted
// checkout page. The BillingPage handler already attempts a verify-and-sync
// before routing here, but we also fire one verify on mount as a belt — if
// the user landed here via a stale tab, deep link, or the handler version
// before the verify call, this re-syncs them. Polling continues as a final
// fallback in case both verify and webhook fail.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccountStatus } from '../hooks/useAccountStatus.jsx'
import { verifySubscription } from '../services/billing.js'

export default function BillingReturnPage() {
  const navigate = useNavigate()
  const { refresh, status } = useAccountStatus()
  const [polling, setPolling] = useState(true)
  const [attempts, setAttempts] = useState(0)
  const verifiedRef = useRef(false)

  useEffect(() => {
    let mounted = true
    let timer

    async function poll() {
      if (!mounted) return

      // Fire verify once before the first refresh — closes the gap if the
      // BillingPage handler skipped/failed it.
      if (!verifiedRef.current) {
        verifiedRef.current = true
        try {
          await verifySubscription()
        } catch (e) {
          console.warn('verify on return failed', e)
        }
        if (!mounted) return
      }

      await refresh()
      if (!mounted) return
      if (status?.status === 'paid_active' || status?.status === 'overridden') {
        setPolling(false)
        navigate('/today', { replace: true })
        return
      }
      if (attempts >= 10) {
        // Webhook hasn't arrived in ~30s; show "we're processing" state.
        setPolling(false)
        return
      }
      setAttempts((n) => n + 1)
      timer = setTimeout(poll, 3000)
    }
    poll()
    return () => {
      mounted = false
      clearTimeout(timer)
    }
  }, [attempts, status?.status, refresh, navigate])

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--klo-bg)' }}
    >
      <div className="text-center max-w-md">
        <h1
          className="text-2xl font-bold mb-3"
          style={{ color: 'var(--klo-text)' }}
        >
          {polling ? 'Confirming your payment…' : 'Almost there'}
        </h1>
        <p className="text-sm" style={{ color: 'var(--klo-text-dim)' }}>
          {polling
            ? 'Razorpay is processing your subscription. This usually takes a few seconds.'
            : "Your payment was received but is still being confirmed. You'll get an email when your account is activated. If this takes more than a few minutes, email support@klosure.ai."}
        </p>
      </div>
    </div>
  )
}
