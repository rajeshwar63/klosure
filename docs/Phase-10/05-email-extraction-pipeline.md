# Sprint 05 — Email extraction pipeline

**Sprint:** 5 of 11
**Estimated:** 1.5 days
**Goal:** Wire the `nylas-process-email` stub into a real pipeline. Match incoming emails to deals via stakeholder email addresses. For matched emails, fetch the body, feed it to klo-respond, and post Klo's update in the deal chat.

## Why this matters

This sprint hits the roadmap's first acceptance criterion: **"Connect a Gmail account; emails with deal stakeholders appear as Klo updates within 60 seconds."** Everything in sprints 1–4 was infrastructure. This sprint is where Phase A delivers user-visible value.

The stakeholder match is the load-bearing decision. Without it, every personal email becomes a Klo update — unusable. With it, only emails relevant to active deals trigger work, which keeps cost and noise both low.

## Pipeline

```
nylas-process-email called with (grant_id, message_id)
    ↓
Load email_events row + grant + grant.user_id
    ↓
Match: any address in (from, to, cc) ∈ klo_state.people for any active deal of the user?
    ↓ NO  → mark processed_at, processing_error='no_stakeholder_match', return
    ↓ YES → continue
    ↓
Fetch full message body from Nylas
    ↓
Call klo-respond with email_input = { from, to, cc, subject, body }
    ↓
klo-respond extracts → updates klo_state → returns chat_reply
    ↓
Insert chat message: sender='klo', content="Read your email with Sarah. Two things changed: ..."
    ↓
Update email_events: deal_id, matched_stakeholder, posted_to_chat_message_id, processed_at
```

## Deliverable

Two changes:
1. Replace the `nylas-process-email` stub with the real pipeline
2. Extend `klo-respond` to accept an `email_input` parameter (treat it as another message in the conversation history)

## Stakeholder match algorithm

The match is a normalised email comparison. Klosure stores stakeholders in `klo_state.people[]` with `name`, `role`, `company` — but **not always email**. The Phase 4.5 prompt rules don't require an email field on people. We need to add it.

### Schema decision: extend klo_state.people with optional email

Option A: Add `email` to people in `klo_state.people[]`. Update extraction prompts to capture emails when mentioned.
Option B: Match on display name + company instead of email.
Option C: Add a separate `stakeholder_emails` lookup table.

**Decision: A.** Lowest schema change, leverages existing extraction. The cost is one prompt update — small.

This means:
- New deals built post-Phase-A capture stakeholder emails as they appear in chat ("Sarah from Aramco" + later mention of "sarah.k@aramco.com")
- Existing deals get emails populated when the seller mentions them in chat going forward
- For the initial Gulf demo deals, Rajeshwar can manually add emails to `klo_state.people` via SQL once

The match function is defensive against missing email:

```typescript
function emailsMatch(
  participants: Array<{ email: string }>,
  people: Array<{ email?: string; name?: string }>,
): { matched: boolean; matched_address?: string } {
  const peopleEmails = new Set(
    people.map(p => (p.email ?? "").toLowerCase().trim()).filter(Boolean)
  )
  for (const p of participants) {
    const addr = p.email.toLowerCase().trim()
    if (peopleEmails.has(addr)) return { matched: true, matched_address: addr }
  }
  return { matched: false }
}
```

Cross-deal match: a single user can have many active deals. We check the user's deals one by one; first match wins. If an email matches stakeholders in multiple deals (e.g. a contact who's involved in 2 parallel opportunities), it goes to the most recently active deal.

## nylas-process-email — full implementation

Path: `supabase/functions/nylas-process-email/index.ts`

