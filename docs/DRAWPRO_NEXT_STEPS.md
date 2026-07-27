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
— display-only, never gates entry).

**Update: Page 2 and Page 3 code is now fully rewritten for the
multi-class model too** (commit `246f476`) — `producer-event-setup.js`
(event shell + repeatable class creation + per-class open/close) and
`producer-draw-sheet-review.js` (class selector, everything downstream
scoped to classId, displays `qualifiesForIncentive` via a new
`#iconIncentiveFlag`). This was the actual remaining blocker on starting
either page, not a vague future dependency — it's done now.
`docs/DRAWPRO_MANUAL_PAGE_BUILD_GUIDE.md`'s Page 2/3 sections are updated
to match exactly. Neither page has been created in the Wix Editor yet, so
neither file exists yet in `roping-tools` (the real repo) — that happens
via the same git-first process Page 1 went through, once each page is
created/published in the Editor and its generated filename is provided.

## 0.5. Draw Pro -> Steer Me event continuity (2026-07-22, CONFIRMED WORKING END-TO-END 2026-07-23)
`backend/steerMeSync.jsw` cross-posts a lightweight companion listing
into Steer Me's own Supabase database whenever a producer adds a class
(`createEventClass()`), so entrants there can discover the event, mark
attending, find a partner, and hand off back into Draw Pro's real entry
flow via a new "Enter the Draw" button - all without the producer
creating the same event twice. Full reasoning in
`docs/ARCHITECTURE.md`; receiving schema in steer-me-app's migration
`0029_draw_pro_event_sync.sql`.

**Live-tested and confirmed working 2026-07-23**: created a real event
in Producer Event Setup, added a class, and confirmed the row landed
correctly in Supabase's `events` table with a real `draw_pro_entry_url`
link. Getting here required fixing several real, separate bugs found
live in this session (all documented in `docs/ARCHITECTURE.md`):
- `#boxAddClass` didn't support `.disable()`/`.collapse()`, crashing all
  of `$w.onReady()` before any button's click handler ever got wired -
  every button on the page looked completely dead as a result.
- `validateEventInput()` never actually required `eventDate`, letting an
  event get created with it blank - reached `steerMeSync.jsw` as
  `undefined` and threw downstream instead of failing clearly at the
  source.
- The Supabase secret saved as `steerme-supabase-service-role-key` was
  briefly the wrong key (anon instead of service_role), causing every
  insert to be rejected by Row Level Security with a 401.
