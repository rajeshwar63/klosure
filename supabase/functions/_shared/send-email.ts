// =============================================================================
// Shared email sender — Resend
// =============================================================================
// Single chokepoint for outbound email. Every edge function that sends mail
// goes through here so we share retry/error handling and don't reinvent the
// fetch + headers dance in five places. RESEND_API_KEY and FROM_EMAIL must be
// set as Supabase secrets; if RESEND_API_KEY is missing the call is a no-op
// (logged) so local/dev deploys without the key still work.
// =============================================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? ""
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@klosure.ai"
const FROM_NAME = Deno.env.get("FROM_NAME") ?? "Klosure"

export interface SendEmailArgs {
  to: string | string[]
  subject: string
  html: string
  // Optional plain-text fallback for clients that block HTML. Most modern
  // clients render HTML by default, so we don't bother generating one
  // automatically — pass it when copy is short and worth it.
  text?: string
  // Reply-To is a great affordance for "reply to this and Rajeshwar reads it"
  // — keeps the from on noreply@ but routes replies somewhere staffed.
  replyTo?: string
  tags?: { name: string; value: string }[]
}

export interface SendEmailResult {
  ok: boolean
  id?: string
  error?: string
  skipped?: boolean
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  if (!RESEND_API_KEY) {
    console.warn("[send-email] RESEND_API_KEY not set — skipping send to", args.to)
    return { ok: true, skipped: true }
  }

  const recipients = Array.isArray(args.to) ? args.to : [args.to]
  if (recipients.length === 0) {
    return { ok: false, error: "no_recipients" }
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: recipients,
        subject: args.subject,
        html: args.html,
        text: args.text,
        reply_to: args.replyTo,
        tags: args.tags,
      }),
    })

    const text = await res.text()
    let parsed: { id?: string; message?: string } = {}
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { message: text }
    }

    if (!res.ok) {
      console.error("[send-email] resend error", res.status, parsed)
      return { ok: false, error: parsed.message || `resend_${res.status}` }
    }

    return { ok: true, id: parsed.id }
  } catch (err) {
    console.error("[send-email] fetch error", err)
    return { ok: false, error: String(err) }
  }
}
