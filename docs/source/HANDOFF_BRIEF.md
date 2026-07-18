# Project Handoff Brief: Team Roping Training Platform

## What this is

An integrated, self-paced online team roping course, written entirely in a single anonymous "coach" voice (no real people are named anywhere in the product — see **Content Principles** below for why this matters). The course currently exists as one static, self-contained HTML file (`integrated_roping_system_v20.html`) with all content, styling, and client-side logic inline. This brief describes what needs to be built around that file to turn it into a real, sellable product.

**Your job:** take the content and UI in the existing file and turn it into a real multi-page web app — built on Wix, using Velo, on the domain already set up in the client's existing Wix account — with authentication, payment, a real paywall, and a working backend for the AI video-coaching feature. A native mobile app is a deliberate phase-two decision, not part of this build — see **Platform Decision** below.

---

## Current state of the file

- **8 sections, 32 chapters**, each with teaching content and a 10-question quiz (320 questions total, all client-side in a `quizData` JS object)
- **Sections 1–3** (12 chapters total) each include a "video-coach" widget: student uploads a short video of themselves roping a practice dummy, the browser extracts still frames client-side via `<video>`/`<canvas>`, and currently calls the Anthropic API **directly from the browser** for analysis and feedback
- Fully responsive single-file HTML/CSS/vanilla JS, no build step, no dependencies
- Modern flat color system (see **Design System** below) — deliberately moved away from an earlier brown/western palette
- No backend, no auth, no payment, no real access control of any kind exists yet. Anyone with the file has all content and all quiz answers visible in page source.

---

## Content principles (do not violate these without asking)

1. **The teaching voice is a single anonymous "coach," to be named later.** No real person's name appears anywhere in the lesson content, quizzes, or UI. This was a deliberate, repeatedly-enforced decision — earlier drafts named real team ropers and horsemanship trainers directly, and every one of those references was later stripped out at the client's explicit request. **Do not reintroduce real names into course content, marketing copy, or a "sources" page without checking first.**
2. If new lesson content is ever added, it should read like the existing chapters: third-person, instructional, occasionally citing an unnamed "one champion..." or "one widely respected trainer..." for flavor, never a real name.
3. The video-coach feature's system prompt (in the JS, search for `promptText` inside `analyzeRoping`) defines exactly what "the coach" evaluates and how it's supposed to talk. Preserve this prompt's intent if it's ported to a server-side call — don't let it drift into a generic "AI feedback" tone.

---

## Platform decision (already made)

