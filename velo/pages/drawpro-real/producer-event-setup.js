/**
 * Page: Producer — Create/Configure Event
 *
 * REWRITTEN 2026-07-21 for the multi-class redesign (see
 * docs/ARCHITECTURE.md's "Draw Pro multi-class redesign" entry). The old
 * version of this page created one flat event with one cap/price. Now an
 * event is a lightweight shell, and a producer adds one or more CLASSES to
 * it (e.g. a #7.5, an #8.5, a #9.5 — confirmed real fliers routinely bundle
 * several under one shared entry link). This page is a full rewrite, not
 * an incremental patch — if anything was placed in the Editor against the
 * OLD element list, most of it needs to change; see the notes below.
 *
 * Flier-upload-and-AI-review was confirmed as the long-term intended design
 * for this page (see ARCHITECTURE.md), but isn't built here — this is the
 * manual-entry fallback, built first per established sequencing.
 *
 * Expected Editor elements:
 *
 *   -- Event basics (create once) --
 *   #inputTitle           (text input)
 *   #inputEventLocation     (text input, e.g. "Hallettsville, TX" - required, same as title. Has a
 *                            type-ahead: as the producer types, backend/locationSearch.jsw returns matches
 *                            from the same ~32,000-town dataset Steer Me's home_area autocomplete uses -
 *                            see #repeaterLocationSuggestions below)
 *   #repeaterLocationSuggestions (NEW, added 2026-07-23 - Repeater, hidden by default. Item template needs
 *                            one #btnLocationSuggestion (Button) inside it. Shown while #inputEventLocation
 *                            has matches, hidden again once one's picked or the field's cleared)
 *   #inputEventSite         (NEW, added 2026-07-23 - text input, e.g. "Circle T Arena" - the venue itself,
 *                            separate from #inputEventLocation (the town/city). Free text, but also has a
 *                            type-ahead against backend/venues.jsw's shared, cross-producer venue list - see
 *                            #repeaterVenueSuggestions below)
 *   #inputEventSiteLink     (NEW, added 2026-07-23 - text input, optional - the venue's booking page (often
 *                            openstalls.com) or a phone number if that's all a flier has. Auto-fills when a
 *                            venue suggestion is picked, but stays free-typeable otherwise)
 *   #repeaterVenueSuggestions (NEW, added 2026-07-23 - Repeater, hidden by default. Item template needs one
 *                            #btnVenueSuggestion (Button) inside it. Picking a suggestion fills BOTH
 *                            #inputEventSite and, if the saved venue has one, #inputEventSiteLink - and
 *                            #inputEventLocation too if it's still empty)
 *   #textEventTitleLocation (text - starts collapsed; expands to e.g. "Saturday Jackpot - Hallettsville, TX"
 *                            once the event shell is created, as an on-page confirmation of which event
 *                            you're configuring below)
 *   #inputEventDate        (date picker)
 *   #togglePreEntry        (toggle/checkbox)
 *   #toggleListOnSteerMe    (NEW, added 2026-07-22 — checkbox, checked by default. Cross-posts this event
 *                            to Steer Me so entrants there can discover it, find partners, and hand off
 *                            back here to actually enter — see backend/steerMeSync.jsw. Sync only actually
 *                            fires once at least one class exists, not at shell creation)
 *   #radioPaymentMethod    (radio group: 'cash' | 'online' — applies to the WHOLE event, not per class)
 *   #textPayoutWarning      (shown if 'online' selected but payout profile isn't complete)
 *   #linkPayoutSetup        (link to the producer payout profile page — not built yet, see note below)
 *   #btnCreateEvent        (button — creates the SHELL only now, not a full event+cap+price)
 *
 *   -- Add a class (repeatable — one call per roping) --
 *   #boxAddClass           (container of some kind — hidden until the event shell is created. Its exact
 *                            widget type is unconfirmed: it has thrown "is not a function" on both
 *                            .disable() AND .collapse(), so whatever it actually is doesn't behave like a
 *                            standard Container Box. Code below now uses .hide()/.show() and wraps the call
 *                            in safeCall() so a third surprise here can't take the whole page down again -
 *                            but if .hide()/.show() also fails, check this element's real widget type in
 *                            the Editor's Properties panel rather than guessing a 4th method)
 *   #inputClassLabel        (text input, e.g. "7.5")
 *   #inputClassCap          (text input, numeric — combined header+heeler ceiling)
 *   #inputHeelerSubCap      (text input, numeric, optional — additional constraint ON TOP of the cap, not instead of it)
 *   #inputIncentiveCap      (text input, numeric, optional — display/tracking only, never gates entry; e.g. "9.5 event w/ an 8.5 incentive")
 *   #inputMinHeaderToDrawIn (text input, numeric, optional)
 *   #inputMinHeelerToDrawIn (text input, numeric, optional)
 *   #radioEntryMode         (radio group: 'pick_or_draw' | 'pick_only' | 'draw_only')
 *   #inputMaxEntries        (text input, numeric — producer's ceiling on entries per entrant for this class)
 *   #inputClassPricePerEntry (text input, numeric — draw-in base rate)
 *   #inputClassPricePerPreformedTeam (text input, numeric, optional — blank defaults to inputClassPricePerEntry)
 *   #inputDrawInSurcharge   (text input, numeric, optional — extra per-roper fee ONLY for draw-in entries)
 *   #inputClassEntryOpen    (date/time picker)
 *   #radioClassCloseMode    (radio group: 'time' | 'teamCount' | 'manual')
 *   #inputClassCloseDate    (date/time picker, shown when close mode = 'time')
 *   #inputClassCloseCount   (text input, shown when close mode = 'teamCount')
 *   #inputRotationSize      (NEW, added 2026-07-23 - text input, numeric, optional. e.g. "100" - only
 *                            relevant for large fields split across rotations/multiple arenas. Purely a
 *                            display/pacing label on the SAME draw order Draw Pro already produces - it
 *                            does not track catches, advancement, or results, which stay the producer's
 *                            own manual process (same established boundary as qualifiesForIncentive).
 *                            Leave blank for no rotation grouping at all)
 *   #btnAddClass           (button — adds this class, then clears the form for the next one)
 *
 *   -- Classes added so far (repeater) --
 *   #repeaterClasses       (repeater)
 *   #textClassLabel        (text, inside repeater item)
 *   #textClassStatus       (text, inside repeater item — e.g. "draft" / "open" / "closed")
 *   #btnClassOpen          (button, inside repeater item — opens THIS class for entries)
 *   #btnClassClose         (button, inside repeater item — manually closes THIS class's books)
 *
 *   -- QR & entry link (event-level — one shared link, entrant picks class via dropdown) --
 *   #btnGenerateQr         (button)
 *   #imageQrCode           (image, shown once QR generated)
 *   #textEntryUrl          (text)
 *   #textStatus            (text, status/error messages)
 *   #btnReplayTutorial     (always visible)
 *
 *   -- Tour overlay elements (see public/onboarding-engine.js) --
 *   #tourOverlay, #tourHighlightBox, #tourTooltip, #tourTitle, #tourBody,
 *   #textTourStepCount, #btnTourNext, #btnTourBack, #btnTourSkip
 */

