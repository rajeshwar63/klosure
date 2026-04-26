// =============================================================================
// Klosure.ai — Phase 3 "Klo Watcher"
// =============================================================================
// Supabase Edge Function. Runs on a schedule (Supabase Cron) and also accepts
// manual POST invocations for testing. On every run it:
//
//   1. Calls public.mark_overdue_commitments() — flips any confirmed commitment
//      whose due_date has passed to status='overdue', returning the rows that
//      were just flipped (so we only nudge once per overdue event).
//   2. For each newly-overdue commitment:
//        a. Loads its deal + context + recent messages.
//        b. Asks Claude Sonnet 4.6 for a role-scoped nudge per side
//           (one for the seller, one for the buyer in shared mode).
//        c. Inserts those nudges as Klo messages with visible_to scoped
//           accordingly — so each side sees coaching framed for them.
//        d. Marks the row's nudge_sent_at = now() so we don't double-fire.
//        e. Sends the seller a Resend email with the Klo nudge text and a
//           link back to the room.
//   3. The commitments_recalc_health trigger automatically refreshes
//      deals.health on every status change above (Green / Amber / Red).
//
// Setup:
//   supabase functions deploy klo-watcher --no-verify-jwt
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase secrets set RESEND_API_KEY=re_...
//   supabase secrets set RESEND_FROM='Klo <klo@klosure.ai>'
//   supabase secrets set APP_URL=https://klosure.ai
//
// Schedule (Supabase dashboard → Database → Cron Jobs):
//   select cron.schedule(
//     'klo-watcher-hourly',
//     '0 * * * *',
//     $$ select net.http_post(
//       url := 'https://<project-ref>.supabase.co/functions/v1/klo-watcher',
//       headers := jsonb_build_object('Authorization', 'Bearer <anon-key>')
//     ); $$
//   );
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { callLlm } from "../_shared/llm-client.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const USE_GEMINI = (Deno.env.get("USE_GEMINI") ?? "true").toLowerCase() === "true"
const KLO_MODEL_GEMINI = Deno.env.get("KLO_MODEL_GEMINI") ?? "gemini-3.1-flash-lite-preview"
const KLO_MODEL_ANTHROPIC = Deno.env.get("KLO_MODEL_ANTHROPIC") ?? "claude-sonnet-4-5"
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? ""
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Klo <klo@klosure.ai>"
const APP_URL = (Deno.env.get("APP_URL") ?? "https://klosure.ai").replace(/\/$/, "")

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Compact persona for the nudge generator. Same voice as klo-respond, but
// scoped to a single job: write one short message about a specific overdue
// commitment, framed for the recipient role. Cached on every call.
const NUDGE_SYSTEM_PROMPT = `You are Klo, the AI deal coach inside Klosure.

Generate ONE short nudge for an overdue sales commitment.

Voice — Klo speaks like a senior B2B sales expert with 15+ years working in Gulf markets:
- Direct. "Your proposal to Nina is 3 days overdue."
- Followed by ONE action. "Send it before EOD or call her to reset expectations."
- 1-3 sentences. Max 280 characters. Imperative voice.
- No emoji. No greetings. No filler.
- DO NOT say: "Hi there!", "Just a friendly reminder", "I understand", "you might want to consider", "as an AI".

Role-specific framing:
- If you are talking to the SELLER: this is THEIR deal to close. Be direct
  about the consequence. Tell them the move — call, not email. Name the
  blocker if you can infer one. Reference the commitment by what it actually
  is, not "your commitment".
- If you are talking to the BUYER: coach them on managing THEIR side
  (procurement, legal, finance, their own manager). Don't push them to close
  the deal — that's the seller's job. Tell them what one move on their side
  unblocks this.
- If the OWNER of the overdue commitment is the OTHER party from the speaker,
  frame the nudge as "push them" / "ask them today" — not "you missed it".
- If the OWNER of the overdue commitment is the SPEAKER, name it plainly: it
  slipped, here is the move to recover.

Output ONLY the nudge text. No JSON wrapper. No preamble. No prefixes.`

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }

  try {
    if (!SERVICE_ROLE_KEY) return json({ error: "service role not configured" }, 500)

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    // 1. Mark anything overdue. The function returns the rows it just flipped.
    const { data: flipped, error: flipErr } = await supabase.rpc("mark_overdue_commitments")
    if (flipErr) return json({ error: "mark_overdue failed", detail: flipErr.message }, 500)

    const newlyOverdueIds = (flipped ?? []).map((r: { commitment_id: string }) => r.commitment_id)

    // Also re-nudge anything that was already overdue but never sent a nudge
    // (e.g. if the previous run errored before nudge_sent_at was written).
    const { data: needsNudge } = await supabase
      .from("commitments")
      .select("id, deal_id")
      .eq("status", "overdue")
      .is("nudge_sent_at", null)

    const targets = dedupeIds([...newlyOverdueIds, ...(needsNudge ?? []).map((r) => r.id)])

    if (targets.length === 0) {
      return json({ ok: true, processed: 0, message: "nothing to nudge" })
    }

    const results: Array<Record<string, unknown>> = []
    for (const commitmentId of targets) {
      try {
        const r = await processCommitment(supabase, commitmentId)
        results.push({ commitmentId, ...r })
      } catch (err) {
        results.push({ commitmentId, ok: false, error: String(err) })
      }
    }

    return json({ ok: true, processed: results.length, results })
  } catch (err) {
    return json({ error: "klo-watcher crashed", detail: String(err) }, 500)
  }
})

