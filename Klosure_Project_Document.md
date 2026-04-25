# KLOSURE.AI
### Get closure on every deal.
**Project Development Document — Version 1.0 | April 2026 | Confidential**

---

## Table of Contents
1. [Product Vision](#1-product-vision)
2. [The Product — Klosure](#2-the-product--klosure)
3. [Target Market](#3-target-market)
4. [Pricing Model](#4-pricing-model)
5. [Technology Stack](#5-technology-stack)
6. [Development Phases](#6-development-phases)
7. [Klo — Voice Design](#7-klo--voice-design)
8. [Deal States and Data Model](#8-deal-states-and-data-model)
9. [Future Roadmap](#9-future-roadmap--post-launch)
10. [Go-To-Market Strategy](#10-go-to-market-strategy)
11. [Unit Economics](#11-unit-economics)
12. [Start Here — Day One Instructions for Claude Code](#12-start-here--day-one-instructions-for-claude-code)

---

## 1. Product Vision

Klosure is an AI-powered shared deal room that brings buyers and sellers into the same space — for the first time in the history of B2B sales.

Every B2B deal today is managed from one side only. The seller uses a CRM. The buyer uses email and WhatsApp. Nobody has a shared view of what is actually happening. Deals die in the silence between the two sides.

Klosure fixes this. Both buyer and seller join the same deal room. Klo — the AI deal coach — observes every conversation, tracks every commitment, and coaches both sides to move the deal forward.

> **The Core Insight**
>
> Sales managers today rely on what their sales people report — not what is actually happening. The sales guy's word is the bible for the account. Klosure replaces that with deal reality. For the first time, managers see the truth of every deal — in real time — from both sides.

---

## 2. The Product — Klosure

### 2.1 What It Is

Klosure is a web-based deal room — no app download required. It works like WhatsApp but built specifically for B2B deals. A seller creates a deal room, fills in the deal context, and shares a unique link with the buyer. The buyer clicks the link and joins instantly — no signup, no friction.

Inside the deal room, both parties can chat, commit to dates, and share updates. Klo — the AI — sits in the middle and coaches both sides like a senior sales expert would.

### 2.2 What Klo Does

- Reads all deal context — companies, value, deadline, stakeholders, what needs to happen
- Generates a one-line deal summary — always visible at the top of the room
- Coaches both buyer and seller based on their specific role in the deal
- Tracks commitments — when something is promised, Klo locks it in
- Nudges both parties when commitments are overdue — never lets things go silent
- Flags deals that are stuck, at risk, or heading toward failure
- Speaks with a voice via ElevenLabs — sales people can talk to Klo hands-free

### 2.3 What Klo Sounds Like

Klo has a personality. Direct. Brief. Confident. Never generic. Never preachy.

> **Klo Speaking — Examples**
>
> **To seller:** "Ahmed hasn't responded in 8 days. Fatima isn't in the room yet. 26 days to go-live. Call Ahmed today — not email."
>
> **To buyer:** "Your procurement team is waiting on Raja's proposal. It's 6 days overdue. A nudge from you closes this faster than waiting."
>
> **To seller:** "This deal is at risk. Three commitments missed in two weeks. Buyers who go quiet at this stage usually have an internal blocker. Ask Ahmed directly what changed."

---

## 3. Target Market

### 3.1 Primary Market — Gulf B2B Sales Teams

UAE, Saudi Arabia, Qatar, Oman, Kuwait, Bahrain. Companies with active B2B sales teams selling high-value deals — technology, professional services, financial services, real estate, construction, and training.

### 3.2 Buyer Personas

| Persona | Why They Pay |
|---|---|
| Solo B2B Seller | Closes more deals, never drops the ball, looks professional in front of Gulf buyers |
| Sales Manager | Sees deal reality not sales guy stories, forecasts accurately, coaches on real data |
| Sales Director / VP | Pipeline transparency, win/loss patterns, which deals are real vs wishful thinking |
| Buyer (Free forever) | Manages internal approvals, looks organised to their own management, never misses deadlines |

---

## 4. Pricing Model

Klosure is a monthly SaaS subscription. The buyer is always free — no barrier, no friction. The seller is the paying customer.

| Plan | Price | Active Deal Rooms | Users | Archive |
|---|---|---|---|---|
| Free | $0 / month | 3 | 1 | Unlimited |
| Pro | $199 / month | 100 | 1 | Unlimited |
| Team | $499 / month | 100 per seller | 5 | Unlimited |

Annual plans available at 2 months free:
- Pro Annual: $1,990/year
- Team Annual: $4,990/year

### Revenue Targets

| Target | Pro Users Needed | Team Plans Needed |
|---|---|---|
| $5,000 / month | 25 sellers | 10 teams |
| $10,000 / month | 50 sellers | 20 teams |
| $20,000 / month | 100 sellers | 40 teams |

---

## 5. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React + Vite | Web app, PWA ready, mobile first |
| Database | Supabase | Deal data, messages, commitments, users |
| Auth | Supabase Auth | Seller login, magic link for buyers |
| Hosting | Vercel | Global CDN, instant deploys |
| AI Brain | Claude Sonnet 4.6 | Klo — deal coaching intelligence |
| Voice | ElevenLabs API | Klo voice — human-like AI speech |
| Email | Resend | Nudges, deal updates, reminders |
| Domain | klosure.ai | Primary domain — .ai signals the product |

**On cost:** Claude Sonnet 4.6 with prompt caching reduces effective API costs by up to 90% for repeated system prompts. At early stage, total monthly AI cost is under $50 for hundreds of active deal rooms.

**On voice:** ElevenLabs transforms Klo from a chat tool into a genuine deal partner. A sales person driving between meetings in Dubai can talk to Klo completely hands-free.

---

## 6. Development Phases

Klosure is built in four phases over approximately 10 weeks. Each phase delivers a working, testable product — not just code. Show real people at the end of every phase.

---

### Phase 1 — The Room (Weeks 1–2)

**Goal:** A working deal room that a seller can create and a buyer can join via link.

| Week | What Gets Built | Deliverable |
|---|---|---|
| 1 | Supabase schema — deals, messages, users, commitments tables | Database ready |
| 1 | Seller auth — email signup and login via Supabase Auth | Sellers can sign up |
| 1 | Deal creation form — company names, value, deadline, stakeholders, context | First deal created |
| 2 | Unique shareable link per deal — buyer opens with no signup required | Buyer can join |
| 2 | Real-time chat between buyer and seller using Supabase realtime | Chat works live |
| 2 | Mobile responsive layout — WhatsApp feel, works on iPhone and Android | Mobile ready |

> **Phase 1 Milestone**
>
> Raja creates a deal for Dubai Islamic Bank. Sends the link to Ahmed on WhatsApp. Ahmed opens it on his phone — no signup. They can chat in real time. That is the MVP.

---

### Phase 2 — Klo's Brain (Weeks 3–4)

**Goal:** Klo observes the deal and coaches both sides intelligently. This is the heart of the product.

| Week | What Gets Built | Deliverable |
|---|---|---|
| 3 | Claude Sonnet 4.6 API integration with prompt caching | AI connected |
| 3 | Klo system prompt — deal coach persona, role-aware for buyer vs seller | Klo has personality |
| 3 | Deal summary card — Klo generates one-line status, always visible at top | Summary live |
| 4 | Klo responds in chat — triggered when either party messages | Klo is coaching |
| 4 | Role-aware responses — seller sees different Klo message than buyer | Views diverge |
| 4 | Deal stage detection — Discovery, Proposal, Negotiation, Legal, Closed | Stages work |

> **Klo System Prompt — Core Design**
>
> You are Klo, an AI deal coach inside Klosure — a shared deal room between a buyer and a seller. You speak like a senior B2B sales expert with 15+ years in Gulf markets. Direct. Brief. Never generic. You always know: who you are speaking to (buyer or seller), what the deal is, what stage it is at, what commitments have been made, what is overdue, and how many days are left to the deadline. You never give reminders. You give coaching. You tell people what to do and why — right now.

---

### Phase 3 — Commitments and Accountability (Weeks 5–6)

**Goal:** Klo tracks what both parties promise and holds them accountable automatically.

| Week | What Gets Built | Deliverable |
|---|---|---|
| 5 | Commitment creation — either party proposes a task with a due date | Commitments work |
| 5 | Commitment confirmation — other party confirms, Klo locks it as a card in chat | Cards visible |
| 5 | Overdue detection — Klo detects when a commitment passes its due date | Overdue flagged |
| 6 | Klo nudge messages — automatic coaching when something is overdue | Nudges firing |
| 6 | Deal health indicator — Green / Amber / Red based on commitment status | Health visible |
| 6 | Email notifications via Resend — nudges sent outside the app too | Email working |

---

### Phase 4 — Voice, Polish and Manager View (Weeks 7–10)

**Goal:** Klo gets a voice. Sellers get a dashboard. Managers get the truth.

| Week | What Gets Built | Deliverable |
|---|---|---|
| 7 | ElevenLabs voice integration — Klo speaks responses aloud | Klo has a voice |
| 7 | Voice input — seller can speak to Klo, transcribed via Web Speech API | Voice input works |
| 8 | PWA configuration — add to home screen, works offline for cached deals | PWA ready |
| 8 | Seller dashboard — all deals in one view, sorted by health and urgency | Dashboard live |
| 9 | Deal archive — Won / Lost flow, rooms locked as read-only, never deleted | Archive works |
| 9 | Manager view — Team plan: all team deals visible, health across pipeline | Manager can see |
| 10 | Stripe integration — Free, Pro, Team plans with payment and plan gating | Payments work |
| 10 | Performance optimisation — fast on slow Gulf mobile connections | Production ready |

---

## 7. Klo — Voice Design

Voice is what separates Klosure from every other sales tool. A sales person driving in Dubai should be able to say "Hey Klo, where does the DIB deal stand?" and hear a two-sentence answer from a confident, human-sounding voice.

### 7.1 ElevenLabs Integration

- Use ElevenLabs Conversational AI API for real-time voice responses
- Select a voice that sounds confident, professional, and works in Gulf English accents
- Klo speaks in 1–3 sentences maximum — never an essay
- Voice is optional — users can switch between text and voice mode
- On mobile: voice mode is the default suggestion

### 7.2 Voice Interaction Flow

> 1. Seller taps the microphone button in the deal room
> 2. Speaks naturally: "Klo, Ahmed hasn't replied in a week, what should I do?"
> 3. Web Speech API transcribes the message
> 4. Claude Sonnet 4.6 processes it with full deal context
> 5. ElevenLabs converts Klo's response to speech
> 6. Klo speaks the answer — 2 sentences, direct, actionable
> 7. Response also appears as text in the chat

---

## 8. Deal States and Data Model

### 8.1 Deal States

| State | Indicator | What It Means |
|---|---|---|
| Active | 🟢 Green | Deal is moving. Commitments are being met. Both sides engaged. |
| Stuck | 🟡 Amber | A commitment is overdue or one side has gone silent for 5+ days. |
| At Risk | 🔴 Red | Multiple commitments missed or deadline is less than 14 days with blockers. |
| Won | ✅ Closed | Deal closed successfully. Room archived as read-only. Full history preserved. |
| Lost | ❌ Closed | Deal lost. Room archived. Klo asks for reason — becomes learning data. |

**Important:** Deals are never hard deleted. Won and Lost rooms are archived and remain accessible forever. Archive does not count against active room limits.

### 8.2 Supabase Database Schema

```sql
-- Users table
users (
  id uuid primary key,
  email text unique,
  name text,
  plan text default 'free', -- free | pro | team
  team_id uuid,
  created_at timestamptz default now()
)

-- Deals table
deals (
  id uuid primary key,
  seller_id uuid references users(id),
  title text,
  buyer_company text,
  seller_company text,
  value numeric,
  deadline date,
  stage text default 'discovery', -- discovery | proposal | negotiation | legal | closed
  health text default 'green', -- green | amber | red
  status text default 'active', -- active | won | lost | archived
  created_at timestamptz default now()
)

-- Deal context table
deal_context (
  id uuid primary key,
  deal_id uuid references deals(id),
  stakeholders jsonb, -- [{name, role, company}]
  what_needs_to_happen text,
  budget_notes text,
  notes text
)

-- Messages table
messages (
  id uuid primary key,
  deal_id uuid references deals(id),
  sender_type text, -- seller | buyer | klo
  sender_name text,
  content text,
  voice_url text, -- ElevenLabs audio URL if voice message
  created_at timestamptz default now()
)

-- Commitments table
commitments (
  id uuid primary key,
  deal_id uuid references deals(id),
  owner text, -- seller | buyer
  task text,
  due_date date,
  status text default 'pending', -- pending | done | overdue
  created_at timestamptz default now()
)

-- Deal access table (controls buyer link access)
deal_access (
  id uuid primary key,
  deal_id uuid references deals(id),
  user_id uuid references users(id),
  role text, -- seller | buyer
  joined_at timestamptz default now()
)
```

---

## 9. Future Roadmap — Post Launch

These features are not part of the initial build. They become relevant once Klosure has paying customers and usage data.

| Stage | Timeline | Feature |
|---|---|---|
| Stage 2 | Month 3–6 | Pipeline analytics — which stage do deals die most, average time to close |
| Stage 2 | Month 3–6 | Win/loss analysis — Klo identifies patterns across all closed deals |
| Stage 3 | Month 6–12 | Team performance dashboard — compare sellers, coach based on real data |
| Stage 3 | Month 6–12 | CRM-lite — contact management, company profiles, deal history by account |
| Stage 4 | Month 12+ | Full CRM replacement — Klosure becomes the system of record for revenue |
| Stage 4 | Month 12+ | API integrations — connect to existing CRMs, email, calendar |
| Stage 4 | Month 12+ | Enterprise plan — custom pricing, SSO, dedicated support for large Gulf accounts |

---

## 10. Go-To-Market Strategy

### Week 1–4 — Before Launch
- Buy klosure.ai domain immediately
- Set up a single waitlist landing page — the tagline, the problem, one email field
- Reach out personally to 10 Gulf sales contacts — not to sell, to show and get feedback
- Record a 90-second screen recording of the Phase 1 MVP — deal room in action

### Week 5–8 — Soft Launch
- Give free Pro access to first 20 users — no credit card, just use it
- Get one testimonial on video from a Gulf sales person
- Post on LinkedIn — personal story, not product pitch
- Target: 50 signups before charging anyone

### Week 9+ — Revenue
- Switch on Stripe — Free plan stays free, Pro at $199, Team at $499
- Direct outreach to Gulf sales teams — use Klosure itself to manage your own sales deals
- Referral program — sellers who refer another seller get one month free

> **The One Line Pitch**
>
> "For the first time, your sales manager sees what is actually happening in every deal — not what the sales guy thinks is happening."

---

## 11. Unit Economics

| Item | Monthly Estimate |
|---|---|
| Claude Sonnet API (with caching) | ~$50 for hundreds of active deals |
| ElevenLabs Voice API | ~$30 at early stage |
| Supabase Pro plan | ~$25 |
| Vercel Pro plan | ~$20 |
| Resend email | ~$10 |
| Domain + misc | ~$15 |
| **Total costs** | **~$150/month** |
| Revenue at 25 Pro users | $4,975/month |
| Revenue at 10 Team plans | $4,990/month |
| **Gross margin at scale** | **~98%** |

---

## 12. Start Here — Day One Instructions for Claude Code

When you open Claude Code to start building Klosure, do these things in this exact order.

### Step 1 — Supabase Schema

Run the SQL from Section 8.2 first. Enable Row Level Security (RLS) on all tables. Key policies:

- Sellers can only see their own deals
- Buyers access deals only via deal_access table — their UUID is stored when they first open the link
- Klo messages are readable by both roles
- Commitments are readable by both roles, writable by the relevant owner

### Step 2 — Klo System Prompt

Before writing any frontend code, write and test Klo's system prompt in the Anthropic API playground. Get the personality right first.

```
You are Klo, the AI deal coach inside Klosure.

You are embedded inside a shared deal room between a buyer and a seller.
You speak like a senior B2B sales expert with 15+ years working in Gulf markets.
You are direct. You are brief. You are never generic. You never give reminders — you give coaching.

You always know:
- Who you are speaking to: {{role}} (buyer or seller)
- Deal: {{deal_title}} between {{buyer_company}} and {{seller_company}}
- Value: {{deal_value}} | Deadline: {{deadline}} | Days remaining: {{days_remaining}}
- Current stage: {{stage}}
- Stakeholders: {{stakeholders}}
- Open commitments: {{commitments}}
- Overdue commitments: {{overdue_commitments}}
- Last message was {{hours_since_last_message}} hours ago

Your rules:
1. Speak in 1-3 sentences only. Never write paragraphs.
2. Always tell the person what to do next — specifically.
3. Never say "you might want to consider" — say "do this".
4. Buyer and seller get different coaching — you know who you are talking to.
5. When a deal is at risk, be direct about it. Name the problem.
6. When things are moving well, acknowledge it briefly and push for the next step.
7. You are never a reminder tool. You are a deal partner.
```

### Step 3 — The Deal Room UI

Build the mobile-first chat interface. Key components in order:

```
App structure:
/
├── /deals                    — Seller deals list (WhatsApp style)
├── /deals/new                — Create deal form
├── /deals/[id]               — Deal room (seller view)
└── /join/[token]             — Buyer entry point (no auth)

Deal room components:
├── TopBar                    — Deal name, back arrow, menu
├── DealSummaryStrip          — Scrollable pills: value, deadline, stage, contacts
├── KloSummaryBar             — One line, blue, always current
├── OverdueBanner             — Amber, auto-appears when commitment slips
├── ChatArea                  — Messages list, real-time via Supabase
│   ├── SellerBubble          — Right aligned, brand blue
│   ├── BuyerBubble           — Left aligned, white
│   └── KloBubble             — Centered, light blue, ◆ icon
└── InputBar                  — Mic button + text field + send button
```

### Step 4 — Share Link Logic

```javascript
// Generate unique token per deal
const dealToken = crypto.randomUUID()

// Store in deals table
await supabase.from('deals').update({ buyer_token: dealToken }).eq('id', dealId)

// Buyer link
const buyerLink = `https://klosure.ai/join/${dealToken}`

// When buyer opens link:
// 1. Look up deal by token
// 2. Create anonymous session or prompt for name only
// 3. Insert into deal_access with role 'buyer'
// 4. Show deal room in buyer view
// 5. Klo greets the buyer by name
```

### Step 5 — Klo API Call Pattern

```javascript
async function getKloResponse(dealContext, messages, role) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200, // Klo is brief — never more than 200 tokens
      system: buildKloSystemPrompt(dealContext, role), // cache this
      messages: messages.map(m => ({
        role: m.sender_type === 'klo' ? 'assistant' : 'user',
        content: `[${m.sender_name}]: ${m.content}`
      }))
    })
  })
  return response.json()
}
```

### Step 6 — ElevenLabs Voice (Phase 4)

```javascript
async function kloSpeak(text, voiceId) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2', // fastest, lowest latency
        voice_settings: { stability: 0.5, similarity_boost: 0.8 }
      })
    }
  )
  const audioBlob = await response.blob()
  const audioUrl = URL.createObjectURL(audioBlob)
  new Audio(audioUrl).play()
}
```

---

## Brand Reference

| Element | Value |
|---|---|
| Product name | Klosure |
| AI name | Klo |
| Domain | klosure.ai |
| Tagline | Get closure on every deal. |
| Primary color | #1A1A2E (dark navy) |
| Accent color | #4F8EF7 (blue) |
| Font | Inter or DM Sans |
| AI model | Claude Sonnet 4.6 |
| Voice | ElevenLabs Turbo v2 |

---

*Klosure.ai — Version 1.0 — April 2026 — Confidential*
