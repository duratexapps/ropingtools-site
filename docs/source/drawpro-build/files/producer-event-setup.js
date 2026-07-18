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
 *   #btnCreateEvent       (button)
 *   #btnOpenEvent         (button, disabled until event is created)
 *   #btnGenerateQr        (button, disabled until event is created)
 *   #imageQrCode          (image element, shown once QR is generated)
 *   #textEntryUrl         (text element showing the raw entry link)
 *   #textStatus           (text element for validation/status messages)
 */

import { createEvent, openEvent } from 'backend/event-setup.jsw';
import { generateEventQrCode, getAlertSubscriberCount } from 'backend/qr-and-alerts.jsw';

let currentEventId = null;

$w.onReady(function () {
    $w('#btnOpenEvent').disable();
    $w('#btnGenerateQr').disable();
    $w('#imageQrCode').collapse();
    $w('#radioCloseMode').onChange(toggleCloseModeFields);
    toggleCloseModeFields();

    $w('#btnCreateEvent').onClick(handleCreateEvent);
    $w('#btnOpenEvent').onClick(handleOpenEvent);
    $w('#btnGenerateQr').onClick(handleGenerateQr);
});

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

    const eventInput = {
        title: $w('#inputTitle').value,
        eventDate: $w('#inputEventDate').value,
        capNumber,
        entryOpenDateTime: $w('#inputEntryOpen').value,
        entryCloseMode: closeMode,
        entryCloseDateTime: closeMode === 'time' ? $w('#inputEntryCloseDate').value : null,
        entryCloseTeamCount: closeMode === 'teamCount' ? parseInt($w('#inputEntryCloseCount').value, 10) : null,
        preEntryEnabled: $w('#togglePreEntry').checked
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
