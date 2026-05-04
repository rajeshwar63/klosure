# Information Security Policy

**Klosure.ai**
Operated by Rajeshwar Yelne (sole proprietor)
Hyderabad, Telangana, India
**support@klosure.com**

**Document version:** 1.0
**Effective date:** May 4, 2026
**Last reviewed:** May 4, 2026
**Next review:** November 4, 2026

---

## 1. Purpose and scope

This document describes the technical, organizational, and administrative security controls Klosure.ai ("Klosure") applies to protect customer data, payment data, and operational systems. It is intended for review by partners, payment processors (including Razorpay), prospective customers, and auditors who require evidence of Klosure's security posture.

The scope of this policy covers:

- The Klosure SaaS application available at https://klosure.ai
- All supporting infrastructure (database, edge functions, hosting, integrations)
- All sub-processors that handle customer or operational data
- All personnel with access to production systems

Klosure is a small, single-founder operation. The controls described below are appropriate to that scale and are reviewed at least every six months, or sooner when material changes occur.

---

## 2. Information classification

Klosure handles four classes of data, each with different protection requirements.

| Class | Examples | Storage | Access |
|---|---|---|---|
| **Highly sensitive** | OAuth refresh tokens (Google / Microsoft), Razorpay customer/subscription tokens, Supabase service-role keys, LLM API keys | Supabase Vault (encrypted) and Supabase Edge Function secrets store; never in source code or client | Edge functions only; founder via Supabase dashboard with MFA |
| **Sensitive customer data** | Email content cached for deal analysis, calendar events, meeting transcripts, deal chat messages, stakeholder names, deal values | Supabase Postgres (ap-south-1, Mumbai), encrypted at rest; protected by Row Level Security | Authenticated user (their rows only); managers see team data via RLS-validated joins |
| **Personally identifiable information (PII)** | Customer name, email, company name, IP address | Supabase Postgres, encrypted at rest | Authenticated user; founder via Supabase dashboard for support |
| **Public / non-sensitive** | Marketing copy, public landing pages, privacy policy, terms | Vercel CDN, public Git repository | Public |

**Cardholder data (CHD).** Klosure does **not** receive, process, store, or transmit cardholder data. All payment card information is captured directly by Razorpay's iframe/redirect on Razorpay infrastructure. Klosure stores only Razorpay-issued customer and subscription tokens, which are not CHD. Klosure is therefore **out of PCI-DSS scope** and relies on Razorpay's PCI-DSS Level 1 certification.

---

## 3. Encryption

### 3.1 Encryption in transit

- **All client-server traffic uses TLS 1.2 or higher.** TLS termination occurs at Vercel's edge for the web application and at Supabase's load balancers for API and database calls. HTTP requests are redirected to HTTPS.
- **All third-party API calls are made over HTTPS (TLS 1.2+),** including calls to Anthropic, Google Gemini, Nylas, Razorpay, and Resend.
- **HSTS** is enabled on klosure.ai with a long max-age, preventing downgrade attacks.
- **No cleartext protocols** (HTTP, FTP, plain SMTP) are used for any customer data.

### 3.2 Encryption at rest

- **Database (Supabase Postgres):** Encrypted at rest using AES-256 via the underlying cloud provider's storage encryption.
- **Backups:** Automated Supabase backups are encrypted at rest and stored in the same regional infrastructure with the same key management as the primary database.
- **Secrets:** API keys, OAuth client secrets, refresh tokens, and webhook signing secrets are stored in Supabase Vault (encrypted) and Supabase Edge Function environment variables (managed secret store). They are never written to source code, never written to logs, and never exposed to the client.
- **Object storage:** Klosure does not currently store user-uploaded files. If introduced in the future, object storage will use the same at-rest encryption guarantees.

### 3.3 Key management

- Cryptographic keys for at-rest encryption are managed by the underlying provider (Supabase / cloud provider) under their SOC 2 Type II controls.
- Application-level secrets (API keys, OAuth credentials) are rotated when an employee with access leaves, when a secret is suspected of compromise, or at a minimum once per twelve months.
- TLS certificates are issued and renewed automatically by Vercel and Supabase.

---

## 4. Access control

### 4.1 Customer access (in-product)

