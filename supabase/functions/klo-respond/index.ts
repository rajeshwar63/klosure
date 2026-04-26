// Klosure — Phase 4.5 klo-respond
// Per-turn pipeline: load context → call Klo → diff → write history → update state → post chat reply.
//
// This is the skeleton from docs/phase-4-5/06-klo-respond-skeleton.md.
// Helper bodies are filled in step 07 (07-klo-respond-wireup.md).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { buildBootstrapPrompt } from "../_shared/prompts/bootstrap-prompt.ts"
import { buildExtractionPrompt } from "../_shared/prompts/extraction-prompt.ts"
import type { KloState, KloRespondOutput, KloHistoryRow } from "../_shared/klo-state-types.ts"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const KLO_MODEL = Deno.env.get("KLO_MODEL") ?? "claude-sonnet-4-6"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }
  if (req.method !== "POST") {
    return json({ error: "use POST" }, 405)
  }

  try {
    const { deal_id, triggering_message_id } = await req.json()
    if (!deal_id) return json({ error: "deal_id required" }, 400)

    // 1. Load context
    const ctx = await loadDealContext(deal_id)

    // 2. Decide path: bootstrap (state is null) vs normal turn
    const output = ctx.deal.klo_state == null
      ? await runBootstrap(ctx)
      : await runExtraction(ctx, triggering_message_id ?? null)

    // 3. Diff old state vs new state, append history rows
    await writeHistory(
      deal_id,
      ctx.deal.klo_state,
      output.klo_state,
      triggering_message_id ?? null,
      ctx.recipientRole,
    )

    // 4. Update deals.klo_state (and sync legacy fields)
    await updateDealState(deal_id, output.klo_state)

    // 5. Insert chat_reply as a Klo message scoped to recipientRole
    await postKloMessage(deal_id, output.chat_reply, ctx.recipientRole)

    return json({ ok: true })
  } catch (err) {
    console.error("klo-respond error", err)
    return json({ ok: false, error: String(err) }, 500)
  }
})

// --- Stubs (filled in step 07) ---

interface MessageRow {
  id: string
  sender_type: "seller" | "buyer" | "klo"
  sender_name: string | null
  content: string
  created_at: string
}

interface DealContext {
  deal: {
    id: string
    title: string
    buyer_company: string | null
    seller_company: string | null
    value: number | null
    deadline: string | null
    mode: "solo" | "shared"
    stage: string
    klo_state: KloState | null
    [k: string]: unknown
  }
  context: {
    stakeholders?: Array<{ name?: string; role?: string; company?: string }>
    what_needs_to_happen?: string | null
    budget_notes?: string | null
    notes?: string | null
  } | null
  messages: MessageRow[]
  history: KloHistoryRow[]
  recipientRole: "seller" | "buyer"
}

async function loadDealContext(deal_id: string): Promise<DealContext> {
  const [dealRes, contextRes, messagesRes, historyRes] = await Promise.all([
    sb.from("deals").select("*").eq("id", deal_id).single(),
    sb.from("deal_context").select("*").eq("deal_id", deal_id).maybeSingle(),
    sb
      .from("messages")
      .select("id, sender_type, sender_name, content, created_at")
      .eq("deal_id", deal_id)
      .order("created_at", { ascending: true })
      .limit(50),
    sb
      .from("klo_state_history")
      .select("*")
      .eq("deal_id", deal_id)
      .order("changed_at", { ascending: false })
      .limit(20),
  ])

  if (dealRes.error) throw dealRes.error
  const deal = dealRes.data as DealContext["deal"]
  const context = (contextRes.data ?? null) as DealContext["context"]
  const messages = (messagesRes.data ?? []) as MessageRow[]
  const history = ((historyRes.data ?? []) as KloHistoryRow[]).slice().reverse() // oldest first for the prompt

  // recipientRole = role of the most recent non-Klo message sender
  const lastNonKlo = [...messages].reverse().find((m) => m.sender_type !== "klo")
  const recipientRole: "seller" | "buyer" =
    lastNonKlo?.sender_type === "buyer" ? "buyer" : "seller"

  return { deal, context, messages, history, recipientRole }
}

