/**
 * Page: Entrant — Enter the Draw
 * Assumes eventId is passed via URL query param (?event=EVENT_ID) or a
 * dataset connection — adjust getEventIdFromContext() to match however
 * this page is actually routed.
 *
 * REWRITTEN 2026-07-21 for the multi-class redesign (see
 * docs/ARCHITECTURE.md's "Draw Pro multi-class redesign" entry). Read
 * this comment block before touching elements already placed in the
 * Editor — most of what exists stays exactly as-is; only a few specific
 * things changed:
 *
 *   - NEW: #dropdownClass — one event can now bundle several differently
 *     capped ropings (confirmed via real fliers); the entrant picks which
 *     one they're entering. Everything else on the page reacts to this
 *     selection.
 *   - CHANGED: #radioEntryType ('solo' | 'preformed_team', mutually
 *     exclusive) is REPLACED by #checkboxAddPartner (a plain yes/no). This
 *     isn't cosmetic — it's structural: one person can now submit BOTH a
 *     pre-formed partner AND draw-in entries in the same submission
 *     (confirmed real scenario), which a mutually-exclusive radio can't
 *     represent. Everything the radio used to show/hide (#boxPartnerFields
 *     and everything inside it) is UNCHANGED — same fields, same IDs, just
 *     triggered by the checkbox now instead of the radio's value.
 *   - CHANGED: #inputEntryCount now means "how many draw-in entries" (can
 *     be 0, if the entrant only wants their one pre-formed partner and no
 *     blind draw-in slots), not "total entries." Total requested = 1 (if
 *     checkboxAddPartner is checked) + this count.
 *   - CHANGED: #textEventCap shows the SELECTED class's cap, updates when
 *     the dropdown changes — it used to show one flat event-wide number.
 *
 * Expected Editor elements:
 *   #textEventTitle           (display only, event shell)
 *   #dropdownClass            (NEW — which roping within the event)
 *   #textEventCap             (display only, reflects selected class)
 *   #inputFirstName, #inputLastName, #inputClassification,
 *   #inputGlobalId (optional), #inputEmail, #inputPhone
 *   #radioRole                ('header' | 'heeler')
 *   #checkboxAddPartner       (NEW — replaces #radioEntryType; "I already have a partner")
 *   #boxPartnerFields          (container, shown only if checkboxAddPartner is checked — UNCHANGED)
 *   #radioPartnerMode          ('fullDetails' | 'emailOnly', shown only if checkboxAddPartner is checked — UNCHANGED)
 *   #inputPartnerFirstName, #inputPartnerLastName, #inputPartnerClassification,
 *   #inputPartnerGlobalId, #inputPartnerEmail, #inputPartnerPhone   (shown if radioPartnerMode = fullDetails — UNCHANGED)
 *   #inputPartnerEmailOnly    (shown if radioPartnerMode = emailOnly — UNCHANGED)
 *   #textPartnerEmailOnlyHint (UNCHANGED)
 *   #checkboxGuestEntry       (shown only to non-logged-in visitors — UNCHANGED)
 *   #inputEntryCount          (numeric, draw-in entries specifically now — can be 0)
 *   #textFeeAmount            (live-computed total based on partner + draw-in count)
 *   #textSteerMeNudge         (shown when a draw-in entry is requested and a team rate is cheaper)
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
 *   -- Pre-open state (no class in this event has opened entries yet) --
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
        targetId: '#dropdownClass',
        title: 'Which roping?',
        body: 'Pick the class you\'re entering — cap, price, and rules below all update to match it.'
    },
    {
        targetId: '#checkboxAddPartner',
        title: 'Already have a partner?',
        body: "Check this if you know who you're entering with. Leave it unchecked (or add draw-in entries below too) to be randomly matched when the draw runs."
    },
    {
        targetId: '#inputEntryCount',
        title: 'Adding draw-in entries?',
        body: 'Set how many additional times you want to draw in — you can combine this with a known partner above, or use it on its own. Your fee updates automatically below.'
    },
    {
        targetId: '#textFeeAmount',
        title: 'Your total',
        body: 'This updates live as you change your entries.'
    },
    {
        targetId: '#btnSubmitEntry',
        title: "You're ready",
        body: "Once you submit, you'll see exactly how to pay — cash instructions, or a secure online payment, depending on how this producer collects fees."
    }
];

let eventId;
let currentEvent;
let openClasses = [];
let currentClass;

$w.onReady(async function () {
    eventId = wixLocation.query.event;
    if (!eventId) {
        setStatus('No event specified.', true);
        $w('#btnSubmitEntry').disable();
        return;
    }

    currentEvent = await loadEventSummary();
    openClasses = await loadOpenClasses();

    if (openClasses.length === 0) {
        await showNotYetOpenState();
        return; // don't wire up the entry form at all — it's not usable yet
    }

    populateClassDropdown(openClasses);
    currentClass = openClasses[0];
    $w('#dropdownClass').value = currentClass._id;
    onClassChanged();

    $w('#dropdownClass').onChange(onClassChanged);
    await setGuestVisibility();
    $w('#checkboxAddPartner').onChange(() => { togglePartnerFields(); updateFeePreview(); });
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

/**
 * Reacts to the class dropdown changing: updates the cap display, shows
 * only the entry controls this class actually allows (entryModeAllowed),
 * and recomputes the fee preview.
 */
