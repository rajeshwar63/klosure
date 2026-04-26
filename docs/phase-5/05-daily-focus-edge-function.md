# Step 05 — `klo-daily-focus` Edge Function

**Sprint:** 3
**Goal:** New Edge Function that synthesizes the seller's whole pipeline into one short paragraph of coaching, displayed at the top of the dashboard.

## Why a separate function

Per-deal `klo-respond` already runs on every chat turn. But the daily focus banner needs cross-deal synthesis — Klo reads ALL of a seller's active deals at once and tells them where to spend their day. That's a different scope, computed less often, and worth caching.

## Files

- `supabase/functions/klo-daily-focus/index.ts` — new function
- The function returns the synthesized message; it does NOT write to the database (caching is in step 06)

## Function logic

```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KLO_MODEL = Deno.env.get('KLO_MODEL') ?? 'claude-sonnet-4-5';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  try {
    // Auth: only the seller themselves can call this
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response('not authorized', { status: 401 });

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return new Response('not authorized', { status: 401 });

    const sellerId = userData.user.id;

    // Load all active deals for this seller
    const { data: deals, error } = await sb
      .from('deals')
      .select('id, title, buyer_company, klo_state, value, deadline, stage, status')
      .eq('seller_id', sellerId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    if (!deals || deals.length === 0) {
      return Response.json({
        focus_text: "No active deals yet. When you start one, Klo will start coaching across your pipeline here.",
        deals_referenced: []
      });
    }

    // Build the digest for the prompt
    const digest = deals.map(d => ({
      id: d.id,
      title: d.title,
      buyer: d.buyer_company,
      stage: d.klo_state?.stage ?? d.stage,
      value: d.klo_state?.deal_value?.amount ?? d.value,
      deadline: d.klo_state?.deadline?.date ?? d.deadline,
      confidence: d.klo_state?.confidence?.value ?? null,
      trend: d.klo_state?.confidence?.trend ?? null,
      delta: d.klo_state?.confidence?.delta ?? null,
      summary: d.klo_state?.summary ?? null,
      top_blocker: d.klo_state?.blockers?.[0]?.text ?? null,
      seller_take: d.klo_state?.klo_take_seller ?? null
    }));

    const systemPrompt = `You are Klo, the AI deal coach inside Klosure. You're talking to a sales person at the start of their day.

You have a digest of their active deals — confidence scores, trends, top blockers, and your previous coaching for each. Your job is to synthesize ONE coaching paragraph (3-5 sentences max) that tells them where to spend their time today.

Rules:
- Name the 1-2 deals that matter most today, BY NAME (e.g. "DIB" or the deal title)
- Be specific about why each one matters — reference the actual blocker or signal
- Tell them what to do, in order of priority
- Don't summarize their whole pipeline. Pick the urgent stuff and ignore the rest. Sellers know they have other deals.
- If a deal is slipping (trend down, delta -10 or worse), it usually deserves the top spot
- If two deals are quiet for 5+ days, mention both as a pattern
- If everything is on track, say so briefly and point them at the highest-leverage move (usually the biggest deal in proposal stage)
- Tone: senior, direct, no filler. Same Klo voice.

Output a single paragraph. No bullet lists. No headers.`;

    const userMessage = `Here's the seller's active pipeline:

${JSON.stringify(digest, null, 2)}

Write today's coaching paragraph.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: KLO_MODEL,
        max_tokens: 400,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data.content?.[0]?.text ?? '';

    // Pull deal IDs Klo referenced (best-effort: any title from digest mentioned in the text)
    const referenced = digest
      .filter(d => text.toLowerCase().includes(d.title.toLowerCase()) || (d.buyer && text.toLowerCase().includes(d.buyer.toLowerCase())))
      .map(d => d.id);

    return Response.json({
      focus_text: text.trim(),
      deals_referenced: referenced,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('klo-daily-focus error', err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});
```

## Deploy

```powershell
supabase functions deploy klo-daily-focus
```

This function **requires JWT** (no `--no-verify-jwt`) — it only serves the authenticated seller.

## Acceptance

- Deploy succeeds
- Calling the function with a valid auth token returns a JSON object with `focus_text`, `deals_referenced`, and `generated_at`
- The text is 3-5 sentences, mentions specific deals by name
- For a seller with no active deals, the function returns the empty-state message
- Function logs show no errors
- Calling without auth returns 401

→ Next: `06-daily-focus-cache-table.md`
