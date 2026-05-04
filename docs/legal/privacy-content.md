# Privacy Policy

**Effective date:** May 1, 2026
**Last updated:** May 4, 2026

This Privacy Policy describes how Klosure.ai ("Klosure," "we," "our," or "us") collects, uses, stores, and shares information when you use our B2B sales coaching platform available at klosure.ai (the "Service").

Klosure is operated by Rajeshwar Yelne, an individual founder based in Hyderabad, India. You can reach us at **support@klosure.com**.

If you do not agree with this policy, please do not use the Service.

---

## 1. Information we collect

### 1.1 Information you provide

When you sign up and use Klosure, you give us:

- **Account information** — name, email address, password (stored as a hash, never in plain text), and your role (seller or manager)
- **Company information** — your company name, your team members' email addresses if you invite them
- **Deal information** — buyer company names, deal values, deadlines, stakeholder names, notes, and chat messages you and your buyers exchange inside the platform
- **Billing information** — handled entirely by Razorpay (our payment processor). We never see your full card number; Razorpay returns a token to us that we store to manage your subscription. Klosure is **not in PCI-DSS scope** because we never receive, store, or transmit cardholder data; all payment card data is handled directly by Razorpay (PCI-DSS Level 1 certified).

### 1.2 Information from connected accounts

If you choose to connect your email or calendar, Klosure accesses data from those accounts through Nylas (our integration provider) acting on our behalf. The categories are:

- **Email metadata and content** — sender, recipient, subject, date, and body text of email messages in the connected mailbox, used solely to identify communications related to your active deals
- **Calendar events** — event title, time, attendees, and conferencing link, used solely to identify customer meetings and dispatch our Notetaker bot
- **Meeting transcripts** — when you allow our Notetaker to join a meeting, we receive the audio recording and transcript of that meeting
- **Account identifiers** — the email address and provider (Google or Microsoft) of the connected account

We **do not**:

- Read emails unrelated to your active deals (we filter by stakeholder match before processing)
- Send emails on your behalf
- Modify, delete, or move emails or calendar events
- Access contacts, drive files, photos, or any other data outside of email and calendar

### 1.3 Information collected automatically

When you use Klosure, we collect basic technical information:

- IP address (for security and fraud prevention only; not used for advertising or location targeting)
- Browser type and version
- Pages visited within Klosure and timestamps
- Error logs to diagnose product issues

We do not use third-party advertising trackers, retargeting pixels, or analytics that profile you across sites. We use Vercel for hosting and Supabase for our database; both providers see standard request logs.

### 1.4 Cookies and similar technologies

Klosure uses a small number of cookies and similar browser storage mechanisms, all of which are **strictly necessary** for the Service to function:

- **Authentication cookies / local storage** — set by Supabase Auth to keep you signed in across pages
- **Session preferences** — small entries in browser local storage to remember UI preferences (e.g., last opened deal, sidebar state)
- **CSRF and security tokens** — short-lived tokens used to protect against cross-site request forgery during payment and OAuth flows

We do **not** use third-party advertising, retargeting, social-media, or cross-site tracking cookies. We do not embed analytics tools that build profiles across the web. You can clear or block cookies via your browser settings; if you block strictly-necessary cookies, you will not be able to sign in.

---

## 2. Google API user data — Limited Use disclosure

**Klosure's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.**

Specifically, when you connect a Google account to Klosure:

- We use the `gmail.readonly` scope **only** to read messages in your Gmail inbox that are part of conversations with stakeholders on your active deals in Klosure. We use this data to extract relevant information (deadlines, decisions, blockers, new contacts) and surface it as coaching updates inside your Klosure deal chat.
- We use the `calendar.readonly` scope **only** to read calendar events on your connected calendar that involve stakeholders from your active deals, so that we can identify customer meetings and offer to dispatch our Notetaker bot to join them.
- We do **not** transfer Google user data to others except as necessary to provide the Service (for example, our processors Supabase and Anthropic, who process the data under contract on our behalf and cannot use it for their own purposes).
- We do **not** use Google user data for serving advertisements.
- We do **not** use Google user data to develop, improve, or train generalized or non-personalized AI or machine learning models. Data sent to our LLM providers (Anthropic and Google Gemini) is used only to generate the immediate response shown to you in the product, and the providers are contractually prohibited from training on it.
- We do **not** allow humans to read Google user data unless: (a) you give us explicit permission to do so for a specific support request you raised, (b) it is necessary for security purposes (such as investigating abuse), (c) it is necessary to comply with applicable law, or (d) the data is aggregated and used for internal operations in compliance with applicable privacy laws.

