# Draw Pro — Data Model (Wix Collections)

Scope: Team Roping only (v1). Calf roping / rough stock (single-entrant + livestock draw) deferred.

Draw Pro is standalone with its own collections. When a producer opts in ("export
entrants to Draw Pro"), Steer Me data is **synced into** these collections rather than
queried live cross-product — keeps Draw Pro's draw logic self-contained and working
even if an event has no Steer Me linkage at all.

> **Fee model interpretation note:** the producer's pricing example ("draw 3 for
> $160... $320 enters you six times") works out to a constant $53.33 per entry
> scaled linearly — 3×$53.33=$160, 6×$53.33=$320. This data model implements
> pricing as a single **price-per-entry** the producer sets, with total fee =
> `pricePerEntry × requestedEntryCount`. If the intent is later a true *tiered*
> discount (e.g. entry 4+ costs less per-unit than entries 1–3), this would need a
> pricing-tier table instead of a flat rate — flagging that as a design fork worth
> confirming rather than assuming.

---

## 1. `DrawProEvents`

One record per event a producer runs through Draw Pro.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `title` | text | |
| `producerId` | reference → Wix Members | Owner of the event |
| `eventDate` | date/time | |
| `capNumber` | number | e.g. 10.5 — the roping's stated cap |
| `entryOpenDateTime` | date/time | When entries open |
| `entryCloseMode` | text (enum) | `time` \| `teamCount` |
| `entryCloseDateTime` | date/time | Used if `entryCloseMode = time` |
| `entryCloseTeamCount` | number | Used if `entryCloseMode = teamCount` |
| `preEntryEnabled` | boolean | |
| `requiredEntryFields` | array of text | Producer-configurable fields beyond the mandatory set |
| `steerMeEventId` | text (nullable) | Set only if producer opted into export |
| `status` | text (enum) | `draft` \| `open` \| `closed` \| `finalized` \| `drawn` \| `notified` |
| `qrCodeUrl` | text (nullable) | Cached QR image URL pointing at this event's entry page — generated once, reused on fliers |
| `qrCodeGeneratedDate` | date/time (nullable) | |
| `pricePerEntry` | number | Dollar cost of a single **solo/draw-in** entry, set by the producer |
| `pricePerPreformedTeamEntry` | number (nullable) | Optional lower rate for a **pre-formed team** entry (billed once per team, not per person). Defaults to `pricePerEntry` if not set — see the Steer Me incentive note below |
| `paymentMethod` | text (enum) | `cash` \| `online` — see `DrawProProducerPayoutProfiles` for the `online` path |
| `createdDate` / `updatedDate` | date/time | Wix-managed |

**Status lifecycle:** `draft` → `open` → `closed` (entries stopped, draw sheet locked for review) → `finalized` (producer reviewed) → `drawn` (algorithm executed) → `notified` (emails sent).

> **Steer Me migration incentive, built structurally rather than as a banner ad:**
> - **Entrant side:** a pre-formed team is billed once per team; two solo draw-ins
>   are billed individually. At an identical rate that already halves the cost of
>   entering with a partner versus drawing in blind. `pricePerPreformedTeamEntry`
>   lets a producer widen that gap further if they want to.
> - **Producer side:** the cash-event execution charge (see
>   `DrawProExecutionCharges` below) only counts teams the matching *algorithm*
>   actually paired — pre-formed teams did no computational work and don't count
>   toward the producer's billable total. The more entrants pre-form via Steer Me,
>   the lower a producer's own Draw Pro bill on the same event.
>
> Both incentives point the same direction without needing Draw Pro to editorialize
> about it in the UI — the pricing itself does the nudging.

---

## 2. `DrawProEntrants`

One record per person entered into an event (both scanned-card and self-entry paths write here).

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `eventId` | reference → DrawProEvents | |
| `firstName` / `lastName` | text | |
| `classificationNumber` | number | **Required.** e.g. 4.5 |
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
| `requestedEntryCount` | number | How many times this entrant (solo) or this team (pre-formed) is entering the draw — default 1 |
| `feeOwed` | number | `pricePerEntry × requestedEntryCount` at the time of entry — snapshotted so a later price change doesn't retroactively alter what's owed |
| `isFeeResponsible` | boolean | For `preformed_team` entries: true for whichever entrant submitted/owns payment, false for their partner. Always true for `solo` entries — see "Fee responsibility" below |
| `paymentStatus` | text (enum) | `unpaid` \| `pending_cash` \| `paid` |
| `paymentReferenceNumber` | text (nullable) | Shown to the entrant once paid — set for both cash (producer-confirmed) and online (provider-confirmed) payments |
| `entryTimestamp` | date/time | |

**Guest cap enforcement:** query `guestContactHash` across all events within the rolling window (frequency still TBD) before allowing a new guest entry.

**Fee responsibility (pre-formed teams):** Draw Pro does not split or track who-owes-whom within a team — one fee is owed per team, and whichever entrant completes the entry flow is `isFeeResponsible = true`; the partner's record carries the same `feeOwed`/`paymentStatus` for visibility but isn't separately billed. Splitting the cost is between the two entrants, outside the platform. This doesn't apply to `solo` entries, since the drawing algorithm — not the entrant — decides who their partner ends up being, so each solo entry is individually priced and paid.

**Lightweight team entry:** when submitting a pre-formed team entry, the entering person can supply just their partner's **email** (`partnerEmailOnly`) instead of the partner's full info. Draw Pro emails that address inviting them to view/claim the entry — this both lowers friction for the entering contestant and surfaces RopingTools to someone who may not have an account yet. `teamPartnerEntrantId` remains null until/unless the partner claims the invite and their own entrant record is created and linked.

---

## 3. `DrawProTeams`

Created at draw time (or immediately at entry time for pre-formed teams).

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `eventId` | reference → DrawProEvents | |
| `teamNumber` | number | Run-order position — the number entrants are notified of |
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

Payment status for a team is derived at display time from its two entrants'
`paymentStatus` (both solo entrants must individually show `paid`; a pre-formed
team is "paid" once its fee-responsible entrant does) rather than duplicated onto
the team record itself.

---

## 4. `DrawProDrawSheets`

One record per event, tracking the finalize → signoff → draw → notify pipeline.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `eventId` | reference → DrawProEvents | |
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

## 5. `DrawProNotificationLog`

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

## 6. `DrawProAuditLog`

Accountability log — every manual override and every attempted cap violation, per your requirement that both be tracked.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `eventId` | reference → DrawProEvents | |
| `actionType` | text (enum) | `manual_pairing` \| `cap_violation_attempt` \| `spacing_conflict_flagged` \| `payment_recorded` |
| `performedByUserId` | reference → Wix Members | |
| `timestamp` | date/time | |
| `detail` | text | Human-readable description (entrant names, numbers involved, why) |

---

## 7. `DrawProEntryAlerts`

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

## 8. `DrawProProducerPayoutProfiles`

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

## 9. `DrawProPayments`

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
| `producerAmount` | number | The producer's own stated fee (`pricePerEntry × count`) — what the producer receives |
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

## 10. `DrawProProducerSubscriptions`

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

## 11. `DrawProExecutionCharges`

One row per **cash-method** event once its draw executes — the mechanism that
closes the "Draw Pro is out of the loop on cash events" gap. Only created for
`paymentMethod: cash` events; online events never touch this collection.

| Field | Type | Notes |
|---|---|---|
| `_id` | auto | |
| `eventId` | reference → DrawProEvents | |
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

## 12. `DrawProOnboardingStatus`

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
DrawProEvents (1) ──< DrawProEntrants (many)
DrawProEvents (1) ──< DrawProTeams (many)
DrawProEvents (1) ──1 DrawProDrawSheets (one active sheet per event)
DrawProTeams  (1) ──< DrawProNotificationLog (2 rows per team: header + heeler)
DrawProEvents (1) ──< DrawProAuditLog (many)
DrawProEvents (1) ──< DrawProEntryAlerts (many)
DrawProEvents (1) ──< DrawProPayments (many)
Wix Members   (1) ──1 DrawProProducerPayoutProfiles (one profile per producer)
Wix Members   (1) ──1 DrawProProducerSubscriptions (one subscription record per producer)
DrawProEvents (1) ──1 DrawProExecutionCharges (one charge per cash-method event, at draw time)
```
