# Klosure.ai

> Get closure on every deal.

Klosure is an AI-powered deal room that brings buyers and sellers into the same space. Klo — the AI deal coach — observes every conversation and coaches both sides to move the deal forward.

This repo currently implements **Phase 1 — The Room** (Section 8 of `Klosure_Project_Document_v2.md`).

## What's in Phase 1

- React + Vite frontend, mobile-first WhatsApp-style chat UI.
- Supabase schema with RLS for users, deals, deal context, messages, commitments, and deal access.
- Seller email/password auth via Supabase Auth.
- Deal creation (title, companies, value, deadline, stakeholders, context).
- Deals list (Active + Archive sections).
- Solo-mode deal room — seller can chat with Klo immediately.
- Unique shareable buyer link — buyer joins with just a name, no signup.
- Real-time chat via Supabase realtime.
- A Klo service abstraction with a Phase 1 heuristic stub. Phase 2 swaps in Claude Sonnet 4.6 with prompt caching behind the same interface.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + Tailwind |
| Routing | react-router-dom |
| DB / Auth / Realtime | Supabase |
| AI (Phase 2) | Claude Sonnet 4.6 |

## Setup

### 1. Supabase project

1. Create a new Supabase project (region: EU or Singapore — see Section 11.1).
2. Open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql) end-to-end. This creates all tables, RLS policies, the realtime publication, and the auth-trigger that mirrors `auth.users` into `public.users`.
3. In **Authentication → Providers**, enable Email. For Phase 1 you can disable email confirmations during local dev to speed up testing.

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

### 3. Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

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

## Phase 1 walkthrough

1. **Sign up** as a seller.
2. **Create a deal** — fill in title, companies, value, deadline, stakeholders, what needs to happen.
3. The room opens — Klo greets you in solo mode. Type a message, Klo replies (Phase 1 stub today; real Claude in Phase 2).
4. Tap **Share** → copy the buyer link or send via WhatsApp.
5. Open the link in another browser/incognito → enter a buyer name → you're in the same room.
6. Both sides chat in real time. Klo posts coaching after each user message.

## What's next

- **Phase 2 — Klo's Brain (Weeks 3–4):** wire `src/services/klo.js` to the Anthropic API with the system prompt from Section 15.2 and prompt caching. The same `getKloResponse({ deal, dealContext, messages, role, mode })` signature is already used end-to-end, so the swap is one file.
- **Phase 3 — Commitments and Accountability (Weeks 5–6):** the `commitments` table is already created in Phase 1; build the UI and Klo's commitment detection on top.
- **Phase 4 — Polish, Dashboard, Manager View (Weeks 7–10).**

## File layout

```
supabase/schema.sql        Postgres schema + RLS + realtime
src/
  lib/supabase.js          Supabase client
  lib/format.js            Currency, deadline, time formatters
  hooks/useAuth.jsx        Auth context (Supabase Auth)
  services/klo.js          Klo abstraction (Phase 1 stub, Phase 2 swap point)
  components/DealRoom.jsx  Shared room UI for seller + buyer views
  pages/
    LandingPage.jsx
    AuthPage.jsx
    DealsListPage.jsx
    NewDealPage.jsx
    DealRoomPage.jsx       Seller view of /deals/:id
    BuyerJoinPage.jsx      Buyer entry at /join/:token
  App.jsx                  Routes + auth guards
  main.jsx                 Entry
  styles.css               Tailwind + chat doodle background
```

## Notes on Phase 1 RLS

- Sellers see only their own deals (`deals.seller_id = auth.uid()`).
- Buyers are anonymous — they access a deal only through `buyer_token` and `deal_access`. The Phase 1 policies allow anon reads/inserts of messages on shared deals; Phase 4 will harden this with a Postgres function that validates the buyer_token explicitly.
- Team-manager visibility (`teams.owner_id`) is already wired so Phase 4's manager view requires no schema change.

## Brand

| | |
|---|---|
| Domain | klosure.ai |
| AI name | Klo |
| Primary | `#1A1A2E` (navy) |
| Accent | `#4F8EF7` (blue) |
| Font | Inter / DM Sans |