You can revoke Klosure's access to your Google account at any time through Klosure's Settings → Connections page, or directly in your [Google Account permissions](https://myaccount.google.com/permissions).

---

## 3. Microsoft Graph data

When you connect a Microsoft 365 account, Klosure accesses data through the Microsoft Graph API using the `Mail.Read`, `Calendars.Read`, and `offline_access` scopes. The same usage restrictions described in Section 2 above apply equally to Microsoft data: read-only, scoped to deal-relevant communications, never used to train models, never shared with third parties for advertising.

You can revoke Klosure's access to your Microsoft account at any time through Klosure's Settings → Connections page, or via your [Microsoft account apps and services](https://account.microsoft.com/consent).

---

## 4. How we use your information

We use the information we collect to:

- Provide the core Klosure product — chat, coaching, deal tracking, email and meeting integration
- Generate AI coaching responses by sending relevant deal context to our LLM providers (Anthropic and Google Gemini)
- Send service emails (account confirmation, billing receipts, security alerts, manager invitations)
- Detect and prevent fraud, abuse, and security incidents
- Comply with legal obligations
- Improve the product through aggregated, de-identified usage analytics (we do not look at individual customers' deal content for product analysis)

We do not use your data for advertising, sell your data to third parties, or share it with data brokers.

---

## 5. Sub-processors and third-party services

Klosure is a small operation. We rely on the following sub-processors to deliver the Service. Each of them is contractually obligated to handle your data only for the purpose of providing services to Klosure.

| Sub-processor | Purpose | Data accessed | Location |
|---|---|---|---|
| Supabase | Database, authentication, edge functions | All Klosure data | Mumbai, India (ap-south-1) |
| Vercel | Frontend hosting | Web request logs | Global edge network |
| Nylas | Email and calendar API integration | Email and calendar data from your connected accounts | United States |
| Anthropic | AI model (Claude) for coaching responses | Deal context relevant to the current chat turn | United States |
| Google (Gemini API) | AI model for coaching responses | Deal context relevant to the current chat turn | Global |
| Razorpay | Payment processing | Billing details only — name, email, payment token | India |
| Resend | Transactional email delivery | Recipient email and message content | United States |

We will update this list when we add or change sub-processors. If you have a contract with us that requires advance notice of sub-processor changes, we will honor it.

---

## 6. How long we keep your data

- **Active accounts** — we retain your data for as long as your account is active.
- **Closed deals** — won and lost deals are archived in your account and remain accessible to you indefinitely unless you delete them.
- **Cancelled accounts** — when you cancel, we retain your data for 30 days in case you want to reactivate, then delete it within 60 days, except where law requires longer retention (for example, billing records under Indian tax law are kept for 8 years).
- **Email and calendar data from connected accounts** — when you disconnect an account, we delete the cached email metadata, calendar events, and meeting transcripts associated with that grant within 30 days. We do not retain this data after disconnection except where required to maintain audit logs for security purposes.
- **Backups** — encrypted database backups may persist for up to 30 days after deletion before being purged from backup storage.

---

## 7. Security

We protect your data through:

- TLS 1.2+ encryption for all data in transit
- Encryption at rest in our database
- Row-level security policies in Supabase that enforce tenant isolation — users can only access their own data and, for managers, the data of their team members
- Secrets management — API keys and tokens are stored in Supabase Vault, never in source code
- Access logging for all administrative actions
- Multi-factor authentication available on all accounts (and required for the founder's admin account)

No system is perfectly secure. If we discover a security incident affecting your data, we will notify you without undue delay, and in any event within 72 hours of becoming aware of it where required by applicable law.

---

## 8. Your rights

Depending on where you live, you may have the right to:

- **Access** — request a copy of the personal data we hold about you
- **Correct** — ask us to fix inaccurate information
- **Delete** — ask us to delete your account and personal data
- **Export** — receive a copy of your data in a portable format (JSON or CSV)
- **Object** — object to certain types of processing
- **Withdraw consent** — disconnect any integration at any time

To exercise any of these rights, email **support@klosure.com** with the subject line "Privacy request." We will respond within 30 days.

If you are in the European Economic Area, the United Kingdom, or a jurisdiction with similar data protection laws, you also have the right to lodge a complaint with your local supervisory authority.

If you are in India, your data is processed under the Digital Personal Data Protection Act, 2023.

**California residents (CCPA / CPRA).** If you are a California resident, you have additional rights under the California Consumer Privacy Act, as amended by the California Privacy Rights Act:

- **Right to know** the categories and specific pieces of personal information we collect, the sources, the business purposes, and the categories of third parties with whom we share it (all disclosed in this Policy).
- **Right to delete** the personal information we hold about you, subject to legal exceptions.
- **Right to correct** inaccurate personal information.
- **Right to opt out of "sale" or "sharing"** of personal information for cross-context behavioral advertising. **Klosure does not sell or share personal information** as those terms are defined under the CCPA/CPRA. We do not have a "Do Not Sell or Share My Personal Information" link because there is no such activity to opt out of.
- **Right to limit use of sensitive personal information** — we do not use sensitive personal information for purposes that would trigger this right.
- **Right to non-discrimination** — we will not deny service, charge different prices, or provide a different level of service because you exercised any of these rights.

To exercise any CCPA right, email **support@klosure.com** with the subject line "California privacy request." We will verify your identity by matching the email address against your account before responding.

---

## 9. International data transfers

Klosure is operated from India, but our sub-processors are based in multiple countries (see Section 5). When we transfer data internationally, we rely on the sub-processor's own data transfer mechanisms (such as Standard Contractual Clauses or equivalent safeguards approved by relevant regulators).

---

## 10. Children's privacy

Klosure is a B2B sales tool intended for use by adults in a professional capacity. We do not knowingly collect data from anyone under 18. If you believe a child has provided us data, contact us at **support@klosure.com** and we will delete it.

---

## 11. Changes to this policy

We will update this policy from time to time. When we make material changes, we will:

- Update the "Last updated" date at the top
- Notify active users by email at least 30 days before the change takes effect
- For changes that materially affect how we handle Google or Microsoft user data, request fresh consent before continuing to access that data

---

## 12. Contact

For privacy questions, data requests, or to report a security concern:

**Rajeshwar Yelne**
Klosure.ai
Hyderabad, Telangana, India
**support@klosure.com**

---

This policy is provided in English. If we publish translations, the English version controls in case of conflict.