import wixData from 'wix-data';
import { createEvent, createEventClass, openClass, closeClass } from 'backend/event-setup.jsw';
import { generateEventQrCode, getAlertSubscriberCount } from 'backend/qr-and-alerts.jsw';
import { getPayoutProfile } from 'backend/payments.jsw';
import { hasSeenTour, markTourCompleted, markTourDismissed } from 'backend/onboarding.jsw';
import { searchHomeAreas } from 'backend/locationSearch.jsw';
import { searchVenues } from 'backend/venues.jsw';
import { currentMember } from 'wix-members-frontend';
import { runTour } from 'public/onboarding-engine.js';

const TYPEAHEAD_DEBOUNCE_MS = 300; // small pause after the last keystroke before calling the backend -
                                    // avoids firing a search on every single character typed. Bumped from
                                    // 200ms to 300ms 2026-07-23 after reported lag on the location
                                    // type-ahead - fewer redundant backend round trips while typing at
                                    // normal speed, alongside the stale-response guard and precomputed
                                    // search index fixes made the same day

const PRODUCER_TOUR_STEPS = [
    {
        targetId: '#inputTitle',
        title: 'Start with the basics',
        body: "Name your event and set the date. This is the shell for the whole day/weekend — you'll add each individual roping (a #7.5, an #8.5, etc.) as its own class next."
    },
    {
        targetId: '#radioPaymentMethod',
        title: 'Cash or online?',
        body: "Cash means you collect at the gate — entries aren't final until you record payment. Online means Draw Pro collects it for you and hands you a paid, confirmed list. This applies to the whole event, not per class."
    },
    {
        targetId: '#btnCreateEvent',
        title: 'Create the event shell',
        body: "Once created, you'll add one or more classes below — each with its own cap, price, and entry rules."
    },
    {
        targetId: '#inputClassCap',
        title: 'Set this class\'s cap',
        body: "The combined header+heeler classification ceiling for THIS roping, e.g. 10.5. A class can also have an additional heeler-specific cap, and a display-only 'incentive' number for time bonuses — see the fields below if this class offers either."
    },
    {
        targetId: '#inputClassPricePerEntry',
        title: 'Set this class\'s price',
        body: "Different classes in the same event can charge different rates — that's normal, not a mistake. There's also an optional lower rate for entrants who show up already partnered, and an optional draw-in surcharge."
    },
    {
        targetId: '#btnAddClass',
        title: 'Add as many classes as this event needs',
        body: 'Repeat for every roping in this event — a #7.5, an #8.5, a #9.5, etc. Each one appears in the list below with its own Open/Close controls.'
    },
    {
        targetId: '#btnGenerateQr',
        title: 'Get your QR code',
        body: 'One shared QR code covers the whole event — entrants pick which class they\'re entering from a dropdown on the entry page itself.'
    }
];

