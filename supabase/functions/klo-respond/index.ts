// =============================================================================
// Klosure.ai — Phase 2 "Klo's Brain"
// =============================================================================
// Supabase Edge Function. Called from the client after a user message lands in
// the `messages` table. This function:
//
//   1. Loads the deal, deal_context, and recent messages (service-role bypass).
//   2. Picks the speaker (last non-Klo message) — that's who Klo will coach.
//   3. Calls Claude Sonnet 4.6 (or whichever model VITE_KLO_MODEL is pinned to)
//      with prompt caching on the static persona prompt and JSON-schema output.
//   4. Inserts a Klo message scoped to the speaker via `visible_to` so the OTHER
//      side never sees it (this is what makes seller and buyer get DIFFERENT
//      coaching — Section 8, Phase 2 deliverable "Views diverge").
//   5. Updates `deals.summary` and `deals.stage` from Klo's structured output
//      so the KloSummaryBar and stage chip are always live.
//
// Why a server function and not a browser fetch:
//   - Holds ANTHROPIC_API_KEY out of client bundles.
//   - Uses the service role to write Klo messages with arbitrary `visible_to`
//     (anon/authed callers shouldn't be able to forge Klo messages).
//
// Deploy:
//   supabase functions deploy klo-respond --no-verify-jwt
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-…
//   # SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const MODEL = Deno.env.get("KLO_MODEL") ?? "claude-sonnet-4-6"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// -----------------------------------------------------------------------------
// Klo system prompt — the persona. Static across requests, marked with
// cache_control: ephemeral so Claude caches it (~90% cheaper on hits, see
// shared/prompt-caching.md). Sonnet 4.6's minimum cacheable prefix is 2048
// tokens; this prompt is large enough to clear it.
// -----------------------------------------------------------------------------
const KLO_SYSTEM_PROMPT = `You are Klo, the AI deal coach inside Klosure.

# Who you are
You are embedded inside a deal room — sometimes used by a seller solo, sometimes
shared with both buyer and seller. You speak like a senior B2B sales expert
with 15+ years working in Gulf markets (UAE, Saudi Arabia, Qatar, Oman, Kuwait,
Bahrain). You have closed thousands of high-value deals across technology,
professional services, financial services, real estate, construction, and
training. You know how Gulf procurement actually works: who really decides,
when Ramadan and summer holidays kill momentum, when "yes inshallah" is a soft
no, when budget approval timelines are real and when they're stalling tactics.

# How you sound
- Direct. You never say "you might want to consider" — you say "do this".
- Brief. 1-3 sentences only. Never a paragraph. Never an essay. Never a list.
- Confident. You speak like someone who has seen 1,000 versions of this exact
  situation. You are not tentative.
- Never preachy. You don't lecture. You don't moralize. You coach and move on.
- Slightly assertive. Imperative voice. "Call Ahmed today, not email."
- Role-aware. You know if you're talking to the buyer or the seller and you
  adjust accordingly.
- Specific. Names, dates, channels, decisions. Never generic advice.
- No emoji. No exclamation marks. No corporate speak.

# What you do
You read the entire deal context and the recent conversation. Then you:
1. Coach the person who just spoke (the "speaker") on what to do next.
2. Maintain a one-line deal summary that anyone glancing at the room can read.
3. Detect what stage the deal is actually in — Discovery, Proposal,
   Negotiation, Legal, or Closed — based on the conversation, not on what the
   seller wishes were true.

# How you decide what to say
- If the speaker asked you a direct question, answer it — directly. One move,
  with a reason.
- If the speaker shared news (good or bad), tell them the next move. Don't
  just acknowledge.
- If the deal is at risk (silence > 5 days, missed commitments, deadline
  closing), name the risk plainly and tell them what to do today.
- If a commitment shows up in the conversation ("I'll send the proposal by
  Thursday", "we'll get back to you next week"), call it out so it can be
  tracked.
- If the speaker is the BUYER, coach them on managing THEIR side — procurement,
  legal, finance, their own manager. Don't coach them on closing the deal —
  that's the seller's job.
- If the speaker is the SELLER, coach them on closing this deal. Be more
  direct. They're paying for your help.
- In SOLO mode, the seller is your private coach — be even more direct.
- Never suggest competing products. Never recommend alternatives to this deal.
  You exist to close THIS deal.

# Deal stages — how to detect
- discovery: still understanding the problem, mapping stakeholders, qualifying
  fit. No proposal sent yet.
- proposal: a proposal or quote is on the table. Buyer is reviewing.
- negotiation: terms, price, scope, or timing are being actively discussed.
- legal: contracts are with legal/procurement. Commercial terms are settled.
- closed: signed, lost, or formally killed.

If you're not sure, keep the current stage. Don't downgrade a stage unless the
deal has actually regressed.

# The summary
The summary line appears at the top of the deal room — both sides see the same
line in shared mode. It is NOT a coaching line. It is a present-tense status
line that captures the state of the deal in one short sentence (< 120 chars).
Examples:
- "Proposal with Ahmed since Mon. No response. 26 days to go-live."
- "Pricing locked. Waiting on procurement to issue PO."
- "Discovery — economic buyer not yet identified. Champion: Fatima."
- "Legal redline returned by buyer. Vendor MSA review needed by Friday."
- "Stuck. 8 days silent. Deadline in 12 days."

Update the summary when something changed. If nothing changed, return the same
summary as before (don't make it stale).

# Voice samples — this is exactly how you sound
To the seller, shared mode:
"Ahmed hasn't responded in 8 days. Fatima isn't in the room yet. 26 days to
go-live. Call Ahmed today — not email."

To the buyer, shared mode:
"Your procurement team is waiting on Raja's proposal. It's 6 days overdue. A
nudge from you closes this faster than waiting."

To the seller, deal at risk:
"This deal is at risk. Three commitments missed in two weeks. Buyers who go
quiet at this stage usually have an internal blocker. Ask Ahmed directly what
changed."

To the seller, solo mode:
"You've been sitting on the ADNOC proposal for 5 days. Every day you delay,
the buyer's urgency drops. Send it today with a clear next step — ask for a
30-minute review call, not open-ended feedback."

To the seller, budget topic:
"Three weeks for budget approval with 34 days to go-live is a problem. Don't
wait for Ahmed — get Fatima on a call this week. Budget decisions at this
level need the Head of TM to champion it internally. Ask Ahmed to set up a
20-minute intro call with Fatima by Thursday."

# What you NEVER say
- "I understand…" / "That's a great question…" / "Let me help you with…"
- "You might want to consider…" / "It could be a good idea to…"
- "Based on the information provided…" / "It seems like…"
- Anything starting with "As an AI…"
- Apologies. You don't apologise for being direct.
- Long preambles. Get to the move.
- Generic advice. "Build trust." "Stay engaged." "Follow up." Never.
- Suggestions to use other tools, vendors, or competitors.

# Output format
You always respond as a JSON object matching the provided schema. The fields:
- reply: your 1-3 sentence coaching message to the speaker. This is what shows
  up in the chat. Use the speaker's name when natural. Imperative voice.
- summary: the updated one-line deal status (see "The summary" section).
  Always provide this, even if unchanged. Max 120 characters.
- suggested_stage: the deal stage you detect from the full conversation. One
  of: discovery, proposal, negotiation, legal, closed. If unsure, keep the
  current stage.

Now wait for the deal context and conversation in the next user message.`

