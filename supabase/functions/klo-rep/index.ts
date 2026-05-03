// =============================================================================
// Klosure.ai — Phase 17 "Rep talks to Klo about their own pipeline"
// =============================================================================
// A rep with 20+ deals can't realistically open every Deal Room to ask Klo
// pipeline-wide questions ("which of my deals are slipping?", "what should I
// focus on today?"). This edge function powers the third Klo surface — the
// first two being per-deal `messages` (klo-respond) and team-level
// `manager_messages` (klo-manager).
//
// Differences from klo-manager:
//   - Conversation lives in rep_threads + rep_messages
//   - Context is the CALLER'S OWN active deals (deals.seller_id = caller)
//   - Persona shifts to a peer/self-coach voice — tactical, what-to-do-next,
//     no team-level strategic framing
//
// Auth model: the function expects a JWT for the rep. We confirm the caller
// owns the thread via RLS-friendly queries on the user-bound client; deal
// reads use the user-bound client too (the deals RLS policy already gates on
// seller_id = auth.uid()), so no service-role read of others' data.
//
// Deploy:
//   supabase functions deploy klo-rep
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { callLlm } from "../_shared/llm-client.ts"
import type { LlmMessage } from "../_shared/llm-types.ts"
import { loadSellerProfile } from "../_shared/seller-profile-loader.ts"
import { buildSellerProfileSection } from "../_shared/prompts/sections.ts"
import { canWrite } from "../_shared/can-write.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const USE_GEMINI = (Deno.env.get("USE_GEMINI") ?? "true").toLowerCase() === "true"
const KLO_MODEL_GEMINI = Deno.env.get("KLO_MODEL_GEMINI") ?? "gemini-3.1-flash-lite-preview"
const KLO_MODEL_ANTHROPIC = Deno.env.get("KLO_MODEL_ANTHROPIC") ?? "claude-sonnet-4-5"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const KLO_REP_PROMPT = `You are Klo, the AI deal coach inside Klosure, now talking to a SELLER about their own pipeline. Your audience is the rep themselves — tactical, hands-on, what-to-do-next. Not a manager briefing.

# Who you are
You are the same Klo this rep already knows from inside each deal room — direct, brief, confident, 15+ years in Gulf B2B sales. Now they've stepped back and asked you across all their deals at once. They want the truth about where to spend their next hour, not a feel-good summary.

# How you sound
- 1-3 sentences for tactical questions. Up to 4-6 when they ask for a plan or pattern.
- Imperative when there's a clear move. "Push the DIB deal today — Ahmed's gone quiet for 6 days."
- Specific. Deal titles, buyer names, dates, dollar values. Never generic.
- Honest about what's slipping. "Three of your deals haven't moved in 10+ days" — not "some opportunities to follow up on."
- Confident. You've coached this exact pipeline shape before.
- No corporate speak. No "synergy". No "alignment".

DO NOT say:
- "Your pipeline is doing great!" / "I notice some opportunities..."
- "I understand…" / "Great question…" / "Let me help…"
- "You might want to consider…" / "It could be worth…"

DO say:
- "Start with DIB today — biggest deal that's gone quiet."
- "Two deals stuck on signatory unknown. Same fix: ask 'who else needs to see this?'"
- "Send the Q3 follow-up to Acme — last touch was 8 days ago."

# What you do
You read the rep's WHOLE pipeline — every active deal they own. Then you answer their question with the one thing they should do next, which deal to dig into, or the pattern they're missing.

If the rep asks vague questions ("how's my pipeline?"), pick the highest-leverage move you see and surface it. Don't summarise — direct.

You can name deals by title and buyer. You should — that's what they came for.

# Per-deal data you have

For each of the rep's active deals, you have:

- klo_state: your current understanding of the deal (the same Overview the rep and buyer see). Use klo_state.summary and klo_state.klo_take_seller for the current situation.
- recent_history: the last 10 things you changed in this deal. Use it to answer "what changed?" / "when did X happen?" questions specifically with dates.

When the rep asks about a deal, prefer:
1. klo_state.summary and klo_state.klo_take_seller for the current state.
2. recent_history for change/timeline questions, with concrete dates.

# What you NEVER say
- "I understand…" / "Great question…" / "Let me help…"
- "You might want to consider…" / "It could be worth…"
- "Based on the data…" / "It seems like…"
- Anything starting with "As an AI…"
- Long preambles. Get to the move.
- Generic advice. "Follow up." "Build rapport." Never.

# Output format
Plain text. 1-3 sentences. No JSON, no markdown headers, no lists.

Now wait for the pipeline digest and the rep's question.`

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "use POST" }, 405)

  try {
    const body = await req.json().catch(() => ({}))

    const auth = req.headers.get("Authorization")
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: auth ? { Authorization: auth } : {} },
      auth: { persistSession: false },
    })
    const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const threadId = body?.thread_id
    const question = body?.question
    if (!threadId || !question) return json({ error: "thread_id + question required" }, 400)

    // Identify the rep — both for the licensing gate and for filtering deals.
    const { data: userData } = await userClient.auth.getUser()
    const userId = userData?.user?.id ?? null
    if (!userId) return json({ error: "not authorized" }, 401)

    // Phase 12.1 — server-side licensing gate. Klo coaching is the main cost
    // vector; every LLM-emitting function must run this guard.
    const writeCheck = await canWrite(SUPABASE_URL, SERVICE_ROLE_KEY, userId)
    if (!writeCheck.ok) {
      console.log(JSON.stringify({
        event: "klo_rep_blocked_read_only",
        user_id: userId,
        thread_id: threadId,
        status: writeCheck.status,
        reason: writeCheck.reason,
      }))
      return json({
        ok: false,
        error: "account_read_only",
        status: writeCheck.status,
        message: "This account is read-only. Upgrade to continue using Klo coaching.",
      }, 402)
    }

    // Verify the caller actually owns the thread (RLS would block anyway, but
    // we want a clean 404 instead of an empty result).
    const { data: thread, error: tErr } = await userClient
      .from("rep_threads")
      .select("*")
      .eq("id", threadId)
      .single()
    if (tErr || !thread) return json({ error: "thread not found", detail: tErr?.message }, 404)

    // Pipeline digest — the rep's own active deals only. Uses the user-bound
    // client so the deals RLS policy enforces seller_id = auth.uid() — we
    // never see another rep's deals here.
    const [{ data: deals }, { data: history }] = await Promise.all([
      userClient
        .from("deals")
        .select("*")
        .eq("seller_id", userId)
        .eq("status", "active"),
      service
        .from("rep_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
        .limit(20),
    ])

    // Per-deal recent klo_state_history (last 10 changes, oldest first for
    // the prompt). Service-role read is fine — we already filtered deal IDs
    // to ones the rep owns.
    const dealIds = (deals ?? []).map((d: { id: string }) => d.id)
    const stateHistoryByDeal = new Map<string, Array<Record<string, unknown>>>()
    if (dealIds.length > 0) {
      const { data: stateHistory } = await service
        .from("klo_state_history")
        .select("deal_id, changed_at, triggered_by_role, change_kind, field_path, before_value, after_value, reason")
        .in("deal_id", dealIds)
        .order("changed_at", { ascending: false })
        .limit(10 * dealIds.length)
      for (const h of stateHistory ?? []) {
        const arr = stateHistoryByDeal.get(h.deal_id as string) ?? []
        if (arr.length < 10) {
          arr.push(h as Record<string, unknown>)
          stateHistoryByDeal.set(h.deal_id as string, arr)
        }
      }
      for (const [k, arr] of stateHistoryByDeal) {
        stateHistoryByDeal.set(k, arr.reverse())
      }
    }

    const digest = renderPipeline(deals ?? [], stateHistoryByDeal)
    const transcript = renderTranscript(history ?? [])

    const messages: LlmMessage[] = [
      {
        role: "user",
        content: `${digest}\n\n${transcript}\n\nYou just asked: "${question}"\n\nAnswer in 1-3 sentences (up to 4-6 for plan questions). Direct. Specific.`,
      },
    ]

    // Inject the rep's own profile so the coaching is grounded.
    let repProfile = null
    try {
      repProfile = await loadSellerProfile(SUPABASE_URL, SERVICE_ROLE_KEY, userId)
    } catch (err) {
      console.warn("seller_profile_load_failed", err)
    }
    console.log(JSON.stringify({
      event: "seller_profile_loaded",
      user_id: userId,
      has_profile: !!repProfile,
      fn: "klo-rep",
    }))
    const profileSection = buildSellerProfileSection(repProfile)
    const systemPrompt = profileSection
      ? `${KLO_REP_PROMPT}\n\n${profileSection}`
      : KLO_REP_PROMPT

    let result
    try {
      result = await callLlm({
        systemPrompt,
        messages,
        maxTokens: 1200,
        temperature: 0.7,
      })
    } catch (err) {
      return json({ error: "llm error", detail: String(err) }, 502)
    }

    if (result.toolCalled) {
      return json({ error: "unexpected tool call in klo-rep chat" }, 502)
    }
    const reply = result.text.trim() || "I can't see your pipeline right now. Try again."

    console.log(JSON.stringify({
      event: "klo_rep_chat_complete",
      model: USE_GEMINI ? KLO_MODEL_GEMINI : KLO_MODEL_ANTHROPIC,
      thread_id: threadId,
      deal_count: (deals ?? []).length,
    }))

    const { error: insertErr } = await service.from("rep_messages").insert({
      thread_id: threadId,
      sender: "klo",
      content: reply,
    })
    if (insertErr) return json({ error: "insert failed", detail: insertErr.message }, 500)

    await service
      .from("rep_threads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", threadId)

    return json({ ok: true, reply })
  } catch (err) {
    return json({ error: "klo-rep crashed", detail: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  })
}

