# Step 08 — Quality calibration

**Sprint:** D
**Goal:** Define what "Gemini is good enough" means, measure it on real traffic, and decide whether to keep it or roll back.

## Why this step exists separately

The migration is mechanically complete after step 07. But the question "is Gemini Flash-Lite actually good enough?" can't be answered by code review. It needs real conversations, with you reading the outputs and making a judgment call.

This step is the structured judgment.

## What to test — six dimensions

For each dimension, send 5-10 real chat messages and evaluate.

### Dimension 1 — Reply voice

**Test:** Send a tactical question in a deal. ("Should I push back on the budget?")
**Pass criteria:** Klo's reply sounds like a senior sales VP — direct, specific, 2-4 sentences. No "Great question!", no "I'd recommend...", no vague hedging.
**Fail criteria:** Reply feels generic, hedged, or chatbot-flavored.

### Dimension 2 — Extraction completeness

**Test:** Send a message with multiple new facts. ("Met with Ahmed, he confirmed budget at $25k, said the legal review takes 2 weeks, intro'd me to Khalid from procurement.")
**Pass criteria:** `klo_state` updates `deal_value`, adds Khalid to `people`, may add a blocker about legal timeline.
**Fail criteria:** Some facts missing or hallucinated.

### Dimension 3 — Confidence calibration

**Test:** Open 3-4 different deals (or simulate them by sending varied chat content).
**Pass criteria:** Confidence values feel calibrated — really good deals score 70+, stuck deals score 40-, dead deals score below 30. Anchors hold.
**Fail criteria:** Most deals end up around 50% (model is hedging), OR scores feel disconnected from the actual content.

### Dimension 4 — Meeting extraction

**Test:** Send messages with various meeting phrasings: "Demo Monday at 10am", "Maybe a call next week", "Confirmed for Tuesday April 28th".
**Pass criteria:** `next_meeting` populates with correct date, title, confidence (definite vs tentative).
**Fail criteria:** Meetings missed, dates wrong, confidence misclassified.

### Dimension 5 — Daily focus quality

**Test:** Trigger daily focus regeneration (update a deal's confidence by 15+ points).
**Pass criteria:** Paragraph picks ONE deal as anchor, gives a specific action, mentions the deal by name, voice is sharp.
**Fail criteria:** Generic paragraph, no specific deal, no specific action.

### Dimension 6 — Manager voice

**Test:** Open `/team` and load the team brief. Send a message to `/team/askklo`.
**Pass criteria:** Voice is strategic (patterns across reps), not tactical (do this today). Acknowledges weak reps directly.
**Fail criteria:** Generic team-coach voice. Avoids being honest about weak reps.

## Decision matrix after testing

After running all six dimensions on 5-10 messages each:

| How many dimensions feel acceptable | Decision |
|---|---|
| All 6 | **Keep Gemini.** Ship it. ~$3/seller/month confirmed. |
| 4-5, with reply voice + extraction OK | **Keep Gemini, plan Phase 7.5** to upgrade specific weak surfaces (probably daily-focus or manager-brief) to Gemini 2.5 Pro. ~$5-8/seller/month. |
| 1-3, OR reply voice clearly bad, OR extraction missing data | **Roll back.** Set `USE_GEMINI=false`. Keep Claude. Plan Phase 8 cost optimization (caching + trivial gate + differential extraction) to bring Claude cost down without changing models. |

## Rollback procedure

If the decision is to roll back:

```powershell
supabase secrets set USE_GEMINI=false
```

That's it. The abstraction layer (step 01) routes everything back to Anthropic. No code changes, no redeploys (the env var is read at runtime).

If you want to also remove the Gemini code from the abstraction (cleaner main branch), do so in a follow-up commit. But the env var alone is enough for instant rollback.

## What "good enough" actually means

Be honest with yourself. Gemini 3.1 Flash-Lite is 30x cheaper than Claude Sonnet. That economic reality should buy SOME quality compromise.

If Gemini is 90% as good but enables $5/month Indian pricing — that's a clear win.
If Gemini is 80% as good — probably still worth it given the economics.
If Gemini is 60% as good or less — not worth it. The product becomes a worse product.

Don't over-engineer the threshold. Use Klosure for two days on Gemini. If it feels like Klosure, ship it. If it feels like a worse product, roll back.

## Cost verification

While testing, also verify the cost reduction is real:

```sql
-- Watch the per-message Anthropic spend on the dashboard:
-- https://console.anthropic.com/settings/usage
-- Should drop to near-zero after Phase 7 deploys

-- Watch the Gemini spend:
-- https://aistudio.google.com (free tier likely covers all your testing)
-- Or https://console.cloud.google.com if billing is set up

-- Internal log check:
select count(*), date_trunc('day', created_at) as day
from messages
where sender_type = 'klo'
  and created_at >= current_date - interval '7 days'
group by day
order by day;
```

Calculate: (Anthropic $ before) / (messages before) vs (Gemini $ after) / (messages after). The ratio should be approximately 30x cheaper. If it's not (e.g., only 10x cheaper), something's wrong — maybe Klo is hitting the retry path on every call. Investigate.

## Acceptance for this step

- [ ] All 6 dimensions tested with 5-10 messages each
- [ ] Decision recorded (keep / partial / roll back)
- [ ] If partial: list which surfaces need Pro-tier model upgrade for Phase 7.5
- [ ] Cost verification: per-message cost confirmed at ~$0.001 (vs $0.037 baseline)

→ Next: `09-acceptance-walkthrough.md`
