// =============================================================================
// nylas-process-email — Phase A (sprint 05)
// =============================================================================
// Async processor for inbound email events. Matches the email to an active
// deal via stakeholder emails; if matched, fetches the full body and feeds
// it to klo-respond as a system 'email' message in deal chat.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const NYLAS_API_URL = Deno.env.get("NYLAS_API_URL") ?? "https://api.us.nylas.com"
const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY") ?? ""

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  try {
    const { nylas_grant_id, nylas_message_id } = await req.json()
    if (!nylas_grant_id || !nylas_message_id) {
      return json({ ok: false, error: "missing_args" }, 400)
    }

    // 1. Load the email_event + grant.
    const { data: event, error: eventErr } = await sb
      .from("email_events")
      .select("*")
      .eq("nylas_grant_id", nylas_grant_id)
      .eq("nylas_message_id", nylas_message_id)
      .maybeSingle()

    if (eventErr || !event) {
      console.error("email_events load failed", eventErr)
      return json({ ok: false, error: "event_not_found" }, 404)
    }

    // Idempotency: if already processed (and not just the stub), skip.
    if (event.processed_at && event.processing_error !== "stub_no_extraction") {
      return json({ ok: true, skipped: "already_processed" })
    }

    const { data: grant } = await sb
      .from("nylas_grants")
      .select("user_id, team_id, email_address, provider")
      .eq("nylas_grant_id", nylas_grant_id)
      .maybeSingle()

    if (!grant) {
      await markProcessed(event.id, "grant_not_found")
      return json({ ok: false, error: "grant_not_found" }, 404)
    }

    // 2. Build participant list (everyone on the email).
    const participants: Array<{ email: string; name?: string }> = []
    if (event.from_addr) participants.push({ email: event.from_addr })
    for (const t of (event.to_addrs ?? []) as Array<{ email: string }>) {
      if (t.email) participants.push({ email: t.email })
    }
    for (const c of (event.cc_addrs ?? []) as Array<{ email: string }>) {
      if (c.email) participants.push({ email: c.email })
    }

    // Skip emails that are entirely user→user (no external party).
    const externalParticipants = participants.filter(
      (p) => p.email.toLowerCase() !== grant.email_address.toLowerCase(),
    )
    if (externalParticipants.length === 0) {
      await markProcessed(event.id, "no_external_participants")
      return json({ ok: true, skipped: "no_external" })
    }

    // 3. Find a matching deal among the user's active deals.
    const { data: deals } = await sb
      .from("deals")
      .select("id, title, klo_state, updated_at")
      .eq("seller_id", grant.user_id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })

    let matchedDealId: string | null = null
    let matchedAddress: string | null = null

    for (const deal of deals ?? []) {
      const people = ((deal.klo_state as { people?: Array<{ email?: string }> })?.people ??
        []) as Array<{ email?: string }>
      const m = emailsMatch(externalParticipants, people)
      if (m.matched) {
        matchedDealId = deal.id
        matchedAddress = m.matched_address ?? null
        break
      }
    }

    if (!matchedDealId) {
      await markProcessed(event.id, "no_stakeholder_match")
      return json({ ok: true, skipped: "no_match" })
    }

    // 4. Fetch the full message body from Nylas.
    const fullMessage = await fetchNylasMessage(nylas_grant_id, nylas_message_id)
    if (!fullMessage) {
      await markProcessed(event.id, "nylas_fetch_failed")
      return json({ ok: false, error: "fetch_failed" }, 502)
    }

    // 5. Insert a system message that becomes part of the chat history.
    const emailSummary = formatEmailForChat({
      from: event.from_addr ?? "unknown",
      to: (event.to_addrs ?? []) as Array<{ email: string; name?: string }>,
      subject: event.subject ?? "(no subject)",
      body: fullMessage.body,
      date: event.received_at,
    })

    const { data: emailMsg, error: msgErr } = await sb
      .from("messages")
      .insert({
        deal_id: matchedDealId,
        sender_type: "system",
        sender_name: "email",
        content: emailSummary,
        visible_to: null,
        metadata: {
          source: "nylas_email",
          email_event_id: event.id,
          nylas_message_id,
        },
      })
      .select("id")
      .single()

    if (msgErr) {
      console.error("email message insert failed", msgErr)
      await markProcessed(event.id, `msg_insert_failed:${msgErr.message}`)
      return json({ ok: false, error: "msg_insert_failed" }, 500)
    }

    // 6. Trigger klo-respond. Direct fetch with service-role apikey because
    //    sb.functions.invoke() does not propagate the service-role key in
    //    edge-function context, AND because the project's new-format keys
    //    (sb_publishable_/sb_secret_) are not JWTs — so klo-respond must be
    //    deployed with verify_jwt: false. We await so Deno doesn't recycle
    //    the worker before the call resolves.
    const kloRes = await fetch(`${SUPABASE_URL}/functions/v1/klo-respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        deal_id: matchedDealId,
        triggering_message_id: emailMsg.id,
      }),
    }).catch((err) => {
      console.error("klo-respond fetch failed", err)
      return null
    })
    if (kloRes && !kloRes.ok) {
      console.error(
        "klo-respond non-2xx",
        kloRes.status,
        (await kloRes.text().catch(() => "")).slice(0, 200),
      )
    }

    // 7. Mark the email_event as processed and link to the deal.
    await sb
      .from("email_events")
      .update({
        deal_id: matchedDealId,
        matched_stakeholder: matchedAddress,
        posted_to_chat_message_id: emailMsg.id,
        processed_at: new Date().toISOString(),
        processing_error: null,
      })
      .eq("id", event.id)

    return json({
      ok: true,
      deal_id: matchedDealId,
      matched_stakeholder: matchedAddress,
      message_id: emailMsg.id,
    })
  } catch (err) {
    console.error("nylas-process-email exception", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

// ----- Helpers --------------------------------------------------------------

async function markProcessed(eventId: string, error: string | null): Promise<void> {
  await sb
    .from("email_events")
    .update({
      processed_at: new Date().toISOString(),
      processing_error: error,
    })
    .eq("id", eventId)
}

function emailsMatch(
  participants: Array<{ email: string }>,
  people: Array<{ email?: string }>,
): { matched: boolean; matched_address?: string; matched_via?: "exact" | "domain" } {
  const peopleEmails = new Set<string>()
  const peopleDomains = new Set<string>()
  for (const p of people) {
    const addr = (p.email ?? "").toLowerCase().trim()
    if (!addr) continue
    peopleEmails.add(addr)
    const dom = domainOf(addr)
    if (dom && !isCommonDomain(dom)) peopleDomains.add(dom)
  }
  if (peopleEmails.size === 0) return { matched: false }

  // Pass 1: exact email match — strongest signal.
  for (const p of participants) {
    const addr = p.email.toLowerCase().trim()
    if (peopleEmails.has(addr)) {
      return { matched: true, matched_address: addr, matched_via: "exact" }
    }
  }

  // Pass 2: domain match. If any participant shares a domain with a known
  // stakeholder on this deal (and that domain isn't a free-mail provider),
  // route the email to this deal. The seller can then add the new contact
  // as a stakeholder; for now we record the matched address so klo-respond
  // sees who actually emailed.
  for (const p of participants) {
    const addr = p.email.toLowerCase().trim()
    const dom = domainOf(addr)
    if (dom && peopleDomains.has(dom)) {
      return { matched: true, matched_address: addr, matched_via: "domain" }
    }
  }

  return { matched: false }
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@")
  if (at < 0) return null
  return email.slice(at + 1).toLowerCase().trim() || null
}

// Free-mail domains shouldn't pull every gmail/outlook contact into a deal.
// Keep this list short and conservative; expand only if seller traffic
// surfaces a missing one.
const COMMON_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
])

function isCommonDomain(d: string): boolean {
  return COMMON_DOMAINS.has(d)
}

async function fetchNylasMessage(
  grantId: string,
  messageId: string,
): Promise<{ body: string; subject?: string } | null> {
  const url = `${NYLAS_API_URL}/v3/grants/${grantId}/messages/${messageId}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${NYLAS_API_KEY}` },
  })
  if (!res.ok) {
    console.error("nylas message fetch failed", res.status, await res.text())
    return null
  }
  const j = await res.json()
  const data = j.data ?? j
  return {
    body: stripHtml(data.body ?? ""),
    subject: data.subject,
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 8000)
}

function formatEmailForChat(args: {
  from: string
  to: Array<{ email: string; name?: string }>
  subject: string
  body: string
  date: string
}): string {
  const toList = args.to
    .map((t) => (t.name ? `${t.name} <${t.email}>` : t.email))
    .join(", ")
  const dateStr = new Date(args.date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
  return `EMAIL — ${dateStr}
From: ${args.from}
To: ${toList}
Subject: ${args.subject}

${args.body}`
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
