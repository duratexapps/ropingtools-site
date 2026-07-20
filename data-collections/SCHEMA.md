# Wix Data Collections

Wix Velo's database is Wix Data Collections — schema-less document storage
configured through the Wix Content Manager UI (Editor → CMS), not a code
migration file. There's no local-file equivalent to a SQL migration for
this; create each collection below by hand in the Content Manager once the
site exists, matching these field names/types exactly (the backend modules
in `velo/backend/` assume these names).

For every collection except `Feedback`, set **read/write permissions to
"Admin"** (i.e., only backend code, never client-side `wix-data` calls) —
these are only ever touched from `.jsw` modules that already verify the
member server-side. `Feedback` should also be Admin-only for write (writes
only happen via `feedback.jsw`, including anonymous submissions).

---

## `CreditLedger`
One row per member; `balance` is the current spendable balance.

| Field | Type | Notes |
|---|---|---|
| `memberId` | Text | Wix member ID. Index this — it's queried on every video-coach request. |
| `balance` | Number | Current credit balance. Can be fractional (tiers cost 1, 1.25, 1.75). |
| `lastTransaction` | Object | `{ type, amount, reason, timestamp }` — most recent change, for quick display; full history isn't kept in this collection (see note below). |

Row created when a member first purchases a plan or credit pack (in
whichever payment-flow code ends up handling checkout — not yet written,
see HANDOFF_BRIEF.md §4). `aiCoach.jsw`'s `deductCredits()` assumes a row
already exists and throws if it doesn't — checkout code must create it with
an initial balance before a member can be sent to the course page.

**Full transaction history isn't in this collection** — for that, see
`CreditTransactions` below, now built and wired into `deductCredits()`.

---

## `CreditTransactions`
Full auditable ledger — every credit deduction, not just the most recent
one. Built alongside `CreditLedger`, since the latter only ever holds
current balance + last change. `aiCoach.jsw`'s `deductCredits()` writes to
both: `CreditLedger` first (source of truth for balance checks), then this
collection (best-effort — a logging failure here doesn't undo a deduction
that already succeeded, same reasoning as `logVideoAnalysis()` not being
allowed to roll back a completed analysis).

| Field | Type | Notes |
|---|---|---|
| `memberId` | Text | |
| `type` | Text | `"debit"` currently — no credit-grant path writes here yet, since that's part of the still-unbuilt checkout flow |
| `amount` | Number | |
| `reason` | Text | e.g. `"Full Rep analysis, chapter 1-1"` |
| `balanceAfter` | Number | |
| `timestamp` | Date/Time | |

---

## `Purchases`
Whole Course ($199 one-time) ownership records.

| Field | Type | Notes |
|---|---|---|
| `memberId` | Text | |
| `plan` | Text | `"whole-course"` |
| `amountPaid` | Number | |
| `purchasedAt` | Date/Time | |
| `unlockedStandingDiscount` | Boolean | Flips true after their first credit-pack purchase, per the loyalty mechanic in HANDOFF_BRIEF.md §Business Model. |

---

## `Subscriptions`
Annual Standard / Annual Pro state. If Wix Pricing Plans ends up handling
these (see HANDOFF_BRIEF.md §4), this collection may end up mirroring
Wix's own subscription data rather than being the source of truth —
decide this when payment integration is actually built.

| Field | Type | Notes |
|---|---|---|
| `memberId` | Text | |
| `plan` | Text | `"annual-standard"` \| `"annual-pro"` |
| `status` | Text | `"active"` \| `"canceled"` \| `"past_due"` |
| `renewalDate` | Date/Time | |
| `renewalYear` | Number | Drives the 10%/15% loyalty renewal discount (year 2 / year 3+). |
| `monthlyCreditsGranted` | Number | 10 (Standard) or 25 (Pro) — refreshed monthly by a scheduled job (not yet written). |

---

## `QuizAttempts`
Every quiz submission, for the progress report and `getQuizHistory()`.

| Field | Type | Notes |
|---|---|---|
| `memberId` | Text | Index this. |
| `chapterId` | Text | e.g. `"1-1"` |
| `score` | Number | |
| `total` | Number | Always 10 currently, but don't hardcode — the file already parameterizes it. |
| `timestamp` | Date/Time | |

---

## `VideoAnalysisLog`
Every AI-coaching analysis used, written by `aiCoach.jsw` as part of the
credit-deduction transaction — never written directly from the frontend.

| Field | Type | Notes |
|---|---|---|
| `memberId` | Text | |
| `chapterId` | Text | |
| `tier` | Text | `"Quick Look"` \| `"Full Rep"` \| `"Extended Run"` |
| `credits` | Number | Actual amount deducted — server-computed, not client-supplied. |
| `timestamp` | Date/Time | |

---

## `Feedback`
Structured feedback submissions, replacing/supplementing the mailto
fallback. See `velo/backend/feedback.jsw`.

| Field | Type | Notes |
|---|---|---|
| `memberId` | Text | Nullable — anonymous submissions are allowed. |
| `type` | Text | Value of the feedback-type select in the form. |
| `location` | Text | Free text, "where in the course" this relates to. |
| `message` | Text | Required. |
| `email` | Text | Optional reply-to, self-reported. |
| `status` | Text | `"new"` \| `"triaged"` \| `"resolved"` — set manually from the Content Manager. |
| `timestamp` | Date/Time | |