let currentEventId = null;

$w.onReady(async function () {
    // Click handlers are wired FIRST, before any cosmetic show/hide setup
    // below. This page has twice now had a cosmetic setup call throw on
    // #boxAddClass (first .disable(), then .collapse() - both "is not a
    // function" on whatever element type this actually turned out to be)
    // which, because $w.onReady() is a single synchronous-until-await
    // function, silently killed everything after it INCLUDING every
    // onClick binding below - every button on the page looked completely
    // dead with zero visible error anywhere on the page itself. Wiring
    // clicks first means a cosmetic-setup failure can never do that again,
    // regardless of which element turns out to be the next surprise.
    $w('#btnCreateEvent').onClick(handleCreateEvent);
    $w('#btnAddClass').onClick(handleAddClass);
    $w('#btnGenerateQr').onClick(handleGenerateQr);
    $w('#btnReplayTutorial').onClick(startProducerTour);
    $w('#radioClassCloseMode').onChange(toggleClassCloseModeFields);
    $w('#radioPaymentMethod').onChange(checkPayoutReadiness);
    $w('#inputEventLocation').onInput(handleLocationInput);
    $w('#inputEventSite').onInput(handleVenueInput);

    // Cosmetic/starting-state setup - each wrapped in safeCall() so one
    // element behaving unexpectedly (wrong widget type, unsupported
    // method, etc.) logs a console error and moves on instead of taking
    // the rest of onReady() down with it.
    safeCall(() => $w('#boxAddClass').hide());
    safeCall(() => $w('#btnGenerateQr').disable());
    safeCall(() => $w('#imageQrCode').collapse());
    safeCall(() => $w('#textPayoutWarning').collapse());
    safeCall(() => $w('#textEventTitleLocation').collapse());
    safeCall(() => $w('#repeaterLocationSuggestions').hide());
    safeCall(() => $w('#repeaterVenueSuggestions').hide());
    safeCall(() => { $w('#toggleListOnSteerMe').checked = true; }); // opt-out, not opt-in - continuity is the intended default

    toggleClassCloseModeFields();
    await checkPayoutReadiness();

    const alreadySeen = await hasSeenTour('producer').catch(() => true); // fail safe: don't force a tour on a signed-out visitor
    if (!alreadySeen) {
        startProducerTour();
    }
});

// Runs fn() and swallows/logs any error instead of letting it propagate -
// see the big comment at the top of $w.onReady() for why this exists.
function safeCall(fn) {
    try {
        fn();
    } catch (err) {
        console.error(`[producer-event-setup] setup step failed (page keeps working): ${err.message}`);
    }
}

function startProducerTour() {
    runTour($w, PRODUCER_TOUR_STEPS, {
        onFinish: () => markTourCompleted('producer').catch(() => {}),
        onSkip: () => markTourDismissed('producer').catch(() => {})
    });
}

