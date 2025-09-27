Product Requirements Document (PRD)

Product: INP² Cybersecurity Lead Generator
Platform: React front end + Netlify (App + Serverless Functions)
Owner: You (INP²)
Version: v1.0 (Current) + v1.5 (Innovations)
Last updated: Sep 25, 2025 (America/Denver)

1) Purpose & Strategy
1.1 Vision

Build the fastest path from intent signal → meeting for cybersecurity services. The app collects company leads, enriches them with security-relevant signals, prioritizes them transparently, and drafts contextual outreach targeted to executive buyers (CISO/CTO/COO/CFO).

1.2 Goals

Qualify better, faster: Surface high-intent accounts and “Why now?” evidence in minutes.

Increase meetings booked: Auto-generate credible, contextual outreach that earns replies.

Scale repeatably: Encapsulate your prospecting playbook into a single, operable console.

1.3 Success Metrics (North Stars)

Reply rate: ≥ 10% on cold outreach generated in the app

Meeting rate: ≥ 5% of contacted leads

Time to first qualified list: ≤ 10 minutes from zero to 40+ usable leads

Research time saved: ≥ 60% reduction vs manual process

2) Users & Use Cases
2.1 Primary Users

Cybersecurity Principal / Seller-Doer: needs fast, credible context to contact executives.

SDR/BDR (optional later): runs repeatable searches and sequences.

CISO Advisor/Consultant: creates insight-led outreach aligned to business risk.

2.2 Core Use Cases (Today)

Generate a list of companies (mock or API) and filter by industry/State/City/size.

Open a company and view Overview (score, priority, concerns, recent activity, stack/tools).

View Contacts (CISO/CTO/IT Director) with emails for outreach.

View Intelligence (recent news, company insights/funding).

Use Outreach tab to generate a customized email.

Track Activity timeline (lightweight history).

2.3 Expanded Use Cases (Innovations)

Detect Breach Proximity, Regulatory Countdown, Exec Job Changes, AI Governance Gaps, RFPs, Dark-web Exposure (safe), Board-topic Heat, Conference Intent, SaaS Consolidation, Attack-surface Regressions, Cyber Insurance Renewal windows.

Save Segments, run A/B outreach, explainable scoring, and light sequencing.

3) Scope
3.1 In-Scope (Current)

Single-page React app with dashboard and tabs.

Lead list, search, industry filter, score/priority chips, status.

Company detail with concerns, activities, tech stack, security tools, news, contacts.

Outreach generator (subject + body using company signals).

“Generate Leads” panel (API or News buttons) calling Netlify Functions (with graceful mock fallback).

CSV upload and CRM sync UI stubs.

3.2 Out-of-Scope (Current)

Real provider integrations (Apollo/ZoomInfo/LinkedIn/SFDC/HubSpot) beyond fetch wrappers.

Auth/multi-tenant persistence.

Email send and calendar booking integrations.

Full pipeline/CRM replacement.

4) Product Requirements — Current State (v1.0)
4.1 Information Architecture

Left rail: Leads list (name, priority, score, employees, status).

Top search & filter: company search; industry dropdown (All/Software/Healthcare/Finance).

Main panel tabs: Overview, Contacts, Intelligence, Outreach, Activity.

Generate Leads slide-out: API Integrations, Intelligence Gathering, Tech Analysis tips & actions.
Lead = {
  id: string,
  company: string,
  domain: string,
  industry: string,
  employees: number,
  revenue?: number,
  location?: string,
  score: number,          // 1..100
  priority: "Low"|"Medium"|"High"|"Critical",
  status: "New Lead"|"Contacted"|"Meeting"|"Nurture",
  contacts: [{ name, title, email }],
  news: [{ title, source, date }],
  techStack: { frontEnd?: string[], backEnd?: string[], cms?: string[], hosting?: string[], analytics?: string[] },
  securityTools?: string[],
  concerns?: string[],    // e.g., "Zero Trust","Ransomware","SOC 2"
  recentActivity?: string[],
  insights?: { followers?: number, glassdoor?: number, funding?: string },
  lastUpdated?: string
}
4.3 Lead Scoring (Current)

Static heuristic; Priority derived from Score:

≥80 = Critical, ≥60 = High, ≥40 = Medium, else Low.

Visual chips for fast triage.

4.4 Outreach Generator (Current)

Tokenized template uses: {company}, {industry}, {exec_title}, {recent_news.title}, and a selection of {securityTools} / {techStack}.

CTA: short meeting ask (e.g., “15 minutes next week?”).

Buttons: Send (stub), Save (stub), A/B (stub).

Executive dashboard that clearly shows and articulates the leads based on the best score and AI recommendation. 

Executive dashboard must be executive grade and easily understood

4.5 Serverless (Current)

Fetch wrappers for Netlify Functions (client-side):

POST /.netlify/functions/fetch-leads

POST /.netlify/functions/news-leads

POST /.netlify/functions/enrich-company (aka Analyze Tech)

If function fails: show alert and use mock dataset (≈40–50 realistic companies) so the demo never breaks.

