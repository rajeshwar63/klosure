// =============================================================================
// send-buyer-share
// =============================================================================
// Authenticated POST. Body: { deal_id, buyer_email, message? }.
//
// Lets a seller mail the buyer a link to the deal room directly from the app
// instead of just copying the link. The seller's name shows up in the From
// header (via reply-to) and the email body so it doesn't feel like cold
// automation.
//
// Auth: caller must be the deal seller_id. Server-side check.
//
// Deploy:
//   supabase functions deploy send-buyer-share
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { sendEmail } from "../_shared/send-email.ts"
import { buyerShareEmail } from "../_shared/email-templates.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const APP_URL = Deno.env.get("APP_URL") ?? "https://klosure.ai"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const authHeader = req.headers.get("Authorization") ?? ""
    if (!authHeader.startsWith("Bearer ")) {
      return json({ ok: false, error: "not_authenticated" }, 401)
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return json({ ok: false, error: "not_authenticated" }, 401)
    }
    const userId = userData.user.id

    const body = await req.json().catch(() => ({}))
    const dealId = String(body.deal_id ?? "").trim()
    const buyerEmail = String(body.buyer_email ?? "").trim().toLowerCase()
    const customMessage =
      typeof body.message === "string" ? body.message.slice(0, 1000) : ""

    if (!dealId || !buyerEmail || !buyerEmail.includes("@")) {
      return json({ ok: false, error: "invalid_input" }, 400)
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: deal, error: dealErr } = await sb
      .from("deals")
      .select(
        "id, seller_id, title, buyer_company, buyer_token",
      )
      .eq("id", dealId)
      .maybeSingle()
    if (dealErr || !deal) {
      return json({ ok: false, error: "deal_not_found" }, 404)
    }
    if (deal.seller_id !== userId) {
      return json({ ok: false, error: "not_deal_owner" }, 403)
    }
    if (!deal.buyer_token) {
      return json({ ok: false, error: "no_buyer_token" }, 400)
    }

    const { data: sellerRow } = await sb
      .from("users")
      .select("name, email")
      .eq("id", userId)
      .maybeSingle()

    const buyerLink = `${APP_URL.replace(/\/$/, "")}/join/${deal.buyer_token}`

    const { subject, html } = buyerShareEmail({
      buyerEmail,
      sellerName: sellerRow?.name || sellerRow?.email || "Your seller",
      sellerEmail: sellerRow?.email || userData.user.email || "",
      dealTitle: deal.title || "your deal",
      buyerCompany: deal.buyer_company || "",
      buyerLink,
      message: customMessage,
    })

    const sendResult = await sendEmail({
      to: buyerEmail,
      subject,
      html,
      replyTo:
        sellerRow?.email || userData.user.email || undefined,
      tags: [
        { name: "type", value: "buyer_share" },
        { name: "deal_id", value: String(deal.id) },
      ],
    })

    if (!sendResult.ok) {
      return json(
        {
          ok: false,
          error: "email_send_failed",
          detail: sendResult.error,
          buyer_link: buyerLink,
        },
        502,
      )
    }

    return json({
      ok: true,
      buyer_link: buyerLink,
      email_sent: !sendResult.skipped,
      email_skipped: !!sendResult.skipped,
    })
  } catch (err) {
    console.error("send-buyer-share error", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}
