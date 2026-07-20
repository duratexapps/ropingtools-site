# Draw Pro — Manual Page Build Guide

No Wix API exists for creating pages or placing native `$w` elements — this
has to be done by hand in the Editor. This doc is the exact element list
each page's code already expects, pulled directly from the "Expected
Editor elements" comment block at the top of each page-code file (not
reverse-engineered — those comments were already accurate and complete).

**General rule for every element below:** the ID in the Editor's Properties
panel (the `#idName` field) must match exactly what's listed here — that's
literally how `$w('#idName')` finds it. Get this wrong and the page code
will throw "X could not be found" at runtime, not fail silently.

---

## Before building any page

1. **Create the page** in the Wix Editor (Pages panel → Add Page → Blank
   Page). Name it something recognizable in the page list (e.g. "Draw Pro —
   Entrant Entry"), separate from what shows in the URL.
2. **Set the page's URL slug** — this matters because both
   `entrant-entry-form.js` and `producer-draw-sheet-review.js` read
   `wixLocation.query.event` (i.e. `?event=EVENT_ID` in the URL) to know
   which event they're working with. The slug itself can be anything
   reasonable (e.g. `/drawpro/enter`, matching `ENTRY_BASE_URL` already
   used in `qr-and-alerts.jsw` and `payments.jsw`) — just don't rely on
   the page having its own dynamic-item routing, since this is a plain
   query-param pattern, not a Wix dynamic-item page.
3. **Connect the page code**: in the Editor, click the page in the Pages
   panel → the `{}` code icon (or right-click → "View Code") opens that
   page's code panel. Paste the corresponding file's contents from
   `velo/pages/drawpro-real/` in the repo. (This is different from
   backend `.jsw` files, which sync via git automatically — page code has
   to be pasted into the specific page it belongs to, same reason the
   HTML-embed content does.)
4. **Element IDs** are set via the Properties panel after selecting an
   element on the canvas — usually a small `#` field near the top, or
   under "ID" in an advanced/settings tab depending on element type.

---

## Shared component: Tour Overlay

Needed on **both** the Entrant Entry page and the Producer Event Setup
page (not the Draw Sheet Review page — it doesn't use the tour). Build it
once, then either duplicate it onto the second page or rebuild it
identically — Wix doesn't have a true shared-component mechanism for
across-page reuse in the classic Editor.

**Critical setup detail:** `tourHighlightBox` and `tourTooltip` are moved
around the page programmatically via `.x`, `.y`, `.width`, `.height` — for
that to work, both elements must be set to **fixed/absolute position**
(not flow layout) in the Editor's layout settings, otherwise those
properties won't do anything.

| ID | Element type | Notes |
|---|---|---|
| `#tourOverlay` | Container/Box | Full-page translucent backdrop. Starts **hidden/collapsed**. |
| `#tourHighlightBox` | Rectangle/Box shape | Fixed position. A visible outline/highlight that frames whatever's being pointed at. Starts hidden. |
| `#tourTooltip` | Container/Box | Fixed position. Holds the title/body/buttons below. |
| `#tourTitle` | Text | Step title |
| `#tourBody` | Text | Step description |
| `#textTourStepCount` | Text | e.g. "Step 2 of 5" |
| `#btnTourNext` | Button | Label changes to "Finish" on the last step automatically |
| `#btnTourBack` | Button | Starts disabled (first step has no back) |
| `#btnTourSkip` | Button | |

---

## Page 1: Entrant Entry Form

File: `velo/pages/drawpro-real/entrant-entry-form.js`
Suggested URL: `/drawpro/enter` (matches `ENTRY_BASE_URL` already used elsewhere)

### Event display (read-only)
| ID | Type |
|---|---|
| `#textEventTitle` | Text |
| `#textEventCap` | Text |

### Entry type & entrant info
| ID | Type | Notes |
|---|---|---|
| `#radioEntryType` | Radio button group | Values: `solo`, `preformed_team` |
| `#inputFirstName` | Text input | |
| `#inputLastName` | Text input | |
| `#inputClassification` | Text input | Numeric |
| `#inputGlobalId` | Text input | Optional |
| `#inputEmail` | Text input | |
| `#inputPhone` | Text input | Optional |
| `#radioRole` | Radio button group | Values: `header`, `heeler` |
| `#inputEntryCount` | Text input | Numeric, default should read `1` |
| `#textFeeAmount` | Text | Live-updated, read-only |
| `#textSteerMeNudge` | Text | Shown/hidden based on entry type — start collapsed |

### Partner fields (container — shown only when entry type = preformed_team)
| ID | Type | Notes |
|---|---|---|
| `#boxPartnerFields` | Container | Starts collapsed |
| `#radioPartnerMode` | Radio button group | Values: `fullDetails`, `emailOnly` |
| `#inputPartnerFirstName` | Text input | Shown when partner mode = fullDetails |
| `#inputPartnerLastName` | Text input | " |
| `#inputPartnerClassification` | Text input | " |
| `#inputPartnerGlobalId` | Text input | " |
| `#inputPartnerEmail` | Text input | " |
| `#inputPartnerPhone` | Text input | " |
| `#inputPartnerEmailOnly` | Text input | Shown when partner mode = emailOnly |
| `#textPartnerEmailOnlyHint` | Text | Shown alongside `inputPartnerEmailOnly` |

### Guest & submit
| ID | Type | Notes |
|---|---|---|
| `#checkboxGuestEntry` | Checkbox | Hidden entirely for logged-in members |
| `#btnSubmitEntry` | Button | |
| `#textStatus` | Text | Status/error messages |

### Payment step (shown after successful submit)
| ID | Type | Notes |
|---|---|---|
| `#boxCashInstructions` | Container | Starts collapsed; shown if event is cash-pay |
| `#textCashAmount` | Text | |
| `#boxOnlinePayment` | Container | Starts collapsed; shown if event is online-pay |
| `#textOnlineAmount` | Text | |
| `#btnPayNow` | Button | **Note:** the actual PayPal approval buttons aren't wired in yet — see `docs/ARCHITECTURE.md`'s PayPal section. This button currently calls the backend directly, which isn't correct for production until PayPal's JS SDK is added here. |
| `#textPaymentConfirmation` | Text | Starts collapsed |

### Pre-open state (shown instead of the form if entries haven't opened)
| ID | Type | Notes |
|---|---|---|
| `#boxNotYetOpen` | Container | Starts collapsed |
| `#textNotYetOpenMessage` | Text | |
| `#inputAlertEmail` | Text input | |
| `#btnSubscribeAlert` | Button | |
| `#textAlertStatus` | Text | |
| `#btnReplayTutorial` | Button | Always visible, regardless of open/not-open state |

Plus the 9 shared Tour Overlay elements above.

---

## Page 2: Producer Event Setup

File: `velo/pages/drawpro-real/producer-event-setup.js`
Suggested URL: `/drawpro/producer/setup` (or similar — no query-param dependency on this one)

### Event basics
| ID | Type | Notes |
|---|---|---|
| `#inputTitle` | Text input | |
| `#inputEventDate` | Date picker | |
| `#inputCapNumber` | Text input | Numeric, e.g. `10.5` |
| `#inputEntryOpen` | Date/time picker | |
| `#radioCloseMode` | Radio button group | Values: `time`, `teamCount` |
| `#inputEntryCloseDate` | Date/time picker | Shown when close mode = time |
| `#inputEntryCloseCount` | Text input | Shown when close mode = teamCount |
| `#togglePreEntry` | Toggle/checkbox | |

### Pricing & payment
| ID | Type | Notes |
|---|---|---|
| `#inputPricePerEntry` | Text input | Numeric |
| `#inputPricePerPreformedTeam` | Text input | Numeric, optional — blank defaults to `inputPricePerEntry` |
| `#radioPaymentMethod` | Radio button group | Values: `cash`, `online` |
| `#textPayoutWarning` | Text | Starts collapsed; shown if online selected but payout setup incomplete |
| `#linkPayoutSetup` | Link/button | Links to the producer's payout-profile page (not yet built as its own page — see note below) |

### Actions & QR
| ID | Type | Notes |
|---|---|---|
| `#btnCreateEvent` | Button | Label changes to "Update Event" after first successful create |
| `#btnOpenEvent` | Button | Starts **disabled** |
| `#btnGenerateQr` | Button | Starts **disabled** |
| `#imageQrCode` | Image | Starts collapsed |
| `#textEntryUrl` | Text | |
| `#textStatus` | Text | |
| `#btnReplayTutorial` | Button | Always visible |

Plus the 9 shared Tour Overlay elements above.

**Real gap, not something to build around silently:** `#linkPayoutSetup`
points at "the producer payout profile page" — that page doesn't exist
yet either. `payments.jsw`'s `startProducerPayoutOnboarding()` is the
backend function it should call (kicks off real PayPal onboarding), but
no page has been built to host that button. Worth its own pass once
PayPal approval comes through, since there's no point building UI against
credentials that don't exist yet.

---

## Page 3: Producer Draw Sheet Review & Sign-Off

File: `velo/pages/drawpro-real/producer-draw-sheet-review.js`
Suggested URL: `/drawpro/producer/review` (reads `?event=EVENT_ID` same as the entry page)

This is the most complex of the three — two repeaters with sub-elements,
plus two confirmation modals.

### Pre-draw entrant list
| ID | Type | Notes |
|---|---|---|
| `#repeaterEntrants` | Repeater | Item template needs the 3 elements below inside it |
| `#textEntrantName` | Text (inside repeater item) | |
| `#textEntrantRole` | Text (inside repeater item) | |
| `#textEntrantClass` | Text (inside repeater item) | |
| `#btnFinalize` | Button | |

### Sign-off confirmation
| ID | Type | Notes |
|---|---|---|
| `#btnSignOff` | Button | Starts disabled until Finalize succeeds |
| `#boxSignOffConfirm` | Container | Confirmation modal — starts collapsed |
| `#btnConfirmSignOff` | Button | |
| `#btnCancelSignOff` | Button | |

### Post-draw team list (repeater)
| ID | Type | Notes |
|---|---|---|
| `#repeaterTeams` | Repeater | Item template needs the elements below inside it |
| `#textTeamNumber` | Text (inside repeater item) | |
| `#textHeader` | Text (inside repeater item) | |
| `#textHeeler` | Text (inside repeater item) | |
| `#iconSpacingFlag` | Icon/image (inside repeater item) | Has a `.tooltip` set programmatically — use an element type that supports a tooltip property |
| `#checkboxSwapSelect` | Checkbox (inside repeater item) | |
| `#btnAcknowledgeConflict` | Button (inside repeater item) | Shown only for flagged-unacknowledged rows |

### Swap & acknowledge
| ID | Type | Notes |
|---|---|---|
| `#btnSwapSelected` | Button | Starts disabled — enables once exactly 2 teams are checked |
| `#boxAcknowledgeConfirm` | Container | Starts collapsed |
| `#inputAcknowledgeNote` | Text input | |
| `#btnConfirmAcknowledge` | Button | |

### Unmatched entrants & manual pairing
| ID | Type | Notes |
|---|---|---|
| `#repeaterUnmatched` | Repeater | Item template needs `#textEntrantName` inside (same ID as the pre-draw repeater's — that's fine, they're in different repeaters) |
| `#dropdownManualHeader` | Dropdown | Populated dynamically from unmatched headers |
| `#dropdownManualHeeler` | Dropdown | Populated dynamically from unmatched heelers |
| `#btnManualPair` | Button | |
| `#boxOverrideConfirm` | Container | |
| `#checkboxOverrideAck` | Checkbox | Must be checked before `btnManualPair` succeeds — cap rule is enforced server-side regardless |

### Notifications & status
| ID | Type | Notes |
|---|---|---|
| `#btnSendNotifications` | Button | Enable this once status reaches "drawn" — **won't actually send anything until the Triggered Email template is created and `DRAW_NOTIFICATION_EMAIL_ID` is set in `notifications.jsw`**, per the existing setup note in that file |
| `#textStatus` | Text | |

No Tour Overlay elements on this page.

---

## Suggested build order

1. **Producer Event Setup** first — it's the only one of the three with no
   dependency on an existing event already existing (the other two both
   need `?event=EVENT_ID` in the URL to do anything).
2. **Entrant Entry Form** second — test it against a real event ID created
   in step 1.
3. **Producer Draw Sheet Review** last — needs real entrants already
   submitted via step 2 to be useful to test against.

This mirrors the actual pipeline order (create event → entries come in →
review/draw), so testing each page as you go gives you real data to test
the next one against, rather than needing to fake it.
