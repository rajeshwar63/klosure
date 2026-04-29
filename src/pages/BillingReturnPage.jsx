// =============================================================================
// BillingReturnPage — Phase 12.3
// =============================================================================
// Razorpay redirects users here after they authorise a mandate on the hosted
// checkout page. Razorpay's redirect happens before the webhook lands, so we
// poll get_my_account_status until the user flips to paid_active (or we
// give up after ~30s and ask them to wait for email confirmation).
// =============================================================================

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccountStatus } from '../hooks/useAccountStatus.jsx'

export default function BillingReturnPage() {
  const navigate = useNavigate()
  const { refresh, status } = useAccountStatus()
  const [polling, setPolling] = useState(true)
  const [attempts, setAttempts] = useState(0)

  useEffect(() => {
    let mounted = true
    let timer

    async function poll() {
      if (!mounted) return
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
            : "Your payment was received but is still being confirmed. You'll get an email when your account is activated. If this takes more than a few minutes, email rajeshwar63@gmail.com."}
        </p>
      </div>
    </div>
  )
}