- Customers authenticate through Supabase Auth (email + password, with optional OAuth-based passwordless flows).
- Passwords are never stored in plain text. Supabase Auth stores password hashes using bcrypt with industry-standard work factors.
- **Multi-factor authentication (MFA / TOTP) is available** for all customer accounts and can be enabled in Settings.
- Sessions are issued as short-lived JWTs with refresh tokens; idle and absolute session timeouts are enforced.
- **Row Level Security (RLS)** policies are enforced at the database layer for every table that contains customer data. A user can only read or write rows that match their `auth.uid()`. Manager-scoped queries are validated through RLS-enforced joins against the team membership table — there is no way to bypass tenant isolation from the client.
- Failed login attempts are rate-limited at the auth layer to mitigate credential-stuffing.
- Password reset flows use single-use, time-limited tokens delivered via email.

### 4.2 Administrative / staff access

- The founder is the only person with administrative access to production systems (Supabase project, Vercel deployment, Razorpay account, Nylas dashboard, GitHub repository, domain registrar).
- All administrative accounts require **MFA**. Where the platform supports it (GitHub, Google, Razorpay), hardware-backed MFA (security key or TOTP authenticator) is used in preference to SMS.
- Administrative access is granted on a least-privilege basis. There are no shared credentials.
- The principle of least privilege is applied to service roles: edge functions use scoped service roles where possible rather than the full Supabase service-role key.
- Klosure does not offer "log in as user" functionality. Founder access to customer data is limited to (a) explicit support requests where the customer authorizes access, (b) investigation of suspected abuse or security incidents, or (c) compliance with valid legal process.

### 4.3 Provisioning and deprovisioning

- Klosure currently has a single founder operator. If staff are added in the future, access will be provisioned per-role through SSO where possible, with an offboarding checklist that revokes access within one business day of role change.
- Departing-staff procedure: revoke SSO, rotate any shared credentials the person had access to, audit recent activity logs, transfer ownership of any artifacts.

---

## 5. Application security

### 5.1 Secure development

- Source code is hosted on GitHub in a private repository.
- All production deployments go through Vercel's Git-integrated CI; only the founder can merge to the production branch.
- Secrets are never committed to source control. A `.gitignore` excludes `.env*` files; pre-commit review is performed manually.
- Dependencies are kept reasonably current via periodic review of `npm audit` output and Dependabot alerts on GitHub.
- Frontend is a static React + Vite single-page application. Server-side logic runs in Supabase Edge Functions (Deno runtime), which provide an isolated execution environment.

### 5.2 Common vulnerability classes

- **SQL injection:** mitigated by exclusively using the Supabase JS client / parameterized PostgREST queries from edge functions; no string-concatenated SQL.
- **Cross-site scripting (XSS):** React escapes interpolated values by default; `dangerouslySetInnerHTML` is reviewed on every introduction. Markdown rendering in the deal coach uses `react-markdown` with `remark-gfm`, which sanitizes by default.
- **Cross-site request forgery (CSRF):** authentication uses bearer JWTs in the Authorization header (not cookies), so traditional CSRF does not apply to API calls. Sensitive actions (cancel subscription, delete account) require an authenticated session and are confirmed in-product.
- **OAuth / open redirect:** the redirect URI for Google, Microsoft, and Aurinko/Nylas OAuth flows is explicitly whitelisted at the provider; state parameters are validated server-side to prevent CSRF in the OAuth callback.
- **Webhook spoofing:** Razorpay and Nylas webhooks are validated by HMAC signature using the provider-issued signing secret before any state mutation is performed. Webhooks with invalid or missing signatures are rejected.
- **Sensitive logging:** edge-function logs are scrubbed of OAuth tokens, request bodies for auth flows, and Razorpay payloads. Customer email content is never logged.

### 5.3 Vulnerability management

- Dependency vulnerabilities are reviewed monthly and on every Dependabot alert.
- Critical and high-severity vulnerabilities (CVSS 7.0+) are remediated within 14 days of public disclosure or sooner.
- Penetration testing: Klosure has not yet engaged a third-party penetration tester. An engagement is planned within 12 months of crossing 100 paying customers or earlier if a customer contractually requires it. In the interim, automated dependency scanning, manual code review, and the SaaS providers' own posture (Supabase, Vercel) provide layered defense.