async function checkPayoutReadiness() {
    if ($w('#radioPaymentMethod').value !== 'online') {
        $w('#textPayoutWarning').collapse();
        return;
    }
    const member = await currentMember.getMember().catch(() => null);
    if (!member) return;

    const profile = await getPayoutProfile(member._id);
    if (!profile || profile.onboardingStatus !== 'complete') {
        $w('#textPayoutWarning').text = "You'll need to finish payout setup before this event can accept online payments.";
        $w('#textPayoutWarning').expand();
    } else {
        $w('#textPayoutWarning').collapse();
    }
}

function toggleClassCloseModeFields() {
    const mode = $w('#radioClassCloseMode').value;
    if (mode === 'time') {
        $w('#inputClassCloseDate').expand();
        $w('#inputClassCloseCount').collapse();
    } else if (mode === 'teamCount') {
        $w('#inputClassCloseCount').expand();
        $w('#inputClassCloseDate').collapse();
    } else {
        // 'manual' — neither auto-close field applies; the producer just
        // clicks Close on this class whenever they decide, same manual
        // action every mode still supports regardless (see event-setup.jsw).
        $w('#inputClassCloseDate').collapse();
        $w('#inputClassCloseCount').collapse();
    }
}

/* ------------------------------------------------------------------ */
/* Type-ahead: event location (city) and event site (venue)            */
/* ------------------------------------------------------------------ */

let locationDebounceTimer = null;
let locationRequestToken = 0;

function handleLocationInput() {
    clearTimeout(locationDebounceTimer);
    const query = $w('#inputEventLocation').value;
    if (!query || query.trim().length < 2) {
        locationRequestToken += 1; // invalidate any in-flight search
        safeCall(() => $w('#repeaterLocationSuggestions').hide());
        return;
    }
    // Real, confirmed lag/flicker cause: with no ordering guard, typing
    // fast enough to have two searches in flight at once meant a slower
    // (now-stale) response could arrive AFTER a newer one and overwrite
    // it with outdated suggestions - looks exactly like lag even when
    // each individual search is fast. myToken must still match the
    // current token when the response comes back, or it's discarded.
    const myToken = ++locationRequestToken;
    locationDebounceTimer = setTimeout(async () => {
        const matches = await searchHomeAreas(query).catch(() => []);
        if (myToken !== locationRequestToken) return; // superseded by a newer search
        if (matches.length === 0) {
            safeCall(() => $w('#repeaterLocationSuggestions').hide());
            return;
        }
        $w('#repeaterLocationSuggestions').data = matches.map((label, i) => ({ _id: String(i), label }));
        $w('#repeaterLocationSuggestions').onItemReady(($item, item) => {
            $item('#btnLocationSuggestion').label = item.label;
            $item('#btnLocationSuggestion').onClick(() => {
                $w('#inputEventLocation').value = item.label;
                safeCall(() => $w('#repeaterLocationSuggestions').hide());
            });
        });
        safeCall(() => $w('#repeaterLocationSuggestions').show());
    }, TYPEAHEAD_DEBOUNCE_MS);
}

let venueDebounceTimer = null;
let venueRequestToken = 0;

function handleVenueInput() {
    clearTimeout(venueDebounceTimer);
    // Typing again after a suggestion was picked invalidates the
    // auto-filled link until a suggestion is picked again - same
    // "unconfirmed edits don't count" rule Steer Me's own home_area
    // autocomplete uses, just applied to the derived link field here
    // instead of the field being typed into.
    $w('#inputEventSiteLink').value = '';

    const query = $w('#inputEventSite').value;
    if (!query || query.trim().length < 2) {
        venueRequestToken += 1; // invalidate any in-flight search
        safeCall(() => $w('#repeaterVenueSuggestions').hide());
        return;
    }
    // Same stale-response guard as handleLocationInput() above.
    const myToken = ++venueRequestToken;
    venueDebounceTimer = setTimeout(async () => {
        const matches = await searchVenues(query).catch(() => []);
        if (myToken !== venueRequestToken) return; // superseded by a newer search
        if (matches.length === 0) {
            safeCall(() => $w('#repeaterVenueSuggestions').hide());
            return;
        }
        $w('#repeaterVenueSuggestions').data = matches.map((v, i) => ({
            _id: String(i),
            name: v.name,
            location: v.location,
            link: v.link
        }));
        $w('#repeaterVenueSuggestions').onItemReady(($item, item) => {
            $item('#btnVenueSuggestion').label = item.location ? `${item.name} (${item.location})` : item.name;
            $item('#btnVenueSuggestion').onClick(() => {
                $w('#inputEventSite').value = item.name;
                if (item.link) {
                    $w('#inputEventSiteLink').value = item.link;
                }
                // Only fills the town/city if the producer hasn't already
                // typed one - never overwrites an in-progress entry.
                if (item.location && !$w('#inputEventLocation').value) {
                    $w('#inputEventLocation').value = item.location;
                }
                safeCall(() => $w('#repeaterVenueSuggestions').hide());
            });
        });
        safeCall(() => $w('#repeaterVenueSuggestions').show());
    }, TYPEAHEAD_DEBOUNCE_MS);
}