**Build this on Wix, using Velo (Wix's developer platform), on the domain already set up in the client's existing Wix account. Do not build a native app in this phase, and do not stand up a separate custom backend (Supabase, a custom Node server, etc.) — build within Wix's own backend, database, and payment systems.**

Reasoning for web-first over native app: Apple/Google in-app-purchase fees (15–30%) would materially cut into margins at every revenue scenario modeled (see **Business Model** below) — at moderate-scenario projections, going through app-store billing costs an estimated $360K–$720K/year versus selling through the web directly. A native app is a legitimate phase-two consideration once there's proven revenue.

Reasoning for Wix specifically: the client already has a Wix account with other domains and wants this project on the same account/domain rather than standing up separate hosting. Wix supports this through **Git Integration & Wix CLI for Sites** — Wix provisions a GitHub repo for the site, you clone it and write code in a normal local terminal/IDE, commit and push like any other project, and use the `wix` CLI (`wix dev` for a live local preview, `wix publish` to ship) to get it live. This is compatible with a terminal-based coding workflow — it is not the old drag-and-drop-only Wix experience.

**Before starting, check whether the target site already has Velo Packages installed.** Wix's own docs are explicit that GitHub/CLI integration is not supported on a site that has Velo Packages set up (plain npm packages are fine, Velo Packages specifically are not). If the existing account's site(s) have this, that needs to be resolved (a fresh site, or removing the conflicting packages) before the Git-based workflow described here will work.

PWA requirements (still apply on Wix): a web app manifest, HTTPS (Wix provides this by default on connected domains), "Add to Home Screen" support. A service worker for offline reading of already-loaded content may need to be added via Velo's custom code injection, since Wix doesn't provide one natively — check current Wix documentation for the supported way to do this before assuming it's a simple drop-in.

---

## Business model & pricing (for reference — implement the mechanics, not necessarily these exact numbers)

**Two purchase paths, both include full access to all 8 sections and all future content updates for free:**

| Plan | Price | What's included |
|---|---|---|
| Whole Course | $199 one-time | All lessons/quizzes, owned permanently. AI coaching credits purchased separately at full price. |
| Annual Standard | $149/year | Same lesson access (active while subscribed) + 10 AI-coaching credits/month (refreshes monthly) + 10% off credit-pack purchases. |
| Annual Pro | $199/year | Same lesson access (active while subscribed) + 25 AI-coaching credits/month + 20% off credit-pack purchases. |

**AI coaching credit system** (this is implemented client-side already and needs to move server-side — see **Technical Requirements**):

- 1 credit = 1 "Quick Look" analysis (clip up to 15 seconds, 5 video frames extracted)
- 1.25 credits = 1 "Full Rep" analysis (up to 30 seconds, 8 frames)
- 1.75 credits = 1 "Extended Run" analysis (up to 60 seconds, 12 frames)
- Clips over 60 seconds are rejected client-side with a message asking the student to trim
- Credit packs (sold a la carte, priced at real processing cost × 4, i.e. a 300% markup): 10 credits/$0.99, 30/$2.99, 75/$6.99, 200/$18.99
- Actual Anthropic API cost per analysis is roughly 2–4 cents (Sonnet-tier pricing) — this feature is cheap to run even at real usage volume; don't over-engineer cost controls, but do rate-limit against abuse

**Loyalty mechanics to implement:** Annual renewal discount (10% at year 2, 15% at year 3+); Whole Course customers unlock a standing 10% discount code after their first credit-pack purchase; Whole Course owners can apply their $199 as credit toward upgrading to an Annual plan at any time.

**Free tier:** Chapter 1.1 in full (content + quiz + 2–3 free video-coach analyses, no login required) as the top-of-funnel preview. Every other chapter should show its title and a short teaser, then prompt to purchase.

---

## Technical requirements

### 0. Integrating the existing course file with Wix
The current `integrated_roping_system_v20.html` file is a single self-contained HTML/CSS/JS document. On Wix, the most direct path is embedding it as a **custom HTML/embed element (or Velo custom element)** on a Wix page, rather than manually rebuilding all 32 chapters and the video-coach UI as native Wix page elements — that content and styling already works and shouldn't need to be redone. The parts of its JavaScript that currently call external services directly (the Anthropic fetch call, in particular) need to be changed to call Velo backend HTTP functions instead (see #1 below). Confirm current Wix limits on embedded custom code size/complexity before assuming the whole file drops in with zero changes — if there are constraints, splitting the embed per-section rather than as one giant embed is the fallback.

### 1. Move the AI coaching call server-side (into a Velo backend web module)
The browser currently calls `https://api.anthropic.com/v1/messages` directly with a hardcoded model string. This must move into a **Velo backend web module** (a `.jsw` file, or an HTTP Function if you need a raw REST endpoint):
- Browser still does client-side frame extraction (existing `extractVideoFrames`/`getVideoDuration`/`getVcTierForDuration` logic in the file is fine to keep as-is — it's cheap and privacy-friendly to keep raw video off your servers)
- Browser calls a Velo backend function (via `import` from the frontend, the standard Velo pattern) passing extracted frames + student context (position, skill level, goal, chapter)
- The backend function: verifies the logged-in Wix member, checks their credit balance (in a Wix Data Collection) ≥ the tier's cost, deducts credits, calls Anthropic's API using a key stored in **Velo's Secrets Manager** (never hardcoded), and returns the response
- Never ship an Anthropic API key in any client-side code, and never put it directly in backend source — use Secrets Manager

### 2. Auth
**Use Wix's built-in Members Area / Authentication system** rather than building custom auth — Wix already provides signup, login, session management, and password reset as a native feature. Do not build a parallel custom auth system; hook entitlement and progress data to the Wix member ID.

### 3. Entitlements / real paywall
Content and quiz data (currently the `quizData` object, fully visible in page source) needs to move behind a Velo backend function that checks the logged-in member's purchase/subscription status (stored in a Wix Data Collection, see #5) before returning chapter content or quiz questions. The free-preview chapter (1.1) can stay fully client-side/public since it doesn't need gating.

### 4. Payment
Wix has two real paths here, and picking between them (or combining them) is a decision for whoever builds this, not something pre-decided in this brief:
- **Wix Pricing Plans** — Wix's native recurring-billing product. Likely a good fit for the Annual Standard/Pro subscriptions specifically, since recurring billing, renewal, and cancellation are handled natively without custom webhook code.
- **Stripe via Velo backend code** — Wix Velo supports calling the Stripe API from backend web modules, with keys stored in Secrets Manager. This gives more flexibility for the credit-pack a la carte purchases and the loyalty-discount logic described below, which don't map as cleanly onto Wix's native subscription product.
- Whichever path is chosen, preserve this principle from the original plan: **don't build entitlements in a way that's tightly coupled to a single payment rail** — a future native app (phase two) should be able to check the same entitlement data without requiring Apple/Google in-app-purchase billing to be the source of truth.
- Handle the loyalty discount logic (coupon codes or computed discounts at checkout) in whichever system ends up handling checkout.

### 5. Data storage (Wix Data Collections, not a SQL database)
Wix Velo's database is **Wix Data Collections** — a document-style store, not relational Postgres/MySQL with joins the way the original generic plan assumed. Suggested minimum collections: `Members` (Wix provides this natively via the Members Area — extend it with custom fields rather than building a parallel users collection), `Purchases` (whole-course owners), `Subscriptions` (plan tier, status, renewal date), `CreditLedger` (balance + transaction history), and `QuizAttempts` (chapter id, score, total, timestamp) for the progress-tracking feature described later in this brief. Design each collection's fields with Wix Data's actual query capabilities in mind (it supports filtering/sorting but not arbitrary SQL joins) rather than porting a relational schema literally.

### Recommended stack
**Wix Velo end-to-end** — Members Area for auth, Wix Data Collections for storage, Velo backend web modules for the AI-coaching proxy and any custom business logic, Secrets Manager for API keys, and either Wix Pricing Plans or Stripe-via-Velo (or both, split by purchase type as above) for payment. This keeps everything on the one platform/account the client already has, rather than introducing a second infrastructure provider.

---

## Design system (already implemented in the CSS — reference, not a spec)

CSS custom properties are all defined in the `:root` block at the top of the file. Key ones: `--brown` (near-black charcoal, dark surfaces), `--gold` (vivid orange, primary accent/CTAs), `--sage` (emerald, correct/success states), `--rust` (red, incorrect/error states), `--sky` (blue, informational accents), `--cream`/`--border` (light neutral backgrounds/borders). Headings use Playfair Display (serif); body text uses Source Sans 3. If you restructure this into a component framework, port these as design tokens rather than re-deriving colors.

---

## Open decisions / things not yet finalized

- The coach's actual name (currently a `[COACH NAME]` / `[Coach]` placeholder in the cover hero and nav — cosmetic, easy to swap once decided)
- Whether/how to track quiz attempt history per student
- Exact legal terms, refund policy, etc. — not addressed in this brief at all
- Marketing/landing page copy exists in conversation but has not been added to the file itself — ask if you need it

---

## Progress tracking, printable coach report, and feedback (added after initial handoff)

Three features were added to the file after the initial build. All three currently work client-side only (in-memory JS state, resets on page reload) as a functional prototype — **none of this is real persistence yet**, and that's the main thing this section asks you to fix.

### 1. Quiz + video-coach usage tracking
- A `studentProgress` object (search for it near the top of the `<script>` block) tracks, per chapter: best quiz score, most recent score, attempt count, and a log of every video-coach analysis used (chapter, tier, credits, timestamp).
- `recordQuizResult(id, score, total)` is called at the end of `submitQuiz()` every time a student finishes a quiz.
- `recordVideoAnalysis(id, tier)` is called right after a successful video-coach analysis in `analyzeRoping()`.
- **Both functions have a `// TODO: sync to backend` comment showing exactly what to POST and where.** Once auth exists, these two functions are the two places to wire in real API calls — everything else (the UI, the report page) can stay as-is and will "just work" once these two functions write to a real database instead of an in-memory object.

### 2. "My Progress" report page (`#progress-report` section, near the end of the file)
- Shows every chapter, its best quiz score, attempt count, and video-analysis count, plus rolled-up stats (chapters attempted, course coverage %, average best score, total video analyses used)
- Includes a student name field and a "Print This Report" button
- Has dedicated print CSS (`@media print` block) that hides all navigation/interactive chrome and prints a clean report — **this part is genuinely done and shouldn't need rework**, it's just currently populated from the in-memory session data instead of a real account's history
- Once real accounts exist, this page should load a specific student's actual historical data (not just the current session) — that's the only real gap

### 3. Feedback ("Send Feedback," `#feedback-section` near the end of the file)
- A form (feedback type, location in course, message, optional email) that currently opens a **mailto: link** on submit — this works today with zero backend, which matters for the launch/testing phase specifically
- **The mailto address is a placeholder (`feedback@example.com`) — search for it in `sendFeedback()` and replace with a real inbox before this goes live**
- Comment in the code flags this: once a backend exists, replace the body of `sendFeedback()` with a call to a Velo backend function that writes to the `Feedback` Wix Data Collection, and keep the mailto as a fallback if that request fails — this is genuinely useful during testing regardless (structured feedback with type/location tags beats an unstructured email, even before there's a database behind it)

### Suggested data storage for these three features
Add to the Wix Data Collections described earlier: `QuizAttempts` (member id, chapter id, score, total, timestamp) and `VideoAnalysisLog` (member id, chapter id, tier, credits, timestamp) — both are just persisted versions of the in-memory tracking already built. A `Feedback` collection (member id or empty, type, location, message, email, timestamp, status) would let the mailto fallback become a real inbox you can triage from a Wix dashboard instead of just an email thread.

---

## What NOT to do

- Don't reintroduce real people's names, quotes, or links anywhere in the product (see **Content Principles**)
- Don't build a native app or couple entitlements to Apple/Google IAP in this phase (see **Platform Decision**)
- Don't stand up a separate backend provider (Supabase, a custom server, etc.) — this is a Wix Velo build now, on the client's existing account
- Don't assume the Git Integration & Wix CLI workflow is available without first checking the target site for existing Velo Packages — it's incompatible with that workflow per Wix's own docs
- Don't ship the Anthropic API key client-side, or hardcoded in backend source — use Velo's Secrets Manager
- Don't assume the pricing numbers above are final — implement the *mechanics* (tiers, credits, loyalty discounts) in a way that's easy to re-price, since these are business estimates, not committed figures
- Don't ship `feedback@example.com` as the real feedback address — it's a placeholder

---

## Legal documents (draft — need real attorney review before launch)

Three draft legal documents were written and are included alongside this brief: `RISK_DISCLAIMER.md`, `TERMS_OF_SERVICE.md`, `PRIVACY_POLICY.md`. **These were written by an AI assistant as a starting structure, not by a lawyer, and are not fit to govern real transactions or real physical risk as-is.** Get them reviewed by a licensed attorney — ideally one with equine liability experience — before this goes live. A few things flagged directly in the documents that need specific attention:

- **Equine Activity Liability Acts**: 47–48 U.S. states have some form of statute limiting liability for the "inherent risks" of equine activity, and most require specific statutory warning language and/or physical signage to get that protection. These statutes were generally written for in-person facilities and instructors — it's genuinely unclear how they apply to a purely online educational product, and the required language differs state by state (California and Maryland have no such statute at all). This needs jurisdiction-specific legal research, not a generic disclaimer.
- All three documents are full of `[BRACKETED PLACEHOLDERS]` (company name, jurisdiction, contact email, retention periods, refund policy, age minimum, etc.) that need real values before publishing.
- The Privacy Policy doesn't attempt to resolve GDPR/CCPA-style jurisdictional differences — if the audience includes EU/UK or California users, that needs real analysis.

### What's already wired into the course file
- **A visible risk notice** on the cover page, linking to the full disclaimer
- **A first-visit acknowledgment modal** (`#risk-modal-overlay` in the HTML, `acknowledgeRisk()` in the JS) that requires checking a box before a visitor can proceed into the course at all. **This currently shows on every page load** since there's no account system yet to remember a prior acknowledgment — once auth exists, record `{ memberId, acknowledgedAt, disclaimerVersion }` in the `LegalAcknowledgments` collection on acceptance and only show the modal if that record is missing or the disclaimer version has changed. The TODO comment in the code (currently written in generic `userId` terms) says exactly this — just map it to the Wix member ID.
- **A footer** linking to all three documents (currently pointing to placeholder relative paths `terms.html`, `privacy.html`, `disclaimer.html` — wire these to wherever the real hosted pages end up living) plus a condensed risk statement, on every page.

### Suggested data storage for this
A `LegalAcknowledgments` Wix Data Collection (member id, document type, version, timestamp) — this is what actually makes the checkbox-and-modal pattern legally meaningful instead of just a UI gesture: a real, timestamped, per-member record that a specific version of the disclaimer was shown and accepted before they could use the product.

---

## Testimonials (placeholder content — do not launch as-is)

The merged cover/landing hero now includes a rotating testimonial carousel (search the HTML for `testimonials-wrap`, and the `testimonials` array near the top of the `<script>` block). **These six testimonials are entirely fictional** — written to demo the carousel layout, not real customer quotes.

**This matters legally, not just editorially.** Presenting fabricated testimonials as if they're genuine customer endorsements is deceptive advertising under the FTC Act in the U.S. (and equivalent consumer-protection law elsewhere), regardless of intent. Before any real, public launch:
- Either replace every entry in the `testimonials` array with an actual submitted testimonial, or
- Remove the whole carousel until real ones exist

**There is currently no way for a real student to submit a testimonial** — this was intentionally left as a bookmark rather than built out now. When you get to it: a simple submission form (the existing feedback form's mailto-based pattern is a fine starting point) feeding into a `Testimonials` Wix Data Collection (quote, author name/role, submitted-by member id, status: pending/approved/rejected, timestamp) with a manual approval step before anything goes live in the carousel — don't auto-publish member submissions directly to a public marketing surface.
