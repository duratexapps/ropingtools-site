/**
 * Page: Producer — Create/Configure Event
 * Expected Editor elements (match these IDs when building the page):
 *   #inputTitle          (text input)
 *   #inputEventDate       (date picker)
 *   #inputCapNumber       (text input, numeric)
 *   #inputEntryOpen       (date/time picker)
 *   #radioCloseMode       (radio group: 'time' | 'teamCount')
 *   #inputEntryCloseDate  (date/time picker, shown when radioCloseMode = 'time')
 *   #inputEntryCloseCount (text input, shown when radioCloseMode = 'teamCount')
 *   #togglePreEntry       (toggle/checkbox)
 *   #inputPricePerEntry   (text input, numeric — cost of a single solo/draw-in entry)
 *   #inputPricePerPreformedTeam (text input, numeric, optional — cost per pre-formed
 *                          team entry; leave blank to default to inputPricePerEntry.
 *                          Setting this lower is the Steer Me migration incentive.)
 *   #radioPaymentMethod   (radio group: 'cash' | 'online')
 *   #textPayoutWarning     (shown if 'online' selected but payout profile isn't complete)
 *   #linkPayoutSetup       (link to the producer payout profile page)
 *   #btnCreateEvent       (button)
 *   #btnOpenEvent         (button, disabled until event is created)
 *   #btnGenerateQr        (button, disabled until event is created)
 *   #imageQrCode          (image element, shown once QR is generated)
 *   #textEntryUrl         (text element showing the raw entry link)
 *   #textStatus           (text element for validation/status messages)
 *   #btnReplayTutorial    (always visible — lets a producer re-trigger the tour)
 *
 *   -- Tour overlay elements (see public/onboarding-engine.js) --
 *   #tourOverlay, #tourHighlightBox, #tourTooltip, #tourTitle, #tourBody,
 *   #textTourStepCount, #btnTourNext, #btnTourBack, #btnTourSkip
 */

import { createEvent, openEvent } from 'backend/event-setup.jsw';
import { generateEventQrCode, getAlertSubscriberCount } from 'backend/qr-and-alerts.jsw';
import { getPayoutProfile } from 'backend/payments.jsw';
import { hasSeenTour, markTourCompleted, markTourDismissed } from 'backend/onboarding.jsw';
import { currentMember } from 'wix-members-frontend';
import { runTour } from 'public/onboarding-engine.js';

const PRODUCER_TOUR_STEPS = [
    {
        targetId: '#inputTitle',
        title: 'Start with the basics',
        body: 'Name your event and set the date. Nothing here is locked in until you click Create Event.'
    },
    {
        targetId: '#inputCapNumber',
        title: 'Set your cap',
        body: 'This is the classification cap for the roping — e.g. 10.5. It controls which headers and heelers can be validly paired.'
    },
    {
        targetId: '#inputPricePerEntry',
        title: 'Set your fee',
        body: "This is what a solo draw-in costs. There's an optional lower rate just below for entrants who show up already partnered — a small incentive toward finding a partner ahead of time."
    },
    {
        targetId: '#radioPaymentMethod',
        title: 'Cash or online?',
        body: "Cash means you collect at the gate — entries aren't final until you record payment. Online means Draw Pro collects it for you and hands you a paid, confirmed list."
    },
    {
        targetId: '#btnGenerateQr',
        title: 'Get your QR code',
        body: 'Once your event is created, generate a QR code here — print it on a flier, and entrants can scan straight to your entry page, even before you open entries.'
    },
    {
        targetId: '#btnOpenEvent',
        title: "You're ready",
        body: "When you're ready for entries to start coming in, click Open Event. Anyone who scanned early gets notified automatically."
    }
];

let currentEventId = null;

$w.onReady(async function () {
    $w('#btnOpenEvent').disable();
    $w('#btnGenerateQr').disable();
    $w('#imageQrCode').collapse();
    $w('#textPayoutWarning').collapse();
    $w('#radioCloseMode').onChange(toggleCloseModeFields);
    toggleCloseModeFields();

    $w('#radioPaymentMethod').onChange(checkPayoutReadiness);
    await checkPayoutReadiness();

    $w('#btnCreateEvent').onClick(handleCreateEvent);
    $w('#btnOpenEvent').onClick(handleOpenEvent);
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

function toggleCloseModeFields() {
    const mode = $w('#radioCloseMode').value;
    if (mode === 'time') {
        $w('#inputEntryCloseDate').expand();
        $w('#inputEntryCloseCount').collapse();
    } else {
        $w('#inputEntryCloseCount').expand();
        $w('#inputEntryCloseDate').collapse();
    }
}

async function handleCreateEvent() {
    setStatus('');

    const capNumber = parseFloat($w('#inputCapNumber').value);
    if (isNaN(capNumber) || capNumber <= 0) {
        setStatus('Enter a valid cap number (e.g. 10.5).', true);
        return;
    }

    const closeMode = $w('#radioCloseMode').value;

    const pricePerEntry = parseFloat($w('#inputPricePerEntry').value);
    if (isNaN(pricePerEntry) || pricePerEntry < 0) {
        setStatus('Enter a valid price per entry.', true);
        return;
    }

    const rawTeamRate = $w('#inputPricePerPreformedTeam').value;
    const pricePerPreformedTeamEntry = rawTeamRate ? parseFloat(rawTeamRate) : null;
    if (rawTeamRate && (isNaN(pricePerPreformedTeamEntry) || pricePerPreformedTeamEntry < 0)) {
        setStatus('Enter a valid pre-formed team price, or leave it blank.', true);
        return;
    }

    const eventInput = {
        title: $w('#inputTitle').value,
        eventDate: $w('#inputEventDate').value,
        capNumber,
        entryOpenDateTime: $w('#inputEntryOpen').value,
        entryCloseMode: closeMode,
        entryCloseDateTime: closeMode === 'time' ? $w('#inputEntryCloseDate').value : null,
        entryCloseTeamCount: closeMode === 'teamCount' ? parseInt($w('#inputEntryCloseCount').value, 10) : null,
        preEntryEnabled: $w('#togglePreEntry').checked,
        pricePerEntry,
        pricePerPreformedTeamEntry,
        paymentMethod: $w('#radioPaymentMethod').value
    };

    $w('#btnCreateEvent').disable();

    try {
        const event = await createEvent(eventInput);
        currentEventId = event._id;
        setStatus(`Event created as a draft. Review the details, then open it for entries.`);
        $w('#btnOpenEvent').enable();
        $w('#btnGenerateQr').enable(); // QR can be generated before opening — that's the point:
                                        // it goes on fliers ahead of time, and early scanners get
                                        // the "notify me when entries open" option instead.
        $w('#btnCreateEvent').label = 'Update Event';
    } catch (err) {
        setStatus(err.message, true);
    } finally {
        $w('#btnCreateEvent').enable();
    }
}

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

async function handleOpenEvent() {
    if (!currentEventId) return;
    $w('#btnOpenEvent').disable();

    try {
        await openEvent(currentEventId);
        setStatus('Event is open for entries.');
    } catch (err) {
        setStatus(err.message, true);
        $w('#btnOpenEvent').enable();
    }
}

function setStatus(message, isError) {
    $w('#textStatus').text = message;
    $w('#textStatus').style.color = isError ? '#B3261E' : '#2E7D32';
}
