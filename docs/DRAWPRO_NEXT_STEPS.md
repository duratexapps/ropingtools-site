# Draw Pro — Outstanding Work (start here next session)

Everything below is real, current status as of the end of this session — not
aspirational. Ordered roughly by what unblocks the most other things.

---

## 0. Multi-class event redesign (2026-07-21) — read before continuing Page 1 or starting Page 2
Full decision record in `docs/ARCHITECTURE.md` ("Draw Pro multi-class
redesign") and the rewritten schema in
`docs/source/drawpro-build/files/data-model.md`. Short version: one
`DrawProEvents` record can no longer carry a single cap/price — real fliers
show one event routinely bundling multiple differently-capped ropings
(confirmed against two real fliers spanning largest-to-smallest
association). Schema is rewritten (new `DrawProEventClasses` collection,
`DrawProEntrants` supports mixed pre-formed/draw-in entries per person, a
few other real mechanics like heeler sub-caps and draw-in surcharges).
**None of this is implemented in code yet** — `matching-engine.jsw`,
`event-setup.jsw`, `entrant-entry-form.js`, and the live Wix collections
(created via REST API earlier this project) all still reflect the old
single-cap model. Concretely:
- Page 1's already-placed solo/individual fields remain valid; the
  "Partner"/team-entry section will need rework once the mixed-entry
  model is implemented — don't build much further into that section
  without accounting for this.
- Page 2 (Producer Event Setup) is confirmed to be designed around
  flier-upload-and-AI-review from the start, not manual-first — see
  ARCHITECTURE.md for the reasoning. Don't start Page 2 assuming a flat
  manual form.
- The live Wix Data Collections need a new `DrawProEventClasses`
  collection created, and `DrawProEntrants`/`DrawProTeams`/
  `DrawProDrawSheets`/`DrawProAuditLog`/`DrawProExecutionCharges` need new
  reference fields added per the rewritten schema, before any of this can
  actually be tested end-to-end.

## 1. Build the 3 real pages in the Wix Editor
**The single biggest remaining blocker.** No API exists for this — has to be
done by hand. Full element-by-element instructions already written:
`docs/DRAWPRO_MANUAL_PAGE_BUILD_GUIDE.md`. Suggested build order (each gives
real data to test the next against): **Producer Event Setup → Entrant Entry
Form → Producer Draw Sheet Review.**

## 2. Test `elevate()` from Page Code the moment any page goes live
This project has a known, unresolved question (task #20): `elevate()` is
*confirmed broken* in HTTP Function context, but whether it also fails when
called from Page-Code-invoked `.jsw` imports — which is Draw Pro's real
pattern once pages exist — has never been tested. Almost every Draw Pro
backend function depends on this working. Test this as soon as the first
page is live, before assuming the rest of the backend just works.

## 3. PayPal for Platforms
- Application status: submitted, awaiting approval (external, not on our
  timeline).
- Once approved: add real credentials to Secrets Manager —
  `drawpro-paypal-client-id`, `drawpro-paypal-client-secret`,
  `drawpro-paypal-partner-merchant-id`.
- Build the actual PayPal JS SDK approval buttons on the entrant entry
  page — `createPayPalOrder()`/`capturePayPalOrder()` backend contract is
  ready, but `handlePayNow()` currently skips straight to capture with a
  TODO, which is not correct for production.
- Build the producer payout-onboarding page (`#linkPayoutSetup` currently
  points at a page that doesn't exist) — calls `startProducerPayoutOnboarding()`,
  which is ready. No point building this until PayPal approval lands.
- Build the `MERCHANT.ONBOARDING.COMPLETED` webhook (would live in
  `backend/http-functions.js`, same pattern as `post_joinDrawProWaitlist`) —
  `checkPayoutOnboardingStatus()` is a working polling fallback in the
  meantime, not urgent.

## 4. Create 3 Triggered Email templates in the Wix dashboard
Nothing sends a single email until these exist:
- Draw notifications → `DRAW_NOTIFICATION_EMAIL_ID` in `notifications.jsw`
- Entry-open alerts → `ENTRY_OPEN_ALERT_EMAIL_ID` in `qr-and-alerts.jsw`
- Partner invites → `PARTNER_INVITE_EMAIL_ID` in `payments.jsw`

## 5. `scan-import.jsw` was never built
Option 1 (scanned entry cards) has no backend module at all — referenced in
early sequencing notes but never delivered. Blocked on a real decision, not
something to build against a guess: an OCR provider. The privacy policy
draft lists "Google Cloud Vision or equivalent" as an explicit placeholder,
not a confirmed choice.

## 6. Placeholder numbers still needing real values
- Guest-entry rate limit (`GUEST_ENTRY_LIMIT = 3` per `GUEST_ENTRY_WINDOW_DAYS = 90`)
- `DrawProExecutionCharges` cost model (`FREE_TEAM_THRESHOLD = 50`,
  `PER_TEAM_EXECUTION_RATE = 0.50`)
- Processor fee rate in `payments.jsw` — currently mirrors Stripe's
  published rate as a stand-in, not PayPal's actual negotiated rate
- Producer annual subscription fee — no number set yet

## 7. Legal drafts — DRAFT status, not counsel-reviewed
Four documents exist (ToS, Privacy Policy, Minor & Parental Consent
Addendum, Refund & Extra-Run Policy) with explicit open placeholders:
fee structure, data retention windows, governing law/jurisdiction, and a
minor age-declaration step that the entry form itself still doesn't have.
Also unresolved: cancelled/postponed event handling, and whether a guest
(no account) can submit a *paid* entry at all.

## 8. Landing page's Draw Pro card
Correctly still "Coming Soon" — should **not** change until enough of the
above is resolved that a real producer/entrant could complete a full,
real action. Don't flip this prematurely (see this project's history on
why that matters).

---

## What's already solid, no action needed
- All backend logic written and syntax-checked: `event-setup.jsw`,
  `matching-engine.jsw`, `payments.jsw`, `notifications.jsw`,
  `qr-and-alerts.jsw`, `onboarding.jsw`
- All 12 real-product Data Collections created and verified live in Wix
- `DrawProWaitlist` (coming-soon signup) fully working end-to-end, tested live
- Fee-calculation math confirmed (4% + $1.50 flat platform fee)
- `canPair()`-equivalent cap logic, spacing algorithm, manual-override
  audit logging all built and reviewed
