// =============================================================================
// intl-billing-lead — Phase A sprint 09
// =============================================================================
// USD / AED visitors who can't auto-debit through Razorpay (until ticket
// #18895606 resolves) submit a concierge form on /billing. This function:
//   1. Inserts a row into public.intl_billing_leads (service-role write —
//      RLS denies direct client inserts).
//   2. Best-effort emails the founder via Resend so the lead is visible
//      immediately, without waiting for someone to query the table.
//
// Anonymous calls are accepted (lead capture sometimes happens before signup);
// authenticated calls additionally backfill user_id on the row.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { sendEmail } from "../_shared/send-email.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const FOUNDER_EMAIL = Deno.env.get("FOUNDER_EMAIL") ?? "support@klosure.ai"
const APP_URL = Deno.env.get("APP_URL") ?? "https://klosure.ai"

const ALLOWED_PLANS = new Set(["coach", "closer", "command"])
const ALLOWED_CURRENCIES = new Set(["USD", "AED", "INR"])

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? "").trim().toLowerCase()
    const planSlug = String(body.plan_slug ?? "")
    const currency = String(body.currency ?? "")
    const seatsRaw = Number(body.seats ?? 1)
    const notes = String(body.notes ?? "").slice(0, 1000)

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ ok: false, error: "invalid_email" }, 400)
    }
    if (!ALLOWED_PLANS.has(planSlug)) {
      return json({ ok: false, error: "invalid_plan" }, 400)
    }
    if (!ALLOWED_CURRENCIES.has(currency)) {
      return json({ ok: false, error: "invalid_currency" }, 400)
    }
    const seats = Math.max(1, Math.min(500, Number.isFinite(seatsRaw) ? Math.floor(seatsRaw) : 1))

    // Optional auth — if the request carries a JWT we'll attach the user_id.
    let userId: string | null = null
    const authHeader = req.headers.get("Authorization") ?? ""
    if (authHeader.startsWith("Bearer ")) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: userData } = await userClient.auth.getUser()
      if (userData?.user?.id) {
        userId = userData.user.id
      }
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: inserted, error: insertErr } = await sb
      .from("intl_billing_leads")
      .insert({
        email,
        plan_slug: planSlug,
        currency,
        seats,
        notes: notes || null,
        user_id: userId,
      })
      .select("id, created_at")
      .maybeSingle()

    if (insertErr) {
      console.error("intl-billing-lead insert failed", insertErr)
      return json({ ok: false, error: "insert_failed", detail: insertErr.message }, 500)
    }

    // Best-effort founder notification. If Resend is not configured the send
    // is a no-op (sendEmail handles that). Failures are logged, not raised —
    // the lead is already in the DB so the form-success message is honest.
    try {
      const planLabel = planSlug === "coach" ? "Coach" : planSlug === "closer" ? "Closer" : "Command"
      await sendEmail({
        to: FOUNDER_EMAIL,
        replyTo: email,
        subject: `[Klosure] New ${currency} billing lead — ${email} (${planLabel}, ${seats} seat${seats === 1 ? "" : "s"})`,
        html: founderEmail({
          email,
          planLabel,
          currency,
          seats,
          notes,
          userId,
          createdAt: inserted?.created_at,
        }),
        tags: [
          { name: "type", value: "intl_billing_lead" },
          { name: "plan", value: planSlug },
          { name: "currency", value: currency },
        ],
      })
    } catch (err) {
      console.warn("intl-billing-lead: founder email failed", err)
    }

    return json({ ok: true, id: inserted?.id })
  } catch (err) {
    console.error("intl-billing-lead error", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

function founderEmail(args: {
  email: string
  planLabel: string
  currency: string
  seats: number
  notes: string
  userId: string | null
  createdAt?: string
}) {
  const safe = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; max-width: 560px; padding: 16px;">
      <h2 style="margin: 0 0 12px;">New international billing lead</h2>
      <table style="border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Email</td>
            <td><a href="mailto:${safe(args.email)}">${safe(args.email)}</a></td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Plan</td>
            <td>${safe(args.planLabel)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Currency</td>
            <td>${safe(args.currency)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Seats</td>
            <td>${args.seats}</td></tr>
        ${args.userId ? `<tr><td style="padding: 4px 12px 4px 0; color: #666;">User ID</td><td><code>${safe(args.userId)}</code></td></tr>` : ""}
        ${args.createdAt ? `<tr><td style="padding: 4px 12px 4px 0; color: #666;">Created</td><td>${safe(args.createdAt)}</td></tr>` : ""}
      </table>
      ${args.notes ? `<p style="margin-top: 16px;"><strong>Notes:</strong><br>${safe(args.notes).replace(/\n/g, "<br>")}</p>` : ""}
      <p style="margin-top: 20px; color: #666; font-size: 12px;">
        SLA: respond within 24 hours with a Razorpay payment link.
        Lead is in <code>intl_billing_leads</code> at ${APP_URL}.
      </p>
    </div>
  `
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}
