// =============================================================================
// aurinko-process-email — Phase B
// =============================================================================
// Async processor for inbound email events from Aurinko. Mirrors the matching
// logic from the old nylas-process-email (stakeholder exact-match → domain
// fallback) and posts a system message into the deal chat that triggers
// klo-respond.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { aurinkoFetch } from "../_shared/aurinko-client.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  try {
    const { aurinko_account_id, aurinko_message_id } = await req.json()
    if (!aurinko_account_id || !aurinko_message_id) {
      return json({ ok: false, error: "missing_args" }, 400)
    }

    // 1. Load the email_event + grant.
    const { data: event } = await sb
      .from("email_events")
      .select("*")
      .eq("aurinko_account_id", aurinko_account_id)
      .eq("aurinko_message_id", aurinko_message_id)
      .maybeSingle()

    if (!event) {
      return json({ ok: false, error: "event_not_found" }, 404)
    }
    if (event.processed_at) {
      return json({ ok: true, skipped: "already_processed" })
    }

    const { data: grant } = await sb
      .from("aurinko_grants")
      .select("user_id, team_id, email_address")
      .eq("aurinko_account_id", aurinko_account_id)
      .maybeSingle()
    if (!grant) {
      await markProcessed(event.id, "grant_not_found")
      return json({ ok: false, error: "grant_not_found" }, 404)
    }

    // 2. Fetch the full message from Aurinko.
    const message = await aurinkoFetch(
      sb,
      aurinko_account_id,
      `/email/messages/${encodeURIComponent(aurinko_message_id)}`,
    )
    if (!message) {
      await markProcessed(event.id, "aurinko_fetch_failed")
      return json({ ok: false, error: "fetch_failed" }, 502)
    }

    // 3. Extract envelope. Aurinko's shape:
    //   from: { name, address }
    //   to / cc / bcc: [{ name, address }]
    //   subject, bodyPlain, bodyHtml, sentDate, receivedDate
    const fromAddr = String((message.from as { address?: string } | undefined)?.address ?? "")
    const toAddrs = ((message.to as Array<{ name?: string; address?: string }> | undefined) ?? [])
      .map((p) => ({ name: p.name, email: p.address ?? "" }))
      .filter((p) => p.email)
    const ccAddrs = ((message.cc as Array<{ name?: string; address?: string }> | undefined) ?? [])
      .map((p) => ({ name: p.name, email: p.address ?? "" }))
      .filter((p) => p.email)
    const subject = String(message.subject ?? "")
    const bodyText = String(message.bodyPlain ?? "")
    const bodyHtml = String(message.bodyHtml ?? "")
    const receivedAt = (message.receivedDate as string | undefined)
      ?? (message.sentDate as string | undefined)
      ?? new Date().toISOString()

    // 4. Backfill envelope fields onto the email_events row.
    await sb
      .from("email_events")
      .update({
        from_addr: fromAddr || null,
        to_addrs: toAddrs,
        cc_addrs: ccAddrs,
        subject: subject || null,
        snippet: bodyText.slice(0, 200),
        received_at: receivedAt,
      })
      .eq("id", event.id)

    // 5. Build participant list and skip emails with no external party.
    const participants: Array<{ email: string; name?: string }> = []
    if (fromAddr) participants.push({ email: fromAddr })
    for (const t of toAddrs) participants.push({ email: t.email, name: t.name })
    for (const c of ccAddrs) participants.push({ email: c.email, name: c.name })

    const externals = participants.filter(
      (p) => p.email.toLowerCase() !== grant.email_address.toLowerCase(),
    )
    if (externals.length === 0) {
      await markProcessed(event.id, "no_external_participants")
      return json({ ok: true, skipped: "no_external" })
    }

    // 6. Find a matching deal among the user's active deals.
    const matched = await matchDeal(grant.user_id, externals)
    if (!matched.dealId) {
      await markProcessed(event.id, "no_stakeholder_match")
      return json({ ok: true, skipped: "no_match" })
    }

    // 7. Insert the system 'email' message — but only if no message for this
    // Aurinko message_id already exists in this deal. Aurinko sometimes fires
    // both messages.created and messages.updated for the same email; without
    // this guard we get duplicate pills (the processed_at check above has a
    // TOCTOU race when two webhooks arrive within a few hundred ms).
    const { data: existing } = await sb
      .from("messages")
      .select("id")
      .eq("deal_id", matched.dealId)
      .eq("metadata->>aurinko_message_id", aurinko_message_id)
      .maybeSingle()
    if (existing) {
      await markProcessed(event.id, "duplicate_message_skipped")
      return json({ ok: true, skipped: "duplicate", message_id: existing.id })
    }

    const emailSummary = formatEmailForChat({
      from: fromAddr || "unknown",
      to: toAddrs,
      subject: subject || "(no subject)",
      body: bodyText || stripHtml(bodyHtml),
      date: receivedAt,
    })

    const { data: emailMsg, error: msgErr } = await sb
      .from("messages")
      .insert({
        deal_id: matched.dealId,
        sender_type: "system",
        sender_name: "email",
        content: emailSummary,
        visible_to: null,
        metadata: {
          source: "aurinko_email",
          email_event_id: event.id,
          aurinko_message_id,
        },
      })
      .select("id")
      .single()

    if (msgErr) {
      console.error("email message insert failed", msgErr)
      await markProcessed(event.id, `msg_insert_failed:${msgErr.message}`)
      return json({ ok: false, error: "msg_insert_failed" }, 500)
    }

    // 8. Trigger klo-respond.
    await fetch(`${SUPABASE_URL}/functions/v1/klo-respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        deal_id: matched.dealId,
        triggering_message_id: emailMsg.id,
      }),
    }).catch((err) => console.error("klo-respond fetch failed", err))

    // 9. Mark the event processed.
    await sb
      .from("email_events")
      .update({
        deal_id: matched.dealId,
        matched_stakeholder: matched.address,
        posted_to_chat_message_id: emailMsg.id,
        processed_at: new Date().toISOString(),
        processing_error: null,
      })
      .eq("id", event.id)

    return json({ ok: true, deal_id: matched.dealId, message_id: emailMsg.id })
  } catch (err) {
    console.error("aurinko-process-email exception", err)
    return json({ ok: false, error: "exception", detail: String(err) }, 500)
  }
})

// ----- Helpers -------------------------------------------------------------

async function markProcessed(eventId: string, error: string | null): Promise<void> {
  await sb
    .from("email_events")
    .update({
      processed_at: new Date().toISOString(),
      processing_error: error,
    })
    .eq("id", eventId)
}

async function matchDeal(
  sellerId: string,
  externals: Array<{ email: string; name?: string }>,
): Promise<{ dealId: string | null; address: string | null }> {
  const { data: deals } = await sb
    .from("deals")
    .select("id, klo_state")
    .eq("seller_id", sellerId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })

  if (!deals || deals.length === 0) return { dealId: null, address: null }

  const dealIds = deals.map((d) => d.id)
  const { data: contexts } = await sb
    .from("deal_context")
    .select("deal_id, stakeholders")
    .in("deal_id", dealIds)

  const stakeholdersByDeal = new Map<string, Array<{ email?: string }>>()
  for (const ctx of contexts ?? []) {
    stakeholdersByDeal.set(
      ctx.deal_id as string,
      (ctx.stakeholders ?? []) as Array<{ email?: string }>,
    )
  }

  function emailsForDeal(deal: { id: string; klo_state: unknown }): string[] {
    const people = ((deal.klo_state as { people?: Array<{ email?: string }> })?.people ??
      []) as Array<{ email?: string }>
    const stakeholders = stakeholdersByDeal.get(deal.id) ?? []
    const out = new Set<string>()
    for (const p of [...people, ...stakeholders]) {
      const addr = (p.email ?? "").toLowerCase().trim()
      if (addr) out.add(addr)
    }
    return [...out]
  }

  // Pass 1: exact email match.
  for (const deal of deals) {
    const peopleEmails = new Set(emailsForDeal(deal))
    if (peopleEmails.size === 0) continue
    for (const ext of externals) {
      if (peopleEmails.has(ext.email.toLowerCase())) {
        return { dealId: deal.id, address: ext.email.toLowerCase() }
      }
    }
  }

  // Pass 2: domain fallback (excluding free-mail domains).
  for (const deal of deals) {
    const peopleDomains = new Set(
      emailsForDeal(deal)
        .map((e) => domainOf(e))
        .filter((d): d is string => !!d && !isCommonDomain(d)),
    )
    if (peopleDomains.size === 0) continue
    for (const ext of externals) {
      const dom = domainOf(ext.email.toLowerCase())
      if (dom && peopleDomains.has(dom)) {
        return { dealId: deal.id, address: ext.email.toLowerCase() }
      }
    }
  }
  return { dealId: null, address: null }
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@")
  if (at < 0) return null
  return email.slice(at + 1).toLowerCase().trim() || null
}

const COMMON_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "icloud.com", "me.com",
  "proton.me", "protonmail.com", "aol.com",
])

function isCommonDomain(d: string): boolean { return COMMON_DOMAINS.has(d) }

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
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
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
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
