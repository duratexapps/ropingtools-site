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

**One-time setup per page — do this once when a page is first created,
never again for that same page.** If a page already exists and its code
is already connected (Page 1, "Draw Pro Entry," went through this
already and is confirmed working), do not delete and recreate it to
"redo" this section — that would just lose whatever element placement
progress already exists for no reason. This section only applies the
first time, to Pages 2 and 3 when they're actually created.

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
3. **Connect the page code — NOT by pasting into the browser.** Confirmed
   live while building Page 1: the Page Code panel is read-only for this
   Git-Integrated site (Wix's own message: "Edit code in your local IDE.
   When you save, it's automatically updated here") — and a *new* page's
   code file does not sync down to the local repo automatically the way
   backend `.jsw` files and already-existing pages do. Full diagnosis in
   `docs/ARCHITECTURE.md`. The actual process:
   1. Create the page, Save, **Publish** (not just Save — Publish matters).
   2. In the Editor's Page Code sidebar, find the exact filename Wix
      generated for this page — format `<Page Display Name>.<5-char
      ID>.js`, e.g. `Draw Pro Entry.gq31q.js`. Tell me this exact name.
   3. I create that exact file in `src/pages/` in the `roping-tools` repo
      with the real code from `velo/pages/drawpro-real/` in this repo,
      then commit and push.
   4. It should then appear correctly in the Editor's read-only view —
      confirm before moving on to placing elements.
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
around the page programmatically via `.x`, `.y`, `.width`, `.height`.
Correction from earlier guidance: Wix's classic Editor doesn't offer a
generic "fixed/absolute position" toggle by that name — what it actually
offers is **Pin**, which takes an element out of normal flow layout and
anchors it to a chosen quadrant/corner of the page. Both elements should
be **pinned** (pick whichever starting quadrant is convenient — it just
needs to be out of flow layout, not in a specific corner).

**Open question, not yet verified:** the onboarding-engine code sets
`.x`/`.y` to arbitrary computed pixel values at runtime (wherever the
current tour step's target element happens to be — not confined to one
quadrant). Whether Wix's Pin mechanism still allows those runtime `.x`/`.y`
overrides to freely move the element anywhere on the page, or whether
pinning constrains it more than that, is untested. Worth checking as soon
as these two elements exist and a tour step can actually be triggered —
if pinned elements resist being moved via code beyond their pinned
quadrant, the fallback is likely to leave them in normal flow layout
instead and rely on `.x`/`.y` alone (no pin at all), but that's a guess,
not a confirmed plan.

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

**Updated 2026-07-21 for the multi-class redesign** (see
`docs/ARCHITECTURE.md`'s "Draw Pro multi-class redesign" entry). If you
already placed elements from the OLD version of this table: most of it is
still correct and untouched (all of "Entrant info" below, the entire
Partner fields section including `#boxPartnerFields` and everything
inside it, guest/submit, payment step, pre-open state, tour overlay).
Only two things actually changed — read the notes on `#dropdownClass`
(new) and `#checkboxAddPartner` (replaces `#radioEntryType`) below.

### Event display (read-only)
| ID | Type | Notes |
|---|---|---|
| `#textEventTitle` | Text | |
| `#dropdownClass` | Dropdown | **NEW.** One event can bundle several differently-capped ropings (confirmed via real fliers) — this is how the entrant picks which one. Populated by code from that event's open classes; no static options need to be set in the Editor. |
| `#textEventCap` | Text | Now reflects whichever class is selected in `#dropdownClass`, not one flat event-wide number — same element, no change needed here, just different behavior driven by the dropdown. |

### Entry type & entrant info
| ID | Type | Notes |
|---|---|---|
| `#checkboxAddPartner` | Checkbox (single, **not** Checkbox Group) | **REPLACES `#radioEntryType`.** Not cosmetic — structural: one person can now submit a pre-formed partner AND draw-in entries together in one submission (confirmed real scenario), which a mutually-exclusive radio can't represent. If `#radioEntryType` is already placed, delete it and add this instead — same trigger role (shows/hides `#boxPartnerFields` below), different control type. Label: "I already have a partner". |
| `#inputFirstName` | Text input | |
| `#inputLastName` | Text input | |
| `#inputClassification` | Text input | Numeric |
| `#inputGlobalId` | Text input | Optional |
| `#inputEmail` | Text input | |
| `#inputPhone` | Text input | Optional |
| `#radioRole` | Radio button group | Values: `header`, `heeler`. **Meaning narrowed**: now specifically "my role WITH MY PARTNER" — only relevant/shown when `#checkboxAddPartner` is checked, not a general "which position am I" for the whole submission. |
| `#inputEntryCount` | Text input | Numeric. **Meaning changed**: now specifically "how many draw-in entries" (separate from any pre-formed partner above), and `0` is a valid value (someone entering only with their one pre-formed partner and no blind draw-in). Default should read `0`, not `1`. |
| `#radioDrawInRole` | Radio button group | **NEW.** Values: `header`, `heeler`. "My role when drawing in" — independent of `#radioRole` above, can be set differently. Confirmed real scenario: a lower-numbered heeler can rationally head with a known partner (better catch odds for a low-numbered header) while drawing in as heeler — their genuinely stronger position — for their own solo entries. Shown only when `#inputEntryCount` is greater than 0. |
| `#textFeeAmount` | Text | Live-updated, read-only. Now sums a pre-formed partner (if checked) and draw-in entries (if any) together, since a submission can include both. |
| `#textSteerMeNudge` | Text | Shown/hidden based on whether any draw-in entries are requested — start collapsed |

### Partner fields (container — shown only when `#checkboxAddPartner` is checked)
| ID | Type | Notes |
|---|---|---|
| `#boxPartnerFields` | Container | Starts collapsed — UNCHANGED from before the redesign |
| `#radioPartnerMode` | Radio button group | Values: `fullDetails`, `emailOnly` — UNCHANGED |
| `#inputPartnerFirstName` | Text input | Shown when partner mode = fullDetails — UNCHANGED |
| `#inputPartnerLastName` | Text input | " — UNCHANGED |
| `#inputPartnerClassification` | Text input | " — UNCHANGED |
| `#inputPartnerGlobalId` | Text input | " — UNCHANGED |
| `#inputPartnerEmail` | Text input | " — UNCHANGED |
| `#inputPartnerPhone` | Text input | " — UNCHANGED |
| `#inputPartnerEmailOnly` | Text input | Shown when partner mode = emailOnly — UNCHANGED |
| `#textPartnerEmailOnlyHint` | Text | Shown alongside `inputPartnerEmailOnly` — UNCHANGED |
| `#checkboxUpAndBack` | Checkbox (single) | **NEW.** "Also enter with this partner in opposite positions?" Real team-roping mechanic — the same two people can enter a class twice with roles swapped (unlike entering the identical role assignment twice, which normally isn't allowed). If checked, code automatically builds a second pre-formed pairing with the same partner info and flipped roles — no second set of partner fields needed. Doesn't apply to draw-in at all. |

### Guest & submit
| ID | Type | Notes |
|---|---|---|
| `#checkboxGuestEntry` | Checkbox (single, **not** Checkbox Group) | Code reads `.checked` (single boolean) — a Checkbox Group's list-of-choices setup doesn't apply here. Label: "I'm entering as a guest (no RopingTools account)". Hidden entirely for logged-in members |
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
Suggested URL: `/drawpro-producer-setup` (Wix page slugs can't contain `/` — same fix already applied to the entry page's slug; no query-param dependency on this one)

**Fully rewritten 2026-07-21 for the multi-class redesign.** This is a
different page than before, not an incremental patch — a producer now
creates a lightweight event shell, then adds one or more classes (ropings)
to it, each with its own cap/price/rules. If you'd started building
against the old single-cap version, most of it needs to change.

Flier-upload-and-AI-review is the confirmed long-term design for this
page (see `docs/ARCHITECTURE.md`), but isn't built yet — what's below is
the manual-entry fallback, built first per established sequencing.

### Event basics (create once)
| ID | Type | Notes |
|---|---|---|
| `#inputTitle` | Text input | |
| `#inputEventLocation` | Text input | e.g. "Hallettsville, TX" — required, same as title. Free text, same single-string convention as Steer Me's home_area rather than split town/state fields |
| `#textEventTitleLocation` | Text | **NEW**, added 2026-07-22. Starts collapsed; expands once the event shell is created, showing e.g. "Saturday Jackpot - Hallettsville, TX" as a persistent on-page confirmation of which event you're configuring below — useful since a producer managing several events could otherwise lose track while scrolling through the class-adding section |
| `#inputEventDate` | Date picker | |
| `#togglePreEntry` | Toggle/checkbox | |
| `#toggleListOnSteerMe` | Toggle/checkbox | **NEW**, added 2026-07-22. Checked by default (opt-out, not opt-in) — cross-posts this event to Steer Me so entrants there can discover it, mark attending, find a partner, and hand off back here to actually enter via the "Enter the Draw" link on their side. Sync only actually fires once at least one class exists (Steer Me requires a division/cap on insert), not at shell creation — see `backend/steerMeSync.jsw` |
| `#radioPaymentMethod` | Radio button group | Values: `cash`, `online`. Applies to the **whole event**, not per class — no evidence a producer splits payment method by roping |
| `#textPayoutWarning` | Text | Starts collapsed; shown if online selected but payout setup incomplete |
| `#linkPayoutSetup` | Link/button | Links to the producer's payout-profile page (not yet built as its own page — see note below) |
| `#btnCreateEvent` | Button | Creates the SHELL only now — title/location/date/payment method, no cap or price. Label changes to "Event Created" after success |

### Add a class (repeat this section for each roping — a #7.5, an #8.5, a #9.5, etc.)
| ID | Type | Notes |
|---|---|---|
| `#boxAddClass` | **Container Box** (not a plain Box) | Starts **collapsed** — expands once the event shell is created. Must be a real Container Box element - a plain Box doesn't support `.collapse()`/`.expand()` the same reliable way, and this element does NOT support `.disable()`/`.enable()` at all (confirmed live 2026-07-23 — calling `.disable()` threw a TypeError that silently killed the entire `$w.onReady()` function before it ever reached the click-handler wiring further down, making every button on the page look "dead") |
| `#inputClassLabel` | Text input | e.g. `"7.5"` |
| `#inputClassCap` | Text input | Numeric — combined header+heeler ceiling for this class |
| `#inputHeelerSubCap` | Text input | Numeric, optional — an *additional* constraint on top of the cap, not instead of it (e.g. a flier's "#11.5 WSTR... #7.5 heeler cap") |
| `#inputIncentiveCap` | Text input | Numeric, optional — **display/tracking only, never gates entry.** e.g. "9.5 event w/ an 8.5 incentive." Just flags which teams get shaded on the draw sheet review page later |
| `#inputMinHeaderToDrawIn` | Text input | Numeric, optional — floor on classification to be eligible for blind draw-in as a header |
| `#inputMinHeelerToDrawIn` | Text input | Numeric, optional — same, for heeler |
| `#radioEntryMode` | Radio button group | Values: `pick_or_draw`, `pick_only`, `draw_only` |
| `#inputMaxEntries` | Text input | Numeric — max entries per entrant for this class, in any combination of pre-formed and draw-in |
| `#inputClassPricePerEntry` | Text input | Numeric — draw-in base rate |
| `#inputClassPricePerPreformedTeam` | Text input | Numeric, optional — blank defaults to `inputClassPricePerEntry` |
| `#inputDrawInSurcharge` | Text input | Numeric, optional — extra per-roper fee **only** for draw-in entries, on top of the base rate |
| `#inputClassEntryOpen` | Date/time picker | |
| `#radioClassCloseMode` | Radio button group | Values: `time`, `teamCount`, `manual`. Manual close is always available regardless of mode — this just controls whether there's also an automatic trigger |
| `#inputClassCloseDate` | Date/time picker | Shown when close mode = `time` |
| `#inputClassCloseCount` | Text input | Shown when close mode = `teamCount` |
| `#btnAddClass` | Button | Adds this class, then clears the form so you can immediately add the next one |

### Classes added so far (repeater)
| ID | Type | Notes |
|---|---|---|
| `#repeaterClasses` | Repeater | Item template needs the 4 elements below inside it |
| `#textClassLabel` | Text (inside repeater item) | |
| `#textClassStatus` | Text (inside repeater item) | e.g. "draft" / "open" / "closed" |
| `#btnClassOpen` | Button (inside repeater item) | Opens **this specific class** for entries — enabled only while status = `draft` |
| `#btnClassClose` | Button (inside repeater item) | Manually closes **this specific class's** books — enabled only while status = `open` |

### QR & entry link (event-level — one shared link for all classes)
| ID | Type | Notes |
|---|---|---|
| `#btnGenerateQr` | Button | Starts **disabled**, enables once the event shell is created |
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
Suggested URL: `/drawpro-producer-review` (Wix page slugs can't contain `/` — same fix already applied to the entry page's slug; reads `?event=EVENT_ID` same as the entry page)

**Updated 2026-07-21 for the multi-class redesign.** Everything below the
class dropdown is scoped to whichever class is selected — finalize, sign
off, the draw itself, manual pairing, and notifications all now operate
per class, since classes close and draw independently (one class in an
event can be finalized and drawn while a sibling class is still open for
entries). This is the most complex of the three pages — a class selector,
two repeaters with sub-elements, plus two confirmation modals.

### Class selector (NEW)
| ID | Type | Notes |
|---|---|---|
| `#dropdownClass` | Dropdown | Which class within this event to review/draw. Populated from every class in the event (not just ones ready to finalize) — showing a still-`open` class too, rather than hiding it, lets the producer see at a glance which of their classes aren't ready yet |

### Entrants panel heading (NEW, added 2026-07-22)
Not in the original spec — added after noticing the desktop mockup
(`docs/mockups/drawpro-producer-review-desktop-mockup.html`) showed a
heading treatment here that was never actually wired to real data. All
three update together, every time `#dropdownClass` changes.

| ID | Type | Notes |
|---|---|---|
| `#textEntrantsHeading` | Text | e.g. "Entrants — Class 8.5" |
| `#textEntrantsStatus` | Text | The selected class's raw status, uppercased - e.g. "DRAWN". Pairs well with a small pill/badge style, matching the mockup |
| `#textEntrantsCaption` | Text | "Locked once finalized." once the class is `finalized`/`drawn`/`notified`; otherwise "Still open - entries can change until you finalize." First-pass wording, not locked in - adjust once you see it live |

### Pre-draw entrant list
| ID | Type | Notes |
|---|---|---|
| `#repeaterEntrants` | Repeater | Item template needs the 3 elements below inside it. Scoped to the selected class |
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
| `#iconIncentiveFlag` | Icon/image (inside repeater item) | **NEW.** Shown only if this team's combined number qualifies for the class's incentive/slide (if the class offers one) — display-only, lets the producer visually pick out incentive-qualifying teams for their own manual time-bonus tracking. Doesn't affect anything else here |
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