/* ------------------------------------------------------------------ */
/* Event shell creation                                                */
/* ------------------------------------------------------------------ */

async function handleCreateEvent() {
    setStatus('');

    const eventInput = {
        title: $w('#inputTitle').value,
        location: $w('#inputEventLocation').value,
        eventSite: $w('#inputEventSite').value || null,
        eventSiteLink: $w('#inputEventSiteLink').value || null,
        eventDate: $w('#inputEventDate').value,
        preEntryEnabled: $w('#togglePreEntry').checked,
        listOnSteerMe: $w('#toggleListOnSteerMe').checked,
        paymentMethod: $w('#radioPaymentMethod').value
    };

    $w('#btnCreateEvent').disable();

    try {
        const event = await createEvent(eventInput);
        currentEventId = event._id;
        setStatus('Event created. Now add at least one class (roping) below.');
        safeCall(() => { $w('#textEventTitleLocation').text = `${event.title} - ${event.location}`; });
        safeCall(() => $w('#textEventTitleLocation').expand());
        safeCall(() => $w('#boxAddClass').show());
        safeCall(() => $w('#btnGenerateQr').enable()); // QR can be generated before any class opens —
                                        // it goes on fliers ahead of time, and early
                                        // scanners get the "notify me when entries open"
                                        // option instead.
        $w('#btnCreateEvent').label = 'Event Created';
        $w('#btnCreateEvent').disable(); // one shell per page visit — re-editing the
                                          // shell itself isn't handled by this pass
    } catch (err) {
        setStatus(err.message, true);
        $w('#btnCreateEvent').enable();
    }
}

/* ------------------------------------------------------------------ */
/* Class creation — repeatable, one call per roping                    */
/* ------------------------------------------------------------------ */

async function handleAddClass() {
    if (!currentEventId) {
        setStatus('Create the event shell first.', true);
        return;
    }
    setStatus('');

    const capNumber = parseFloat($w('#inputClassCap').value);
    if (isNaN(capNumber) || capNumber <= 0) {
        setStatus('Enter a valid cap number for this class (e.g. 10.5).', true);
        return;
    }

    const pricePerEntry = parseFloat($w('#inputClassPricePerEntry').value);
    if (isNaN(pricePerEntry) || pricePerEntry < 0) {
        setStatus('Enter a valid price per entry for this class.', true);
        return;
    }

    const maxEntriesPerEntrant = parseInt($w('#inputMaxEntries').value, 10);
    if (isNaN(maxEntriesPerEntrant) || maxEntriesPerEntrant <= 0) {
        setStatus('Enter a valid maximum entries-per-entrant for this class.', true);
        return;
    }

    const closeMode = $w('#radioClassCloseMode').value;

    const classInput = {
        label: $w('#inputClassLabel').value,
        capNumber,
        heelerSubCap: parseOptionalNumber($w('#inputHeelerSubCap').value),
        incentiveCapNumber: parseOptionalNumber($w('#inputIncentiveCap').value),
        minHeaderNumberToDrawIn: parseOptionalNumber($w('#inputMinHeaderToDrawIn').value),
        minHeelerNumberToDrawIn: parseOptionalNumber($w('#inputMinHeelerToDrawIn').value),
        entryModeAllowed: $w('#radioEntryMode').value,
        maxEntriesPerEntrant,
        pricePerEntry,
        pricePerPreformedTeamEntry: parseOptionalNumber($w('#inputClassPricePerPreformedTeam').value),
        drawInSurchargeFee: parseOptionalNumber($w('#inputDrawInSurcharge').value),
        entryOpenDateTime: $w('#inputClassEntryOpen').value,
        entryCloseMode: closeMode,
        entryCloseDateTime: closeMode === 'time' ? $w('#inputClassCloseDate').value : null,
        entryCloseTeamCount: closeMode === 'teamCount' ? parseInt($w('#inputClassCloseCount').value, 10) : null,
        rotationSize: parseOptionalNumber($w('#inputRotationSize').value)
    };

    $w('#btnAddClass').disable();

    try {
        await createEventClass(currentEventId, classInput);
        setStatus(`Class "${classInput.label}" added.`);
        clearClassForm();
        await refreshClassList();
    } catch (err) {
        setStatus(err.message, true);
    } finally {
        $w('#btnAddClass').enable();
    }
}