4.6 Non-Functional (Current)

Performance: < 1s tab switching, list render snappy on 100+ leads.

Resilience: Mock fallback for any backend error.

Security: No provider keys in client; functions expected to use env vars.

Accessibility: Keyboard focus states; semantic headings/buttons.

5) Product Requirements — Innovative Additions (v1.5)
5.1 New Lead Signals (Serverless Intelligence Pack)

Each is a Netlify Function that returns normalized signals. All include scoreImpact, occurredAt, details for explainability.

Breach Proximity Radar

Route: POST /.netlify/functions/breach-proximity

Input: { domain, vendors?: string[] }

Output: { relatedIncidents:[{vendor, incidentDate, summary, source}], proximityScore }

Scoring: direct vendor +25; same industry/region +10; decay 20% after 14 days.

Regulatory Countdown Alerts

Route: POST /.netlify/functions/reg-countdown

Input: { domain, industry }

Output: { frameworks:[{name, dueBy, evidence}], urgencyDays }

Scoring: urgencyScore = max(0, 90 - daysToDue), ≥60 → Critical.

CISO/CTO Job-Change Sentinel

Route: POST /.netlify/functions/exec-moves

Output: { moved:[{role, name, moveDate, from, to}] }

Scoring: +35 within 60 days; +20 within 120 days.

Cyber Insurance Renewal Predictor

Route: POST /.netlify/functions/ins-renewal

Output: { estimatedRenewal, requiredControls[], confidence }

Scoring: +15 if <60 days; +10 if control gaps present.

Attack-Surface Regression Detector

Route: POST /.netlify/functions/surface-regression

Output: { regressions:[{type:"header|port|tls", detail, firstSeen}], severity }

Scoring: high +30, med +15, low +5; decay 10%/week.

AI Program Governance Gap

Route: POST /.netlify/functions/ai-governance-gap

Output: { signals[], gaps[], confidence }

Scoring: production AI + governance gap → +25.

RFP Hunter (Security/GRC)

Route: POST /.netlify/functions/rfp-hunter

Input: { industry?, region? }

Output: { rfps:[{issuer, title, dueDate, url, keywords[]}] }

Scoring: issuer is tracked account +40; otherwise +15.

Workforce Stress Fusion

Route: POST /.netlify/functions/workforce-stress

Output: { openRoles, timeOpenAvg, teamSizeEst, stressIndex }

Scoring: use stressIndex directly; ≥70 → “High Pain”.

Board-Topic Heatmap

Route: POST /.netlify/functions/board-heatmap

Output: { topics:[{keyword, count, lastMention}], heat }

Scoring: heat ≥65 → +30 (“Board Priority”).

Dark-Web Exposure (Safe)

Route: POST /.netlify/functions/dw-exposure

Output: { exposureLevel:"low|med|high", lastSeen, sources }

Scoring: high +35, med +20; recent (<30d) +10.

Conference Intent Scanner

Route: POST /.netlify/functions/conf-intent

Input: { conference, year }

Output: { attendees:[{company, exec, role}], sponsors:[{company,tier}] }

Scoring: sponsor (Gold+) +25; speaker +20; attendee +10.

SaaS Consolidation Trigger

Route: POST /.netlify/functions/saas-consolidation

Output: { overlaps:[[toolA, toolB],...], estSavingsPct }

Scoring: estSavingsPct * 0.5.
LeadSignal = {
  type: "breach_proximity"|"reg_countdown"|"exec_move"|"ins_renewal"|"surface_regression"|"ai_gap"|"rfp"|"workforce_stress"|"board_heat"|"darkweb"|"conference"|"consolidation",
  severity?: "low"|"medium"|"high",
  scoreImpact: number,
  occurredAt: string,
  details: string,
  evidence?: string[]
}
score = base (0..60) from size/industry/news
      + Σ(signal.scoreImpact)
      + freshnessBoost ( +5 if updated <72h )
      - stalenessDecay (0.5 per day since last update; floor at 0)
Explain Score popover shows top contributors (e.g., “New CISO +35; SOC 2 due in 45d +30; Dark-web: medium +20; Freshness +5; Decay −6”).

5.3 Saved Segments & Views

Persist named segment queries (e.g., “US Healthcare, 500–5000 emp, Critical/High, AI-gap”).

Sidebar section for quick recall; includes count and avg score.

5.4 Outreach v2

Personas: CISO / COO / CFO; Tones: formal / plain / urgent.

Generate 2 variants with different subject lines.

Tokens: {company}, {exec_title}, {recent_news.title}, {top_signal}, {tech.0}, {next_week_slots}.

Store chosen variant on the lead; A/B outcome field for tracking.

5.5 Light Sequencing

3-touch sequence (Email → LinkedIn note → Follow-up email) spaced over 10 days.

Each touch references a different top signal.

5.6 New UI Elements

Signals tab: filterable timeline by type/severity.

Decision Cards (top of Company): “Why now,” “What we’d do first,” “Risks of waiting.”

