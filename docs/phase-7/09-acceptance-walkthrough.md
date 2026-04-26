# Step 09 — Acceptance walkthrough

**Goal:** Final verification before merging Phase 7 to main.

## Pre-flight

```powershell
cd C:\Users\rajes\Documents\klosure
git fetch
git checkout claude/phase-7-gemini-migration
git pull
```

Verify env vars are set:

```powershell
supabase secrets list
```

Should include:
- `GEMINI_API_KEY` (you've already added)
- `USE_GEMINI=true`
- `KLO_MODEL_GEMINI=gemini-3.1-flash-lite-preview`
- `KLO_MODEL_ANTHROPIC=claude-sonnet-4-5`

If any are missing:

```powershell
supabase secrets set USE_GEMINI=true
supabase secrets set KLO_MODEL_GEMINI=gemini-3.1-flash-lite-preview
supabase secrets set KLO_MODEL_ANTHROPIC=claude-sonnet-4-5
```

Deploy all six functions:

```powershell
supabase functions deploy klo-respond --no-verify-jwt
supabase functions deploy klo-daily-focus --no-verify-jwt
supabase functions deploy klo-manager
supabase functions deploy klo-watcher
supabase functions deploy klo-removal
```

## Sprint A — Shared infrastructure

### Test A.1 — Abstraction layer compiles
- [ ] `supabase/functions/_shared/llm-client.ts` exists with `callLlm` exported
- [ ] `supabase/functions/_shared/llm-types.ts` exists with `LlmCallOptions`, `LlmResult`, `LlmToolDefinition` exported
- [ ] All Edge Functions deploy without errors

## Sprint B — klo-respond

### Test B.1 — Tool schema
- [ ] `KLO_OUTPUT_TOOL` typed as `LlmToolDefinition`
- [ ] All major nullable fields in `required` array with explicit null support

### Test B.2 — Live call works
- [ ] Send a chat message in DIB
- [ ] Klo responds within 3 seconds
- [ ] Reply text feels like Klo's voice (direct, specific, 2-4 sentences)
- [ ] `klo_state` updated correctly:
  ```sql
  select jsonb_pretty(klo_state) from deals where id = 'dd7c0455-a719-469f-85dc-d51909a77dc8';
  ```
- [ ] All required fields present in `klo_state` (none missing)

### Test B.3 — Logs confirm Gemini
- [ ] Open Supabase logs for `klo-respond`
- [ ] Recent invocation shows `model: gemini-3.1-flash-lite-preview` in the log
- [ ] Token counts logged (`prompt_tokens`, `completion_tokens`)

### Test B.4 — Meeting extraction still works
- [ ] Send: "Demo confirmed for Wednesday May 1 at 2pm with Khalid"
- [ ] Verify: `select klo_state->'next_meeting' from deals where id='dd7c0455-...';`
- [ ] Returns structured object with date, title, with[Khalid], confidence: definite

## Sprint C — Other functions

### Test C.1 — klo-daily-focus
- [ ] Trigger regeneration (update a deal's confidence ±15 points OR wait 24h)
- [ ] Reload `/today`
- [ ] Focus paragraph appears with sharp voice
- [ ] Mentions a real deal by name
- [ ] CTA "Open {deal name}" navigates correctly

### Test C.2 — klo-manager
- [ ] Open `/team` as a manager
- [ ] Team brief renders within 3 seconds
- [ ] Voice is strategic (patterns) not tactical
- [ ] Open `/team/askklo` and send a message
- [ ] Reply has manager-appropriate voice

### Test C.3 — klo-watcher
- [ ] Manually create an overdue commitment (set due_date to yesterday)
- [ ] Trigger watcher cron OR wait for next hourly run
- [ ] Receive email nudge with concise, direct copy
- [ ] Email content under 50 words
- [ ] Email mentions specific deal and action

### Test C.4 — klo-removal
- [ ] Click × on any blocker, provide a removal reason
- [ ] Removal logged in `klo_state_history`
- [ ] If acknowledgment is generated, voice is appropriate

## Sprint D — Quality + cost

### Test D.1 — Quality dimensions
Run through the 6 dimensions from step 08:
- [ ] Reply voice acceptable
- [ ] Extraction completeness acceptable
- [ ] Confidence calibration acceptable
- [ ] Meeting extraction acceptable
- [ ] Daily focus quality acceptable
- [ ] Manager voice acceptable

### Test D.2 — Cost verification
- [ ] Send 10 chat messages
- [ ] Check Anthropic console: total spend should be near zero
- [ ] Check Gemini console: total spend should be ~$0.01 (or free-tier covered)
- [ ] Per-message average ~30x lower than pre-Phase-7 baseline

### Test D.3 — Rollback works
- [ ] Set `supabase secrets set USE_GEMINI=false`
- [ ] Send a chat message
- [ ] Verify in logs: model is now `claude-sonnet-4-5`
- [ ] Set `supabase secrets set USE_GEMINI=true` to restore Gemini
- [ ] Confirm rollback path is functional

## Cross-cutting

### Test X.1 — No regression
- [ ] Phase 6.1 acceptance tests still pass (next meeting chip, stakeholders panel, recency strip, fixed stuck-for, promoted commitments)
- [ ] Phase 6 desktop redesign still works
- [ ] Phase 5 confidence + dashboard + manager forecast still work
- [ ] Phase 4.5 × removal + provenance still work
- [ ] Phase 4 Stripe + manager + archive still work
- [ ] Phase 3 commitments + watcher + nudges still work

### Test X.2 — No console errors
- [ ] DevTools console clean across every page

### Test X.3 — Edge function logs clean
- [ ] No errors in last 100 log entries for any of the six functions
- [ ] Token usage logs present (cost monitoring is wired)

## Decision point

After all tests pass, you have two options:

### Option A — Ship Phase 7 to main
- Merge `claude/phase-7-gemini-migration` → main
- Watch for issues over 24-48 hours
- Real cost savings begin immediately

### Option B — Hybrid: keep migration but upgrade specific surfaces
If quality tests revealed weak spots (say, daily focus is too generic), do a small Phase 7.5:
- Add a `model` parameter override to `callLlm` calls in those specific functions
- Set them to `gemini-3-pro-preview` or `gemini-2.5-pro`
- Cost goes from ~$3/seller/month to ~$8-12/seller/month
- Still 10x cheaper than Claude

### Option C — Roll back
If quality is bad enough that Klosure feels worse:
- Keep the abstraction code (it's good architecture)
- Set `USE_GEMINI=false` permanently
- Plan Phase 8 = Claude optimization (caching + trivial gate + differential extraction)
- Achieves ~80% Claude cost reduction without model change

## Cleanup before merging

After acceptance and decision:

- Update README.md with the chosen path (which model, which functions overridden if any)
- Delete any unused old code (e.g., the inline `callAnthropic` function inside individual Edge Functions — already removed in steps 03/05/06/07)
- Final commit: "phase 7 cleanup: documentation update"

## When PR merges

Phase 7 done. Klosure now runs on Gemini at ~30x lower cost. India pricing tier becomes viable. Gulf margins improve dramatically.

**What's next:**
- Use it. Two days minimum.
- If quality is fine, plan Phase 8 (further optimizations like trivial-gate, differential extraction — these compound on top of model savings)
- If quality is borderline, plan Phase 7.5 hybrid (specific surfaces on Pro)
- If quality is bad, roll back and pivot to Phase 8 = Claude optimization

→ Phase 7 complete.
