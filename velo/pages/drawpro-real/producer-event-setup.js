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
 *   #inputEventLocation     (text input, e.g. "Hallettsville, TX" - required, same as title)
 *   #textEventTitleLocation (text - starts collapsed; expands to e.g. "Saturday Jackpot - Hallettsville, TX"
 *                            once the event shell is created, as an on-page confirmation of which event
 *                            you're configuring below)
 *   #inputEventDate        (date picker)
 *   #togglePreEntry        (toggle/checkbox)
 *   #radioPaymentMethod    (radio group: 'cash' | 'online' — applies to the WHOLE event, not per class)
 *   #textPayoutWarning      (shown if 'online' selected but payout profile isn't complete)
 *   #linkPayoutSetup        (link to the producer payout profile page — not built yet, see note below)
 *   #btnCreateEvent        (button — creates the SHELL only now, not a full event+cap+price)
 *
 *   -- Add a class (repeatable — one call per roping) --
 *   #boxAddClass           (container — disabled/collapsed until the event shell is created)
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
import { currentMember } from 'wix-members-frontend';
import { runTour } from 'public/onboarding-engine.js';

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
    $w('#boxAddClass').disable();
    $w('#btnGenerateQr').disable();
    $w('#imageQrCode').collapse();
    $w('#textPayoutWarning').collapse();
    $w('#textEventTitleLocation').collapse();

    $w('#radioClassCloseMode').onChange(toggleClassCloseModeFields);
    toggleClassCloseModeFields();

    $w('#radioPaymentMethod').onChange(checkPayoutReadiness);
    await checkPayoutReadiness();

    $w('#btnCreateEvent').onClick(handleCreateEvent);
    $w('#btnAddClass').onClick(handleAddClass);
    $w('#btnGenerateQr').onClick(handleGenerateQr);
    $w('#btnReplayTutorial').onClick(startProducerTour);

    const alreadySeen = await hasSeenTour('producer').catch(() => true); // fail safe: don't force a tour on a signed-out visitor
    if (!alreadySeen) {
        startProducerTour();
    }
});

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
/* Event shell creation                                                */
/* ------------------------------------------------------------------ */

async function handleCreateEvent() {
    setStatus('');

    const eventInput = {
        title: $w('#inputTitle').value,
        location: $w('#inputEventLocation').value,
        eventDate: $w('#inputEventDate').value,
        preEntryEnabled: $w('#togglePreEntry').checked,
        paymentMethod: $w('#radioPaymentMethod').value
    };

    $w('#btnCreateEvent').disable();

    try {
        const event = await createEvent(eventInput);
        currentEventId = event._id;
        setStatus('Event created. Now add at least one class (roping) below.');
        $w('#textEventTitleLocation').text = `${event.title} - ${event.location}`;
        $w('#textEventTitleLocation').expand();
        $w('#boxAddClass').enable();
        $w('#btnGenerateQr').enable(); // QR can be generated before any class opens —
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
        entryCloseTeamCount: closeMode === 'teamCount' ? parseInt($w('#inputClassCloseCount').value, 10) : null
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
