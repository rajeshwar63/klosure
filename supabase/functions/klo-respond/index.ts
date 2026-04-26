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

const KLO_OUTPUT_TOOL = {
  name: "emit_klo_response",
  description: "Emit Klo's structured response: updated deal state and a chat reply.",
  input_schema: {
    type: "object",
    properties: {
      klo_state: {
        type: "object",
        properties: {
          version: { type: "number" },
          summary: { type: "string" },
          stage: { type: "string", enum: ["discovery", "proposal", "negotiation", "legal", "closed"] },
          stage_reasoning: { type: "string" },
          deal_value: {
            type: ["object", "null"],
            properties: {
              amount: { type: "number" },
              currency: { type: "string" },
              confidence: { type: "string", enum: ["definite", "tentative"] },
              source_message_id: { type: ["string", "null"] },
            },
          },
          deadline: {
            type: ["object", "null"],
            properties: {
              date: { type: "string" },
              confidence: { type: "string", enum: ["definite", "tentative"] },
              previous: { type: ["string", "null"] },
              note: { type: ["string", "null"] },
              source_message_id: { type: ["string", "null"] },
            },
          },
          people: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string" },
                company: { type: "string" },
                first_seen_message_id: { type: ["string", "null"] },
                added_at: { type: "string" },
              },
              required: ["name", "role", "company", "added_at"],
            },
          },
          decisions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                what: { type: "string" },
                when: { type: "string" },
                source_message_id: { type: ["string", "null"] },
              },
              required: ["what", "when"],
            },
          },
          blockers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                since: { type: "string" },
                severity: { type: "string", enum: ["green", "amber", "red"] },
                source_message_id: { type: ["string", "null"] },
                added_at: { type: "string" },
              },
              required: ["text", "since", "severity", "added_at"],
            },
          },
          open_questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                source_message_id: { type: ["string", "null"] },
                added_at: { type: "string" },
              },
              required: ["text", "added_at"],
            },
          },
          removed_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["people", "blockers", "open_questions", "decisions"] },
                value: {},
                reason: { type: "string" },
                removed_at: { type: "string" },
              },
              required: ["kind", "value", "reason", "removed_at"],
            },
          },
          klo_take_seller: { type: "string" },
          klo_take_buyer: { type: "string" },
        },
        required: [
          "version",
          "summary",
          "stage",
          "people",
          "decisions",
          "blockers",
          "open_questions",
          "removed_items",
          "klo_take_seller",
          "klo_take_buyer",
        ],
      },
      chat_reply: { type: "string" },
    },
    required: ["klo_state", "chat_reply"],
  },
}

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
  recipientRole: "seller" | "buyer",
  useCache: boolean,
): Promise<KloRespondOutput> {
  try {
    return await callAnthropicOnce(systemPrompt, messages, recipientRole, useCache)
  } catch (err) {
    if (err instanceof SyntaxError && err.message.includes("JSON")) {
      console.warn("Klo returned invalid JSON, retrying once")
      return await callAnthropicOnce(systemPrompt, messages, recipientRole, useCache)
    }
    throw err
  }
}

async function callAnthropicOnce(
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
    max_tokens: 4096,
    system: useCache
      ? [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }]
      : systemPrompt,
    messages: apiMessages,
    tools: [KLO_OUTPUT_TOOL],
    tool_choice: { type: "tool", name: "emit_klo_response" },
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

  const toolUseBlock = data.content?.find(
    (block: { type: string; name?: string }) =>
      block.type === "tool_use" && block.name === "emit_klo_response",
  )
  if (!toolUseBlock) {
    const types = data.content?.map((b: { type: string }) => b.type)
    throw new Error(`No tool_use block in response. Got: ${JSON.stringify(types)}`)
  }

  const parsed = toolUseBlock.input as KloRespondOutput
  if (!parsed.klo_state || !parsed.chat_reply) {
    throw new Error("Tool input missing klo_state or chat_reply")
  }
  return parsed
}

const NOISY_FIELDS = new Set([
  "summary",
  "klo_take_seller",
  "klo_take_buyer",
  "stage_reasoning",
])

async function writeHistory(
  deal_id: string,
  oldState: KloState | null,
  newState: KloState,
  triggering_message_id: string | null,
  triggered_by_role: "seller" | "buyer" | "system",
): Promise<void> {
  // Bootstrap case: one row, kind='extracted', field_path='bootstrap'.
  if (oldState == null) {
    const { error } = await sb.from("klo_state_history").insert({
      deal_id,
      triggered_by_message_id: triggering_message_id,
      triggered_by_role: "system",
      change_kind: "extracted",
      field_path: "bootstrap",
      before_value: null,
      after_value: newState,
    })
    if (error) throw error
    return
  }

  const rows: Array<Record<string, unknown>> = []
  const fields: Array<keyof KloState> = [
    "stage",
    "deal_value",
    "deadline",
    "people",
    "decisions",
    "blockers",
    "open_questions",
  ]

  for (const f of fields) {
    if (NOISY_FIELDS.has(f as string)) continue
    const before = (oldState as unknown as Record<string, unknown>)[f as string]
    const after = (newState as unknown as Record<string, unknown>)[f as string]
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      rows.push({
        deal_id,
        triggered_by_message_id: triggering_message_id,
        triggered_by_role,
        change_kind: "extracted",
        field_path: String(f),
        before_value: before ?? null,
        after_value: after ?? null,
      })
    }
  }

  if (rows.length > 0) {
    const { error } = await sb.from("klo_state_history").insert(rows)
    if (error) throw error
  }
}

async function updateDealState(deal_id: string, state: KloState): Promise<void> {
  // Sync legacy columns so existing UI keeps working as a rollback target.
  const update: Record<string, unknown> = {
    klo_state: state,
    summary: state.summary,
    stage: state.stage,
  }
  if (state.deal_value) update.value = state.deal_value.amount
  if (state.deadline) update.deadline = state.deadline.date

  const { error } = await sb.from("deals").update(update).eq("id", deal_id)
  if (error) throw error
}

async function postKloMessage(
  deal_id: string,
  content: string,
  visible_to: "seller" | "buyer",
): Promise<void> {
  const { error } = await sb.from("messages").insert({
    deal_id,
    sender_type: "klo",
    sender_name: "Klo",
    content,
    visible_to,
  })
  if (error) throw error
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  })
}
