// Public Refund & Cancellation Policy page. Razorpay (and most payment
// processors) require a publicly-resolvable refund/cancellation URL on the
// merchant website; this page satisfies that requirement.

import refundContent from '../../docs/legal/refund-content.md?raw'
import LegalPage from './LegalPage.jsx'

export default function RefundPage() {
  return (
    <LegalPage
      title="Refund & Cancellation Policy"
      description="How Klosure handles trials, cancellations, mid-cycle seat changes, and refunds — including the procedure to request one."
      content={refundContent}
    />
  )
}
