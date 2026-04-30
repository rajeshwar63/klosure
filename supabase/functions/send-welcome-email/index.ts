// =============================================================================
// send-welcome-email
// =============================================================================
// Authenticated POST. Body: optional { } — caller is identified from JWT.
//
// Called from the frontend right after a successful signup so the new rep
// gets a friendly welcome with a CTA to open the app. Idempotent — we record
// `welcome_email_sent_at` on the user row and skip on subsequent calls.
//
// Why client-triggered and not a SQL trigger? Triggers can't make outbound
// HTTP calls; pg_net is dicey to set up and we already have a session token
// at signup time. Edge function is the simpler path.
//
// Deploy:
//   supabase functions deploy send-welcome-email
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { sendEmail } from "../_shared/send-email.ts"
import { welcomeEmail } from "../_shared/email-templates.ts"

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
    if (userErr || !userData?.user?.email) {
      return json({ ok: false, error: "not_authenticated" }, 401)
    }
    const userId = userData.user.id
    const userEmail = userData.user.email

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const { data: userRow } = await sb
      .from("users")
      .select("id, email, name, welcome_email_sent_at")
      .eq("id", userId)
      .maybeSingle()

    if (userRow?.welcome_email_sent_at) {
      return json({ ok: true, skipped: "already_sent" })
    }

    const { subject, html } = welcomeEmail({
      userEmail,
      userName: userRow?.name ?? "",
      appUrl: APP_URL,
    })

    const sendResult = await sendEmail({
      to: userEmail,
      subject,
      html,
      replyTo: "rajeshwar@klosure.ai",
      tags: [{ name: "type", value: "welcome" }],
    })

    if (!sendResult.ok) {
      return json(
        { ok: false, error: "email_send_failed", detail: sendResult.error },
        502,
      )
    }

    // Stamp the timestamp so a second call (refresh, retry) skips.
    await sb
      .from("users")
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq("id", userId)

    return json({
      ok: true,
      email_sent: !sendResult.skipped,
      email_skipped: !!sendResult.skipped,
    })
  } catch (err) {
    console.error("send-welcome-email error", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}
