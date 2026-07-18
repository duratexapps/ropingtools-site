# Draw Pro — Data Model (Wix Collections)

Scope: Team Roping only (v1). Calf roping / rough stock (single-entrant + livestock draw) deferred.

Draw Pro is standalone with its own collections. When a producer opts in ("export
entrants to Draw Pro"), Steer Me data is **synced into** these collections rather than
queried live cross-product — keeps Draw Pro's draw logic self-contained and working
even if an event has no Steer Me linkage at all.

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
| `createdDate` / `updatedDate` | date/time | Wix-managed |

**Status lifecycle:** `draft` → `open` → `closed` (entries stopped, draw sheet locked for review) → `finalized` (producer reviewed) → `drawn` (algorithm executed) → `notified` (emails sent).

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
| `teamPartnerEntrantId` | reference → DrawProEntrants (nullable) | Set if `entryType = preformed_team`; mutual on both records |
| `isGuestEntry` | boolean | True if entered without a RopingTools account |
| `guestContactHash` | text (nullable) | Hashed email/phone, used to enforce the guest-entry rate cap across events |
| `source` | text (enum) | `scanned_card` \| `self_entry` |
| `scanVerified` | boolean | Only relevant for `scanned_card` — true once office staff confirms OCR read |
| `rawOcrText` | text (nullable) | Full unparsed OCR output — kept for staff reference during verification |
| `ocrConfidence` | number (nullable) | 0–1 confidence score returned by the OCR provider, lowest of the parsed fields |
| `sourceImageUrl` | text (nullable) | Wix Media Manager URL of the scanned card, kept for audit/dispute purposes |
| `requiresManualContact` | boolean | True if a scanned entrant was verified with no email — producer must contact them outside the app |
| `entryTimestamp` | date/time | |

**Guest cap enforcement:** query `guestContactHash` across all events within the rolling window (frequency still TBD) before allowing a new guest entry.

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
| `actionType` | text (enum) | `manual_pairing` \| `cap_violation_attempt` \| `spacing_conflict_flagged` |
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

## Relationships at a glance

```
DrawProEvents (1) ──< DrawProEntrants (many)
DrawProEvents (1) ──< DrawProTeams (many)
DrawProEvents (1) ──1 DrawProDrawSheets (one active sheet per event)
DrawProTeams  (1) ──< DrawProNotificationLog (2 rows per team: header + heeler)
DrawProEvents (1) ──< DrawProAuditLog (many)
DrawProEvents (1) ──< DrawProEntryAlerts (many)
```