function onClassChanged() {
    const selectedId = $w('#dropdownClass').value;
    currentClass = openClasses.find(c => c._id === selectedId) || openClasses[0];

    let capText = `Cap: ${currentClass.capNumber}`;
    if (currentClass.heelerSubCap) {
        capText += ` (heeler cap: ${currentClass.heelerSubCap})`;
    }
    $w('#textEventCap').text = capText;

    // Only show the entry controls this class's entryModeAllowed permits.
    if (currentClass.entryModeAllowed === 'pick_only') {
        $w('#checkboxAddPartner').show();
        $w('#inputEntryCount').hide();
        $w('#checkboxAddPartner').checked = true; // pick_only means a partner is mandatory
        $w('#checkboxAddPartner').disable();
    } else if (currentClass.entryModeAllowed === 'draw_only') {
        $w('#checkboxAddPartner').hide();
        $w('#checkboxAddPartner').checked = false;
        $w('#inputEntryCount').show();
    } else {
        $w('#checkboxAddPartner').show();
        $w('#checkboxAddPartner').enable();
        $w('#inputEntryCount').show();
    }

    togglePartnerFields();
    updateFeePreview();
}

/**
 * Fee preview now covers a mixed submission: a pre-formed partner (if
 * checkboxAddPartner is checked) priced at the team rate, PLUS any
 * draw-in entries priced at pricePerEntry + drawInSurchargeFee. Both can
 * be present at once — confirmed real scenario, not an either/or like the
 * old radioEntryType version assumed.
 */
