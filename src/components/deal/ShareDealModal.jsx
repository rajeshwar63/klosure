// Modal launched from the deal page Share action. Lets the seller either
// email the buyer the deal-room link directly, or fall back to copying the
// link. The email path is the new default because it gives us a record of
// who the link was sent to and surfaces the seller's name in the mail body.

import { useEffect, useRef, useState } from 'react'
import { shareDealWithBuyerByEmail } from '../../services/email.js'

export default function ShareDealModal({
  open,
  deal,
  buyerLink,
  onClose,
}) {
  const dialogRef = useRef(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copied, setCopied] = useState(false)

  // Reset form whenever the modal reopens for a different deal.
  useEffect(() => {
    if (open) {
      setEmail('')
      setMessage('')
      setError('')
      setSuccess('')
      setCopied(false)
      // Focus the email field next tick so the user can start typing.
      setTimeout(() => {
        const el = dialogRef.current?.querySelector('input[type="email"]')
        el?.focus()
      }, 50)
    }
  }, [open, deal?.id])

  // Esc closes the modal — common keyboard affordance for dialogs.
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function handleSend(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!email.trim()) {
      setError('Enter the buyer email to send the link.')
      return
    }
    setBusy(true)
    const res = await shareDealWithBuyerByEmail({
      dealId: deal?.id,
      buyerEmail: email.trim(),
      message: message.trim(),
    })
    setBusy(false)
    if (!res.ok) {
      setError(
        res.error === 'no_buyer_token'
          ? "This deal doesn't have a buyer link yet."
          : res.error === 'not_deal_owner'
            ? "Only this deal's seller can share it."
            : res.error === 'invalid_input'
              ? 'That email looks invalid.'
              : 'Could not send the email. Please copy the link instead.',
      )
      return
    }
    if (res.email_skipped) {
      setSuccess('Email service not configured. Copy the link below to share.')
    } else {
      setSuccess(`Sent to ${email.trim()}.`)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buyerLink || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore — link is visible in the dialog
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.55)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5"
      >
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-[18px] font-semibold text-navy">
            Share with buyer
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-navy/45 hover:text-navy text-lg leading-none"
          >
            ×
          </button>
        </div>
        <p className="text-[13px] text-navy/65 mb-4">
          Send the live deal-room link to the buyer. They'll see status,
          next steps, and owners — no login required.
        </p>

        <form onSubmit={handleSend} className="space-y-3">
          <label className="block">
            <span className="block text-xs font-medium text-navy/70 mb-1">
              Buyer email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="buyer@company.com"
              className="w-full border border-navy/15 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-klo focus:ring-2 focus:ring-klo/20"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-navy/70 mb-1">
              Personal note (optional)
            </span>
            <textarea
              rows={3}
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hi — sharing the live deal room so we can keep things in one place."
              className="w-full border border-navy/15 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-klo focus:ring-2 focus:ring-klo/20"
            />
          </label>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
              {success}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="bg-klo hover:bg-klo/90 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-sm"
            >
              {busy ? 'Sending…' : 'Send invite'}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="border border-navy/15 hover:bg-navy/5 text-navy py-2 px-4 rounded-lg text-sm"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </form>

        {buyerLink && (
          <p
            className="mt-4 text-[11px] text-navy/45 truncate font-mono"
            title={buyerLink}
          >
            {buyerLink}
          </p>
        )}
      </div>
    </div>
  )
}