```typescript
// =============================================================================
// nylas-process-email — Phase A (sprint 05)
// =============================================================================
// Async processor for inbound email events. Matches the email to an active
// deal via stakeholder emails; if matched, fetches the full body and feeds
// it to klo-respond as an email_input.
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
    const { data: event, error: eventErr } = await sb.from("email_events")
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

    const { data: grant } = await sb.from("nylas_grants")
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

    // Skip emails that are entirely user→user (no external party). E.g.
    // user emailed themselves or only internal addresses.
    const externalParticipants = participants.filter(
      p => p.email.toLowerCase() !== grant.email_address.toLowerCase()
    )
    if (externalParticipants.length === 0) {
      await markProcessed(event.id, "no_external_participants")
      return json({ ok: true, skipped: "no_external" })
    }

    // 3. Find a matching deal among the user's active deals.
    const { data: deals } = await sb.from("deals")
      .select("id, title, klo_state, updated_at")
      .eq("seller_id", grant.user_id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })

    let matchedDealId: string | null = null
    let matchedAddress: string | null = null

    for (const deal of deals ?? []) {
      const people = (deal.klo_state?.people ?? []) as Array<{ email?: string }>
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
    // This is what Klo "reads" — the email shows up as a system-tagged event
    // in the conversation. The actual extraction happens when klo-respond
    // runs over the new conversation state.
    const emailSummary = formatEmailForChat({
      from: event.from_addr ?? "unknown",
      to: (event.to_addrs ?? []) as Array<{ email: string; name?: string }>,
      subject: event.subject ?? "(no subject)",
      body: fullMessage.body,
      date: event.received_at,
    })

    const { data: emailMsg, error: msgErr } = await sb.from("messages")
      .insert({
        deal_id: matchedDealId,
        sender_type: "system",
        sender_name: "email",
        content: emailSummary,
        visible_to: null,  // both sides see system messages
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

    // 6. Trigger klo-respond. It will see the new system message in the
    // history and extract from it. Klo's chat_reply will be the
    // "Read your email with Sarah. Two things changed: ..." update.
    await sb.functions.invoke("klo-respond", {
      body: {
        deal_id: matchedDealId,
        triggering_message_id: emailMsg.id,
      },
    }).catch((err) => {
      console.error("klo-respond invoke failed", err)
      // Don't fail the whole pipeline — the email row is saved, klo-respond
      // can be retried manually if needed.
    })

    // 7. Mark the email_event as processed and link to the deal.
    await sb.from("email_events")
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
  await sb.from("email_events")
    .update({
      processed_at: new Date().toISOString(),
      processing_error: error,
    })
    .eq("id", eventId)
}

function emailsMatch(
  participants: Array<{ email: string }>,
  people: Array<{ email?: string }>,
): { matched: boolean; matched_address?: string } {
  const peopleEmails = new Set(
    people.map(p => (p.email ?? "").toLowerCase().trim()).filter(Boolean)
  )
  if (peopleEmails.size === 0) return { matched: false }
  for (const p of participants) {
    const addr = p.email.toLowerCase().trim()
    if (peopleEmails.has(addr)) return { matched: true, matched_address: addr }
  }
  return { matched: false }
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
  const json = await res.json()
  // Nylas returns { data: { body, subject, ... } }
  const data = json.data ?? json
  return {
    body: stripHtml(data.body ?? ""),
    subject: data.subject,
  }
}

function stripHtml(html: string): string {
  // Cheap HTML→text. Good enough for klo-respond.
  return html
    .replace(/<style[^>]*>.*?<\/style>/gis, "")
    .replace(/<script[^>]*>.*?<\/script>/gis, "")
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
    .slice(0, 8000)  // cap to keep token cost predictable
}

function formatEmailForChat(args: {
  from: string
  to: Array<{ email: string; name?: string }>
  subject: string
  body: string
  date: string
}): string {
  const toList = args.to.map(t => t.name ? `${t.name} <${t.email}>` : t.email).join(", ")
  const dateStr = new Date(args.date).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  })
  return `📧 EMAIL — ${dateStr}
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
```

## klo-respond extension

`klo-respond` already loads chat history and extracts from it. Email messages now come through as `sender_type='system', sender_name='email'`. We need:

1. Allow `system` as a valid `sender_type` in the existing message-loading logic
2. Update the extraction prompt to recognize the email format and treat it as ground truth

### Code change in supabase/functions/klo-respond/index.ts

In the `MessageRow` interface, expand the type:

```typescript
interface MessageRow {
  id: string
  sender_type: "seller" | "buyer" | "klo" | "system"   // ADD "system"
  sender_name: string | null
  content: string
  created_at: string
}
```

In `loadDealContext`, the message query already uses `select("id, sender_type, ...")` so no change there — system messages flow through automatically.

In `loadDealContext`, when computing `recipientRole`:

```typescript
// recipientRole = role of the most recent non-Klo non-system message sender.
// If the trigger was a system message (email), Klo's reply is for the seller.
const lastNonKloNonSystem = [...messages]
  .reverse()
  .find((m) => m.sender_type !== "klo" && m.sender_type !== "system")
const recipientRole: "seller" | "buyer" =
  lastNonKloNonSystem?.sender_type === "buyer" ? "buyer" : "seller"
