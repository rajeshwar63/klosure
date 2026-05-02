// =============================================================================
// send-invoice
// =============================================================================
// Sends a receipt email after a successful Razorpay charge. Two callers:
//
//   1. razorpay-webhook → on subscription.charged (canonical signal for
//      "money landed"). Service role; no JWT.
//   2. razorpay-verify-subscription → on the user's first activation, so the
//      receipt arrives even before the webhook fires. Authenticated.
//
// Body: { payment_id, subscription_id?, user_id? }
// We re-fetch the payment from Razorpay to get the canonical amount, currency,
// and invoice number — never trust amounts the caller passes in.
//
// Idempotency: stamp `invoice_email_sent_at` on the payment_events row keyed
// by payment_id so a duplicate webhook (or webhook + verify firing back-to-
// back on first activation) doesn't double-send.
//
// Deploy:
//   supabase functions deploy send-invoice
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { sendEmail } from "../_shared/send-email.ts"
import { invoiceEmail } from "../_shared/email-templates.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? ""
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? ""
const APP_URL = Deno.env.get("APP_URL") ?? "https://klosure.ai"
// Server-side mirror of src/lib/plans.ts → plan slug -> human label.
// Legacy slugs kept here so historical invoices still render the plan name.
const PLAN_LABELS: Record<string, string> = {
  klosure: "Klosure",
  enterprise: "Enterprise",
  pro: "Klosure",
  team_starter: "Klosure",
  team_growth: "Klosure",
  team_scale: "Klosure",
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

interface RazorpayPayment {
  id: string
  amount?: number
  currency?: string
  status?: string
  invoice_id?: string
  order_id?: string
  email?: string
  contact?: string
  created_at?: number
  notes?: Record<string, unknown>
  description?: string
}

interface RazorpayInvoice {
  id: string
  receipt?: string | null
  invoice_number?: string | null
  short_url?: string | null
  status?: string
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const body = await req.json().catch(() => ({}))
    const paymentId = String(body.payment_id ?? "").trim()
    const subscriptionId = body.subscription_id
      ? String(body.subscription_id).trim()
      : null

    if (!paymentId) {
      return json({ ok: false, error: "missing_payment_id" }, 400)
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    // Idempotency check — has an invoice for this payment_id already gone out?
    const { data: existingSent } = await sb
      .from("invoices_sent")
      .select("payment_id")
      .eq("payment_id", paymentId)
      .maybeSingle()

    if (existingSent) {
      return json({
        ok: true,
        skipped: "already_sent",
        payment_id: paymentId,
      })
    }

    // 1. Fetch payment from Razorpay (canonical amount + currency).
    const paymentRes = await rzpFetch<RazorpayPayment>(
      `/payments/${paymentId}`,
    )
    if (!paymentRes.ok || !paymentRes.body) {
      return json(
        {
          ok: false,
          error: "razorpay_payment_fetch_failed",
          detail: paymentRes.body,
        },
        502,
      )
    }
    const payment = paymentRes.body
    if (payment.status && payment.status !== "captured") {
      return json({
        ok: true,
        skipped: `payment_status_${payment.status}`,
      })
    }

    // 2. Fetch invoice (gives us the human-readable invoice number + short_url).
    let invoice: RazorpayInvoice | null = null
    if (payment.invoice_id) {
      const invRes = await rzpFetch<RazorpayInvoice>(
        `/invoices/${payment.invoice_id}`,
      )
      if (invRes.ok && invRes.body) invoice = invRes.body
    }

    // 3. Resolve the owner: subscription_id (preferred) → users / teams.
    let userRow:
      | { id: string; email: string; name: string | null }
      | null = null
    let planSlug = ""

    const resolvedSubscriptionId =
      subscriptionId ||
      (typeof payment.notes?.["subscription_id"] === "string"
        ? (payment.notes["subscription_id"] as string)
        : null)

    if (resolvedSubscriptionId) {
      const ownerRes = await sb.rpc("find_subscription_owner", {
        p_subscription_id: resolvedSubscriptionId,
      })
      const owner = Array.isArray(ownerRes.data)
        ? ownerRes.data[0]
        : ownerRes.data

      if (owner?.user_id && !owner?.is_team) {
        const { data } = await sb
          .from("users")
          .select("id, email, name, plan")
          .eq("id", owner.user_id)
          .maybeSingle()
        userRow = data
          ? { id: data.id, email: data.email, name: data.name }
          : null
        planSlug = data?.plan ?? ""
      } else if (owner?.team_id) {
        const { data: teamRow } = await sb
          .from("teams")
          .select("id, owner_id, plan")
          .eq("id", owner.team_id)
          .maybeSingle()
        if (teamRow?.owner_id) {
          const { data: ownerUser } = await sb
            .from("users")
            .select("id, email, name")
            .eq("id", teamRow.owner_id)
            .maybeSingle()
          if (ownerUser) {
            userRow = {
              id: ownerUser.id,
              email: ownerUser.email,
              name: ownerUser.name,
            }
          }
          planSlug = teamRow?.plan ?? ""
        }
      }
    }

    // Fallback: razorpay payload sometimes carries email but no useful name —
    // use it so we can still mail a receipt even if owner lookup fails.
    if (!userRow && payment.email) {
      userRow = {
        id: "",
        email: payment.email,
        name: null,
      }
    }

    if (!userRow?.email) {
      return json(
        { ok: false, error: "no_recipient_resolved", payment_id: paymentId },
        404,
      )
    }

    // Plan slug fallback: notes set at subscription create time include it.
    if (!planSlug && typeof payment.notes?.["klosure_plan_slug"] === "string") {
      planSlug = payment.notes["klosure_plan_slug"] as string
    }

    const planLabel = PLAN_LABELS[planSlug] ?? "Klosure subscription"

    // 4. Format amount. Razorpay quotes amount in lowest unit (paise/fils).
    const amountMajor =
      typeof payment.amount === "number" ? payment.amount / 100 : null
    const currency = payment.currency ?? "INR"
    const amountLabel = amountMajor != null
      ? formatMoney(amountMajor, currency)
      : "—"

    const paidAt = payment.created_at
      ? new Date(payment.created_at * 1000).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      : new Date().toLocaleDateString()

    // Invoice number: prefer Razorpay's invoice_number; fall back to receipt
    // and finally to a deterministic kls-<paymentId>.
    const invoiceNumber =
      invoice?.invoice_number ||
      invoice?.receipt ||
      `KLS-${paymentId.replace(/^pay_/, "")}`

    // Period end on the user/team row.
    let periodEndLabel: string | null = null
    if (userRow.id) {
      // Re-fetch with current_period_end
      const { data } = await sb
        .from("users")
        .select("current_period_end")
        .eq("id", userRow.id)
        .maybeSingle()
      if (data?.current_period_end) {
        periodEndLabel = new Date(data.current_period_end).toLocaleDateString(
          "en-IN",
          { day: "2-digit", month: "short", year: "numeric" },
        )
      }
    }

    const { subject, html } = invoiceEmail({
      userEmail: userRow.email,
      userName: userRow.name ?? "",
      planLabel,
      amount: amountLabel,
      currency,
      invoiceNumber,
      paymentId,
      paidAt,
      periodEnd: periodEndLabel,
      appUrl: APP_URL,
      invoiceUrl: invoice?.short_url ?? null,
    })

    const sendResult = await sendEmail({
      to: userRow.email,
      subject,
      html,
      tags: [
        { name: "type", value: "invoice" },
        { name: "plan", value: planSlug || "unknown" },
      ],
    })

    if (!sendResult.ok) {
      return json(
        {
          ok: false,
          error: "email_send_failed",
          detail: sendResult.error,
        },
        502,
      )
    }

    // Record we sent it. Insert (not upsert) — duplicate insert returns 23505
    // and we treat that as a benign "already sent" race.
    const { error: logErr } = await sb.from("invoices_sent").insert({
      payment_id: paymentId,
      subscription_id: resolvedSubscriptionId,
      user_id: userRow.id || null,
      email: userRow.email,
      plan_slug: planSlug || null,
      amount_minor: payment.amount ?? null,
      currency,
      invoice_number: invoiceNumber,
      provider_invoice_id: invoice?.id ?? null,
    })
    if (
      logErr &&
      logErr.code !== "23505" &&
      !/duplicate/i.test(logErr.message ?? "")
    ) {
      // Log but don't fail — email already went out.
      console.warn("invoices_sent insert failed", logErr)
    }

    return json({
      ok: true,
      payment_id: paymentId,
      invoice_number: invoiceNumber,
      email_sent: !sendResult.skipped,
      email_skipped: !!sendResult.skipped,
    })
  } catch (err) {
    console.error("send-invoice error", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

async function rzpFetch<T>(
  path: string,
): Promise<{ ok: boolean; status: number; body: T | null }> {
  const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
  })
  const text = await res.text()
  let parsed: T | null = null
  try {
    parsed = JSON.parse(text) as T
  } catch {
    parsed = null
  }
  return { ok: res.ok, status: res.status, body: parsed }
}

function formatMoney(amount: number, currency: string): string {
  if (currency === "INR") {
    return `₹${amount.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
  if (currency === "AED") {
    return `AED ${amount.toLocaleString("en-AE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
  return `${currency} ${amount.toFixed(2)}`
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}
