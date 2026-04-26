// =============================================================================
// Klosure.ai — Phase 4 "Manager talks to Klo"
// =============================================================================
// Pipeline-level coaching for sales managers. Different from klo-respond:
//   - Conversation lives in `manager_threads` + `manager_messages`, not in any
//     deal room.
//   - Context is the WHOLE pipeline for the team (every active deal across
//     every member), not a single transcript.
//   - Persona shifts: Klo speaks to the manager about reps, risk concentration,
//     and pipeline blockers, not about a single buyer.
//
// Auth model: the function expects a JWT for the manager (set --no-verify-jwt
// false on deploy). We confirm the manager owns the team via RLS-friendly
// queries on the user-bound client; pipeline reads use the service role.
//
// Deploy:
//   supabase functions deploy klo-manager
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-…
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { callLlm } from "../_shared/llm-client.ts"
import type { LlmMessage } from "../_shared/llm-types.ts"

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

const KLO_MANAGER_PROMPT = `You are Klo, the AI deal coach inside Klosure, now talking to a sales MANAGER about their pipeline. Your audience is more strategic than tactical — surface patterns across reps, not the next-step move for one rep.

# Who you are
You are the same Klo your sellers know — direct, brief, confident, 15+ years
in Gulf B2B sales. You've now been pulled aside by the manager. They want the
truth about what's happening across their team's pipeline, not a feel-good
dashboard summary.

# How you sound
- 1-3 sentences for tactical questions. Up to 4-6 sentences when the manager wants depth or asks a pattern question.
- Patterns over individual tactics. "Two of three deals are slipping for the same reason: signatory unknown" — not "Send X to Y."
- Imperative when there's a clear move. "Push Ahmed on the DIB deal today."
- Honest about reps' weaknesses. "Raja is stuck because he's avoiding the proposal — coach him on that" — not "Raja could benefit from additional support."
- Specific. Names, numbers, dates. Never generic.
- Confident. You've seen this exact pipeline shape before.
- No corporate speak. No "synergy". No "alignment".

DO NOT say:
- "Your team is doing great!" / "I notice some opportunities..."
- "I understand…" / "Great question…" / "Let me help…"
- "You might want to consider…" / "It could be worth…"

DO say:
- "Here's where to spend your 1:1 time this week..."
- "Two reps need pricing-approval support..."
- "DIB is the highest-leverage deal today — Raja's stuck on the proposal."

# What you do
You read the WHOLE pipeline — every active deal in this manager's team — plus
all open and overdue commitments. Then you answer their question with the one
thing they should do today, who they should talk to, or which deal to dig into.

If the manager asks vague questions ("how is the pipeline?"), pick the
highest-risk thing you see and surface it. Don't summarise — direct.

You can name reps by name. You can name deals by title. You should — that's
what the manager came for.

# Per-deal data you have

For each deal in the manager's team, you have:

- klo_state: your current understanding of the deal (the same Overview the
  seller and buyer see). Use klo_state.summary and klo_state.klo_take_seller
  for the current situation.
- recent_history: the last 10 things you changed in this deal. Use it to
  answer "what changed?" / "when did X happen?" questions specifically with
  dates and triggers.
- commitments: structured tasks both sides have committed to — who owes
  what, what's overdue.

When the manager asks about a deal, prefer:
1. klo_state.summary and klo_state.klo_take_seller for the current state.
2. recent_history for change/timeline questions, with concrete dates.
3. commitments for accountability.

# Reality-bending check

If recent_history shows the seller removed something (change_kind='removed'),
mention it when relevant. Example: "Raja removed Ahmed from the people list 3
days ago, saying he was just CC'd. But Ahmed has sent 4 messages since —
worth checking with Raja." This is not surveillance. It's helping the manager
see deal reality, including any reality-bending the seller may have done.

# What you NEVER say
- "I understand…" / "Great question…" / "Let me help…"
- "You might want to consider…" / "It could be worth…"
- "Based on the data…" / "It seems like…"
- Anything starting with "As an AI…"
- Long preambles. Get to the move.
- Generic advice. "Build a forecast." "Coach your reps." Never.

# Output format
Plain text. 1-3 sentences. No JSON, no markdown headers, no lists.

Now wait for the pipeline digest and the manager's question.`

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "use POST" }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const mode = body?.mode ?? "chat"

    const auth = req.headers.get("Authorization")
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: auth ? { Authorization: auth } : {} },
      auth: { persistSession: false },
    })
    const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    if (mode === "quarter_take") {
      if (!body?.team_id) return json({ error: "team_id required" }, 400)
      const { data: userData, error: userErr } = await userClient.auth.getUser()
      if (userErr || !userData?.user) return json({ error: "not authorized" }, 401)
      return await handleQuarterTake(service, body.team_id, userData.user.id)
    }

    const threadId = body?.thread_id
    const question = body?.question
    if (!threadId || !question) return json({ error: "thread_id + question required" }, 400)

    // Verify the caller actually owns the thread.
    const { data: thread, error: tErr } = await userClient
      .from("manager_threads")
      .select("*")
      .eq("id", threadId)
      .single()
    if (tErr || !thread) return json({ error: "thread not found", detail: tErr?.message }, 404)

    // Pipeline digest — service role for cross-rep reads.
    const { data: members } = await service
      .from("team_members")
      .select("user_id, users:users(id, name, email)")
      .eq("team_id", thread.team_id)
    const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id)

    const [{ data: deals }, { data: commits }, { data: history }] = await Promise.all([
      service
        .from("deals")
        .select("*")
        .in("seller_id", memberIds.length > 0 ? memberIds : ["00000000-0000-0000-0000-000000000000"])
        .eq("status", "active"),
      service.from("commitments").select("id, deal_id, status, due_date, task"),
      service
        .from("manager_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
        .limit(20),
    ])

    // Phase 4.5: per-deal recent klo_state_history (last 10 changes, oldest
    // first for the prompt). Service-role read across the manager's team.
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
      // Each per-deal slice ends up newest-first; flip to oldest-first for the prompt.
      for (const [k, arr] of stateHistoryByDeal) {
        stateHistoryByDeal.set(k, arr.reverse())
      }
    }

    const digest = renderPipeline(deals ?? [], commits ?? [], members ?? [], stateHistoryByDeal)
    const transcript = renderTranscript(history ?? [])

    const messages: LlmMessage[] = [
      {
        role: "user",
        content: `${digest}\n\n${transcript}\n\nManager just asked: "${question}"\n\nAnswer in 1-3 sentences (up to 4-6 for pattern questions). Direct. Specific.`,
      },
    ]

    let result
    try {
      result = await callLlm({
        systemPrompt: KLO_MANAGER_PROMPT,
        messages,
        maxTokens: 1200,
        temperature: 0.7,
      })
    } catch (err) {
      return json({ error: "llm error", detail: String(err) }, 502)
    }

    if (result.toolCalled) {
      return json({ error: "unexpected tool call in klo-manager chat" }, 502)
    }
    const reply = result.text.trim() || "I can't see your pipeline right now. Try again."

    console.log(JSON.stringify({
      event: "klo_manager_chat_complete",
      model: USE_GEMINI ? KLO_MODEL_GEMINI : KLO_MODEL_ANTHROPIC,
      thread_id: threadId,
    }))

    const { error: insertErr } = await service.from("manager_messages").insert({
      thread_id: threadId,
      sender: "klo",
      content: reply,
    })
    if (insertErr) return json({ error: "insert failed", detail: insertErr.message }, 500)

    await service
      .from("manager_threads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", threadId)

    return json({ ok: true, reply })
  } catch (err) {
    return json({ error: "klo-manager crashed", detail: String(err) }, 500)
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
  commitments: Array<Record<string, unknown>>,
  members: Array<{ user_id: string; users?: { name?: string; email?: string } }>,
  historyByDeal: Map<string, Array<Record<string, unknown>>>,
) {
  const memberById = new Map(
    members.map((m) => [m.user_id, m.users?.name || m.users?.email || "Member"])
  )
  const lines: string[] = ["# Pipeline digest"]

  if (deals.length === 0) {
    lines.push("- No active deals.")
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
    const sellerName = memberById.get(d.seller_id as string) || "Member"
    const own = commitments.filter((c) => c.deal_id === d.id)
    const overdue = own.filter((c) => c.status === "overdue").length
    const open = own.filter((c) => c.status === "confirmed" || c.status === "proposed").length
    const ks = (d.klo_state as Record<string, unknown> | null) ?? null
    const summary = (ks?.summary as string | undefined) || (d.summary as string | undefined) || ""
    const stage = (ks?.stage as string | undefined) || (d.stage as string | undefined) || ""
    const takeSeller = (ks?.klo_take_seller as string | undefined) || ""

    lines.push(
      `\n- [${(d.health as string).toUpperCase()}] "${d.title}" — ${sellerName} · ${d.buyer_company || "buyer"} · ${formatUsd(Number(d.value) || 0)} · ${d.deadline ? `deadline ${d.deadline}` : "no deadline"} · stage ${stage} · ${overdue} overdue / ${open} open commitments`,
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
    lines.push(`- ${m.sender === "klo" ? "Klo" : "Manager"}: ${m.content}`)
  }
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Phase 5: Klo's narrated quarter take. The forecast tab on the manager's
// Team page calls this once on mount; the result is a 3-5 sentence read of
// the team's pipeline framed for the manager (not for the rep).
// ---------------------------------------------------------------------------
const QUARTER_TAKE_PROMPT = `You are Klo, the AI deal coach inside Klosure. You are advising a sales manager on their quarter forecast.

You'll receive a digest of all active deals across the team. Output a short narrative (3-5 sentences) that:

1. States a realistic Q-commit number (sum of weighted-dollar across confident deals — those scoring 65+)
2. States a stretch number if there are in-play deals (30-65 confidence) that could come through
3. Names the 1-2 specific deals or reps that need attention to hit the stretch
4. If you spot a pattern across the team's struggling deals, mention it ("two deals stuck on signatory unknown")
5. Keep it to 3-5 sentences. Specific over generic. Manager voice — not coaching the rep, briefing the boss.

Don't list every deal. Don't make a forecast table. Synthesize.`

async function handleQuarterTake(
  // deno-lint-ignore no-explicit-any
  service: any,
  teamId: string,
  userId: string,
) {
  // Confirm the caller is a manager (or owner) of this team.
  const { data: membership } = await service
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!membership || (membership.role !== "manager" && membership.role !== "owner")) {
    return json({ error: "not authorized" }, 403)
  }

  const { data: members } = await service
    .from("team_members")
    .select("user_id, role, users:users(id, name, email)")
    .eq("team_id", teamId)
  const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id)

  if (memberIds.length === 0) {
    return json({
      take:
        "No active deals in this team yet. Once your reps start creating deals and chatting in them, Klo will start forecasting here.",
      generated_at: new Date().toISOString(),
    })
  }

  const { data: deals } = await service
    .from("deals")
    .select("id, title, buyer_company, klo_state, value, deadline, stage, seller_id")
    .in("seller_id", memberIds)
    .eq("status", "active")

  if (!deals || deals.length === 0) {
    return json({
      take:
        "No active deals in this team yet. Once your reps start creating deals and chatting in them, Klo will start forecasting here.",
      generated_at: new Date().toISOString(),
    })
  }

  const sellerName = new Map(
    (members ?? []).map((m: { user_id: string; users?: { name?: string; email?: string } }) => [
      m.user_id,
      m.users?.name || m.users?.email || "Member",
    ]),
  )

  // deno-lint-ignore no-explicit-any
  const digest = (deals as any[]).map((d) => {
    const ks = (d.klo_state ?? {}) as Record<string, unknown>
    const dealValue = ks.deal_value as { amount?: number } | undefined
    const deadline = ks.deadline as { date?: string } | undefined
    const confidence = ks.confidence as
      | {
          value?: number
          trend?: string
          delta?: number
          factors_dragging_down?: Array<{ label?: string }>
        }
      | undefined
    return {
      title: d.title,
      buyer: d.buyer_company,
      rep: sellerName.get(d.seller_id) ?? "—",
      stage: (ks.stage as string | undefined) ?? d.stage,
      value: dealValue?.amount ?? d.value,
      deadline: deadline?.date ?? d.deadline,
      confidence: confidence?.value ?? null,
      trend: confidence?.trend ?? null,
      delta: confidence?.delta ?? null,
      summary: (ks.summary as string | undefined) ?? null,
      top_factor_dragging: confidence?.factors_dragging_down?.[0]?.label ?? null,
    }
  })

  const userMessage = `Active pipeline:

${JSON.stringify(digest, null, 2)}

Give me your quarter take.`

  let result
  try {
    result = await callLlm({
      systemPrompt: QUARTER_TAKE_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 800,
      temperature: 0.7,
    })
  } catch (err) {
    return json({ error: "llm error", detail: String(err) }, 502)
  }

  if (result.toolCalled) {
    return json({ error: "unexpected tool call in quarter_take" }, 502)
  }
  const text = result.text.trim()

  console.log(JSON.stringify({
    event: "klo_manager_quarter_take_complete",
    model: USE_GEMINI ? KLO_MODEL_GEMINI : KLO_MODEL_ANTHROPIC,
    team_id: teamId,
    deal_count: deals.length,
  }))

  return json({
    take: text,
    generated_at: new Date().toISOString(),
  })
}
