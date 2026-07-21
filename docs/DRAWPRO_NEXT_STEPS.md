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
association).

**Code is now implemented** (commit `cd77183` in `ropingtools-site`,
mirrored to `roping-tools`): `matching-engine.jsw` (draws run per-class,
solo entrants expand into `requestedEntryCount` poolable slots, heeler
sub-cap check added), `event-setup.jsw` (`createEventClass` is new,
`submitEntry` supports mixing pre-formed + draw-in in one submission),
`payments.jsw` (pricing reads from the class, draw-in surcharge now
actually applied — was silently missing even before this redesign),
`notifications.jsw` (scoped to classId), and Page 1's
`entrant-entry-form.js` (new `#dropdownClass`, `#radioEntryType` replaced
by `#checkboxAddPartner` — see the updated
`docs/DRAWPRO_MANUAL_PAGE_BUILD_GUIDE.md` for exactly what that means for
elements already placed in the Editor).

**Still not done — the actual blocker on testing any of this end-to-end:**
the live Wix Data Collections. `/tmp/wix_setup/update_collections.mjs` is
written and ready — creates `DrawProEventClasses`, adds `classId` to
`DrawProEntrants`/`DrawProTeams`/`DrawProDrawSheets`/`DrawProAuditLog`/
`DrawProExecutionCharges`/`DrawProNotificationLog`, adds
`submissionGroupId` to `DrawProEntrants`. Needs a fresh scoped "Wix Data"
API key to run (the one from the original 12-collection setup was never
saved, correctly — ephemeral, used once, directory deleted after).

Also still open: Page 2 (Producer Event Setup) is confirmed to be
designed around flier-upload-and-AI-review from the start, not
manual-first — see ARCHITECTURE.md for the reasoning — but no code for
it exists yet at all.

Known limitation, flagged in code comments rather than silently wrong:
PayPal checkout for a mixed submission (pre-formed + draw-in together)
currently only creates/captures an order against one of the two entrant
records even though the displayed total is correct — see
`entrant-entry-form.js`'s `handlePayNow` doc comment.

Also added since: role is no longer fixed per submission (a person can
head with a known partner while drawing in as heeler — confirmed real
scenario), `#checkboxUpAndBack` support (same two people, roles
swapped), a real cap-validation gap fix on pre-formed submissions
(previously unenforced entirely), a cumulative-entries-across-
submissions cap fix, and incentive/slide tracking
(`DrawProEventClasses.incentiveCapNumber` / `DrawProTeams.qualifiesForIncentive`
— display-only, never gates entry). **Reminder for whenever Page 3
(Producer Draw Sheet Review) gets built:** it should visually shade or
highlight teams where `qualifiesForIncentive === true`, so the producer
can track incentive-qualifying teams at a glance during a live event —
this was explicitly requested, not yet implemented anywhere in UI since
Page 3 doesn't exist yet.

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
