# Draw Pro — Data Model (Wix Collections)

Scope: Team Roping only (v1). Calf roping / rough stock (single-entrant + livestock draw) deferred.

Draw Pro is standalone with its own collections. When a producer opts in ("export
entrants to Draw Pro"), Steer Me data is **synced into** these collections rather than
queried live cross-product — keeps Draw Pro's draw logic self-contained and working
even if an event has no Steer Me linkage at all.

> **Fee model interpretation note:** the producer's pricing example ("draw 3 for
> $160... $320 enters you six times, up to a $640/12-entry cap") works out to a
> constant $53.33 per entry scaled linearly, confirmed against two real fliers.
> This data model implements pricing as a single **price-per-entry** set per
> class (see `DrawProEventClasses` below), with total fee =
> `pricePerEntry × requestedEntryCount`, capped at that class's `maxEntriesPerEntrant`.

> **Revision history note (2026-07-21):** sections 1 and 2 below were substantially
> restructured after reviewing two real event fliers (a large-association WSTR
> qualifier and a small independent jackpot series) against the original single-cap,
> single-price, one-entry-type-per-record design. See `docs/ARCHITECTURE.md` for the
> full decision record and reasoning. Summary of what changed: one `DrawProEvents`
> record is now a **shell covering an entire multi-class event/day/weekend**
> (confirmed explicitly — a flier listing 5+ different cap classes across 3 days is
> still "one event" from the producer's and entrant's point of view), with a new
> `DrawProEventClasses` child collection carrying everything that varies **per
> roping** (cap, price, entry rules, timing). `DrawProEntrants` also changed to
> support one person mixing pre-formed-team and draw-in entries within their own
> allowed count, instead of one entry-type applying to all of a person's entries.

---

## 1. `DrawProEvents`

One record per event **day/weekend/series** a producer runs through Draw Pro —
a lightweight shell. All the roping-specific detail (cap, price, entry rules,
timing) lives one level down on `DrawProEventClasses`, since real fliers
routinely bundle several differently-capped ropings (e.g. a #7.5, #8.5, and
#9.5 across one weekend) under what is still, structurally and in the
producer's own words, "one event" with one shared entry link.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `title` | text | |
| `location` | text | Town/city, e.g. "Hallettsville, TX" — free text but backed by a type-ahead against the same ~32,000-town dataset Steer Me's home_area autocomplete uses (see `backend/locationSearch.jsw`). Required, same as title. Combines with title for the on-page confirmation display, e.g. "Saturday Jackpot - Hallettsville, TX". **Distinct from `eventSite` below** — this is the town, not the venue itself; the two were conflated in this field's original description until the split was added 2026-07-23 |
| `eventSite` | text (nullable) | **NEW, added 2026-07-23.** The actual venue, e.g. "Circle T Arena" — separate from `location` (the town). Free text, backed by a type-ahead against `DrawProVenues` (see below), a shared cross-producer venue list. Not yet hard-required, though in practice every real event has one |
| `eventSiteLink` | text (nullable) | **NEW, added 2026-07-23.** The venue's booking page (often an openstalls.com listing) or a phone number if that's all a flier has — lets an entrant reserve RV/stall spots without leaving Draw Pro. Auto-fills when a venue suggestion from `DrawProVenues` is picked, but stays independently free-typeable |
| `producerId` | reference → Wix Members | Owner of the event |
| `eventDate` | date/time | Start date of the event/weekend — individual classes carry their own more precise timing |
| `preEntryEnabled` | boolean | |
| `requiredEntryFields` | array of text | Producer-configurable fields beyond the mandatory set. Kept at the event (not class) level — no evidence from real fliers that extra fields vary by class, revisit if that turns out wrong |
| `listOnSteerMe` | boolean | **NEW, added 2026-07-22.** Defaults `true` (opt-out, not opt-in) — whether this event cross-posts a companion listing to Steer Me. See `backend/steerMeSync.jsw` |
| `steerMeEventId` | text (nullable) | Set only if producer opted into export — not yet actually populated by real sync code (steerMeSync.jsw doesn't read back Steer Me's generated id yet), but the field is real and ready for that |
| `paymentMethod` | text (enum) | `cash` \| `online` — assumed to apply to the whole event, not per class (no evidence a producer splits payment method by roping). See `DrawProProducerPayoutProfiles` for the `online` path |
| `qrCodeUrl` | text (nullable) | Cached QR image URL pointing at this event's **shared** entry page (one link for the whole event; entrant picks which class from a dropdown — see `DrawProEventClasses`) — generated once, reused on fliers |
| `qrCodeGeneratedDate` | date/time (nullable) | |
| `sourceFlierImageUrl` | text (nullable) | Set when the event was created via flier upload — see "Flier scan-and-review" below |
| `createdDate` / `updatedDate` | date/time | Wix-managed |

**Flier scan-and-review (Producer Event Setup, planned):** confirmed decision —
Producer Event Setup is designed from the start around uploading a flier image,
having AI draft the event + full `DrawProEventClasses` breakdown against this
schema, and requiring the producer to review/correct every field before
anything publishes. Not a manual-first form with scanning added later. Manual
entry stays available for producers without a flier or building one from
scratch, but scan-and-review is the primary intended path. Same trust pattern
already used for scanned entrant cards (`scanVerified`, `rawOcrText`,
`ocrConfidence` below) — AI drafts, a human confirms, never auto-published
unreviewed. Not yet built — this is a design commitment for when Page 2 starts,
not implemented code.

---

## 1.5. `DrawProVenues`

**NEW, added 2026-07-23.** Shared, cross-producer list of physical venues,
populated automatically (not hand-seeded) via `backend/venues.jsw`'s
`recordVenueUsage()`, called fire-and-forget from `createEvent()` every
time an event is created. Deliberately shared across every producer, not
scoped per-producer — venue names and booking links aren't private, and
the whole point is that the second producer who ever runs something at a
given arena benefits from the first producer having already found and
saved its booking link. Confirmed decision 2026-07-23.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `name` | text | e.g. "Circle T Arena" — matched case-insensitively by `recordVenueUsage()` so "circle t arena" and "Circle T Arena" collapse to one record |
| `location` | text (nullable) | Town/city this venue is in — copied from whichever event most recently referenced it |
| `link` | text (nullable) | Booking page (often openstalls.com) or phone number. Once set, later events referencing this venue without a link do NOT blank it out — see `recordVenueUsage()`'s merge logic |
| `timesUsed` | number | Incremented each time an event references this venue. Suggestions are ranked by this, most-used first |
| `lastUsedDate` | date/time | |

---

## 2. `DrawProEventClasses`

One record per individual roping/class within an event (the "#7.5", "#8.5,"
"#12.5 Heartland," etc. on a real flier). This is where cap rules, pricing,
entry-type restrictions, and timing actually live — confirmed by real fliers
showing different classes in the same event with different prices ($200 vs
$250/roper on the same day), different cap rules, and independently,
manually-closed books.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `eventId` | reference → DrawProEvents | |
| `label` | text | e.g. `"7.5"`, `"12.5 Heartland"` — the human-facing class name shown in the entrant's class-selection dropdown |
| `capNumber` | number | Combined header + heeler classification ceiling, e.g. 11.5. **Required** |
| `heelerSubCap` | number (nullable) | Additional constraint *on top of* `capNumber`, not instead of it — e.g. an "#11.5 WSTR... #7.5 heeler cap" flier listing means combined ≤ 11.5 **and** heeler's own number ≤ 7.5. Confirmed via real flier + direct correction — this is not a second cap mode, it's a second simultaneous check |
| `incentiveCapNumber` (nullable) | number | **Display/tracking only — never gates entry.** Real mechanic: a flier can offer a handicap "incentive" within a class, e.g. "9.5 event w/ an 8.5 incentive" — `capNumber` (9.5) is still the real, only entry-eligibility cap; this second number just identifies which already-entered teams qualify for a time bonus the producer applies manually on draw day. Explicitly confirmed out of scope for any entry validation or fee logic — Draw Pro's only involvement is computing `DrawProTeams.qualifiesForIncentive` (below) so the producer's draw-sheet review can visually shade/highlight qualifying teams, making the producer's own manual time-tracking easier. Everything about actually tracking times/winners/payouts stays the producer's own process, off-platform |
| `minHeaderNumberToDrawIn` / `minHeelerNumberToDrawIn` | number (nullable, each) | Floor on an entrant's own classification number to be eligible for **blind draw-in** specifically (not pre-formed teams) — e.g. "must be at least 6HD/7HL to draw in." Used by smaller fields to keep the blind-draw pool competitive rather than diluted by lower-numbered ropers who'll miss more. Confirmed present on some real classes, absent on most — legitimately optional, not always set |
| `entryModeAllowed` | text (enum) | `pick_or_draw` \| `pick_only` \| `draw_only` — confirmed class-level rule (e.g. a flier's Heartland listing says "pick only," no blind draw-in allowed for that class at all) |
| `maxEntriesPerEntrant` | number | Producer-set ceiling on how many times one person may enter this class, in any combination of pre-formed and draw-in (see `DrawProEntrants.submissionGroupId` below). Confirmed real numbers on fliers scale linearly with price (e.g. $160/3 entries up to $640/12 entries → max 12) |
| `pricePerEntry` | number | Dollar cost of a single **draw-in** entry base rate |
| `pricePerPreformedTeamEntry` | number (nullable) | Optional lower rate for a **pre-formed team** entry (billed once per team, not per person). Defaults to `pricePerEntry` if not set |
| `drawInSurchargeFee` | number (nullable) | Extra per-roper fee added on top of `pricePerEntry`, charged **only** to draw-in entries, not pre-formed. Confirmed real mechanic ("draw in fee: xtra $40/roper") — see the Steer Me incentive note below for why it exists |
| `entryOpenDateTime` | date/time | |
| `entryCloseMode` | text (enum) | `time` \| `teamCount` \| `manual` — automatic modes stay available per class, but a producer can always manually close early regardless of mode (confirmed decision: cross-class timing dependencies like "closes after round 3 of the #7" are handled by producer judgment, not automated round-tracking, which doesn't exist anywhere in this design) |
| `entryCloseDateTime` | date/time (nullable) | Used if `entryCloseMode = time` |
| `entryCloseTeamCount` | number (nullable) | Used if `entryCloseMode = teamCount` |
| `rotationSuggestionThreshold` (nullable) | number | **NEW, added 2026-07-23.** Set at class creation (Producer Event Setup) — "how big a field should nudge me about splitting into rotations at all," defaults to 300 if not set. Deliberately NOT the rotation size itself, which can't be sensibly judged before entries even open — see `rotationSize` below |
| `rotationSize` (nullable) | number | **NEW, added 2026-07-23.** The actual teams-per-rotation, set later via `setClassRotationSize()` on Producer Draw Sheet Review once entries are closed and the real field size is known (real confirmed scenario: single classes with 200-500+ teams, sometimes run across multiple arenas). Purely a display/pacing label computed at read time over the SAME static draw order (`matching-engine.jsw`'s output) — not stored per-team, not dynamic, and does not track catches, advancement, buy-backs, or results. That stays the producer's own manual, in-arena process, same established boundary as `incentiveCapNumber` above. See `producer-draw-sheet-review.js`'s `assignRotations()` |
| `status` | text (enum) | `draft` \| `open` \| `closed` \| `finalized` \| `drawn` \| `notified` — moved from the event level; each class runs its own draw independently |
| `createdDate` / `updatedDate` | date/time | Wix-managed |

**Status lifecycle:** `draft` → `open` → `closed` (entries stopped, draw sheet locked for review) → `finalized` (producer reviewed) → `drawn` (algorithm executed) → `notified` (emails sent). Runs independently per class.

> **Steer Me migration incentive, built structurally rather than as a banner ad:**
> - **Entrant side:** a pre-formed team is billed once per team; two solo draw-ins
>   are billed individually, and draw-ins can carry their own `drawInSurchargeFee`
>   on top. That fee isn't arbitrary — in an unbalanced draw pool the matching
>   algorithm sometimes has to give an entrant more actual runs than they
>   requested/paid for just to get everyone matched (the entrant owes nothing extra
>   for those forced "bonus" runs; the producer absorbs the cost). A pre-formed team
>   never creates that imbalance, since nobody's waiting to be paired.
> - **Producer side:** the cash-event execution charge (see
>   `DrawProExecutionCharges` below) only counts teams the matching *algorithm*
>   actually paired — pre-formed teams did no computational work and don't count
>   toward the producer's billable total.
>
> Both incentives point the same direction without needing Draw Pro to editorialize
> about it in the UI — the pricing itself does the nudging.

---

## 3. `DrawProEntrants`

One record per **entry unit** — not strictly one record per person. A single
person can generate multiple records under one submission if they mix
pre-formed-team and draw-in entries within their allowed count (confirmed real
scenario: someone entering 3x who has one known partner and wants to draw in
for the other two). Both scanned-card and self-entry paths write here.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `eventId` | reference → DrawProEvents | |
| `classId` | reference → DrawProEventClasses | Which roping this entry belongs to — new field, required |
| `submissionGroupId` | text | Groups every `DrawProEntrants` record created from one person's one form submission — e.g. one `preformed_team` record plus one `solo` record with `requestedEntryCount: 2` share the same value. Used so billing/confirmation/notification treat a mixed submission as one coherent transaction even though it's structurally several pool-eligible records |
| `firstName` / `lastName` | text | |
| `classificationNumber` | number | **Required.** e.g. 4.5 — the entrant's own personal number, unrelated to which class/roping they're entering |
| `globalMembershipId` | text (nullable) | Optional — not all producers require it |
| `email` | text | **Required in v1** (notification channel) |
| `phone` | text (nullable) | Collected now, unused until SMS ships |
| `role` | text (enum) | `header` \| `heeler` |
| `entryType` | text (enum) | `solo` \| `preformed_team` |
| `teamPartnerEntrantId` | reference → DrawProEntrants (nullable) | Set if `entryType = preformed_team` and the partner's full info was provided; mutual on both records |
| `partnerEmailOnly` | text (nullable) | Set instead of `teamPartnerEntrantId` when the entering person only supplied their partner's email — see "Lightweight team entry" below |
| `partnerInviteStatus` | text (enum, nullable) | `not_sent` \| `sent` \| `claimed` — tracks the partner-invite email for a `partnerEmailOnly` entry |
| `isGuestEntry` | boolean | True if entered without a RopingTools account |
| `guestContactHash` | text (nullable) | Hashed email/phone, used to enforce the guest-entry rate cap across events |
| `source` | text (enum) | `scanned_card` \| `self_entry` |
| `scanVerified` | boolean | Only relevant for `scanned_card` — true once office staff confirms OCR read |
| `rawOcrText` | text (nullable) | Full unparsed OCR output — kept for staff reference during verification |
| `ocrConfidence` | number (nullable) | 0–1 confidence score returned by the OCR provider, lowest of the parsed fields |
| `sourceImageUrl` | text (nullable) | Wix Media Manager URL of the scanned card, kept for audit/dispute purposes |
| `requiresManualContact` | boolean | True if a scanned entrant was verified with no email — producer must contact them outside the app |
| `requestedEntryCount` | number | For a `solo` record: how many draw-in slots this represents (the matching engine must expand this into that many separate poolable slots — not yet implemented, see the open gap below). For a `preformed_team` record: effectively always 1 in practice, since a distinct partner needs its own record — default 1 |
| `feeOwed` | number | Computed from the owning class's `pricePerEntry`/`pricePerPreformedTeamEntry`/`drawInSurchargeFee` × `requestedEntryCount` at entry time — snapshotted so a later price change doesn't retroactively alter what's owed. Never recalculated off actual-assigned-run-count (see the "extra runs" note above) |
| `isFeeResponsible` | boolean | For `preformed_team` entries: true for whichever entrant submitted/owns payment, false for their partner. Always true for `solo` entries — see "Fee responsibility" below |
| `paymentStatus` | text (enum) | `unpaid` \| `pending_cash` \| `paid` |
| `paymentReferenceNumber` | text (nullable) | Shown to the entrant once paid — set for both cash (producer-confirmed) and online (provider-confirmed) payments |
| `entryTimestamp` | date/time | |

**Guest cap enforcement:** query `guestContactHash` across all events within the rolling window (frequency still TBD) before allowing a new guest entry.

**Fee responsibility (pre-formed teams):** Draw Pro does not split or track who-owes-whom within a team — one fee is owed per team, and whichever entrant completes the entry flow is `isFeeResponsible = true`; the partner's record carries the same `feeOwed`/`paymentStatus` for visibility but isn't separately billed. Splitting the cost is between the two entrants, outside the platform. This doesn't apply to `solo` entries, since the drawing algorithm — not the entrant — decides who their partner ends up being, so each solo entry is individually priced and paid.

**Lightweight team entry:** when submitting a pre-formed team entry, the entering person can supply just their partner's **email** (`partnerEmailOnly`) instead of the partner's full info. Draw Pro emails that address inviting them to view/claim the entry — this both lowers friction for the entering contestant and surfaces RopingTools to someone who may not have an account yet. `teamPartnerEntrantId` remains null until/unless the partner claims the invite and their own entrant record is created and linked.

**Mixed pre-formed + draw-in entries (confirmed real scenario):** one person entering a class 3x, with one known partner and two draw-in slots, submits as: one `preformed_team` record (`requestedEntryCount: 1`, `teamPartnerEntrantId` or `partnerEmailOnly` set) plus one `solo` record (`requestedEntryCount: 2`), both sharing the same `submissionGroupId`. Validation must sum every record under one `submissionGroupId` + `classId` against that class's `maxEntriesPerEntrant`, not validate each record in isolation.

> **Open gap, not yet implemented — flagging rather than letting it go unnoticed:**
> `matching-engine.jsw`'s current draw algorithm pools "solo headers and solo
> heelers" as if every `DrawProEntrants` record is exactly one poolable slot. It
> has no logic to expand a `solo` record with `requestedEntryCount: 2` into two
> separate matchable slots. This needs to be built — the algorithm must treat each
> unit of `requestedEntryCount` as independently poolable (still respecting the
> existing 10-team minimum-spacing rule across an entrant's own multiple slots,
> not just across different entrants) — before multi-entry draw-in actually works
> correctly. Not yet touched in code; this is a known prerequisite for the mixed-
> entry model above, not something silently assumed to already work.

---

## 4. `DrawProTeams`

Created at draw time (or immediately at entry time for pre-formed teams).
Scoped to a class, not just an event — a #7.5 team and a #9.5 team on the same
day are entirely separate draws with separate run orders.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `eventId` | reference → DrawProEvents | |
| `classId` | reference → DrawProEventClasses | New field — which roping this team belongs to |
| `teamNumber` | number | Run-order position **within this class** — the number entrants are notified of |
| `headerEntrantId` | reference → DrawProEntrants | |
| `heelerEntrantId` | reference → DrawProEntrants | |
| `preFormed` | boolean | True = entered together, skipped matching |
| `manualOverride` | boolean | True if producer hand-paired this team |
| `overrideAcknowledgedBy` | reference → Wix Members (nullable) | Producer who acknowledged the override prompt |
| `overrideTimestamp` | date/time (nullable) | |
| `spacingFlagged` | boolean | True if this team couldn't satisfy the 10-team minimum gap |
| `spacingConflictDetail` | text (nullable) | Which entrant(s) and how close |
| `spacingAcknowledged` | boolean | True once a producer has explicitly acknowledged a flagged conflict has no available fix |
| `spacingAcknowledgedBy` | reference → Wix Members (nullable) | |
| `spacingAcknowledgedTimestamp` | date/time (nullable) | |
| `qualifiesForIncentive` | boolean (nullable) | True if this team's combined classification number is ≤ the class's `incentiveCapNumber` (null if the class doesn't define one). Computed once at team-creation time in `matching-engine.jsw`'s `executeDraw`, for both drawn and pre-formed teams alike. Display-only — used by the producer's draw-sheet review to visually shade/highlight qualifying teams; doesn't affect the draw, matching, or fees in any way |

Payment status for a team is derived at display time from its two entrants'
`paymentStatus` (both solo entrants must individually show `paid`; a pre-formed
team is "paid" once its fee-responsible entrant does) rather than duplicated onto
the team record itself.

---

## 5. `DrawProDrawSheets`

One record per **class**, not per event, tracking the finalize → signoff →
draw → notify pipeline — each roping runs this pipeline independently, since
one class can close/draw/notify while a sibling class in the same event is
still open for entries.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `eventId` | reference → DrawProEvents | |
| `classId` | reference → DrawProEventClasses | New field |
| `status` | text (enum) | `building` \| `pending_signoff` \| `signed_off` \| `drawn` \| `notifications_sent` |
| `finalizedTimestamp` | date/time (nullable) | When entries closed and sheet locked for review |
| `producerSignoffUserId` | reference → Wix Members (nullable) | |
| `producerSignoffTimestamp` | date/time (nullable) | |
| `unmatchedEntrantIds` | array of reference (nullable) | Entrants the algorithm couldn't pair — needs manual resolution |
| `drawnTimestamp` | date/time (nullable) | When the algorithm actually executed the draw |

**Cash-payment interaction:** per the "not final until funds are received prior to
closing of the books" rule, `finalizeDrawSheet` should be blocked (or at minimum
warn the producer) if any entrant's `paymentStatus` is still `pending_cash` at
close — see `payments.jsw`.

---

## 6. `DrawProNotificationLog`

Per-entrant delivery record. One row per notification attempt.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `eventId` | reference → DrawProEvents | |
| `entrantId` | reference → DrawProEntrants | |
| `teamId` | reference → DrawProTeams | |
| `channel` | text (enum) | `email` (v1 only) |
| `status` | text (enum) | `queued` \| `sent` \| `delivered` \| `bounced` \| `manual_contact_needed` |
| `providerMessageId` | text (nullable) | ID returned by the email provider, for tracing |
| `sentTimestamp` | date/time (nullable) | |
| `errorDetail` | text (nullable) | |

---

## 7. `DrawProAuditLog`

Accountability log — every manual override and every attempted cap violation, per your requirement that both be tracked.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `eventId` | reference → DrawProEvents | |
| `classId` | reference → DrawProEventClasses (nullable) | New field — set when the action is scoped to a specific class (most cap/spacing actions are); null for event-level actions |
| `actionType` | text (enum) | `manual_pairing` \| `cap_violation_attempt` \| `spacing_conflict_flagged` \| `payment_recorded` |
| `performedByUserId` | reference → Wix Members | |
| `timestamp` | date/time | |
| `detail` | text | Human-readable description (entrant names, numbers involved, why) |

---

## 8. `DrawProEntryAlerts`

Captures "notify me when entries open" signups — reached via the QR-code entry link when a producer's event hasn't opened yet. Doubles as a lead source: same mechanic as the `/drawpro` coming-soon page's email capture, but tied to a specific event instead of the product launch generally, and from a visitor who's already shown real intent (scanned a flier for a specific roping).

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `eventId` | reference → DrawProEvents | |
| `email` | text | |
| `createdDate` | date/time | |
| `notified` | boolean | True once the open-alert email has been sent |
| `notifiedTimestamp` | date/time (nullable) | |
| `convertedToAccount` | boolean (nullable) | Optional — set true if this email later creates a RopingTools account, for measuring how well this channel converts to real subscribers |

---

## 8.5. `DrawProProducerProfiles`

**NEW, added 2026-07-23.** A producer's org-facing identity within Draw
Pro - genuinely missing until now. Producers had no identity beyond
their raw Wix Member account (whatever name/email Wix's built-in Members
Area collects at generic sign-up). Deliberately a SEPARATE, standalone
concept from Steer Me's own `producer_profiles` (Supabase) - Draw Pro
and Steer Me already use three independent login systems by design (see
`docs/ARCHITECTURE.md`), and Draw Pro is meant to work standalone
without requiring a Steer Me account. Once set up, `organizationName`
flows into `backend/steerMeSync.jsw`'s `external_producer_name` field,
fixing a real gap where every Draw-Pro-sourced event on Steer Me showed
no producer name at all (fell back to a generic "Posted via Draw Pro"
label).

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `producerId` | text | A plain Wix Member ID string, not a Reference field - matches the pattern already used elsewhere in this schema |
| `organizationName` | text | Required - the only required field on this profile |
| `contactEmail` | text (nullable) | |
| `contactPhone` | text (nullable) | |
| `logoUrl` | text (nullable) | A plain URL field for now, not a real image upload component - upgrading to one is a reasonable future enhancement, not done in this first pass |
| `createdDate` / `updatedDate` | date/time | Wix-managed |

---

## 9. `DrawProProducerPayoutProfiles`

One record per producer, not per event — set up once at the profile level so it
doesn't need repeating for every event that uses online payment collection.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `producerId` | reference → Wix Members (unique) | |
| `payoutProvider` | text | e.g. `stripe` — placeholder pending which processor is chosen |
| `payoutAccountId` | text (nullable) | The connected-account ID on the provider's side (e.g. a Stripe Connect account) |
| `onboardingStatus` | text (enum) | `not_started` \| `pending` \| `complete` — a producer can't select `paymentMethod: online` on an event until this is `complete` |
| `payoutContactEmail` | text | |
| `createdDate` / `updatedDate` | date/time | |

---

## 10. `DrawProPayments`

Financial transaction log — one row per fee collected, whether cash or online.
Kept separate from `DrawProEntrants` so there's a clean audit trail independent of
entrant record edits.

> **Revenue rule (as decided):** the two payment methods are mutually exclusive
> revenue paths, not stackable. **Online** — Draw Pro's cut and the processor's cut
> are charged *on top of* the entrant's fee, itemized and paid by the entrant; the
> producer receives the full, undiminished `pricePerEntry × count`. No separate
> draw-execution charge applies to that event. **Cash** — the entrant pays only the
> producer's stated fee, nothing added; Draw Pro is instead paid by the *producer*
> via the execution fee (`DrawProExecutionCharges` / `DrawProProducerSubscriptions`
> below), since no money ever passes through the platform to take a cut of.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `eventId` | reference → DrawProEvents | |
| `entrantId` | reference → DrawProEntrants | The fee-responsible entrant (see `isFeeResponsible`) |
| `producerAmount` | number | The producer's own stated fee (`class.pricePerEntry × count`, plus `class.drawInSurchargeFee × count` if applicable) — what the producer receives |
| `drawProFee` | number (nullable) | Platform cut — `online` only; always null for `cash` |
| `processingFee` | number (nullable) | Payment processor's cut — `online` only; always null for `cash` |
| `totalChargedToEntrant` | number | `producerAmount` for cash; `producerAmount + drawProFee + processingFee` for online |
| `netToProducer` | number | Always equals `producerAmount` — the producer never absorbs Draw Pro's or the processor's cut, on either method |
| `method` | text (enum) | `cash` \| `online` |
| `referenceNumber` | text | Shown to the entrant as their confirmation — generated for both methods |
| `providerTransactionId` | text (nullable) | Payment processor's own transaction ID, `online` only |
| `status` | text (enum) | `pending` \| `completed` \| `failed` \| `refunded` |
| `timestamp` | date/time | |

---

## 11. `DrawProProducerSubscriptions`

Optional annual plan a producer can hold, covering their **cash-method** events'
execution fees (online events never generate an execution charge — see above).
One record per producer.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `producerId` | reference → Wix Members (unique) | |
| `status` | text (enum) | `inactive` \| `active` \| `expired` |
| `annualFee` | number (nullable) | Snapshotted at signup — placeholder amount, not yet set |
| `startDate` / `renewalDate` | date/time (nullable) | |

---

## 12. `DrawProExecutionCharges`

One row per **cash-method class** once its draw executes — the mechanism that
closes the "Draw Pro is out of the loop on cash events" gap. Only created for
events with `paymentMethod: cash`; online events never touch this collection.
Scoped to a class, not the whole event, since each class draws (and so incurs
this charge) independently.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `eventId` | reference → DrawProEvents | |
| `classId` | reference → DrawProEventClasses | New field |
| `producerId` | reference → Wix Members | |
| `teamCount` | number | Total teams in the executed draw, including pre-formed |
| `matchedTeamCount` | number | Teams the algorithm actually paired — **excludes pre-formed teams**, since they required no matching work. This is the base the free threshold and rate apply to, not `teamCount` |
| `freeThreshold` | number | Team-count threshold under which no charge applies — placeholder value, not yet set |
| `billableTeamCount` | number | `max(0, matchedTeamCount − freeThreshold)` |
| `perTeamRate` | number (nullable) | Placeholder e.g. $0.50/team — null if `coveredBySubscription` |
| `coveredBySubscription` | boolean | True if the producer held an active `DrawProProducerSubscriptions` record at draw time |
| `amountDue` | number | `0` if `coveredBySubscription` or under the free threshold; otherwise `billableTeamCount × perTeamRate` |
| `status` | text (enum) | `no_charge` \| `pending` \| `invoiced` \| `paid` |
| `timestamp` | date/time | |

> **Open gap, flagged rather than assumed:** actually *collecting* this charge from
> the producer needs its own billing mechanism — a stored payment method on the
> producer's account for being charged (distinct from `DrawProProducerPayoutProfiles`,
> which is for the producer *receiving* money, the opposite direction). That flow
> isn't built yet; this collection currently only calculates and logs what's owed.

---

## 13. `DrawProOnboardingStatus`

Tracks whether a logged-in user has seen/dismissed the first-time guided tour on
each side of the product, so it doesn't reappear once completed and can be
explicitly replayed on request. Guests (entrants without an account) aren't
tracked here at all — see the note below.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `userId` | reference → Wix Members | |
| `surface` | text (enum) | `producer` \| `entrant` — a member could plausibly need both if they're also a producer |
| `completed` | boolean | True once they finished every step |
| `dismissed` | boolean | True if they skipped out early — treated the same as completed for "don't show again" purposes, tracked separately only so a future analytics pass can tell the two apart |
| `lastUpdated` | date/time | |

> **Guest entrants:** most first-time entrants aren't logged in. For them, "seen
> the tour" is tracked client-side only (browser local storage, per device) rather
> than in this collection — there's no durable identity to attach it to until they
> create an account. This means a guest could see the tour again on a different
> device; that's an accepted tradeoff, not an oversight.

---

## Relationships at a glance

```
DrawProEvents       (1) ──< DrawProEventClasses (many — the individual ropings within one event/day/weekend)
DrawProEventClasses (1) ──< DrawProEntrants (many)
DrawProEventClasses (1) ──< DrawProTeams (many)
DrawProEventClasses (1) ──1 DrawProDrawSheets (one active sheet per class, not per event)
DrawProTeams        (1) ──< DrawProNotificationLog (2 rows per team: header + heeler)
DrawProEvents       (1) ──< DrawProAuditLog (many, optionally scoped to a class)
DrawProEvents       (1) ──< DrawProEntryAlerts (many — one shared alert list per event, not per class)
DrawProEvents       (1) ──< DrawProPayments (many)
Wix Members         (1) ──1 DrawProProducerPayoutProfiles (one profile per producer)
Wix Members         (1) ──1 DrawProProducerSubscriptions (one subscription record per producer)
DrawProEventClasses (1) ──1 DrawProExecutionCharges (one charge per cash-method class, at draw time)
```
