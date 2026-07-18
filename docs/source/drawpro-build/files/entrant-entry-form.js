/**
 * Page: Entrant — Enter the Draw
 * Assumes eventId is passed via URL query param (?event=EVENT_ID) or a
 * dataset connection — adjust getEventIdFromContext() to match however
 * this page is actually routed.
 *
 * Expected Editor elements:
 *   #textEventTitle, #textEventCap   (display only)
 *   #radioEntryType         ('solo' | 'preformed_team')
 *   #inputFirstName, #inputLastName, #inputClassification,
 *   #inputGlobalId (optional), #inputEmail, #inputPhone
 *   #radioRole               ('header' | 'heeler')
 *   #boxPartnerFields         (container, shown only if entryType = preformed_team)
 *   #inputPartnerFirstName, #inputPartnerLastName, #inputPartnerClassification,
 *   #inputPartnerGlobalId, #inputPartnerEmail, #inputPartnerPhone
 *   #checkboxGuestEntry       (shown only to non-logged-in visitors)
 *   #btnSubmitEntry
 *   #textStatus
 *
 *   -- Pre-open state (event hasn't opened yet, shown instead of the form) --
 *   #boxNotYetOpen            (container)
 *   #textNotYetOpenMessage
 *   #inputAlertEmail
 *   #btnSubscribeAlert
 *   #textAlertStatus
 */

import wixLocation from 'wix-location';
import { currentMember } from 'wix-members-frontend';
import { submitEntry } from 'backend/event-setup.jsw';
import { subscribeToEntryAlert } from 'backend/qr-and-alerts.jsw';
import wixData from 'wix-data';

let eventId;

$w.onReady(async function () {
    eventId = wixLocation.query.event;
    if (!eventId) {
        setStatus('No event specified.', true);
        $w('#btnSubmitEntry').disable();
        return;
    }

    const event = await loadEventSummary();

    if (event.status !== 'open') {
        showNotYetOpenState(event);
        return; // don't wire up the entry form at all — it's not usable yet
    }

    await setGuestVisibility();
    $w('#radioEntryType').onChange(togglePartnerFields);
    togglePartnerFields();
    $w('#btnSubmitEntry').onClick(handleSubmit);
});

function showNotYetOpenState(event) {
    $w('#boxNotYetOpen').expand();
    // Everything below this form is collapsed rather than just left
    // unwired, so a visitor can't fill out fields that won't submit.
    $w('#radioEntryType').collapse();
    $w('#boxPartnerFields').collapse();
    $w('#btnSubmitEntry').collapse();
    $w('#checkboxGuestEntry').collapse();

    const opensAt = event.entryOpenDateTime ? new Date(event.entryOpenDateTime).toLocaleString() : 'soon';
    $w('#textNotYetOpenMessage').text = `Entries for ${event.title} haven't opened yet. Opens ${opensAt}.`;

    $w('#btnSubscribeAlert').onClick(() => handleSubscribeAlert(event._id));
}

async function handleSubscribeAlert(eventIdForAlert) {
    const email = $w('#inputAlertEmail').value;
    $w('#btnSubscribeAlert').disable();

    try {
        await subscribeToEntryAlert(eventIdForAlert, email);
        setAlertStatus("You're set — we'll email you the moment entries open.");
        $w('#inputAlertEmail').disable();
        $w('#btnSubscribeAlert').label = 'Subscribed';
    } catch (err) {
        setAlertStatus(err.message, true);
        $w('#btnSubscribeAlert').enable();
    }
}

function setAlertStatus(message, isError) {
    $w('#textAlertStatus').text = message;
    $w('#textAlertStatus').style.color = isError ? '#B3261E' : '#2E7D32';
}

async function loadEventSummary() {
    const event = await wixData.get('DrawProEvents', eventId);
    $w('#textEventTitle').text = event.title;
    $w('#textEventCap').text = `Cap: ${event.capNumber}`;
    return event;
}

async function setGuestVisibility() {
    const member = await currentMember.getMember().catch(() => null);
    if (member) {
        $w('#checkboxGuestEntry').collapse(); // logged-in members aren't guests
    } else {
        $w('#checkboxGuestEntry').expand();
    }
}

function togglePartnerFields() {
    if ($w('#radioEntryType').value === 'preformed_team') {
        $w('#boxPartnerFields').expand();
    } else {
        $w('#boxPartnerFields').collapse();
    }
}

async function handleSubmit() {
    setStatus('');

    const isTeamEntry = $w('#radioEntryType').value === 'preformed_team';
    const isGuest = $w('#checkboxGuestEntry').checked || false;

    const entrantInput = {
        firstName: $w('#inputFirstName').value,
        lastName: $w('#inputLastName').value,
        classificationNumber: parseFloat($w('#inputClassification').value),
        globalMembershipId: $w('#inputGlobalId').value || null,
        email: $w('#inputEmail').value,
        phone: $w('#inputPhone').value || null,
        role: $w('#radioRole').value,
        isGuestEntry: isGuest
    };

    let partnerInput = null;
    if (isTeamEntry) {
        partnerInput = {
            firstName: $w('#inputPartnerFirstName').value,
            lastName: $w('#inputPartnerLastName').value,
            classificationNumber: parseFloat($w('#inputPartnerClassification').value),
            globalMembershipId: $w('#inputPartnerGlobalId').value || null,
            email: $w('#inputPartnerEmail').value,
            phone: $w('#inputPartnerPhone').value || null,
            role: $w('#radioRole').value === 'header' ? 'heeler' : 'header',
            isGuestEntry: isGuest
        };
    }

    $w('#btnSubmitEntry').disable();

    try {
        await submitEntry(eventId, entrantInput, partnerInput);
        setStatus("You're entered. Watch your email for your team number once the draw is run.");
        $w('#btnSubmitEntry').collapse();
    } catch (err) {
        setStatus(err.message, true);
        $w('#btnSubmitEntry').enable();
    }
}

function setStatus(message, isError) {
    $w('#textStatus').text = message;
    $w('#textStatus').style.color = isError ? '#B3261E' : '#2E7D32';
}
