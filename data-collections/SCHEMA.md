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

**Full transaction history isn't in this collection** — if you need an
auditable ledger (not just current balance + last change), add a separate
`CreditTransactions` collection (`memberId`, `type`, `amount`, `reason`,
`balanceAfter`, `timestamp`) and insert into both on every change. Not
built yet; flagging as a likely near-term addition once real payments
exist.

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
Not built yet — no submission form exists. Per HANDOFF_BRIEF.md's
"Testimonials" section, this needs a manual-approval step before anything
public-facing reads from it. Documented here so the shape is decided ahead
of building the submission form.

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
(`public/drawpro/index.html`). Same permission pattern as `Feedback` —
Admin-only, written via `velo/backend/drawPro.jsw`'s `joinDrawProWaitlist()`,
which allows anonymous callers (no Members Area account required to join a
waitlist).

| Field | Type | Notes |
|---|---|---|
| `email` | Text | Lowercased/trimmed before storage; `drawPro.jsw` checks for an existing row before inserting to avoid duplicates. |
| `timestamp` | Date/Time | |

---

## Not yet covered here

`Members` is provided natively by the Wix Members Area — extend it with
custom fields (Content Manager → Members app → Settings) rather than
building a parallel collection, per HANDOFF_BRIEF.md §5.