function renderPipeline(
  deals: Array<Record<string, unknown>>,
  historyByDeal: Map<string, Array<Record<string, unknown>>>,
) {
  const lines: string[] = ["# Your active pipeline"]

  if (deals.length === 0) {
    lines.push("- No active deals yet.")
    return lines.join("\n")
  }

  const totalValue = deals.reduce((s, d) => s + (Number(d.value) || 0), 0)
  const red = deals.filter((d) => d.health === "red")
  const amber = deals.filter((d) => d.health === "amber")
  lines.push(
    `- Active deals: ${deals.length} · pipeline value ~${formatUsd(totalValue)}`,
    `- Health: ${red.length} red · ${amber.length} amber · ${deals.length - red.length - amber.length} green`,
  )

  const sorted = [...deals].sort((a, b) => rank(a.health) - rank(b.health))
  lines.push(`\n## Deals`)
  for (const d of sorted) {
    const ks = (d.klo_state as Record<string, unknown> | null) ?? null
    const summary = (ks?.summary as string | undefined) || (d.summary as string | undefined) || ""
    const stage = (ks?.stage as string | undefined) || (d.stage as string | undefined) || ""
    const takeSeller = (ks?.klo_take_seller as string | undefined) || ""

    lines.push(
      `\n- [${(d.health as string).toUpperCase()}] "${d.title}" — ${d.buyer_company || "buyer"} · ${formatUsd(Number(d.value) || 0)} · ${d.deadline ? `deadline ${d.deadline}` : "no deadline"} · stage ${stage}`,
    )
    if (summary) lines.push(`    summary: ${summary}`)
    if (takeSeller) lines.push(`    klo_take_seller: ${takeSeller}`)

    const hist = historyByDeal.get(d.id as string) ?? []
    if (hist.length > 0) {
      lines.push(`    recent_history (oldest first):`)
      for (const h of hist) {
        const when = String(h.changed_at).slice(0, 10)
        const kind = h.change_kind as string
        const path = h.field_path as string
        const role = h.triggered_by_role as string
        const reason = h.reason ? ` — reason: "${h.reason}"` : ""
        lines.push(`      • ${when} ${role} ${kind} ${path}${reason}`)
      }
    }
  }
  return lines.join("\n")
}

function rank(h: unknown) {
  return h === "red" ? 0 : h === "amber" ? 1 : 2
}

function formatUsd(n: number) {
  if (!n) return "$0"
  return "$" + Math.round(n).toLocaleString("en-US")
}

function renderTranscript(history: Array<{ sender: string; content: string }>) {
  if (history.length === 0) return "# Conversation\n- (this is the first turn)"
  const lines = ["# Conversation so far"]
  for (const m of history) {
    lines.push(`- ${m.sender === "klo" ? "Klo" : "You"}: ${m.content}`)
  }
  return lines.join("\n")
}
