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
 *   #radioPartnerMode         ('fullDetails' | 'emailOnly', shown only if entryType = preformed_team)
 *   #inputPartnerFirstName, #inputPartnerLastName, #inputPartnerClassification,
 *   #inputPartnerGlobalId, #inputPartnerEmail, #inputPartnerPhone   (shown if radioPartnerMode = fullDetails)
 *   #inputPartnerEmailOnly    (shown if radioPartnerMode = emailOnly)
 *   #textPartnerEmailOnlyHint
 *   #checkboxGuestEntry       (shown only to non-logged-in visitors)
 *   #inputEntryCount          (numeric, how many times entering the draw — default 1)
 *   #textFeeAmount            (live-computed total based on entry count and entry type)
 *   #textSteerMeNudge         (shown when radioEntryType = 'solo' and a team rate is cheaper)
 *   #btnSubmitEntry
 *   #textStatus
 *
 *   -- Payment step (shown after submit, before entry is considered final) --
 *   #boxCashInstructions      (shown if event.paymentMethod = 'cash')
 *   #textCashAmount
 *   #boxOnlinePayment         (shown if event.paymentMethod = 'online')
 *   #textOnlineAmount
 *   #btnPayNow
 *   #textPaymentConfirmation  (shows reference number once paid)
 *
 *   -- Pre-open state (event hasn't opened yet, shown instead of the form) --
 *   #boxNotYetOpen            (container)
 *   #textNotYetOpenMessage
 *   #inputAlertEmail
 *   #btnSubscribeAlert
 *   #textAlertStatus
 *   #btnReplayTutorial        (always visible)
 *
 *   -- Tour overlay elements (see public/onboarding-engine.js) --
 *   #tourOverlay, #tourHighlightBox, #tourTooltip, #tourTitle, #tourBody,
 *   #textTourStepCount, #btnTourNext, #btnTourBack, #btnTourSkip
 */

import wixLocation from 'wix-location';
import { currentMember } from 'wix-members-frontend';
import { local } from 'wix-storage-frontend';
import { submitEntry } from 'backend/event-setup.jsw';
import { subscribeToEntryAlert } from 'backend/qr-and-alerts.jsw';
import { createPayPalOrder, capturePayPalOrder, calculateEntrantCharge } from 'backend/payments.jsw';
import { hasSeenTour, markTourCompleted, markTourDismissed } from 'backend/onboarding.jsw';
import { runTour } from 'public/onboarding-engine.js';
import wixData from 'wix-data';

const GUEST_TOUR_STORAGE_KEY = 'drawpro_entrant_tour_seen';

const ENTRANT_TOUR_STEPS = [
    {
        targetId: '#radioEntryType',
        title: 'Solo or with a partner?',
        body: "Solo means you'll be randomly matched when the draw runs. With a partner means you already know who you're entering with."
    },
    {
        targetId: '#inputEntryCount',
        title: 'Entering more than once?',
        body: 'Set how many times you want to draw in. Your fee updates automatically below.'
    },
    {
        targetId: '#textFeeAmount',
        title: 'Your total',
        body: 'This updates live as you change your entry count or switch between solo and partner entry.'
    },
    {
        targetId: '#btnSubmitEntry',
        title: "You're ready",
        body: "Once you submit, you'll see exactly how to pay — cash instructions, or a secure online payment, depending on how this producer collects fees."
    }
];

let eventId;
let currentEvent;

$w.onReady(async function () {
    eventId = wixLocation.query.event;
    if (!eventId) {
        setStatus('No event specified.', true);
        $w('#btnSubmitEntry').disable();
        return;
    }

    const event = await loadEventSummary();
    currentEvent = event;

    if (event.status !== 'open') {
        showNotYetOpenState(event);
        return; // don't wire up the entry form at all — it's not usable yet
    }

    await setGuestVisibility();
    $w('#radioEntryType').onChange(() => { togglePartnerFields(); updateFeePreview(); });
    togglePartnerFields();
    $w('#radioPartnerMode').onChange(togglePartnerMode);
    togglePartnerMode();
    $w('#inputEntryCount').onInput(updateFeePreview);
    updateFeePreview();
    $w('#btnSubmitEntry').onClick(handleSubmit);
    $w('#btnReplayTutorial').onClick(startEntrantTour);

    if (!(await hasSeenEntrantTour())) {
        startEntrantTour();
    }
});

function startEntrantTour() {
    runTour($w, ENTRANT_TOUR_STEPS, {
        onFinish: () => markEntrantTourSeen(true),
        onSkip: () => markEntrantTourSeen(false)
    });
}

/**
 * Logged-in members: persisted server-side, same as the producer side.
 * Guests: no durable identity to attach it to, so it's tracked in
 * browser local storage instead — good enough to avoid annoying a
 * guest on repeat visits from the same device, without pretending to
 * track them across devices.
 */
async function hasSeenEntrantTour() {
    const member = await currentMember.getMember().catch(() => null);
    if (member) {
        return hasSeenTour('entrant').catch(() => false);
    }
    return local.getItem(GUEST_TOUR_STORAGE_KEY) === 'true';
}

async function markEntrantTourSeen(completed) {
    const member = await currentMember.getMember().catch(() => null);
    if (member) {
        const markFn = completed ? markTourCompleted : markTourDismissed;
        markFn('entrant').catch(() => {});
    } else {
        local.setItem(GUEST_TOUR_STORAGE_KEY, 'true');
    }
}

async function updateFeePreview() {
    const count = parseInt($w('#inputEntryCount').value, 10) || 1;
    const isTeamEntry = $w('#radioEntryType').value === 'preformed_team';
    const teamRate = currentEvent.pricePerPreformedTeamEntry || currentEvent.pricePerEntry;
    const rate = isTeamEntry ? teamRate : currentEvent.pricePerEntry;

    const { producerAmount, drawProFee, processingFee, totalChargedToEntrant } =
        await calculateEntrantCharge(rate, count, currentEvent.paymentMethod);

    if (currentEvent.paymentMethod === 'cash') {
        $w('#textFeeAmount').text = `$${producerAmount.toFixed(2)} (${count} ${count === 1 ? 'entry' : 'entries'} at $${rate.toFixed(2)} each) — cash`;
    } else {
        $w('#textFeeAmount').text =
            `$${totalChargedToEntrant.toFixed(2)} total — $${producerAmount.toFixed(2)} entry fee + ` +
            `$${(drawProFee + processingFee).toFixed(2)} processing (online payment)`;
    }

    // Steer Me nudge: only relevant when entering solo, and only if
    // team-entering would actually be cheaper for this event.
    if (!isTeamEntry && teamRate < currentEvent.pricePerEntry) {
        const savingsPerEntry = currentEvent.pricePerEntry - teamRate;
        $w('#textSteerMeNudge').text =
            `Entering with a partner costs $${savingsPerEntry.toFixed(2)} less per entry than drawing in solo. ` +
            `Find a partner on Steer Me first to save.`;
        $w('#textSteerMeNudge').expand();
    } else if (!isTeamEntry) {
        // Even without a producer-set discount, pre-formed teams are
        // billed once per team instead of once per person — worth
        // surfacing even when the rate itself is identical.
        $w('#textSteerMeNudge').text = "Entering with a partner means one entry fee for the team instead of two. Find a partner on Steer Me first.";
        $w('#textSteerMeNudge').expand();
    } else {
        $w('#textSteerMeNudge').collapse();
    }
}

function togglePartnerMode() {
    if ($w('#radioPartnerMode').value === 'emailOnly') {
        $w('#inputPartnerEmailOnly').expand();
        $w('#textPartnerEmailOnlyHint').expand();
        $w('#inputPartnerFirstName').collapse();
        $w('#inputPartnerLastName').collapse();
        $w('#inputPartnerClassification').collapse();
        $w('#inputPartnerGlobalId').collapse();
        $w('#inputPartnerEmail').collapse();
        $w('#inputPartnerPhone').collapse();
    } else {
        $w('#inputPartnerEmailOnly').collapse();
        $w('#textPartnerEmailOnlyHint').collapse();
        $w('#inputPartnerFirstName').expand();
        $w('#inputPartnerLastName').expand();
        $w('#inputPartnerClassification').expand();
        $w('#inputPartnerGlobalId').expand();
        $w('#inputPartnerEmail').expand();
        $w('#inputPartnerPhone').expand();
    }
}

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
    const requestedEntryCount = parseInt($w('#inputEntryCount').value, 10) || 1;

    const entrantInput = {
        firstName: $w('#inputFirstName').value,
        lastName: $w('#inputLastName').value,
        classificationNumber: parseFloat($w('#inputClassification').value),
        globalMembershipId: $w('#inputGlobalId').value || null,
        email: $w('#inputEmail').value,
        phone: $w('#inputPhone').value || null,
        role: $w('#radioRole').value,
        isGuestEntry: isGuest,
        requestedEntryCount
    };

    let partnerInput = null;
    let partnerEmailOnly = null;

    if (isTeamEntry) {
        if ($w('#radioPartnerMode').value === 'emailOnly') {
            partnerEmailOnly = $w('#inputPartnerEmailOnly').value;
            if (!partnerEmailOnly) {
                setStatus("Enter your partner's email.", true);
                return;
            }
        } else {
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
    }

    $w('#btnSubmitEntry').disable();

    try {
        const result = await submitEntry(eventId, entrantInput, partnerInput, partnerEmailOnly);
        $w('#btnSubmitEntry').collapse();
        await showPaymentStep(result.entrant);
    } catch (err) {
        setStatus(err.message, true);
        $w('#btnSubmitEntry').enable();
    }
}

async function showPaymentStep(entrant) {
    if (currentEvent.paymentMethod === 'cash') {
        $w('#boxCashInstructions').expand();
        $w('#textCashAmount').text =
            `Bring $${entrant.feeOwed.toFixed(2)} in cash. You're in the draw, but not confirmed until it's paid — ` +
            `entries close the books before the draw runs.`;
        setStatus("You're entered.");
        return;
    }

    // Online payment — entrant.feeOwed is the PRODUCER's share only;
    // what they actually owe includes Draw Pro's cut + processing.
    const rate = entrant.entryType === 'preformed_team'
        ? (currentEvent.pricePerPreformedTeamEntry || currentEvent.pricePerEntry)
        : currentEvent.pricePerEntry;
    const { totalChargedToEntrant, drawProFee, processingFee } =
        await calculateEntrantCharge(rate, entrant.requestedEntryCount, 'online');

    $w('#boxOnlinePayment').expand();
    $w('#textOnlineAmount').text =
        `$${totalChargedToEntrant.toFixed(2)} due ($${entrant.feeOwed.toFixed(2)} entry fee + $${(drawProFee + processingFee).toFixed(2)} processing)`;
    $w('#btnPayNow').onClick(() => handlePayNow(entrant._id));
    setStatus("You're entered — pay now to confirm your spot.");
}

/**
 * PayPal's checkout is a two-step, client-driven flow, not a single
 * backend call like the Stripe version this replaced:
 *   1. createPayPalOrder() (backend) — computes the charge, creates the
 *      order with the producer/platform split already specified, returns
 *      an orderId.
 *   2. PayPal's own JS SDK renders approval buttons using that orderId —
 *      NOT BUILT HERE. This page needs a `<script>`-loaded PayPal SDK
 *      (via an HTML embed element or Wix's custom code panel) with
 *      `createOrder: () => orderId` and an `onApprove` callback that
 *      calls step 3 below. See PayPal's "Advanced Checkout" docs for the
 *      button/hosted-fields integration.
 *   3. capturePayPalOrder() (backend) — called from that onApprove
 *      callback once the buyer has approved; actually captures the funds.
 *
 * handlePayNow() below only does step 1 and stops — it hands back the
 * orderId a real PayPal-buttons integration would need. Wiring the SDK
 * itself, and calling handlePaymentApproved() from its onApprove
 * callback, is real frontend work not done as part of this page-code
 * pass. See docs/ARCHITECTURE.md's PayPal section for the full status.
 */
async function handlePayNow(entrantId) {
    $w('#btnPayNow').disable();
    setStatus('Preparing payment…');

    try {
        const { orderId } = await createPayPalOrder(eventId, entrantId);

        // TODO: render PayPal's approval buttons here using orderId,
        // instead of proceeding straight to capture. Left as a direct
        // call for now so the backend contract is exercised end-to-end
        // once real credentials exist, but this skips the buyer's actual
        // approval step — not correct for production until the SDK
        // buttons are wired in per the comment above.
        await handlePaymentApproved(entrantId, orderId);
    } catch (err) {
        setStatus(err.message, true);
        $w('#btnPayNow').enable();
    }
}

async function handlePaymentApproved(entrantId, orderId) {
    setStatus('Confirming payment…');
    try {
        const result = await capturePayPalOrder(eventId, entrantId, orderId);

        $w('#textPaymentConfirmation').text = `Paid $${result.amountCharged.toFixed(2)}. Confirmation: ${result.referenceNumber}`;
        $w('#textPaymentConfirmation').expand();
        $w('#btnPayNow').collapse();
        setStatus("Payment confirmed. You're locked in.");
    } catch (err) {
        setStatus(err.message, true);
        $w('#btnPayNow').enable();
    }
}

function setStatus(message, isError) {
    $w('#textStatus').text = message;
    $w('#textStatus').style.color = isError ? '#B3261E' : '#2E7D32';
}
