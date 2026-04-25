# Klosure.ai

> Get closure on every deal.

Klosure is an AI-powered deal room that brings buyers and sellers into the same space. Klo — the AI deal coach — observes every conversation and coaches both sides to move the deal forward.

This repo currently implements **Phase 1 — The Room** and **Phase 2 — Klo's Brain** (Section 8 of `Klosure_Project_Document_v2.md`).

## What's in Phase 1

- React + Vite frontend, mobile-first WhatsApp-style chat UI.
- Supabase schema with RLS for users, deals, deal context, messages, commitments, and deal access.
- Seller email/password auth via Supabase Auth.
- Deal creation (title, companies, value, deadline, stakeholders, context).
- Deals list (Active + Archive sections).
- Solo-mode deal room — seller can chat with Klo immediately.
- Unique shareable buyer link — buyer joins with just a name, no signup.
- Real-time chat via Supabase realtime.

## What's new in Phase 2

- **Claude Sonnet 4.6** wired in via a Supabase Edge Function (`supabase/functions/klo-respond`). The Anthropic API key lives server-side as a Supabase secret — never in the browser bundle.
- **Prompt caching** on the Klo persona prompt — ~90% cost reduction on cached reads. Verified via `usage.cache_read_input_tokens` in the function response.
- **Structured JSON output** via `output_config.format` so every Klo turn returns a clean `{ reply, summary, suggested_stage }` we can persist without retries.
- **Role-aware coaching.** When the seller speaks, Klo coaches the seller privately; when the buyer speaks, Klo coaches the buyer privately. New `messages.visible_to` column + tightened RLS make sure each side only reads coaching meant for them. This is the Phase 2 §8 deliverable "Views diverge".
- **Live deal summary card.** New `deals.summary` column is rewritten on every Klo turn and pushed to the seller view via realtime. The KloSummaryBar at the top of the room is always current.
- **Deal stage detection.** Klo classifies the deal into Discovery / Proposal / Negotiation / Legal / Closed from the conversation and updates `deals.stage`. The pill in the top bar moves on its own.
- **Phase 1 heuristic fallback.** If the edge function isn't deployed (or returns an error), `src/services/klo.js` falls back to the Phase 1 stub so the room still works in local dev.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + Tailwind |
| Routing | react-router-dom |
| DB / Auth / Realtime | Supabase |
| AI | Claude Sonnet 4.6 (Anthropic Messages API + prompt caching) |
| AI hosting | Supabase Edge Function (Deno) |

## Setup

### 1. Supabase project

1. Create a new Supabase project (region: EU or Singapore — see Section 11.1).
2. Open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql) end-to-end. This creates all tables, RLS policies, the realtime publication, and the auth-trigger that mirrors `auth.users` into `public.users`.
3. Then run [`supabase/phase2.sql`](supabase/phase2.sql) — the Phase 2 delta (adds `visible_to`, `summary`, `last_klo_at`, and tightens the message-read RLS policies).
4. In **Authentication → Providers**, enable Email. For local dev you can disable email confirmations to speed up testing.

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in:

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_APP_URL=http://localhost:5173
```

### 3. Deploy the Klo edge function (Phase 2)

The function lives in [`supabase/functions/klo-respond`](supabase/functions/klo-respond). It calls Claude Sonnet 4.6 with prompt caching, picks up the speaker, writes a role-scoped Klo message, and updates `deals.summary` and `deals.stage`.

```bash
# Install the Supabase CLI if you haven't:
brew install supabase/tap/supabase
# or: npm install -g supabase

# Log in and link to your project:
supabase login
supabase link --project-ref <your-project-ref>

# Set the Anthropic key as a function secret (NEVER commit this):
supabase secrets set ANTHROPIC_API_KEY=sk-ant-…