// -----------------------------------------------------------------------------

async function processCommitment(
  supabase: ReturnType<typeof createClient>,
  commitmentId: string,
) {
  // Load the commitment + parent deal + context + recent transcript.
  const { data: commitment, error: cErr } = await supabase
    .from("commitments")
    .select("*")
    .eq("id", commitmentId)
    .single()
  if (cErr || !commitment) throw new Error(`commitment ${commitmentId} not found`)
  if (commitment.nudge_sent_at) {
    return { skipped: "already nudged" }
  }

  const dealId = commitment.deal_id as string

  // Load deal first — we need seller_id from it before we can join users.
  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .single()
  if (dealErr || !deal) throw new Error("deal not found")

  const [ctxRes, msgRes, sellerRes, accessRes] = await Promise.all([
    supabase.from("deal_context").select("*").eq("deal_id", dealId).maybeSingle(),
    supabase
      .from("messages")
      .select("*")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("users")
      .select("id, email, name")
      .eq("id", deal.seller_id)
      .maybeSingle(),
    supabase
      .from("deal_access")
      .select("*")
      .eq("deal_id", dealId)
      .eq("role", "buyer")
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const ctx = ctxRes.data
  const recent = (msgRes.data ?? []).reverse()
  const seller = sellerRes.data
  const buyerName = (accessRes.data?.buyer_name as string | undefined) ?? null

  // Generate role-scoped nudges. Solo mode → seller only. Shared → both sides.
  const nudgeRoles: Array<"seller" | "buyer"> =
    deal.mode === "shared" ? ["seller", "buyer"] : ["seller"]

  const nudges: Record<string, string> = {}
  for (const role of nudgeRoles) {
    const text = await generateNudge({
      role,
      deal,
      ctx,
      commitment,
      recent,
      buyerName,
      sellerName: seller?.name as string | undefined,
    })
    nudges[role] = text
  }

  // Insert one Klo message per nudge, role-scoped via visible_to.
  const insertRows = nudgeRoles.map((role) => ({
    deal_id: dealId,
    sender_type: "klo",
    sender_name: "Klo",
    content: nudges[role],
    visible_to: role,
  }))
  const { error: insertErr } = await supabase.from("messages").insert(insertRows)
  if (insertErr) throw new Error(`message insert failed: ${insertErr.message}`)

  // Mark nudge_sent_at so we don't double-fire on the next watcher tick.
  // The trigger on commitments will re-run recalculate_deal_health() — that
  // keeps the Green/Amber/Red pill in sync.
  const { error: updErr } = await supabase
    .from("commitments")
    .update({ nudge_sent_at: new Date().toISOString() })
    .eq("id", commitmentId)
  if (updErr) throw new Error(`update nudge_sent_at: ${updErr.message}`)

  // Send the seller an email via Resend (one-shot). The buyer is anonymous —
  // Phase 4 will add a buyer email field to deal_access.
  let emailResult: { sent: boolean; detail?: string } = { sent: false }
  if (RESEND_API_KEY && seller?.email) {
    emailResult = await sendNudgeEmail({
      to: seller.email as string,
      name: (seller.name as string) || "there",
      deal,
      commitment,
      nudgeText: nudges["seller"],
    })
  }

  return { ok: true, nudgedRoles: nudgeRoles, email: emailResult }
}

async function generateNudge(args: {
  role: "seller" | "buyer"
  deal: Record<string, unknown>
  ctx: Record<string, unknown> | null
  commitment: Record<string, unknown>
  recent: Array<Record<string, unknown>>
  buyerName: string | null
  sellerName: string | undefined
}) {
  const { role, deal, ctx, commitment, recent, buyerName, sellerName } = args
  const days = commitment.due_date ? daysUntil(String(commitment.due_date)) : null
  const overdueLabel = days !== null && days < 0 ? `${Math.abs(days)}d overdue` : "overdue"
  const owner = commitment.owner as string
  const ownerLabel = (commitment.owner_name as string) || (owner === "seller" ? "the seller" : "the buyer")
  const speakerName = role === "seller" ? sellerName ?? "" : buyerName ?? ""

  const lines: string[] = [
    `# Overdue commitment`,
    `- Task: "${commitment.task}"`,
    `- Owner: ${ownerLabel} (${owner})`,
    `- Due date: ${commitment.due_date} (${overdueLabel})`,
    ``,
    `# Deal`,
    `- "${deal.title}" between ${deal.buyer_company || "buyer"} and ${deal.seller_company || "seller"}`,
    `- Mode: ${deal.mode}`,
    `- Stage: ${deal.stage}`,
    `- Health: ${deal.health}`,
    `- Deadline: ${deal.deadline || "(none)"} ${deal.deadline ? `(${daysUntil(String(deal.deadline))}d to go-live)` : ""}`,
    `- Value: ${deal.value ? "$" + Number(deal.value).toLocaleString() : "(unstated)"}`,
  ]
  if (ctx?.what_needs_to_happen) lines.push(`- What needs to happen: ${ctx.what_needs_to_happen}`)
  if (ctx?.budget_notes) lines.push(`- Budget notes: ${ctx.budget_notes}`)

  lines.push(``, `# Recent conversation (oldest first)`)
  const visible = recent.filter((m) => !m.visible_to || m.visible_to === role)
  if (visible.length === 0) {
    lines.push(`- (no messages yet)`)
  } else {
    for (const m of visible.slice(-12)) {
      const who = m.sender_type === "klo" ? "Klo" : `${m.sender_name || m.sender_type}`
      lines.push(`- ${who}: ${m.content}`)
    }
  }
  lines.push(
    ``,
    `# Speaker`,
    `- You are writing this nudge to: ${role}${speakerName ? ` (${speakerName})` : ""}`,
    `- The owner of the overdue commitment is the ${owner === role ? "speaker themselves" : "OTHER party"}.`,
    ``,
    `Write the nudge now. Output only the nudge text.`,
  )

  const result = await callLlm({
    systemPrompt: NUDGE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: lines.join("\n") }],
    maxTokens: 200,
    temperature: 0.5,
  })

  if (result.toolCalled) {
    throw new Error("unexpected tool call in klo-watcher nudge")
  }
  const text = result.text.trim()
  if (!text) throw new Error("empty nudge from Klo")

  console.log(JSON.stringify({
    event: "klo_watcher_nudge_complete",
    model: USE_GEMINI ? KLO_MODEL_GEMINI : KLO_MODEL_ANTHROPIC,
    role,
    deal_id: deal.id,
  }))

  return text
}