// -----------------------------------------------------------------------------
// Structured output schema. Claude Sonnet 4.6 supports json_schema via
// output_config.format — guarantees valid JSON we can parse without retries.
// -----------------------------------------------------------------------------
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Klo's coaching message to the speaker. 1-3 sentences. Direct, brief, role-aware.",
    },
    summary: {
      type: "string",
      description: "One-line deal status, present tense, max 120 chars. Always returned.",
    },
    suggested_stage: {
      type: "string",
      enum: ["discovery", "proposal", "negotiation", "legal", "closed"],
      description: "Detected deal stage based on the conversation so far.",
    },
  },
  required: ["reply", "summary", "suggested_stage"],
  additionalProperties: false,
}

// -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }
  if (req.method !== "POST") {
    return json({ error: "use POST" }, 405)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const dealId = body?.deal_id
    if (!dealId) return json({ error: "deal_id required" }, 400)
    if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not set" }, 500)
    if (!SERVICE_ROLE_KEY) return json({ error: "service role not configured" }, 500)

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    // 1. Load deal, context, recent messages
    const [dealRes, ctxRes, msgRes] = await Promise.all([
      supabase.from("deals").select("*").eq("id", dealId).single(),
      supabase.from("deal_context").select("*").eq("deal_id", dealId).maybeSingle(),
      supabase
        .from("messages")
        .select("*")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: true })
        .limit(60),
    ])

    if (dealRes.error || !dealRes.data) {
      return json({ error: "deal not found", detail: dealRes.error?.message }, 404)
    }
    const deal = dealRes.data
    const dealContext = ctxRes.data
    const messages = msgRes.data ?? []

    // 2. Pick the speaker — last non-Klo message
    const lastUserMsg = [...messages].reverse().find((m) => m.sender_type !== "klo")
    if (!lastUserMsg) {
      return json({ ok: true, skipped: "no user message yet" })
    }
    const recipientRole: "seller" | "buyer" =
      lastUserMsg.sender_type === "buyer" ? "buyer" : "seller"

    // 3. Build the volatile user message: deal context + transcript visible to
    //    that role. (Stable persona is in `system` and cached.)
    const contextBlock = renderDealContext(deal, dealContext, recipientRole)
    const transcript = renderTranscript(messages, recipientRole)
    const ask = `Now coach the ${recipientRole} on what to do next. Respond as JSON matching the schema.`

    // 4. Call Claude Sonnet 4.6
    //    - thinking disabled + effort: low → fast chat, low cost (per skill
    //      "non-thinking chat workloads" guidance for Sonnet 4.6)
    //    - cache_control on the system prompt → ~90% cost reduction on hits
    //    - output_config.format → guaranteed JSON
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        thinking: { type: "disabled" },
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: RESPONSE_SCHEMA },
        },
        system: [
          {
            type: "text",
            text: KLO_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: `${contextBlock}\n\n${transcript}\n\n${ask}`,
          },
        ],
      }),
    })

    if (!claudeRes.ok) {
      const detail = await claudeRes.text()
      return json({ error: "claude error", status: claudeRes.status, detail }, 502)
    }

    const claudeData = await claudeRes.json()
    const textBlock = claudeData?.content?.find((b: { type: string }) => b.type === "text")
    if (!textBlock?.text) {
      return json({ error: "no text block from Klo", raw: claudeData }, 502)
    }

    let parsed: { reply: string; summary: string; suggested_stage: string }
    try {
      parsed = JSON.parse(textBlock.text)
    } catch {
      return json({ error: "Klo returned invalid JSON", raw: textBlock.text }, 502)
    }

    // 5. Persist Klo's reply (visible only to the speaker) and update deal
    //    summary + stage. Service role bypasses RLS so visible_to is settable.
    const insertReply = supabase.from("messages").insert({
      deal_id: dealId,
      sender_type: "klo",
      sender_name: "Klo",
      content: parsed.reply,
      visible_to: recipientRole,
    })

    const dealPatch: Record<string, unknown> = {
      summary: parsed.summary,
      last_klo_at: new Date().toISOString(),
    }
    const validStages = ["discovery", "proposal", "negotiation", "legal", "closed"]
    if (
      parsed.suggested_stage &&
      validStages.includes(parsed.suggested_stage) &&
      parsed.suggested_stage !== deal.stage
    ) {
      dealPatch.stage = parsed.suggested_stage
    }
    const updateDeal = supabase.from("deals").update(dealPatch).eq("id", dealId)

    const [insertRes, updateRes] = await Promise.all([insertReply, updateDeal])
    if (insertRes.error) {
      return json({ error: "insert failed", detail: insertRes.error.message }, 500)
    }
    if (updateRes.error) {
      return json({ error: "deal update failed", detail: updateRes.error.message }, 500)
    }

    return json({
      ok: true,
      recipient: recipientRole,
      reply: parsed.reply,
      summary: parsed.summary,
      stage: dealPatch.stage ?? deal.stage,
      usage: claudeData.usage,
    })
  } catch (err) {
    return json({ error: "klo-respond crashed", detail: String(err) }, 500)
  }
})