```

### Prompt update — extraction-prompt.ts

Add this block to `_shared/prompts/extraction-rules-text.ts` under a new section:

```typescript
export const EMAIL_AND_MEETING_RULES = `
<email_and_meeting_inputs>
Some messages in the conversation history are tagged with sender_type='system' and sender_name='email' or 'meeting'. These are not chat messages — they are signals from the seller's connected inbox or calendar.

When you see a system 'email' message:
- Treat the email content as the most reliable source of truth (more reliable than the seller's typed messages — emails are direct evidence)
- Extract: dates, dollar amounts, decisions, blockers, new stakeholders, deadline changes
- If the email contains a stakeholder email address you don't have in klo_state.people yet, ADD it
- If the email contains a date that conflicts with a date already in klo_state, the email wins (but flag it in chat_reply)
- Your chat_reply should reference the email naturally: "Read your email with Sarah. Two things changed: deadline moved to March 15, Procurement's now in the loop." Not "I have processed an email." Not "An email was received." Be the colleague reading their inbox over their shoulder.

When you see a system 'meeting' message:
- The content is a transcript of a meeting
- Extract any commitments made by either side
- Identify who said what (use speaker labels in the transcript)
- Update stakeholder roles based on what they actually said in the meeting
- Your chat_reply should be: "Caught the call with Sarah and Ahmed. Three takeaways: ..." — short, direct, action-oriented.

Length discipline applies as always: chat_reply max 4 sentences. If you have 8 things to say about an email, pick the 3 that change the deal.
</email_and_meeting_inputs>
`
```

Then in `extraction-prompt.ts`, append this to the existing rules text:

```typescript
import { EMAIL_AND_MEETING_RULES } from './extraction-rules-text.ts'

// In buildExtractionPrompt, append after the existing extraction rules:
return `... existing prompt ...

${EMAIL_AND_MEETING_RULES}

... rest of prompt ...`
```

## Migration for existing deals

Existing deals don't have `email` on people. To make the demo work, manually backfill for one or two of Rajeshwar's real deals:

```sql
-- Example: add Sarah's email to a specific deal's stakeholders
update deals
set klo_state = jsonb_set(
  klo_state,
  '{people}',
  (
    select jsonb_agg(
      case
        when p->>'name' = 'Sarah Khan' then p || '{"email": "sarah.k@aramco.com"}'::jsonb
        else p
      end
    )
    from jsonb_array_elements(klo_state->'people') p
  )
)
where id = '<deal-uuid>';
```

This is one-time pain. Going forward, the prompt update auto-extracts emails as they appear in chat.

## Acceptance

- [ ] `nylas-process-email` deploys without errors
- [ ] `klo-respond` redeployed with the prompt update and `system` sender type
- [ ] Test email from a known stakeholder produces a Klo message in deal chat within 60s
- [ ] Test email from an unknown sender produces an `email_events` row with `processing_error='no_stakeholder_match'`
- [ ] The Klo message references the email naturally ("Read your email with X")
- [ ] `klo_state` has been updated based on email content (e.g. new commitment, date change)
- [ ] Sending the same email twice (force a webhook replay) does NOT duplicate the chat message — the upsert on email_events catches the dupe and skips
- [ ] An email where the sender's address is added to `klo_state.people` for the FIRST time appears in the people list after extraction (verify the prompt adds emails to existing people on subsequent emails too)

## End-to-end demo script (use this as the acceptance walkthrough)

1. Pick a real deal you have (e.g. ATS prospect with their VP)
2. Manually add the VP's email to `klo_state.people` via SQL
3. Send an email to/from the VP about that deal — actual content like "Can we push the kickoff to March 22?"
4. Watch the deal chat — within 60s a Klo message appears: "Read your email with [VP name]. They want to push kickoff to March 22 — that's a one-week slip from your existing March 15 target."
5. Open the Overview tab — confirm `klo_state.deadline` reflects the new proposed date

This is the moment Klosure changes from "deal coach you talk to" → "deal coach that watches your inbox." If this demo lands, you have the conviction to keep building Phase A. If it feels weird or wrong, stop and figure out why before sprint 6.

## Pitfalls

- **Email body size** → some marketing emails are huge. The 8000-char cap in `stripHtml` is intentional. Larger bodies waste tokens for no signal.
- **Don't let klo-respond run on system messages alone** — the existing loop posts a Klo reply on every triggering message. For email triggers, that's the desired behavior. But triple-check that bootstrap flow doesn't fire on email triggers (it shouldn't, because deals already have klo_state by Phase A — but if you hit a legacy null-state deal, bootstrap will try to read the email body which is fine).
- **Reply chains create duplicates** — when someone replies to a thread, both the new message AND the quoted history are in the body. The prompt should handle this naturally (extract only what's new), but watch for it in early testing.
- **Out-of-office replies** — autoreplies from stakeholders will trigger Klo. That's actually fine ("OOO until Apr 5" is genuine signal — Klo should note that the stakeholder is unavailable).
- **Forwarded emails** — if the seller forwards a stakeholder's email to themselves, the from_addr is the seller, not the stakeholder. Match still works because the stakeholder is in to/cc, but the chat reply might read awkwardly. Acceptable; can be improved in Phase B.

→ Next: `06-meeting-extraction-pipeline.md`
