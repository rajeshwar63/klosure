# Step 08 — Acceptance walkthrough

**Goal:** Verify Phase 7.1 hits all three constraints — improved quality, same-or-lower cost, latency under 3 seconds — before merging.

## Pre-flight

```powershell
cd C:\Users\rajes\Documents\klosure
git checkout claude/phase-7-1-prompt-tightening
git pull
supabase functions deploy klo-respond --no-verify-jwt
```

Verify env vars unchanged:
```powershell
supabase secrets list
```

Should still show:
- `USE_GEMINI=true`
- `GEMINI_API_KEY` set
- `KLO_MODEL_GEMINI=gemini-3.1-flash-lite-preview`

## The 5 standard test messages

Use these EXACT messages for consistency. Send them in a fresh deal (create "Test 7.1 — Acme LMS" with similar setup as before — Acme Corp, $35K, 60-day deadline, Sarah Chen as initial stakeholder).

**Message 1 — Multi-fact update:**
> "Got on a call with Sarah. She confirmed budget at $40k for Year 1, said her CFO Rajiv needs to sign off, and intro'd me to David from IT who'll do technical eval. They're also looking at Cornerstone."

**Message 2 — Tactical question:**
> "Cornerstone is offering 25% lower pricing. How do I respond?"

**Message 3 — Meeting:**
> "Demo confirmed for Friday May 2 at 3pm with Sarah and David. Rajiv will join if he can."

**Message 4 — Threat signal:**
> "Sarah just emailed — they're 'leaning toward Cornerstone but want to see our pricing model first.'"

**Message 5 — Trivial ack:**
> "Thanks!"

## Quality dimensions

After sending each message, evaluate:

### Dimension 1 — Reply voice (was the biggest issue before)

| Message | Pass criteria |
|---|---|
| 1 | Reply names Sarah specifically, addresses CFO Rajiv as a specific path, mentions David's technical role. Not "good progress, keep moving." |
| 2 | Reply addresses Cornerstone by name, gives specific tactical reframe, doesn't say "pivot to value proposition." |
| 3 | Reply acknowledges the demo specifically, suggests prep step for Rajiv attendance specifically. |
| 4 | Reply identifies the leaning-toward-Cornerstone as a specific risk, names a specific countermove. |
| 5 | Reply is brief or absent. Not a generic "you're welcome" paragraph. |

### Dimension 2 — Extraction completeness

After message 1, verify:
```sql
select jsonb_pretty(klo_state) from deals where title ilike '%Test 7.1%' order by created_at desc limit 1;
```

- people[]: Sarah Chen (VP People), Rajiv (CFO), David (IT) — three entries
- deal_value.amount: 40000
- blockers[]: includes "CFO Rajiv approval needed"
- open_questions[] OR summary: mentions Cornerstone as competitor

### Dimension 3 — Strict grounding

After message 1, verify:
- Rajiv's role is "CFO" (stated), NOT "likely signatory" (inferred)
- David's role is "IT" or "technical evaluation" — specific to what was said, not invented seniority
- No fabricated stakeholders

### Dimension 4 — Hard stops working

After message 4 (Cornerstone leaning), verify:
- confidence drops noticeably
- factors_dragging_down includes the competitive threat
- klo_take_seller acknowledges the cap (if applicable based on rule 7)

### Dimension 5 — Momentum awareness

This requires waiting OR simulating. Skip in basic test, but worth manual check:
- Find an existing deal with no buyer message in 7+ days
- Verify klo_take_seller's tone is "warning" not "advice"

## Latency verification

For each of the 5 test messages, time from clicking Send to seeing Klo's reply.

Target: ≤3 seconds for messages 1-4. Message 5 (trivial) can be slightly faster (2-2.5s).

If any message takes >3 seconds:
- Check Supabase log for the specific call's timing breakdown
- Compare prompt_tokens vs the baseline (~5,400)
- If prompt is much larger, some section is bloated — review steps 03-06 for over-verbose content

## Cost verification

In Supabase logs, check 5-10 recent klo-respond invocations. Each should show:
```json
{"prompt_tokens": <5,400-5,800>, "completion_tokens": <600-850>}
```

Compute average cost per call:
- Input: avg_prompt × $0.10/1M
- Output: avg_completion × $0.40/1M
- Expected total: ~$0.0007-0.0009 per call

If cost is **higher** than $0.001 per call: something is bloated. Check if all the section caps are being honored.

If cost is **lower** than $0.0006: that's better than expected, but verify quality hasn't degraded — too small often means too generic.

## Comparison test

Run the same 5 messages on a deal that was created before Phase 7.1 (DIB or Noor Bank). Compare:

| Metric | Pre 7.1 | Post 7.1 | Target |
|---|---|---|---|
| Voice quality | Generic | Situated | Better |
| Avg latency | 2.5-3.5s | 2-2.5s | Lower |
| Avg cost/call | $0.0009 | $0.0007 | Lower |
| Avg output tokens | ~1000 | ~750 | Lower |

Same 5 messages, different prompts, comparable inputs. If 7.1 doesn't beat the pre-7.1 baseline on quality, voice section needs more iteration. If quality is better but latency or cost is worse, the new sections are too long.

## Decision matrix

| Quality | Latency | Cost | Decision |
|---|---|---|---|
| Better | ≤3s | ≤$0.001 | **Ship.** All three constraints met. |
| Better | ≤3s | >$0.001 | Trim further (steps 5/6 are likely bloated). Try cutting hard_stops or momentum to most-important rules only. |
| Better | >3s | ≤$0.001 | Output is too long. Tighten step 7 caps further. |
| Same/worse | Any | Any | Voice section in step 3 didn't land. Iterate examples. |

## Cleanup

After acceptance passes:

- Update README with Phase 7.1 status
- Final commit titled "phase 7.1: prompt tightening + latency reduction"
- Open PR to main with clear description of constraints met

## When PR merges

You'll have:
- Klo voice that genuinely sounds like a senior coach (situated, not generic)
- Confidence scoring that resists Happy Ears (hard stops in place)
- Time-aware coaching (momentum decay)
- ~25% lower cost per call (~$0.0007 vs $0.0009)
- ~25% faster responses (~2.5s vs 3.5s on the slow end)
- Same Gemini 3.1 Flash-Lite, same architecture, just sharper

## What's next after Phase 7.1

Stop building features. Use Klosure for 3-4 days on real deals. Watch:
- Does Klo's voice now feel like a senior coach, or still chatbot-y?
- Are hard stops triggering correctly or annoying?
- Does momentum decay catch real decay or false-flag healthy deals?

That feedback shapes Phase 8. Don't pre-design Phase 8 until you have real usage data.

→ Phase 7.1 complete.