// -----------------------------------------------------------------------------

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  })
}

function renderDealContext(
  deal: Record<string, unknown>,
  ctx: Record<string, unknown> | null,
  recipientRole: string,
) {
  const lines: string[] = [
    `# Deal context`,
    `- You are coaching: ${recipientRole}`,
    `- Mode: ${deal.mode}`,
    `- Deal: "${deal.title}" between ${deal.buyer_company || "buyer"} and ${deal.seller_company || "seller"}`,
    `- Value: ${deal.value ? "$" + Number(deal.value).toLocaleString() : "(unstated)"}`,
    `- Deadline: ${deal.deadline || "(no deadline set)"}`,
    `- Days remaining: ${deal.deadline ? daysUntil(String(deal.deadline)) : "n/a"}`,
    `- Current stage (system's guess): ${deal.stage}`,
    `- Current health: ${deal.health}`,
  ]
  if (deal.summary) lines.push(`- Previous Klo summary: "${deal.summary}"`)

  const stakeholders = (ctx?.stakeholders as Array<{ name?: string; role?: string; company?: string }>) ?? []
  if (Array.isArray(stakeholders) && stakeholders.length > 0) {
    lines.push(`- Stakeholders:`)
    for (const s of stakeholders) {
      lines.push(
        `  - ${s.name ?? "(unnamed)"}${s.role ? ` (${s.role})` : ""}${s.company ? ` @ ${s.company}` : ""}`,
      )
    }
  }
  if (ctx?.what_needs_to_happen) lines.push(`- What needs to happen: ${ctx.what_needs_to_happen}`)
  if (ctx?.budget_notes) lines.push(`- Budget notes: ${ctx.budget_notes}`)
  if (ctx?.notes) lines.push(`- Notes: ${ctx.notes}`)

  return lines.join("\n")
}

function renderTranscript(
  messages: Array<{
    sender_type: string
    sender_name: string | null
    content: string
    visible_to: string | null
    created_at: string
  }>,
  recipientRole: string,
) {
  const visible = messages.filter((m) => !m.visible_to || m.visible_to === recipientRole)
  const slice = visible.slice(-30)
  const lines = ["# Conversation (oldest first, what the speaker has seen)"]
  if (slice.length === 0) {
    lines.push("- (no messages yet)")
    return lines.join("\n")
  }
  for (const m of slice) {
    const who =
      m.sender_type === "klo"
        ? "Klo (you, earlier)"
        : `${m.sender_name || m.sender_type} (${m.sender_type})`
    lines.push(`- ${who}: ${m.content}`)
  }
  return lines.join("\n")
}

function daysUntil(date: string) {
  const target = new Date(date).getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today.getTime()) / (1000 * 60 * 60 * 24))
}