Kanban pipeline view: status columns with drag-drop; column metrics (count, avg score).

Health meters: MFA/SSO, EDR, Logging/SIEM hints (green/yellow/red).

5.7 Integrations (phaseable)

Email send: Simple provider (e.g., Mailgun/SendGrid) via Netlify Function.

Calendar/booking: embed link; write “Meeting Set” to Activity.

CRM bi-directional sync: Salesforce/HubSpot with field mapping and dedupe.

5.8 Privacy/Security

No PII from dark-web; only aggregate exposure labels.

All provider keys in Netlify env vars; rate-limited functions; 24h cache per domain.

Delete-lead workflow and audit log basics.

6) Functional Requirements & Acceptance Criteria
6.1 Lead List & Filters

FR1: Search by name; filter by industry.

AC: Typing filters in ≤150ms; filter change re-renders ≤300ms on 500 leads.

6.2 Company Detail

FR2: Show score/priority; concerns; recent activities; stack & tools; news; contacts.

AC: All sections render with mock data; external links open in new tab.

6.3 Outreach (v1.0)

FR3: Generate subject/body using tokens.

AC: Must include at least one news or signal reference and a clear CTA.

6.4 Enrichment (Analyze Tech)

FR4: Call enrich-company function; display structured results.

AC: If function fails, show banner and fallback to existing lead data.

6.5 Signals Pack (v1.5)

FR5: Each new Netlify function returns normalized LeadSignal[].

AC: Signals appear in the Signals tab and affect Scoring v2; Explain Score lists top 3.

6.6 Saved Segments

FR6: Create, update, delete, and select segments.

AC: Selecting a segment restores filters and list in ≤300ms (cached).

6.7 Outreach v2

FR7: Persona/tone selection; generate 2 variants; store chosen variant.

AC: Each variant pulls a different top signal; A/B tag saved on lead.

6.8 Sequencing

FR8: One-click add to 3-touch plan; shows due dates.

AC: Sequence state persists per lead; can mark steps complete.

7) Technical Architecture (Netlify)
7.1 Front End

Framework: React + Vite/CRA (existing) with shadcn/ui components & lucide-react icons.

Styling: Tailwind (class usage already consistent).

State: Local state/hooks; optional Zustand later for segments and cache.

7.2 Netlify Functions (Serverless)
/netlify/functions/
  fetch-leads.js
  news-leads.js
  enrich-company.js
  breach-proximity.js
  reg-countdown.js
  exec-moves.js
  ins-renewal.js
  surface-regression.js
  ai-governance-gap.js
  rfp-hunter.js
  workforce-stress.js
  board-heatmap.js
  dw-exposure.js
  conf-intent.js
  saas-consolidation.js
  send-email.js           // optional
  crm-sync.js             // optional
Common library (/netlify/lib/):

http.js (fetch with retries/timeouts), cache.js (KV/file-based), log.js, normalize.js (map provider data → LeadSignal), rateLimit.js.

Environment variables (Netlify UI):

APOLLO_API_KEY, NEWS_API_KEY, PROXY_URL (if used), MAIL_PROVIDER_KEY, CRM_TOKEN, etc.

Caching & Cost Control:

Cache per domain for 24h; force refresh button on UI.

7.3 Routing & Deploy

netlify.toml:
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200
Use Netlify Scheduled Functions for nightly refresh of top segments (optional).

7.4 Logging/Monitoring

Function logs visible in Netlify; include correlation IDs.

Basic error banner in UI with retry guidance.

8) Data & Content
8.1 Mock Data

Maintain 45–60 realistic companies with varied industries, sizes, tools, concerns, news, and contacts to ensure deterministic demos.

Provide seed scripts for randomization but keep stable IDs.

8.2 Tokenization

Tokens for outreach and decision cards must resolve even if a field is missing (fallbacks).

9) Privacy, Compliance, Security

No storage of sensitive personal data; exec emails limited to business addresses.

Dark-web feature: only show exposure levels, counts, and dates; no leaked artifacts.

GDPR/DPA readiness: delete lead endpoint; document data sources; user-requested deletion flow.

Secrets management: all keys in Netlify env vars; never exposed client-side.

Rate limiting: per IP/domain; exponential backoff on providers.

10) Risks & Mitigations

Provider TOS/Scraping: Prefer official APIs; throttle & cache; respect robots.

False positives on signals: Show confidence + evidence strings; allow manual dismiss.

Email deliverability: Warm domains, validated MX, plain-text alt; start with manual send if needed.

Over-reliance on a single signal: Use composite scoring + explainability.


11) Acceptance Test Plan (Spot Checks)

Create 3 saved segments; switch among them in <300ms (cached).

Generate leads when functions are down → app shows banner and loads mocks.

Open a company → Overview shows concerns, tech/tools, and 2 news items.

Click Explain Score → see top 3 factors.

Run Exec Moves on a known test domain → signal appears on Signals tab; score adjusts; outreach cites the move.

Compose outreach for COO (plain tone) → 2 variants with different subjects; choose Variant B; stored on lead.