### 5.4 Change management

- All code changes are made in feature branches and reviewed by the founder (self-review and a 24-hour cooling period for non-urgent changes) before merging to the production branch.
- Production deployments are automated through Vercel on merge to the production branch.
- Database schema changes are versioned as numbered migration files under `supabase/` and applied through the Supabase CLI / dashboard. Migrations are reviewed for backward compatibility before application.
- Rollback: Vercel preserves prior deployments and supports instant rollback. Supabase backups support point-in-time recovery (see Section 7).

---

## 6. Network and infrastructure security

- **No self-hosted infrastructure.** Klosure runs entirely on managed services (Supabase, Vercel, Nylas, Razorpay, Anthropic, Google, Resend), each of which maintains its own SOC 2 and equivalent attestations.
- **Supabase project (database + auth + edge functions)** is hosted in the Mumbai region (ap-south-1). Network access is restricted to authenticated clients via Supabase's API gateway; the Postgres instance is not exposed to the public internet directly.
- **Edge functions** run in an isolated V8 sandbox per invocation; functions cannot access the host filesystem or other functions' memory.
- **Frontend hosting (Vercel)** serves a static SPA via Vercel's global CDN with TLS at the edge.
- **DNS** is managed by the domain registrar with two-factor authentication on the registrar account.
- **DDoS mitigation** is provided by Vercel and Supabase as part of their managed offering.

---

## 7. Backup, disaster recovery, and business continuity

- **Backups:** Supabase performs automated daily backups of the Postgres database, retained for 7 days on the current plan. The founder has procedures to invoke point-in-time recovery via Supabase's dashboard.
- **Recovery objectives:**
  - **Recovery Point Objective (RPO):** ≤ 24 hours (worst-case data loss, equal to backup interval).
  - **Recovery Time Objective (RTO):** ≤ 24 hours for full service restoration in a regional outage scenario.
- **Source-code recoverability:** the application is fully reproducible from the GitHub repository plus environment-variable manifests held by the founder; loss of the Vercel deployment does not jeopardize recoverability.
- **Provider redundancy:** Vercel serves traffic from multiple edge regions. Supabase ap-south-1 is a multi-AZ regional deployment.
- **Continuity plan:** in the event of prolonged provider outage, customers will be notified by email within 4 hours of confirmation. A status page is planned for 2026.

---

## 8. Sub-processors and third-party security

Klosure relies on the following sub-processors. Each is contractually bound to handle customer data only for the purpose of providing services to Klosure, and each maintains its own security program audited under the indicated frameworks.

| Sub-processor | Purpose | Region | Compliance |
|---|---|---|---|
| Supabase | Database, authentication, edge functions, secrets vault | India (ap-south-1, Mumbai) | SOC 2 Type II, HIPAA available, GDPR-aligned |
| Vercel | Frontend hosting, CDN | Global edge | SOC 2 Type II, ISO 27001, GDPR-aligned |
| Nylas | Email and calendar API integration | United States | SOC 2 Type II, ISO 27001, HIPAA |
| Anthropic | LLM inference (Claude) | United States | SOC 2 Type II, GDPR DPA available, no training on customer data |
| Google (Gemini API) | LLM inference | Global | ISO 27001/27017/27018, SOC 2/3, GDPR DPA, no training on Workspace API data |
| Razorpay | Payment processing, subscription billing | India | PCI-DSS Level 1, ISO 27001 |
| Resend | Transactional email | United States | SOC 2 Type II, GDPR-aligned |

- Klosure reviews each sub-processor's compliance attestations on engagement and at least annually thereafter.
- Sub-processor changes are tracked in this document and in the public privacy policy. Material additions are announced to active customers by email.
- Each LLM provider used by Klosure (Anthropic and Google Gemini API) is configured under a contract that **prohibits the use of customer-provided prompts and outputs for training generalized models.**

---

## 9. Logging, monitoring, and audit

- **Application logs** (edge function invocations, errors, request metadata) are retained by Supabase for the duration permitted on the current plan. Sensitive content (OAuth tokens, raw email bodies, payment payloads) is excluded from logs.
- **Authentication events** (sign-ins, password resets, MFA enrollment) are logged by Supabase Auth.
- **Database administrative actions** (schema migrations, manual queries through the dashboard) are logged by Supabase.
- **Webhook deliveries** from Razorpay and Nylas are logged with timestamps, event IDs, and verification outcomes.
- The founder reviews error logs daily and authentication anomaly reports as alerts surface.

