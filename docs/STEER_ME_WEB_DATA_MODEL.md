# Steer Me Web — Data Model (Wix Data Collections)

**Status: design only, nothing created in Wix yet.** Written after reading the
native app's actual Supabase schema in full (`STEER ME/LAUNCH APP/steer-me-app/
supabase/migrations/`, 25 migrations) and `src/lib/matching.ts` — not the
earlier `STEER_ME_WEB_SPEC.md`'s suggested collection list, which predates
several real features (Switch Ender position, need posts, favorites, goat
roping folded into need posts, event fliers/linking) that only exist in the
native app's schema. Treat this document as authoritative over that section
of the spec.

## Why this matters: the "eventually shared backend" decision

Per the confirmed decision in `SITE_RESTRUCTURE_DECISIONS.md`: this is **not**
built to actually share data with the native app right now — no sync, no
shared auth, nothing wired together. But every collection/field name below is
deliberately chosen to mirror the native app's real Postgres schema as closely
as Wix Data's document-model conventions allow, so that a future convergence
is a rename/migration exercise, not a redesign. Where the platforms genuinely
must diverge (see "Where this has to differ" below), that's called out
explicitly rather than glossed over.

---

## Collections

### `SteerMeAthleteProfiles`
Mirrors `profiles`. **Same sensitivity rules apply**: `contact`,
`guardianContact`, `globalMembershipId`, and `verificationScreenshotUrl` must
never be exposed to any other visitor — only ever surfaced through backend
functions that enforce the same "accepted request only" gate the native app's
`get_request_contact()` RPC does (see Backend logic below), never via a
direct client-side Wix Data read.

| Field | Type | Notes |
|---|---|---|
| `memberId` | Text | Wix Member ID — the Wix-side equivalent of `profiles.id` / `auth.users.id`. |
| `fullName` | Text | |
| `isMinor` | Boolean | |
| `guardianName` | Text | Nullable. |
| `guardianContact` | Text | Nullable. Never exposed except post-acceptance (see below). |
| `position` | Text | `"Header"` \| `"Heeler"` \| `"Switch"` — exact same 3 values as the native app's `profiles_position_check` constraint. Match `canPair()`'s logic (below) exactly, don't reinvent it. |
| `homeArea` | Text | |
| `contact` | Text | Nullable. Never exposed except post-acceptance. |
| `avatarUrl` | Text | Wix Media Manager URL — public read (matches native app's public `avatars` bucket). |
| `globalMembershipId` | Text | Nullable. Never exposed to other users. |
| `globalClassification` | Number | e.g. `4.5`. Manual entry only (see `SITE_RESTRUCTURE_DECISIONS.md` — no OCR), matching how the native app also just stores whatever the athlete enters. |
| `verificationScreenshotUrl` | Text | Nullable. Wix Media Manager URL. Exposed only to a confirmed team partner post-acceptance, mirroring migration `0022`'s fraud-prevention change — never to the wider platform. |
| `guidelinesAcceptedAt` | Date/Time | |
| `guardianConsentAt` | Date/Time | Nullable. |
| `suspended` | Boolean | |
| `suspendedReason` | Text | Nullable. |
| `scrubbed` | Boolean | True once the 3-strike scrub has run (see Backend logic). |

**Fields intentionally left out of this collection**, matching the native
schema's actual security model:
- No plain "is this member an admin" flag — moderation status changes happen
  through the same manual-review pattern the native app uses (a human flips
  `status`/`suspended` directly in the Content Manager, no admin app needed
  in v1 here either, matching `supabase/RUNBOOK.md`'s documented manual
  process).

---

### `SteerMeProducerProfiles`
Mirrors `producer_profiles`.

| Field | Type | Notes |
|---|---|---|
| `memberId` | Text | |
| `orgName` | Text | |
| `contactName` | Text | Nullable. |
| `contactInfo` | Text | Nullable. Never exposed except the verification-status badge (below). |
| `affiliation` | Text | Nullable. |
| `verificationDocUrl` | Text | Nullable. Never exposed — review-only, matching native app's `producer-docs` bucket (never public). |
| `verificationStatus` | Text | `"pending"` \| `"verified"` \| `"rejected"`. Reviewed by the client directly via the Wix dashboard (confirmed decision, see `SITE_RESTRUCTURE_DECISIONS.md`) — same "no admin app, manual review" pattern as the native app. |

A public-facing subset (just `orgName` + `verificationStatus`, mirroring the
native app's `public_producer_profiles` view) should be the *only* thing any
`getChapterContent`-style public read function ever returns — never the raw
collection.

---

### `SteerMeEvents`
Mirrors `events`.

| Field | Type | Notes |
|---|---|---|
| `producerId` | Text | |
| `name` | Text | |
| `eventDate` | Date/Time | |
| `location` | Text | Free text, matching native app (no geocoding — that's explicitly deferred there too, see `FUTURE_WORK.md`). |
| `entryFee` | Text | Free text (native app also stores this as text, not a number — entry-fee *processing* is a documented future feature there, not v1). |
| `description` | Text | Nullable. |
| `divisions` | Text | Store as a JSON-stringified array of numbers (e.g. `"[10.5, 12.5, 19]"`) — Wix Data doesn't have a native numeric-array field type as clean as Postgres's `numeric(3,1)[]`; parse/stringify at the backend boundary. Use `19` for Open, matching `OPEN_CAP` in `matching.ts` exactly — don't invent a separate "Open" sentinel. |
| `status` | Text | `"pending_review"` \| `"published"` \| `"removed"` — same values and same auto-publish-if-producer-already-verified logic as the native app's `auto_publish_event()` trigger, reimplemented in a Velo backend function (Wix Data has no trigger equivalent — do this in `createEvent()`'s own code). |
| `flierUrl` | Text | Nullable. Public read. |

---

### `SteerMeEventAttendance`
Mirrors `event_attendance`.

| Field | Type | Notes |
|---|---|---|
| `eventId` | Text | |
| `division` | Number | |
| `athleteId` | Text | |

No sensitive data — safe for broad authenticated read, matching the native
app's reasoning (rows only ever get displayed by joining back through the
*public* profile projection). Insert requires an active subscription + not
suspended, enforced in backend code (not by a Wix Data permission role, since
Wix Data's role system can't express "has an active subscription").

---

### `SteerMeNeedPosts`
Mirrors `need_posts` — the athlete-posted "I need a partner for this event"
listings, which supersede the plain classification calculator and the earlier
(deleted, in the native schema) `goat_roping_interest` table.

| Field | Type | Notes |
|---|---|---|
| `athleteId` | Text | |
| `isGoatRoping` | Boolean | |
| `division` | Number | Nullable — required unless `isGoatRoping` is true, same constraint logic as the native app (enforce in backend code, Wix Data has no CHECK-constraint equivalent). |
| `eventDate` | Date/Time | |
| `eventName` | Text | |
| `producerName` | Text | |
| `location` | Text | |
| `flierUrl` | Text | Nullable. Public read. |
| `facebookLink` | Text | Nullable. |
| `eventId` | Text | Nullable reference to `SteerMeEvents` — a pure cross-reference, same reasoning as native migration `0024`: keep `eventName`/`eventDate`/`producerName`/`location` always populated directly on the post regardless of linking, don't make every read depend on a join. |
| `visibility` | Text | `"everyone"` \| `"favorites"` \| `"selected"` |

---

### `SteerMeNeedPostVisibleTo`
Mirrors `need_post_visible_to` — only populated when a need post's
`visibility` is `"selected"`.

| Field | Type | Notes |
|---|---|---|
| `needPostId` | Text | |
| `athleteId` | Text | |

---

### `SteerMePartnerRequests`
Mirrors `partner_requests` — the core matching mechanism.

| Field | Type | Notes |
|---|---|---|
| `eventId` | Text | Nullable. |
| `needPostId` | Text | Nullable — traces a request back to the listing that prompted it, matching native migration `0020`. |
| `division` | Number | Nullable — required unless `isGoatRoping` (same as `SteerMeNeedPosts`). |
| `isGoatRoping` | Boolean | Denormalized from the linked need post at insert time, same reasoning as native migration `0021` (avoid a join on every render). |
| `requesterId` | Text | |
| `recipientId` | Text | |
| `status` | Text | `"pending"` \| `"pending_guardian"` \| `"accepted"` \| `"declined"` — **the initial status must be computed server-side** from the recipient's `isMinor` flag, exactly like the native app's `set_request_initial_status()` trigger — never trust a client-supplied status. |
| `respondedAt` | Date/Time | Nullable. |

**Dedup logic** (native app enforces via a unique index coalescing nulls to a
sentinel) needs to be a manual check-before-insert in the backend function
instead, since Wix Data doesn't support expression-based unique indexes:
query for an existing row matching `(requesterId, recipientId, division OR
isGoatRoping, eventId)` before inserting.

**Contact reveal**: build a `getRequestContact(requestId)` backend function
that mirrors the native app's `get_request_contact()` RPC exactly — only
returns `contact`/`guardianContact`/`verificationScreenshotUrl` for the two
parties of an *accepted* request, throws otherwise. This is the single most
important piece of trust & safety logic to port faithfully; don't
approximate it.

---

### `SteerMeEventRatings`
Mirrors `event_ratings`.

| Field | Type | Notes |
|---|---|---|
| `eventId` | Text | |
| `athleteId` | Text | |
| `stars` | Number | 1–5. |
| `review` | Text | Nullable. |

**Eligibility** (native app: one `BEFORE INSERT` trigger checking event date
has passed, within a 30-day window, and the athlete marked attending before
the event date) needs to be reimplemented as explicit checks at the top of
the `submitEventRating()` backend function — same three rules, same error
messages where practical.

A `getEventRatingSummary(eventId)` backend function should mirror the native
app's `event_rating_summary` view: average stars, but only surfaced once
`ratingCount >= 3` (hide the average below that threshold, matching Producer
Guidelines §3).

---

### `SteerMeEventReports` and `SteerMeUserReports`
Mirror `event_reports` and `user_reports` — kept as two separate collections,
matching the native app's split (accuracy/fraud on a listing vs. personal
conduct feeding the 3-strike system).

**`SteerMeEventReports`**

| Field | Type | Notes |
|---|---|---|
| `eventId` | Text | |
| `reporterId` | Text | |
| `offense` | Text | |
| `description` | Text | |
| `status` | Text | `"open"` \| `"confirmed"` \| `"dismissed"` |
| `priority` | Text | Default `"high"`. |

**`SteerMeUserReports`**

| Field | Type | Notes |
|---|---|---|
| `targetUserId` | Text | |
| `reporterId` | Text | |
| `offense` | Text | Exact match on `"Soliciting a minor"` triggers immediate suspension — see Backend logic. |
| `description` | Text | |
| `contentRef` | Text | Nullable. |
| `status` | Text | `"open"` \| `"confirmed"` \| `"dismissed"` |

**Backend logic to port faithfully** (native app: two Postgres triggers):
1. On insert, if `offense === 'Soliciting a minor'`, immediately set the
   target's `suspended = true` — independent of confirmation count, matching
   the native app's reasoning (evidence preservation takes priority over
   waiting for human review).
2. On status update to `"confirmed"`, count the target's total confirmed
   reports; on the 3rd, scrub (null out `contact`, `guardianContact`,
   `guardianName`, `globalMembershipId`, `globalClassification`,
   `verificationScreenshotUrl`, `avatarUrl`, set `fullName = "Deleted user"`,
   `scrubbed = true`, `suspended = true`). Keep `homeArea`/`position` —
   harmless, and other members' accepted-request history may still reference
   them.

---

### `SteerMeBlocks`
Mirrors `blocks`. One-directional storage, enforced-mutual for
matching/visibility purposes.

| Field | Type | Notes |
|---|---|---|
| `blockerId` | Text | |
| `blockedId` | Text | |

`isBlockedPair(a, b)` backend helper — checks both directions, matching the
native app's `is_blocked_pair()`. Every place that surfaces another member
(Browse, need post feed, request notifications) must call this before
including a row, the same way the native app's `public_profiles` view
filters at the view level.

---

### `SteerMeFavorites`
Mirrors `favorites`. One-directional.

| Field | Type | Notes |
|---|---|---|
| `userId` | Text | |
| `favoriteId` | Text | |

---

### `SteerMeSubscriptions`
**This is where the platforms genuinely diverge — see "Where this has to
differ" below.** Conceptually mirrors `subscriptions`, but the actual
entitlement source is different by necessity (Wix Pricing Plans or
Stripe-via-Velo, not RevenueCat/Apple/Google IAP — platform decision already
made in `HANDOFF_BRIEF.md`).

| Field | Type | Notes |
|---|---|---|
| `memberId` | Text | |
| `entitlementActive` | Boolean | |
| `planId` | Text | Nullable — whichever Wix Pricing Plan or Stripe price ID applies. |
| `expiresAt` | Date/Time | Nullable. |

Every place the native app calls `has_active_subscription(uid)` needs a
matching `hasActiveSubscription(memberId)` backend helper here — same
semantics (posting a need, sending a request, marking event attendance, and
goat-roping/need-post insert are all subscription-gated, per the native
app's RLS policies).

---

## Where this has to differ from the native app (don't paper over these)

1. **Auth identity**: `memberId` (Wix Members Area) instead of Supabase
   `auth.uid()`. These are different ID spaces — a future real merge would
   need an explicit mapping table or a decision to migrate one system's IDs
   into the other, not assumed away.
2. **Subscription/entitlement source**: Wix Pricing Plans or Stripe, not
   RevenueCat + Apple/Google IAP. `hasActiveSubscription()` needs its own
   real implementation here, not a port of the native app's version.
3. **Row-level security**: Wix Data Collections don't have Postgres RLS.
   Every access rule the native app enforces via an RLS policy (owner-only
   read, "only if not suspended," "only if accepted request," etc.) has to
   be enforced explicitly in Velo backend function code instead — see
   `docs/ARCHITECTURE.md`'s notes on the `elevate()` situation, since these
   collections should be Admin-locked at the data layer the same way the
   coaching course's collections are, with backend functions as the sole
   gatekeeper.
4. **No triggers, no CHECK constraints, no expression-based unique
   indexes.** Every piece of "the database enforces this automatically"
   logic in the migrations above (auto-publish, initial request status,
   rating eligibility, report-confirmation scrubbing, dedup) has to become
   explicit imperative code in the corresponding Velo backend function.
   Flagged individually above per collection, but worth saying once,
   plainly: this is the single biggest porting risk — it's easy to miss one
   of these on a first pass and only notice when someone hits the missing
   check in production. Test each one against the same scenario the native
   app's migration comment describes.
5. **Storage/media**: Wix Media Manager instead of Supabase Storage buckets.
   The *shape* of the access rules (owner-only for verification screenshots
   and producer docs, public read for avatars/fliers, matched-partner read
   for verification screenshots post-acceptance) should still be replicated
   — exact mechanism will differ (Wix Media Manager's own permission model,
   or gating access through a backend function that returns a signed/
   time-limited URL rather than a permanently-public one).

## Not designed yet / explicitly out of scope for this pass

- Goat roping's own division-less matching path exists in the model above
  (`isGoatRoping` flags) but the actual matching/browse UI logic isn't
  designed here — that's part of task #18 (the responsive web build), not
  this data-model pass.
- Real-time/push notifications for new requests, acceptances, etc. — the
  native app's mobile-push story doesn't have a web equivalent designed yet.
- Map view / geocoding — explicitly deferred in the native app too (see
  `FUTURE_WORK.md`), no reason to build it here first.
- Entry-fee payment / `header_id`/`heeler_id` role declaration — explicitly
  future-dated in the native app's own `FUTURE_WORK.md`, not v1 scope
  anywhere.