async function updateFeePreview() {
    const drawInCount = Math.max(0, parseInt($w('#inputEntryCount').value, 10) || 0);
    const hasPartner = $w('#checkboxAddPartner').checked;

    if (!hasPartner && drawInCount === 0) {
        $w('#textFeeAmount').text = 'Add a partner and/or set a draw-in count to see your total.';
        $w('#textSteerMeNudge').collapse();
        return;
    }

    const teamRate = currentClass.pricePerPreformedTeamEntry || currentClass.pricePerEntry;
    const drawInRate = currentClass.pricePerEntry + (currentClass.drawInSurchargeFee || 0);

    let producerTotal = 0;
    let drawProTotal = 0;
    let processingTotal = 0;
    const parts = [];

    if (hasPartner) {
        const { producerAmount, drawProFee, processingFee } =
            await calculateEntrantCharge(teamRate, 1, currentEvent.paymentMethod);
        producerTotal += producerAmount;
        drawProTotal += drawProFee || 0;
        processingTotal += processingFee || 0;
        parts.push(`1 pre-formed entry at $${teamRate.toFixed(2)}`);
    }

    if (drawInCount > 0) {
        const { producerAmount, drawProFee, processingFee } =
            await calculateEntrantCharge(drawInRate, drawInCount, currentEvent.paymentMethod);
        producerTotal += producerAmount;
        drawProTotal += drawProFee || 0;
        processingTotal += processingFee || 0;
        parts.push(`${drawInCount} draw-in ${drawInCount === 1 ? 'entry' : 'entries'} at $${drawInRate.toFixed(2)} each`);
    }

    if (currentEvent.paymentMethod === 'cash') {
        $w('#textFeeAmount').text = `$${producerTotal.toFixed(2)} (${parts.join(' + ')}) — cash`;
    } else {
        $w('#textFeeAmount').text =
            `$${(producerTotal + drawProTotal + processingTotal).toFixed(2)} total — $${producerTotal.toFixed(2)} entry fees + ` +
            `$${(drawProTotal + processingTotal).toFixed(2)} processing (online payment)`;
    }

    // Steer Me nudge: only relevant if any draw-in entries are requested,
    // and only if team-entering would actually be cheaper for this class.
    if (drawInCount > 0 && teamRate < drawInRate) {
        const savingsPerEntry = drawInRate - teamRate;
        $w('#textSteerMeNudge').text =
            `Entering with a partner costs $${savingsPerEntry.toFixed(2)} less per entry than drawing in. ` +
            `Find a partner on Steer Me first to save.`;
        $w('#textSteerMeNudge').expand();
    } else if (drawInCount > 0) {
        $w('#textSteerMeNudge').text = "Entering with a partner means one entry fee for the team instead of paying the draw-in rate. Find a partner on Steer Me first.";
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

async function showNotYetOpenState() {
    $w('#boxNotYetOpen').expand();
    // Everything below this form is collapsed rather than just left
    // unwired, so a visitor can't fill out fields that won't submit.
    $w('#dropdownClass').collapse();
    $w('#checkboxAddPartner').collapse();
    $w('#boxPartnerFields').collapse();
    $w('#btnSubmitEntry').collapse();
    $w('#checkboxGuestEntry').collapse();

    // No open class — find the soonest entryOpenDateTime across every
    // class in this event for the "opens at" message, since classes now
    // open independently rather than the whole event opening at once.
    const allClasses = await wixData.query('DrawProEventClasses').eq('eventId', eventId).find();
    const soonest = allClasses.items
        .map(c => c.entryOpenDateTime)
        .filter(Boolean)
        .sort((a, b) => new Date(a) - new Date(b))[0];
    const opensAt = soonest ? new Date(soonest).toLocaleString() : 'soon';
    $w('#textNotYetOpenMessage').text = `Entries for ${currentEvent.title} haven't opened yet. Opens ${opensAt}.`;

    $w('#btnSubscribeAlert').onClick(() => handleSubscribeAlert(eventId));
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
    return event;
}

/** Only classes currently open for entries populate the dropdown. */
async function loadOpenClasses() {
    const result = await wixData.query('DrawProEventClasses').eq('eventId', eventId).eq('status', 'open').find();
    return result.items;
}

function populateClassDropdown(classes) {
    $w('#dropdownClass').options = classes.map(c => ({ label: c.label, value: c._id }));
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
    if ($w('#checkboxAddPartner').checked) {
        $w('#boxPartnerFields').expand();
    } else {
        $w('#boxPartnerFields').collapse();
    }
}

async function handleSubmit() {
    setStatus('');

    const hasPartner = $w('#checkboxAddPartner').checked;
    const drawInCount = Math.max(0, parseInt($w('#inputEntryCount').value, 10) || 0);
    const isGuest = $w('#checkboxGuestEntry').checked || false;

    if (!hasPartner && drawInCount === 0) {
        setStatus('Add a partner and/or set a draw-in count of at least 1.', true);
        return;
    }

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

    const preformedPartners = [];
    if (hasPartner) {
        if ($w('#radioPartnerMode').value === 'emailOnly') {
            const partnerEmailOnly = $w('#inputPartnerEmailOnly').value;
            if (!partnerEmailOnly) {
                setStatus("Enter your partner's email.", true);
                return;
            }
            preformedPartners.push({ emailOnly: partnerEmailOnly });
        } else {
            preformedPartners.push({
                fullDetails: {
                    firstName: $w('#inputPartnerFirstName').value,
                    lastName: $w('#inputPartnerLastName').value,
                    classificationNumber: parseFloat($w('#inputPartnerClassification').value),
                    globalMembershipId: $w('#inputPartnerGlobalId').value || null,
                    email: $w('#inputPartnerEmail').value,
                    phone: $w('#inputPartnerPhone').value || null,
                    role: $w('#radioRole').value === 'header' ? 'heeler' : 'header',
                    isGuestEntry: isGuest
                }
            });
        }
    }

    $w('#btnSubmitEntry').disable();

    try {
        const result = await submitEntry(currentClass._id, entrantInput, { preformedPartners, drawInCount });
        $w('#btnSubmitEntry').collapse();
        // Payment step needs one representative entrant record to compute
        // against — prefer the draw-in record (its fee reflects the full
        // mixed submission via feeOwed on each record individually; see
        // showPaymentStep, which now sums across everything this
        // submission created rather than assuming a single entrant record).
        await showPaymentStep(result);
    } catch (err) {
        setStatus(err.message, true);
        $w('#btnSubmitEntry').enable();
    }
}

/**
 * UPDATED for mixed submissions: a single submitEntry() call can now
 * return a pre-formed entry AND a draw-in entry at once. The payment step
 * sums fees across whichever of those exist rather than assuming exactly
 * one entrant record, and online payment is created against the draw-in
 * entrant if one exists (falling back to the pre-formed entrant) since
 * createPayPalOrder() currently expects a single entrantId — a real
 * simplification worth knowing about: if BOTH a pre-formed and a draw-in
 * entry exist in one submission, only one of them drives the PayPal
 * order's line-item pricing lookup (it re-derives its own rate from
 * entryType either way, so the amount charged is still correct — this
 * only affects which single entrant record capturePayPalOrder() marks
 * 'paid' first; see the note in payments.jsw if that becomes a problem
 * once real online-payment testing starts).
 */
async function showPaymentStep(result) {
    const entrants = [];
    if (result.preformedEntries) {
        for (const p of result.preformedEntries) entrants.push(p.entrant);
    }
    if (result.drawInEntry) entrants.push(result.drawInEntry);

    const totalFeeOwed = entrants.reduce((sum, e) => sum + (e.feeOwed || 0), 0);
    // Prefer the draw-in entrant for online payment (see doc comment above).
    const paymentEntrant = result.drawInEntry || (result.preformedEntries[0] && result.preformedEntries[0].entrant);

    if (currentEvent.paymentMethod === 'cash') {
        $w('#boxCashInstructions').expand();
        $w('#textCashAmount').text =
            `Bring $${totalFeeOwed.toFixed(2)} in cash. You're in the draw, but not confirmed until it's paid — ` +
            `entries close the books before the draw runs.`;
        setStatus("You're entered.");
        return;
    }

    // Online payment — sum each entrant's own rate rather than
    // recomputing a single blended rate, since a mixed submission can
    // have different rates for its pre-formed vs draw-in portions.
    let totalChargedToEntrant = 0;
    for (const e of entrants) {
        const rate = e.entryType === 'preformed_team'
            ? (currentClass.pricePerPreformedTeamEntry || currentClass.pricePerEntry)
            : currentClass.pricePerEntry + (currentClass.drawInSurchargeFee || 0);
        const charge = await calculateEntrantCharge(rate, e.requestedEntryCount, 'online');
        totalChargedToEntrant += charge.totalChargedToEntrant;
    }

    $w('#boxOnlinePayment').expand();
    $w('#textOnlineAmount').text =
        `$${totalChargedToEntrant.toFixed(2)} due ($${totalFeeOwed.toFixed(2)} entry fees + $${(totalChargedToEntrant - totalFeeOwed).toFixed(2)} processing)`;
    $w('#btnPayNow').onClick(() => handlePayNow(paymentEntrant._id));
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
 *
 * KNOWN LIMITATION as of the multi-class redesign: for a mixed submission
 * (both a pre-formed and a draw-in entry), this only creates/captures a
 * PayPal order against ONE of the two entrant records (see showPaymentStep's
 * doc comment) even though textOnlineAmount displays the combined total.
 * createPayPalOrder would need to accept multiple entrantIds to charge one
 * order covering both — not built, flagged rather than silently wrong.
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