---

## 10. Incident response

### 10.1 Definition

A security incident is any event that compromises, or is reasonably believed to compromise, the confidentiality, integrity, or availability of customer data or production systems. Examples: unauthorized access to the database, a leaked secret, a successful phishing attempt against an administrative account, a malicious dependency.

### 10.2 Process

1. **Detection.** Sources include provider alerts (Supabase, Vercel, GitHub, Razorpay), customer reports to support@klosure.com, dependency vulnerability alerts, and internal anomaly review.
2. **Triage.** The founder evaluates scope, severity, and whether customer data is affected. Severity is rated S1 (confirmed customer data exposure) → S4 (informational).
3. **Containment.** Immediate actions: revoke compromised credentials, invalidate sessions, take affected components offline if necessary, preserve logs for forensic review.
4. **Eradication and recovery.** Patch the underlying cause, restore service from clean state, verify integrity.
5. **Notification.** For incidents that affect customer personal data, customers are notified by email **without undue delay and in any event within 72 hours** of the incident being confirmed, in line with GDPR Article 33 and the Indian DPDP Act 2023. Razorpay and other sub-processors are notified concurrently if the incident touches their integration.
6. **Post-incident review.** Root cause is documented, controls are updated, and the change is captured in the next review of this policy.

### 10.3 Customer reporting

If you believe you have discovered a security vulnerability or incident affecting Klosure, please email **support@klosure.com** with subject line "Security disclosure." Klosure commits to acknowledging your report within 2 business days and to keeping you informed of remediation progress.

---

## 11. Personnel security

- Klosure currently has a single founder operator. The founder is responsible for all security-relevant decisions and has agreed to a written confidentiality understanding regarding customer data.
- Personal devices used for development and administration are full-disk encrypted, password-protected, and have automatic screen lock enabled.
- Phishing awareness: the founder uses hardware-backed MFA on all administrative accounts to mitigate credential phishing.
- If contractors or staff are added in the future, the following will be required before access is granted: a signed confidentiality agreement, completion of a basic security-awareness briefing, MFA enrollment, and per-role least-privilege access.

---

## 12. Compliance posture

- **Indian law:** Klosure complies with the Information Technology Act, 2000 and the Digital Personal Data Protection Act, 2023 (DPDP).
- **GDPR / UK GDPR:** Klosure operates as a data controller for customer data and as a data processor for end-users invited by customers (e.g., buyers in deal rooms). The privacy policy describes legal bases for processing, retention, and data subject rights.
- **CCPA / CPRA:** Klosure does not sell or share personal information as defined under CCPA/CPRA. California residents' rights are honored via the procedure documented in the privacy policy.
- **PCI-DSS:** Klosure is out of scope. All cardholder data is handled by Razorpay (PCI-DSS Level 1).
- **SOC 2 / ISO 27001:** Klosure is not currently certified to SOC 2 Type II or ISO 27001. The controls documented in this policy are designed to align with the relevant Trust Services Criteria (Security, Availability, Confidentiality) so that future certification is achievable. A SOC 2 readiness assessment is planned within 18 months.
- **Sub-processor compliance:** every sub-processor in Section 8 maintains current third-party attestations.

---

## 13. Policy maintenance

This policy is owned by the founder of Klosure. It will be reviewed at least every six months, and on each of the following triggers:

- Material change in architecture or sub-processors
- A confirmed security incident
- A change in applicable law or regulatory guidance
- Customer or partner requirement that materially expands scope

Material updates will be communicated to active customers by email, in line with the change-notice procedure in the privacy policy.

---

## 14. Contact

For security questions, due-diligence requests, vulnerability disclosure, or compliance documentation, contact:

**Rajeshwar Yelne**
Klosure.ai
Hyderabad, Telangana, India
**support@klosure.com**

---

*This document is a living description of Klosure's security posture and is provided for informational and due-diligence purposes. It is not a contract and does not modify any agreement between Klosure and a customer or partner.*