- `buildEntryUrl()` (and, found in the same pass,
  `payments.jsw`'s `calculateProducerFee()` in three places) were called
  across `.jsw` module boundaries without `await` - a real, confirmed
  Velo behavior where cross-`.jsw` calls always return a Promise
  regardless of whether the function itself is sync. Silently corrupted
  `draw_pro_entry_url` (landed as a literal `"{}"`) and would have
  silently corrupted every entry's fee amount once payments go live.
- `roping-tools` (the repo actually wired to the site's Git Integration)
  had fallen behind `ropingtools-site` on backend file changes - several
  fixes were live in the wrong repo and never reached the Editor at all
  until this was caught and corrected.

Also added in this session: `location` (the town/city) now has a
type-ahead against the same ~32,000-town dataset Steer Me's home_area
autocomplete uses (`backend/locationSearch.jsw`), and a new `eventSite`/
`eventSiteLink` pair (the actual venue + its booking page/phone) backed
by a shared, cross-producer `DrawProVenues` collection
(`backend/venues.jsw`) - see `docs/source/drawpro-build/files/data-model.md`.

Known v1 boundary, not an oversight: sync only fires when a class is
added, and only for `divisions`/entry-URL purposes - editing an event's
title/date/location afterward does not re-sync those fields. Revisit if
that turns out to matter in practice.

## 1. Build the real pages in the Wix Editor
Producer Event Setup, Entrant Entry Form, and Producer Draw Sheet Review
are all built and live-tested. **Producer Profile (Page 4, added
2026-07-23) still needs to be created** - see
`docs/DRAWPRO_MANUAL_PAGE_BUILD_GUIDE.md`'s "Page 4" section for the
element list. A producer's org name/contact info/logo - currently
missing entirely, which also means `steerMeSync.jsw`'s
`external_producer_name` field has no real data to use yet. Also need a
new `DrawProProducerProfiles` collection (5 fields, see
data-model.md's "8.5" entry) - small enough to create manually in the
Editor's Content Manager, same as `DrawProVenues` was.

## 2. `elevate()` — RESOLVED, this item is moot (2026-07-23)
Turns out this was never actually a live dependency to test. Checked the
real backend code directly: `elevate()` is not called anywhere in
`event-setup.jsw`, `payments.jsw`, `notifications.jsw`, `qr-and-alerts.jsw`,
`venues.jsw`, or `steerMeSync.jsw` - only mentioned in comments explaining
why it was avoided (Wix-native Triggered Emails were used instead of an
external ESP specifically because of this gap, per `payments.jsw`'s
header comment). Regular `wixData` calls rely on the collections' own
permission settings for the signed-in member, not `elevate()`. Today's
live, successful event/class creation - which writes to Wix Data as the
current member - already proves this path works fine. No further testing
needed here.

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
- ~~Producer annual subscription fee — no number set yet~~ **RESOLVED
  2026-07-25**: set to $149/year (`PRODUCER_ANNUAL_SUBSCRIPTION_FEE` in
  `payments.jsw`), a researched estimate against comparable roping/rodeo
  software (Rodeo Producer $100/yr, Carlsen's Roping Management Program
  $189/yr) — trivially adjustable if it needs to change. Real PayPal
  Subscriptions API integration is now built (`createSubscriptionProduct()`,
  `createSubscriptionPlan()`, `startProducerSubscription()`,
  `checkSubscriptionStatus()`, and a corrected `cancelSubscription()` that
  now actually cancels on PayPal's side) — see `docs/ARCHITECTURE.md`'s
  entry on this for the full design. **Still needed before this is live**:
  run `createSubscriptionProduct()`/`createSubscriptionPlan()` once (after
  PayPal for Platforms approval lands, since these need real credentials),
  store the returned plan id as the `drawpro-paypal-subscription-plan-id`
  secret, and build the actual "Subscribe" UI (a natural fit on the new
  Producer Dashboard page) — none of that frontend work exists yet.
- **Multi-user accounts + tiered pricing — BUILT 2026-07-27** (was "not yet
  built" as of the last update to this section): `backend/account-users.jsw`
  (invite/accept/remove/list + the `assertProducerAccess()` authorization
  check used across `event-setup.jsw`/`matching-engine.jsw`/
  `csv-export.jsw`/`notifications.jsw`), `DrawProAccountUsers` collection,
  and `payments.jsw`'s `PRODUCER_SEAT_TIERS` ($149 solo / $199 team3 / $249
  unlimited, extending `createSubscriptionPlan()`/`startProducerSubscription()`
  to take a `seatTier`). Manage Team UI added to Producer Profile. See
  `docs/ARCHITECTURE.md`'s 2026-07-27 entry for the full design. **Still
  needed before this is fully live**:
  - Run `createSubscriptionPlan(productId, seatTier)` once per tier (3
    times total) once real PayPal credentials exist, storing each
    returned id under `drawpro-paypal-subscription-plan-id-solo` /
    `-team3` / `-unlimited`.
  - **Still needed — 4th Triggered Email template for account-user
    invites.** This one's a Wix Dashboard action only you can do (see
    below for exact steps), then tell me the resulting email ID so I can
    set `account-users.jsw`'s `ACCOUNT_INVITE_EMAIL_ID` — until then,
    invites are recorded (the team list is accurate) but no email
    actually sends.
  - **BUILT 2026-07-27** — `velo/pages/drawpro-real/accept-account-invite.js`:
    the invited person's "accept invite" page. Reads `?invite=` from the
    URL, prompts sign-in if needed (via Wix's own login lightbox), then
    calls `acceptAccountInvite()`. **Still needs the actual page created
    in the Wix Editor** (doesn't exist there yet) — see
    `DRAWPRO_MANUAL_PAGE_BUILD_GUIDE.md`'s new Page 6 section for exactly
    what to build and which elements it needs.
  - New Editor elements on Producer Profile: `#inputInviteEmail`,
    `#btnInviteUser`, `#textTeamStatus`, `#textSeatInfo`,
    `#repeaterTeamUsers` (+ item template) — see
    `DRAWPRO_MANUAL_PAGE_BUILD_GUIDE.md`'s Page 4 section. Not yet added
    to the live page.
  - **FIXED 2026-07-27** — `drawpro-home.js`'s producer dashboard used to
    only query events by `member._id` alone, meaning a signed-in HELPER
    user would see an EMPTY dashboard instead of the account owner's
    events. Now calls `account-users.jsw`'s
    `getAccessibleProducerIds(member._id)` and queries across all
    returned ids via `hasSome()` instead of `eq()` — a no-op for anyone
    who isn't an active helper on someone else's account.
  - **Known, not-yet-closed gap**: the same "does this member actually
    own this record" check was added to the highest-stakes functions in
    `event-setup.jsw`/`matching-engine.jsw`/`csv-export.jsw`/
    `notifications.jsw`, but NOT to `steerMeSync.jsw`, `venues.jsw`,
    `qr-and-alerts.jsw`, or `producerProfiles.jsw` — those haven't been
    audited for the same pre-existing gap. Worth a deliberate pass rather
    than assuming they're fine.

## 6.5. "First to enter, last to rope" + CSV export (2026-07-27) — built, needs live verification
Both built (`DrawProEventClasses.sequenceMode`, `matching-engine.jsw`'s
updated `sequenceWithSpacing()`, new `csv-export.jsw`) — see
`docs/ARCHITECTURE.md`'s entry for the full design. Two things still need
a real producer/live-editor check before trusting these in front of an
actual event:
- **New Editor element**: `#checkboxFirstToEnterLastToRope` on Producer
  Event Setup (see `DRAWPRO_MANUAL_PAGE_BUILD_GUIDE.md`) — not yet added
  to the live page.
- **New Editor element**: `#btnExportCSV` on Producer Draw Sheet Review —
  also not yet added, AND the download mechanism itself
  (`wixLocation.to('data:text/csv;...')`) is untested live. Confirm in
  Preview that it actually triggers a file save prompt rather than
  navigating the page away, before relying on it with a real producer.

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
- All 13 real-product Data Collections created and verified live in Wix
  (`DrawProAccountUsers` added 2026-07-27 via the REST API directly -
  `POST /wix-data/v2/collections`, ADMIN-only permissions on all 4
  operations, same pattern documented in `data-collections/SCHEMA.md`'s
  "Creating/managing collections via the REST API" section)
- `DrawProWaitlist` (coming-soon signup) fully working end-to-end, tested live
- Fee-calculation math confirmed (4% + $1.50 flat platform fee)
- `canPair()`-equivalent cap logic, spacing algorithm, manual-override
  audit logging all built and reviewed