async function sendNudgeEmail(args: {
  to: string
  name: string
  deal: Record<string, unknown>
  commitment: Record<string, unknown>
  nudgeText: string
}) {
  const { to, name, deal, commitment, nudgeText } = args
  const dealUrl = `${APP_URL}/deals/${deal.id}`
  const subject = `Klo: "${commitment.task}" is overdue — ${deal.title}`
  const html = renderEmailHtml({ name, deal, commitment, nudgeText, dealUrl })
  const text = renderEmailText({ name, deal, commitment, nudgeText, dealUrl })

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject,
      html,
      text,
    }),
  })
  if (!res.ok) {
    const detail = await res.text()
    return { sent: false, detail: `resend ${res.status}: ${detail}` }
  }
  return { sent: true }
}

function renderEmailHtml(args: {
  name: string
  deal: Record<string, unknown>
  commitment: Record<string, unknown>
  nudgeText: string
  dealUrl: string
}) {
  const { name, deal, commitment, nudgeText, dealUrl } = args
  const days = commitment.due_date ? daysUntil(String(commitment.due_date)) : null
  const overdueLabel = days !== null && days < 0 ? `${Math.abs(days)} days overdue` : "overdue"
  return `<!doctype html>
<html>
<body style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background:#f5f6f8; margin:0; padding:24px; color:#1A1A2E;">
  <div style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:14px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <div style="font-size:12px; color:#4F8EF7; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:6px;">◆ Klo</div>
    <h1 style="font-size:18px; font-weight:600; margin:0 0 4px 0;">${escapeHtml(String(deal.title || "Deal"))}</h1>
    <p style="font-size:13px; color:rgba(26,26,46,0.6); margin:0 0 18px 0;">Hi ${escapeHtml(name)} — a commitment in this room just slipped.</p>

    <div style="background:#fff5f5; border:1px solid #fecaca; border-radius:10px; padding:14px 16px; margin-bottom:18px;">
      <div style="font-size:11px; color:#991b1b; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">${escapeHtml(overdueLabel)}</div>
      <div style="font-size:15px; font-weight:600; color:#1A1A2E;">${escapeHtml(String(commitment.task))}</div>
      <div style="font-size:12px; color:rgba(26,26,46,0.6); margin-top:4px;">Owner: ${escapeHtml(String(commitment.owner_name || commitment.owner))}</div>
    </div>

    <div style="background:#E8F0FE; border-left:3px solid #4F8EF7; padding:12px 14px; border-radius:6px; margin-bottom:20px;">
      <div style="font-size:11px; color:#4F8EF7; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Klo says</div>
      <div style="font-size:14px; line-height:1.45;">${escapeHtml(nudgeText)}</div>
    </div>

    <a href="${escapeHtml(dealUrl)}" style="display:inline-block; background:#4F8EF7; color:#ffffff; text-decoration:none; font-weight:600; padding:11px 18px; border-radius:10px; font-size:14px;">Open the room</a>

    <p style="font-size:11px; color:rgba(26,26,46,0.4); margin:24px 0 0 0;">You're getting this because you're the seller on this deal in Klosure.</p>
  </div>
</body>
</html>`
}

function renderEmailText(args: {
  name: string
  deal: Record<string, unknown>
  commitment: Record<string, unknown>
  nudgeText: string
  dealUrl: string
}) {
  const { name, deal, commitment, nudgeText, dealUrl } = args
  const days = commitment.due_date ? daysUntil(String(commitment.due_date)) : null
  const overdueLabel = days !== null && days < 0 ? `${Math.abs(days)} days overdue` : "overdue"
  return [
    `Klo — ${deal.title}`,
    ``,
    `Hi ${name},`,
    ``,
    `A commitment in this deal just slipped (${overdueLabel}):`,
    `  "${commitment.task}"`,
    `  Owner: ${commitment.owner_name || commitment.owner}`,
    ``,
    `Klo says:`,
    `  ${nudgeText}`,
    ``,
    `Open the room: ${dealUrl}`,
  ].join("\n")
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function dedupeIds(ids: string[]) {
  return Array.from(new Set(ids))
}

function daysUntil(date: string) {
  const target = new Date(date).getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today.getTime()) / (1000 * 60 * 60 * 24))
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  })
}