---

## `LegalAcknowledgments`
Timestamped record that a specific disclaimer version was shown and
accepted — this is what makes the risk-modal checkbox legally meaningful.
See `velo/backend/legalAcknowledgments.jsw`.

| Field | Type | Notes |
|---|---|---|
| `memberId` | Text | |
| `documentType` | Text | Currently only `"risk-disclaimer"`; leave room for `"terms"` / `"privacy"` if those ever need explicit acceptance tracking too. |
| `version` | Text | Matches `DISCLAIMER_VERSION` in `public/course-embed.html`. Bump both together whenever `legal/RISK_DISCLAIMER.md` materially changes. |
| `timestamp` | Date/Time | |

---

## `Testimonials`
Backend built (`backend/testimonials.jsw`): `submitTestimonial()` requires
login and always writes `status: 'pending'`; `getApprovedTestimonials()` is
the only public read, filtered to `status = 'approved'`. Per
HANDOFF_BRIEF.md's "Testimonials" section, approval itself stays a manual
Content Manager action — no function flips status to `'approved'` or
`'rejected'`, by design. No page/carousel UI built yet — that's a frontend
task, not a backend one, still open.

| Field | Type | Notes |
|---|---|---|
| `quote` | Text | |
| `authorName` | Text | |
| `authorRole` | Text | e.g. "Heeler, Intermediate" |
| `submittedByMemberId` | Text | |
| `status` | Text | `"pending"` \| `"approved"` \| `"rejected"` — the carousel should only ever query `status = "approved"`. |
| `timestamp` | Date/Time | |

---

## `DrawProWaitlist`
"Get Notified" signups from the Draw Pro coming-soon page
(`public/drawpro/index.html`). Written via `velo/backend/drawPro.jsw`'s
`joinDrawProWaitlist()`. **Permissions differ from every other collection
here**: `insert` is open to **Everyone** (anonymous visitors need to be able
to join without an account), while `view`/`update`/`delete` stay Admin-only.
No dedup-by-email check — that would need read access, deliberately not
opened (see "elevate() doesn't work" note below). An occasional duplicate
row is an acceptable trade-off for not exposing the email list to reads.

| Field | Type | Notes |
|---|---|---|
| `email` | Text | Lowercased/trimmed before storage. |
| `timestamp` | Date/Time | |

---

## Important operational notes (learned the hard way, 2026-07-18/19)

### Collection ID vs. display name — always verify both, separately
Creating a collection via **Import from CSV** and then renaming it from
Wix's default `Import1`, `Import2`, etc. **only changes the display name**
— the underlying **Collection ID** (what `wixData.query('CollectionName')`
actually matches against) stays `ImportN` forever. Wix explicitly blocks
changing it after creation ("You cannot modify the collection ID after the
collection has been created"). Every collection in this project that was
built via CSV import hit this — all 7 needed deleting and recreating.

**Building a collection via "Start from scratch" does not have this
problem** — the name you give it at creation time becomes the real
Collection ID. That's the safer path for future collections built through
the Editor UI. Always double check by opening the collection's Settings
tab and confirming the **Collection ID** field (not just the title show in
the breadcrumb) matches what the code expects, *before* writing any real
data into it.

### `wix-auth`'s `elevate()` did not work for Wix HTTP Functions in testing
All of this project's collections are permissioned **Admin-only** by
design (see intro above) — the intent was that trusted backend `.jsw`
code would `elevate()` past that restriction after doing its own
validation, rather than opening broader collection-level access. In
practice, calling `elevate()` — on individual `wixData` calls, on a whole
wrapped function, and applied directly inside `backend/http-functions.js`
itself — consistently failed with `WDE0027: does not have permissions`
when invoked through an HTTP Function. All three variants were tested
live against `DrawProWaitlist`; none worked.

**Workaround used for `DrawProWaitlist`**: opened the specific collection
permission needed (`insert` → Everyone) directly, rather than relying on
`elevate()`. This is a narrower, still-reasonably-safe fix for a
single anonymous-write collection, but **it hasn't been tested whether
member-authenticated actions (course backend, credit deduction, etc.)
have the same `elevate()` problem when called via Velo Page Code +
`import` rather than an HTTP Function** — that's a distinct, unverified
code path. See `docs/ARCHITECTURE.md`'s notes on this for the follow-up
plan before assuming the same fix applies there.

### Creating/managing collections via the REST API instead of the Editor UI
Given the CSV-import ID problem above, all 7 of the mis-IDed collections
were fixed by deleting them and recreating via Wix's REST API directly
(`POST https://www.wixapis.com/wix-data/v2/collections`, with a
`wix-site-id` header and a Wix API Key scoped to just "Wix Data" — Settings
→ API & Extensions in the Wix dashboard). This lets you specify the exact
Collection ID at creation time, sidestepping the Editor's CSV-import flow
entirely. Worth using this path for any future collections (Steer Me's,
Draw Pro's real build) instead of CSV import, to avoid repeating this
whole saga.

---

## Not yet covered here

`Members` is provided natively by the Wix Members Area — extend it with
custom fields (Content Manager → Members app → Settings) rather than
building a parallel collection, per HANDOFF_BRIEF.md §5.