# Deploy. --no-verify-jwt because the function is invoked from the browser
# anon client; we do auth/permission checks against the deal row inside.
supabase functions deploy klo-respond --no-verify-jwt
```

To pin a different model later, set `KLO_MODEL` as a function secret (defaults to `claude-sonnet-4-6`).

### 4. Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

If you want to skip the edge function locally and use the heuristic stub instead, add `VITE_KLO_USE_STUB=true` to `.env.local`.

## App routes

```
/                  Landing page
/signup            Create seller account
/login             Seller login
/deals             Seller deals list (auth required)
/deals/new         Create a deal
/deals/:id         Deal room (seller view)
/join/:token       Buyer entry — no signup
```

## Phase 2 walkthrough

1. **Sign up** as a seller and **create a deal** with rich context (companies, value, deadline, stakeholders, what needs to happen).
2. The room opens — Klo greets you in solo mode. Type a message ("Ahmed mentioned budget approval might take 3 weeks. We have 34 days to go-live.") and watch:
   - Klo replies in 1–3 sentences with a concrete next move.
   - The blue summary line at the top rewrites itself (e.g. "Solo — budget timeline at risk vs. 34d deadline. Push for Fatima intro.").
   - The stage chip in the top bar updates if Klo detects a change.
3. Tap **Share** → send the link to a second browser/incognito window → enter a buyer name.
4. Type as the buyer. Klo writes a coaching message visible **only** to the buyer. Switch back to the seller window — the seller's view doesn't show the buyer's coaching, but does show the buyer's actual message.
5. Type as the seller again. Klo coaches the seller, again privately. The two sides see different Klo coaching in the same room — that's "Views diverge" from Phase 2 §8.

## File layout

```
supabase/
  schema.sql                     Phase 1 schema + RLS + realtime
  phase2.sql                     Phase 2 delta (visible_to, summary, RLS)
  functions/klo-respond/
    index.ts                     Klo's Brain — Claude Sonnet 4.6 + caching
src/
  lib/supabase.js                Supabase client
  lib/format.js                  Currency, deadline, time formatters
  hooks/useAuth.jsx              Auth context (Supabase Auth)
  services/klo.js                Klo entry point — invokes edge function,
                                 falls back to Phase 1 heuristic stub
  components/DealRoom.jsx        Shared room UI — visible_to filtering,
                                 live deal summary subscription
  pages/
    LandingPage.jsx
    AuthPage.jsx
    DealsListPage.jsx
    NewDealPage.jsx
    DealRoomPage.jsx             Seller view of /deals/:id
    BuyerJoinPage.jsx            Buyer entry at /join/:token
  App.jsx                        Routes + auth guards
  main.jsx                       Entry
  styles.css                     Tailwind + chat doodle background
```

## Notes on Phase 2 RLS

- `visible_to` is honoured by Postgres-level RLS: the seller can't read buyer-private Klo messages and vice-versa. The client also filters defensively.
- Klo's writes happen through the Supabase **service role** inside the edge function, which bypasses RLS — this is the only safe way to write a message with `visible_to` set, since neither the anon nor authed JWT should be allowed to forge a Klo turn.
- The buyer remains anonymous and reads `deals` via the Phase 1 `BuyerJoinPage` snapshot. They do **not** receive live `deals.summary` updates over realtime (Phase 4 will add a buyer_token-validating RPC). The buyer DOES see Klo's coaching live via the messages stream.

## What's next

- **Phase 3 — Commitments and Accountability (Weeks 5–6):** the `commitments` table is already created. Next we extend the Klo prompt to detect commitments in conversation, render them as cards in chat, and emit Klo nudges when due dates pass. Email nudges via Resend.
- **Phase 4 — Polish, Dashboard, Manager View (Weeks 7–10):** PWA, dashboard, archive flow, manager view, Stripe.

## Brand

| | |
|---|---|
| Domain | klosure.ai |
| AI name | Klo |
| AI model | Claude Sonnet 4.6 |
| Primary | `#1A1A2E` (navy) |
| Accent | `#4F8EF7` (blue) |
| Font | Inter / DM Sans |
