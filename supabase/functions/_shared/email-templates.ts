// =============================================================================
// Shared HTML email templates
// =============================================================================
// One file = one design system. Every transactional email we send wraps the
// body in `renderEmail()` so the chrome (header, signoff, footer) stays
// consistent — change the brand here once and every email updates.
//
// Templates exposed:
//   teamInviteEmail        — manager invites teammate
//   welcomeEmail           — signup acknowledgement
//   invoiceEmail           — receipt after a successful charge
//   subscriptionStartedEmail — first activation (mandate authorised)
//   buyerShareEmail        — seller shares deal room with buyer
//   trialEndingEmail       — trial winding down warning
//   subscriptionCancelledEmail — confirmation after cancel
//   subscriptionHaltedEmail    — payment failed → account read-only soon
//   deletionWarningEmail   — read-only account heading toward purge
// =============================================================================

const BRAND_COLOR = "#0F172A"
const ACCENT_COLOR = "#3B82F6"
const SUPPORT_EMAIL = "support@klosure.ai"

export interface RenderOptions {
  preheader?: string
  // Override the signoff line. Defaults to "— Rajeshwar, Klosure".
  signoff?: string
}

// All templates funnel through here so chrome stays consistent.
export function renderEmail(
  bodyHtml: string,
  options: RenderOptions = {},
): string {
  const preheader = options.preheader ?? ""
  const signoff = options.signoff ?? "— Rajeshwar, Klosure"

  // Inline styles only — most clients (Gmail, Outlook) strip <style>.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Klosure</title>
</head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${BRAND_COLOR};">
  <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:0;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e8ee;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid #f0f1f5;">
              <a href="https://klosure.ai" style="color:${BRAND_COLOR};text-decoration:none;font-weight:700;font-size:18px;letter-spacing:-0.01em;">Klosure</a>
              <span style="float:right;font-size:11px;color:#8a93a6;text-transform:uppercase;letter-spacing:0.06em;">AI deal room</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;font-size:15px;line-height:1.6;color:${BRAND_COLOR};">
              ${bodyHtml}
              <p style="margin:32px 0 0 0;color:#5b6478;">${escapeHtml(signoff)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #f0f1f5;font-size:12px;color:#8a93a6;background:#fafbfc;">
              Questions? Reply to this email or write to <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT_COLOR};text-decoration:none;">${SUPPORT_EMAIL}</a>.
            </td>
          </tr>
        </table>
        <p style="font-size:11px;color:#8a93a6;margin:16px 0 0 0;">Klosure.ai · AI-powered deal room</p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function ctaButton(url: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${escapeAttr(url)}" style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(label)}</a>
  </p>`
}

function infoBox(html: string): string {
  return `<div style="margin:20px 0;padding:16px 20px;background:#f5f6f8;border-radius:10px;border:1px solid #e6e8ee;font-size:14px;color:#5b6478;">${html}</div>`
}

// ----------------------------------------------------------------------------
// Team invite
// ----------------------------------------------------------------------------
export interface TeamInviteEmailArgs {
  inviteeEmail: string
  inviterName: string
  inviterEmail: string
  teamName: string
  inviteUrl: string
}

export function teamInviteEmail(args: TeamInviteEmailArgs): {
  subject: string
  html: string
} {
  const firstName = firstNameFromEmail(args.inviteeEmail)
  const inviterDisplay = args.inviterName?.trim() || args.inviterEmail
  const subject = `${inviterDisplay} invited you to join ${args.teamName} on Klosure`

  const body = `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p><strong>${escapeHtml(inviterDisplay)}</strong> has invited you to join the team
    <strong>${escapeHtml(args.teamName)}</strong> on Klosure — the AI deal room that helps reps
    get closure on every deal.</p>
    ${ctaButton(args.inviteUrl, "Accept invite")}
    ${infoBox(`This invite was sent to <strong>${escapeHtml(args.inviteeEmail)}</strong>.
      You'll need to sign in or sign up with this email to accept.<br/><br/>
      Or paste this link into your browser:<br/>
      <a href="${escapeAttr(args.inviteUrl)}" style="color:${ACCENT_COLOR};word-break:break-all;">${escapeHtml(args.inviteUrl)}</a>`)}
    <p style="font-size:13px;color:#8a93a6;">If you weren't expecting this invite, you can safely ignore this email — no account will be created.</p>
  `

  return {
    subject,
    html: renderEmail(body, {
      preheader: `${inviterDisplay} added you to ${args.teamName} on Klosure.`,
      signoff: `— Rajeshwar, Klosure`,
    }),
  }
}

// ----------------------------------------------------------------------------
// Welcome (post-signup)
// ----------------------------------------------------------------------------
export interface WelcomeEmailArgs {
  userEmail: string
  userName?: string
  appUrl: string
  trialDays?: number
}

export function welcomeEmail(args: WelcomeEmailArgs): {
  subject: string
  html: string
} {
  const first = args.userName?.split(" ")[0] || firstNameFromEmail(args.userEmail)
  const trialDays = args.trialDays ?? 14
  const subject = `Welcome to Klosure, ${first}`

  const body = `
    <p>Hi ${escapeHtml(first)},</p>
    <p>Welcome to Klosure — the AI deal room built so you can <em>get closure on every deal</em>.</p>
    <p>You're on a <strong>${trialDays}-day Pro trial</strong>. Spin up your first deal, share the buyer link, and let Klo coach you through it.</p>
    ${ctaButton(`${args.appUrl}/today`, "Open Klosure")}
    <p style="margin-top:24px;font-size:14px;color:#5b6478;"><strong>Three things to try first:</strong></p>
    <ul style="font-size:14px;color:#5b6478;line-height:1.8;padding-left:20px;">
      <li>Create a deal and paste your last buyer email — Klo extracts the deal facts automatically.</li>
      <li>Share the buyer link with your prospect — they see a live read-out without signing in.</li>
      <li>Open the daily focus paragraph each morning to know which deal needs you today.</li>
    </ul>
    <p>If anything feels off or you'd like a 1:1 walkthrough, just reply — I read every email.</p>
  `

  return {
    subject,
    html: renderEmail(body, {
      preheader: `Your ${trialDays}-day Pro trial is active.`,
    }),
  }
}

// ----------------------------------------------------------------------------
// Invoice / receipt — sent on each successful Razorpay charge
// ----------------------------------------------------------------------------
export interface InvoiceEmailArgs {
  userEmail: string
  userName?: string
  planLabel: string
  amount: string
  currency: string
  invoiceNumber: string
  paymentId: string
  paidAt: string
  periodEnd?: string | null
  appUrl: string
  invoiceUrl?: string | null
}

export function invoiceEmail(args: InvoiceEmailArgs): {
  subject: string
  html: string
} {
  const first = args.userName?.split(" ")[0] || firstNameFromEmail(args.userEmail)
  const subject = `Receipt · ${args.planLabel} · ${args.invoiceNumber}`

  const periodLine = args.periodEnd
    ? `<tr><td style="padding:6px 0;color:#5b6478;">Next renewal</td><td style="padding:6px 0;text-align:right;">${escapeHtml(args.periodEnd)}</td></tr>`
    : ""

  const body = `
    <p>Hi ${escapeHtml(first)},</p>
    <p>Thanks for subscribing to <strong>${escapeHtml(args.planLabel)}</strong>. Your payment was received and your account is active.</p>
    <div style="margin:20px 0;padding:20px;border:1px solid #e6e8ee;border-radius:12px;">
      <p style="margin:0 0 12px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#8a93a6;">Receipt</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;">
        <tr><td style="padding:6px 0;color:#5b6478;">Invoice #</td><td style="padding:6px 0;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(args.invoiceNumber)}</td></tr>
        <tr><td style="padding:6px 0;color:#5b6478;">Plan</td><td style="padding:6px 0;text-align:right;">${escapeHtml(args.planLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#5b6478;">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600;">${escapeHtml(args.amount)}</td></tr>
        <tr><td style="padding:6px 0;color:#5b6478;">Paid on</td><td style="padding:6px 0;text-align:right;">${escapeHtml(args.paidAt)}</td></tr>
        ${periodLine}
        <tr><td style="padding:6px 0;color:#5b6478;">Payment ID</td><td style="padding:6px 0;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;">${escapeHtml(args.paymentId)}</td></tr>
      </table>
    </div>
    ${
      args.invoiceUrl
        ? ctaButton(args.invoiceUrl, "View invoice (PDF)")
        : ctaButton(`${args.appUrl}/billing/manage`, "Manage subscription")
    }
    <p style="font-size:13px;color:#8a93a6;">This receipt was issued by Klosure for tax / accounting purposes. Keep it for your records.</p>
  `

  return {
    subject,
    html: renderEmail(body, {
      preheader: `Receipt for ${args.amount} on ${args.planLabel}.`,
    }),
  }
}

// ----------------------------------------------------------------------------
// Subscription started — first time activation (mandate authorised)
// Different from invoice: invoice is "you were charged"; this is "subscription
// active — here's what unlocks". Sent once per subscription start.
// ----------------------------------------------------------------------------
export interface SubscriptionStartedEmailArgs {
  userEmail: string
  userName?: string
  planLabel: string
  appUrl: string
}

export function subscriptionStartedEmail(args: SubscriptionStartedEmailArgs): {
  subject: string
  html: string
} {
  const first = args.userName?.split(" ")[0] || firstNameFromEmail(args.userEmail)
  const subject = `You're on Klosure ${args.planLabel}`

  const body = `
    <p>Hi ${escapeHtml(first)},</p>
    <p>Your <strong>${escapeHtml(args.planLabel)}</strong> subscription is active. Welcome aboard.</p>
    <p>Everything you set up during your trial is preserved — no migration, no reset. Pick up exactly where you left off.</p>
    ${ctaButton(`${args.appUrl}/today`, "Open Klosure")}
    <p style="font-size:13px;color:#8a93a6;">A separate receipt for this payment is on its way for your records.</p>
  `

  return {
    subject,
    html: renderEmail(body, {
      preheader: `Your ${args.planLabel} subscription is live.`,
    }),
  }
}

// ----------------------------------------------------------------------------
// Buyer share — seller shares the deal room link with a buyer over email
// ----------------------------------------------------------------------------
export interface BuyerShareEmailArgs {
  buyerEmail: string
  sellerName: string
  sellerEmail: string
  dealTitle: string
  buyerCompany?: string
  buyerLink: string
  message?: string
}

export function buyerShareEmail(args: BuyerShareEmailArgs): {
  subject: string
  html: string
} {
  const first = firstNameFromEmail(args.buyerEmail)
  const subject = `${args.sellerName} shared the ${args.dealTitle} deal room with you`

  const customMessage = args.message?.trim()
    ? `<div style="margin:20px 0;padding:16px 20px;background:#fafbfc;border-left:3px solid ${ACCENT_COLOR};border-radius:6px;font-size:14px;color:#5b6478;white-space:pre-wrap;">${escapeHtml(args.message.trim())}</div>`
    : ""

  const body = `
    <p>Hi ${escapeHtml(first)},</p>
    <p><strong>${escapeHtml(args.sellerName)}</strong> shared a deal room with you for
    <strong>${escapeHtml(args.dealTitle)}</strong>${args.buyerCompany ? ` (${escapeHtml(args.buyerCompany)})` : ""}.</p>
    <p>The link below opens a live read-out: deal status, next steps, owners. No login required.</p>
    ${customMessage}
    ${ctaButton(args.buyerLink, "Open deal room")}
    ${infoBox(`Or paste this link into your browser:<br/>
      <a href="${escapeAttr(args.buyerLink)}" style="color:${ACCENT_COLOR};word-break:break-all;">${escapeHtml(args.buyerLink)}</a>`)}
    <p style="font-size:13px;color:#8a93a6;">Reply to this email to reach ${escapeHtml(args.sellerEmail)} directly.</p>
  `

  return {
    subject,
    html: renderEmail(body, {
      preheader: `${args.sellerName} sent you a link to the ${args.dealTitle} deal room.`,
      signoff: `— Sent via Klosure on behalf of ${args.sellerName}`,
    }),
  }
}

// ----------------------------------------------------------------------------
// Trial ending — n days left
// ----------------------------------------------------------------------------
export interface TrialEndingEmailArgs {
  userEmail: string
  userName?: string
  daysLeft: number
  appUrl: string
}

export function trialEndingEmail(args: TrialEndingEmailArgs): {
  subject: string
  html: string
} {
  const first = args.userName?.split(" ")[0] || firstNameFromEmail(args.userEmail)
  const days = Math.max(0, Math.floor(args.daysLeft))
  const subject =
    days <= 1
      ? `Your Klosure trial ends today`
      : `Your Klosure trial ends in ${days} days`

  const body = `
    <p>Hi ${escapeHtml(first)},</p>
    <p>Your Klosure trial ends in <strong>${days} day${days === 1 ? "" : "s"}</strong>. Pick a plan now to keep coaching every deal without interruption.</p>
    ${ctaButton(`${args.appUrl}/billing`, "See plans")}
    <p style="font-size:13px;color:#8a93a6;">When the trial ends, your deals stay safe — but the workspace becomes read-only until you upgrade.</p>
  `

  return {
    subject,
    html: renderEmail(body, {
      preheader: `${days} day${days === 1 ? "" : "s"} left in your Klosure trial.`,
    }),
  }
}

// ----------------------------------------------------------------------------
// Subscription cancelled — user-initiated
// ----------------------------------------------------------------------------
export interface SubscriptionCancelledEmailArgs {
  userEmail: string
  userName?: string
  planLabel: string
  endsAt?: string | null
  appUrl: string
}

export function subscriptionCancelledEmail(
  args: SubscriptionCancelledEmailArgs,
): { subject: string; html: string } {
  const first = args.userName?.split(" ")[0] || firstNameFromEmail(args.userEmail)
  const subject = `Your Klosure ${args.planLabel} subscription is cancelled`

  const endsLine = args.endsAt
    ? `<p>You'll keep full access until <strong>${escapeHtml(args.endsAt)}</strong>. After that, your account becomes read-only.</p>`
    : `<p>Your account will become read-only at the end of the current billing period.</p>`

  const body = `
    <p>Hi ${escapeHtml(first)},</p>
    <p>We've cancelled your <strong>${escapeHtml(args.planLabel)}</strong> subscription. No further charges will be made.</p>
    ${endsLine}
    ${ctaButton(`${args.appUrl}/billing`, "Resume subscription")}
    <p>If something pushed you away, I'd genuinely like to know — reply to this email and tell me what could have been better.</p>
  `

  return {
    subject,
    html: renderEmail(body, {
      preheader: `Subscription cancelled. Access continues until period end.`,
    }),
  }
}

// ----------------------------------------------------------------------------
// Subscription halted — payment failed → moving to read-only soon
// ----------------------------------------------------------------------------
export interface SubscriptionHaltedEmailArgs {
  userEmail: string
  userName?: string
  planLabel: string
  appUrl: string
}

export function subscriptionHaltedEmail(args: SubscriptionHaltedEmailArgs): {
  subject: string
  html: string
} {
  const first = args.userName?.split(" ")[0] || firstNameFromEmail(args.userEmail)
  const subject = `Action needed: Klosure ${args.planLabel} payment failed`

  const body = `
    <p>Hi ${escapeHtml(first)},</p>
    <p>We weren't able to charge your card for the latest <strong>${escapeHtml(args.planLabel)}</strong> renewal. Razorpay has paused your subscription.</p>
    <p>Update your payment method to keep your workspace active. If we can't collect within the retry window, the workspace will become read-only.</p>
    ${ctaButton(`${args.appUrl}/billing/manage`, "Update payment method")}
  `

  return {
    subject,
    html: renderEmail(body, {
      preheader: `Card declined. Update payment to keep ${args.planLabel} active.`,
    }),
  }
}

// ----------------------------------------------------------------------------
// Deletion warning — read-only account heading toward purge at 90 days
// Sent at 75 days (15-day notice) and 85 days (5-day final). Copy is honest:
// the only way to preserve data is to upgrade — we never imply that "clicking
// here" alone will rescue the account.
// ----------------------------------------------------------------------------
export interface DeletionWarningEmailArgs {
  userEmail: string
  userName?: string
  daysLeft: number
  appUrl: string
}

export function deletionWarningEmail(args: DeletionWarningEmailArgs): {
  subject: string
  html: string
} {
  const first = args.userName?.split(" ")[0] || firstNameFromEmail(args.userEmail)
  const days = Math.max(0, Math.floor(args.daysLeft))
  const subject =
    days <= 5
      ? `Last chance: your Klosure account will be deleted in ${days} days`
      : `Your Klosure account will be deleted in ${days} days`

  const body = `
    <p>Hi ${escapeHtml(first)},</p>
    <p>Your Klosure account has been read-only for some time. To preserve your deals and continue using Klosure, please upgrade to a paid plan within the next <strong>${days} day${days === 1 ? "" : "s"}</strong>.</p>
    ${ctaButton(`${args.appUrl}/billing`, "See plans")}
    <p>After ${days} day${days === 1 ? "" : "s"}, your account and all associated deals will be permanently deleted. This cannot be undone.</p>
    <p style="font-size:13px;color:#8a93a6;">If you have any questions, reply to this email — I read every one.</p>
  `

  return {
    subject,
    html: renderEmail(body, {
      preheader: `${days} day${days === 1 ? "" : "s"} until your Klosure account is purged.`,
    }),
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function firstNameFromEmail(email: string): string {
  if (!email) return "there"
  const local = email.split("@")[0] ?? ""
  const cleaned = local.split(/[._+-]/)[0]
  if (!cleaned) return "there"
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function escapeHtml(s: string): string {
  if (s == null) return ""
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}