function parseOptionalNumber(rawValue) {
    if (!rawValue) return null;
    const parsed = parseFloat(rawValue);
    return isNaN(parsed) ? null : parsed;
}

function clearClassForm() {
    $w('#inputClassLabel').value = '';
    $w('#inputClassCap').value = '';
    $w('#inputHeelerSubCap').value = '';
    $w('#inputIncentiveCap').value = '';
    $w('#inputMinHeaderToDrawIn').value = '';
    $w('#inputMinHeelerToDrawIn').value = '';
    $w('#inputMaxEntries').value = '';
    $w('#inputClassPricePerEntry').value = '';
    $w('#inputClassPricePerPreformedTeam').value = '';
    $w('#inputDrawInSurcharge').value = '';
    $w('#inputClassEntryOpen').value = '';
    $w('#inputClassCloseDate').value = '';
    $w('#inputClassCloseCount').value = '';
}

/* ------------------------------------------------------------------ */
/* Classes added so far — list with per-class open/close               */
/* ------------------------------------------------------------------ */

async function refreshClassList() {
    const result = await wixData.query('DrawProEventClasses').eq('eventId', currentEventId).find();
    $w('#repeaterClasses').data = result.items;
    $w('#repeaterClasses').onItemReady(($item, cls) => {
        $item('#textClassLabel').text = cls.label;
        $item('#textClassStatus').text = cls.status;

        if (cls.status === 'draft') {
            $item('#btnClassOpen').enable();
            $item('#btnClassClose').disable();
        } else if (cls.status === 'open') {
            $item('#btnClassOpen').disable();
            $item('#btnClassClose').enable();
        } else {
            $item('#btnClassOpen').disable();
            $item('#btnClassClose').disable();
        }

        $item('#btnClassOpen').onClick(() => handleOpenClass(cls._id));
        $item('#btnClassClose').onClick(() => handleCloseClass(cls._id));
    });
}

async function handleOpenClass(classId) {
    setStatus('');
    try {
        await openClass(classId);
        setStatus('Class opened for entries.');
        await refreshClassList();
    } catch (err) {
        setStatus(err.message, true);
    }
}

async function handleCloseClass(classId) {
    setStatus('');
    try {
        await closeClass(classId);
        setStatus('Class closed. Move to the Draw Sheet Review page to finalize and run the draw.');
        await refreshClassList();
    } catch (err) {
        setStatus(err.message, true);
    }
}

/* ------------------------------------------------------------------ */
/* QR & entry link — event-level, shared across all classes            */
/* ------------------------------------------------------------------ */

async function handleGenerateQr() {
    if (!currentEventId) return;
    $w('#btnGenerateQr').disable();

    try {
        const { entryUrl, qrImageUrl } = await generateEventQrCode(currentEventId);
        $w('#imageQrCode').src = qrImageUrl;
        $w('#imageQrCode').expand();
        $w('#textEntryUrl').text = entryUrl;

        const waitingCount = await getAlertSubscriberCount(currentEventId);
        if (waitingCount > 0) {
            setStatus(`QR code ready. ${waitingCount} people are already waiting for entries to open.`);
        } else {
            setStatus('QR code ready — add it to your flier.');
        }
    } catch (err) {
        setStatus(err.message, true);
    } finally {
        $w('#btnGenerateQr').enable();
    }
}

function setStatus(message, isError) {
    $w('#textStatus').text = message;
    $w('#textStatus').style.color = isError ? '#B3261E' : '#2E7D32';
}
