# Step 07 — Wire up `klo-respond` helpers

**Goal:** Fill in each stub from step 06. **Commit each helper separately.** This is the longest step; splitting into six small commits avoids stream timeouts.

## Sub-steps (commit after each)

### 7a. `loadDealContext`

Loads everything needed for one turn. Pure read.

```typescript
async function loadDealContext(deal_id: string) {
  const [dealRes, contextRes, messagesRes, historyRes] = await Promise.all([
    sb.from('deals').select('*').eq('id', deal_id).single(),
    sb.from('deal_context').select('*').eq('deal_id', deal_id).maybeSingle(),
    sb.from('messages')
      .select('id, sender_type, sender_name, content, created_at')
      .eq('deal_id', deal_id)
      .order('created_at', { ascending: true })
      .limit(50),
    sb.from('klo_state_history')
      .select('*')
      .eq('deal_id', deal_id)
      .order('changed_at', { ascending: false })
      .limit(20)
  ]);

  if (dealRes.error) throw dealRes.error;
  const deal = dealRes.data;
  const context = contextRes.data ?? null;
  const messages = messagesRes.data ?? [];
  const history = (historyRes.data ?? []).reverse(); // oldest first for the prompt

  // recipientRole = role of the most recent non-Klo message sender
  const lastNonKlo = [...messages].reverse().find(m => m.sender_type !== 'klo');
  const recipientRole: 'seller' | 'buyer' = (lastNonKlo?.sender_type === 'buyer') ? 'buyer' : 'seller';

  return { deal, context, messages, history, recipientRole };
}
```

### 7b. `runBootstrap` and `runExtraction`

Build the prompt, call Anthropic, parse JSON.

```typescript
async function runBootstrap(ctx: any): Promise<KloRespondOutput> {
  const system = buildBootstrapPrompt({
    dealTitle: ctx.deal.title,
    buyerCompany: ctx.deal.buyer_company,
    sellerCompany: ctx.deal.seller_company,
    dealValue: ctx.deal.value,
    dealDeadline: ctx.deal.deadline,
    stakeholders: ctx.context?.stakeholders ?? [],
    whatNeedsToHappen: ctx.context?.what_needs_to_happen ?? null,
    budgetNotes: ctx.context?.budget_notes ?? null,
    notes: ctx.context?.notes ?? null
  });

  return callAnthropic(system, ctx.messages, ctx.recipientRole, /* useCache */ false);
}

async function runExtraction(ctx: any, triggering_message_id: string | null): Promise<KloRespondOutput> {
  const system = buildExtractionPrompt({
    dealTitle: ctx.deal.title,
    buyerCompany: ctx.deal.buyer_company,
    sellerCompany: ctx.deal.seller_company,
    mode: ctx.deal.mode,
    recipientRole: ctx.recipientRole,
    currentState: ctx.deal.klo_state,
    recentHistory: ctx.history
  });

  return callAnthropic(system, ctx.messages, ctx.recipientRole, /* useCache */ true);
}
```

### 7c. `callAnthropic` helper

```typescript
async function callAnthropic(
  systemPrompt: string,
  messages: Array<{ id: string; sender_type: string; sender_name: string; content: string; created_at: string }>,
  recipientRole: 'seller' | 'buyer',
  useCache: boolean
): Promise<KloRespondOutput> {
  // Format messages for the API: tag each with id and sender so Klo can echo source_message_id
  const apiMessages = messages.map(m => ({
    role: m.sender_type === 'klo' ? 'assistant' : 'user',
    content: `[msg_id=${m.id} | ${m.sender_name} (${m.sender_type}) | ${m.created_at}]\n${m.content}`
  }));

  const body: any = {
    model: KLO_MODEL,
    max_tokens: 1500,
    system: useCache
      ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
      : systemPrompt,
    messages: apiMessages
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';

  // Robust JSON extraction: Klo should return only JSON, but tolerate accidental wrapping
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < 0) throw new Error('Klo did not return JSON');
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));

  if (!parsed.klo_state || !parsed.chat_reply) {
    throw new Error('Klo response missing klo_state or chat_reply');
  }
  return parsed as KloRespondOutput;
}
```

### 7d. `writeHistory` (the diff)

Insert one history row per changed field. Skip noisy fields.

```typescript
const NOISY_FIELDS = new Set(['summary', 'klo_take_seller', 'klo_take_buyer', 'stage_reasoning']);

async function writeHistory(
  deal_id: string,
  oldState: KloState | null,
  newState: KloState,
  triggering_message_id: string | null,
  triggered_by_role: 'seller' | 'buyer' | 'system'
) {
  // Bootstrap case: one row, kind='extracted', field_path='bootstrap'
  if (oldState == null) {
    await sb.from('klo_state_history').insert({
      deal_id,
      triggered_by_message_id: triggering_message_id,
      triggered_by_role: 'system',
      change_kind: 'extracted',
      field_path: 'bootstrap',
      before_value: null,
      after_value: newState
    });
    return;
  }

  const rows: any[] = [];
  const fields: Array<keyof KloState> = ['stage', 'deal_value', 'deadline', 'people', 'decisions', 'blockers', 'open_questions'];

  for (const f of fields) {
    if (NOISY_FIELDS.has(f as string)) continue;
    if (JSON.stringify((oldState as any)[f]) !== JSON.stringify((newState as any)[f])) {
      rows.push({
        deal_id,
        triggered_by_message_id: triggering_message_id,
        triggered_by_role,
        change_kind: 'extracted',
        field_path: String(f),
        before_value: (oldState as any)[f] ?? null,
        after_value: (newState as any)[f] ?? null
      });
    }
  }

  if (rows.length > 0) {
    const { error } = await sb.from('klo_state_history').insert(rows);
    if (error) throw error;
  }
}
```

### 7e. `updateDealState` (with legacy field sync)

```typescript
async function updateDealState(deal_id: string, state: KloState) {
  // Sync legacy columns so existing UI keeps working as a rollback target
  const update: any = {
    klo_state: state,
    summary: state.summary,
    stage: state.stage
  };
  if (state.deal_value) update.value = state.deal_value.amount;
  if (state.deadline) update.deadline = state.deadline.date;

  const { error } = await sb.from('deals').update(update).eq('id', deal_id);
  if (error) throw error;
}
```

### 7f. `postKloMessage`

```typescript
async function postKloMessage(deal_id: string, content: string, visible_to: 'seller' | 'buyer') {
  const { error } = await sb.from('messages').insert({
    deal_id,
    sender_type: 'klo',
    sender_name: 'Klo',
    content,
    visible_to
  });
  if (error) throw error;
}
```

## Acceptance per sub-step

After each sub-step:
- The function compiles
- The function deploys with `supabase functions deploy klo-respond --no-verify-jwt`
- After all six sub-steps, send a message in a test deal and verify:
  - A Klo message appears in chat
  - `deals.klo_state` is populated (check in SQL editor)
  - At least one row in `klo_state_history` for the deal

## Acceptance for full step 07

- All six helpers implemented and committed separately
- A test deal end-to-end produces correct state, history, and chat reply
- The `klo-respond` function logs show no errors

→ Next: `08-klo-removal-function.md`