async function runBootstrap(ctx: DealContext): Promise<KloRespondOutput> {
  const system = buildBootstrapPrompt({
    dealTitle: ctx.deal.title,
    buyerCompany: ctx.deal.buyer_company ?? "",
    sellerCompany: ctx.deal.seller_company ?? "",
    dealValue: ctx.deal.value,
    dealDeadline: ctx.deal.deadline,
    stakeholders: (ctx.context?.stakeholders ?? []).map((s) => ({
      name: s.name ?? "",
      role: s.role ?? "",
      company: s.company ?? "",
    })),
    whatNeedsToHappen: ctx.context?.what_needs_to_happen ?? null,
    budgetNotes: ctx.context?.budget_notes ?? null,
    notes: ctx.context?.notes ?? null,
  })

  return callAnthropic(system, ctx.messages, ctx.recipientRole, /* useCache */ false)
}

async function runExtraction(
  ctx: DealContext,
  _triggering_message_id: string | null,
): Promise<KloRespondOutput> {
  // currentState is non-null on the extraction path (skeleton routes on null).
  const currentState = ctx.deal.klo_state as KloState
  const system = buildExtractionPrompt({
    dealTitle: ctx.deal.title,
    buyerCompany: ctx.deal.buyer_company ?? "",
    sellerCompany: ctx.deal.seller_company ?? "",
    mode: ctx.deal.mode,
    recipientRole: ctx.recipientRole,
    currentState,
    recentHistory: ctx.history,
  })

  return callAnthropic(system, ctx.messages, ctx.recipientRole, /* useCache */ true)
}

async function callAnthropic(
  systemPrompt: string,
  messages: MessageRow[],
  _recipientRole: "seller" | "buyer",
  useCache: boolean,
): Promise<KloRespondOutput> {
  // Format messages for the API: tag each with id and sender so Klo can echo source_message_id.
  const apiMessages = messages.map((m) => ({
    role: m.sender_type === "klo" ? "assistant" : "user",
    content: `[msg_id=${m.id} | ${m.sender_name ?? m.sender_type} (${m.sender_type}) | ${m.created_at}]\n${m.content}`,
  }))

  // Anthropic requires the conversation to start with a user turn. If somehow
  // the first item is an assistant turn (e.g. only a Klo message exists), drop
  // leading assistant turns rather than failing the call.
  while (apiMessages.length > 0 && apiMessages[0].role === "assistant") {
    apiMessages.shift()
  }
  if (apiMessages.length === 0) {
    apiMessages.push({ role: "user", content: "(no user messages yet — produce a fresh state from the deal context above.)" })
  }

  const body: Record<string, unknown> = {
    model: KLO_MODEL,
    max_tokens: 1500,
    system: useCache
      ? [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }]
      : systemPrompt,
    messages: apiMessages,
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text: string = data.content?.[0]?.text ?? ""

  // Robust JSON extraction: Klo should return only JSON, but tolerate accidental wrapping.
  const jsonStart = text.indexOf("{")
  const jsonEnd = text.lastIndexOf("}")
  if (jsonStart < 0 || jsonEnd < 0) throw new Error("Klo did not return JSON")
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1))

  if (!parsed.klo_state || !parsed.chat_reply) {
    throw new Error("Klo response missing klo_state or chat_reply")
  }
  return parsed as KloRespondOutput
}

async function writeHistory(
  _deal_id: string,
  _oldState: KloState | null,
  _newState: KloState,
  _triggering_message_id: string | null,
  _triggered_by_role: "seller" | "buyer" | "system",
): Promise<void> {
  // TODO step 07: diff old vs new, insert one klo_state_history row per change
  throw new Error("writeHistory not implemented")
}

async function updateDealState(_deal_id: string, _state: KloState): Promise<void> {
  // TODO step 07: update deals.klo_state, AND sync legacy columns (stage, value, deadline, summary)
  throw new Error("updateDealState not implemented")
}

async function postKloMessage(
  _deal_id: string,
  _content: string,
  _visible_to: "seller" | "buyer",
): Promise<void> {
  // TODO step 07: insert into messages with sender_type='klo', visible_to set
  throw new Error("postKloMessage not implemented")
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  })
}
