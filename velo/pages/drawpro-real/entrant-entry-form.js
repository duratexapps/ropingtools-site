/**
 * Page: Entrant — Enter the Draw
 * Assumes eventId is passed via URL query param (?event=EVENT_ID) or a
 * dataset connection — adjust getEventIdFromContext() to match however
 * this page is actually routed.
 *
 * NEW, added 2026-07-28 - also reads an optional `?handoff=<id>` param
 * (see applyEntryHandoff() near the bottom of this file) to prefill an
 * entrant's info, and their already-confirmed partner's info if they
 * have one, when this link came from Steer Me's "Enter the Draw" rather
 * than a bare QR-code scan. Real friction flagged directly by the user:
 * a Steer Me user shouldn't have to retype what's already known. No new
 * Editor elements needed for this - it only ever sets .value on fields
 * that already exist per the list below.
 *

 * REWRITTEN 2026-07-21 for the multi-class redesign (see
 * docs/ARCHITECTURE.md's "Draw Pro multi-class redesign" entry), THEN
 * REVISED again the same day for a second real scenario: one person's
 * role can now differ between their pre-formed partner and their draw-in
 * entries. Confirmed real example — a #5.5 heeler entering with a friend
 * who's a better heeler can rationally pre-form as HEADER with that
 * friend (a lower-numbered header has better catch odds than a
 * lower-numbered heeler), while separately drawing in as heeler — their
 * genuinely stronger position — for their own solo entries. One radio
 * group can't represent "different role in different parts of the same
 * submission," so there are now TWO role selectors, not one. Read this
 * whole comment block before touching elements already placed in the
 * Editor — most of what exists stays exactly as-is; the changes are:
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
 *   - CHANGED: #radioRole now specifically means "my role WITH MY
 *     PARTNER" — only relevant/shown when #checkboxAddPartner is checked.
 *     Same element, same ID, narrower meaning.
 *   - NEW: #radioDrawInRole ('header' | 'heeler') — "my role when drawing
 *     in," independent of #radioRole above. Only relevant/shown when
 *     #inputEntryCount is greater than 0. Can be the SAME or DIFFERENT
 *     role than #radioRole — both can be visible and set differently at
 *     once, per the confirmed scenario above.
 *   - NEW: #checkboxUpAndBack — "Also enter with the same partner in
 *     opposite positions?" Real team-roping mechanic: the same two people
 *     CAN enter a class twice with roles swapped (unlike entering with the
 *     identical role assignment twice, which normally isn't allowed).
 *     Shown only when #checkboxAddPartner is checked. If checked at
 *     submit, the code automatically builds a SECOND pre-formed pairing
 *     using the same partner info with roles flipped — no separate UI for
 *     re-entering the partner's details. Doesn't apply to draw-in at all
 *     (confirmed — draw-in already naturally varies who you're paired
 *     with each time, no special handling needed there).
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
 *   #radioRole                ('header' | 'heeler') — my role WITH MY PARTNER; shown only if checkboxAddPartner is checked
 *   #checkboxAddPartner       (NEW — replaces #radioEntryType; "I already have a partner")
 *   #boxPartnerFields          (container, shown only if checkboxAddPartner is checked — UNCHANGED)
 *   #radioPartnerMode          ('fullDetails' | 'emailOnly', shown only if checkboxAddPartner is checked — UNCHANGED)
 *   #inputPartnerFirstName, #inputPartnerLastName, #inputPartnerClassification,
 *   #inputPartnerGlobalId, #inputPartnerEmail, #inputPartnerPhone   (shown if radioPartnerMode = fullDetails — UNCHANGED)
 *   #inputPartnerEmailOnly    (shown if radioPartnerMode = emailOnly — UNCHANGED)
 *   #textPartnerEmailOnlyHint (UNCHANGED)
 *   #checkboxUpAndBack        (NEW — "also enter with this partner in opposite positions?"; shown only if checkboxAddPartner is checked)
 *   #checkboxGuestEntry       (shown only to non-logged-in visitors — UNCHANGED)
 *   #inputEntryCount          (numeric, draw-in entries specifically now — can be 0)
 *   #radioDrawInRole          (NEW — 'header' | 'heeler'; my role when drawing in; shown only if inputEntryCount > 0)
 *   #textFeeAmount            (live-computed total based on partner + draw-in count)
 *   #textSteerMeNudge         (shown when a draw-in entry is requested and a team rate is cheaper)
 *   #btnSubmitEntry
 *   #textStatus
 *   #linkEntryLegal           (NEW, added 2026-07-28 — small/muted link near the submit
 *                              button, "present but not overly conspicuous" per direct
 *                              instruction. Opens the Legal page (see velo/pages/
 *                              drawpro-real/drawpro-legal.js) in a new tab.)
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
import { resolveEntryHandoff } from 'backend/steerMeHandoff.jsw';
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
        targetId: '#radioDrawInRole',
        title: 'Your role when drawing in',
        body: "This can be different from your role with a known partner above — e.g. head with a partner you trust, then draw in as a heeler if that's your stronger, or lower-odds, position."
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
        safeCall(() => $w('#btnSubmitEntry').disable());
        return;
    }

    // Click/change handlers wired FIRST, each individually defensive -
    // same lesson learned live this same week on Producer Event Setup
    // (#boxAddClass) and Producer Dashboard (duplicate repeater IDs): a
    // single bad element anywhere in a long, unguarded $w.onReady()
    // silently kills everything after it. This page has dozens of
    // referenced elements and had never been tested live before now, so
    // treating that as a real risk rather than a hypothetical.
    safeCall(() => $w('#dropdownClass').onChange(onClassChanged));
    safeCall(() => $w('#checkboxAddPartner').onChange(() => { togglePartnerFields(); updateFeePreview(); }));
    safeCall(() => $w('#checkboxUpAndBack').onChange(updateFeePreview));
    safeCall(() => $w('#radioPartnerMode').onChange(togglePartnerMode));
    safeCall(() => $w('#inputEntryCount').onInput(() => { toggleDrawInRoleVisibility(); updateFeePreview(); }));
    safeCall(() => $w('#btnSubmitEntry').onClick(handleSubmit));
    safeCall(() => $w('#btnReplayTutorial').onClick(startEntrantTour));
    // NEW, added 2026-07-28 - small/muted link near the submit button,
    // "present but not overly conspicuous" per direct instruction. This is
    // the highest-traffic entrant touchpoint in Draw Pro, so it gets its
    // own link rather than relying solely on the home page footer / producer
    // profile link (see drawpro-legal.js for the full rollout).
    safeCall(() => $w('#linkEntryLegal').onClick(() => wixLocation.to('/legal')));

    currentEvent = await loadEventSummary();
    openClasses = await loadOpenClasses();

    if (openClasses.length === 0) {
        await showNotYetOpenState();
        return; // don't wire up the entry form at all — it's not usable yet
    }

    populateClassDropdown(openClasses);
    currentClass = openClasses[0];
    safeCall(() => { $w('#dropdownClass').value = currentClass._id; });
    safeCall(() => onClassChanged());

    await setGuestVisibility();
    safeCall(() => togglePartnerFields());
    safeCall(() => togglePartnerMode());
    safeCall(() => toggleDrawInRoleVisibility());

    // NEW, added 2026-07-28 - real friction flagged directly by the user:
    // a Steer Me user (and their already-confirmed partner, if they have
    // one) shouldn't have to retype everything here. Runs AFTER the
    // partner-box visibility defaults above are set, since a successful
    // handoff with partner data deliberately overrides that default (see
    // applyEntryHandoff() below) - and BEFORE updateFeePreview() so a
    // prefilled partner's classification counts toward the fee shown.
    await applyEntryHandoff();

    await updateFeePreview();

    if (!(await hasSeenEntrantTour())) {
        startEntrantTour();
    }
});

/**
 * Reads `?handoff=<id>` (present only when this link came from Steer
 * Me's "Enter the Draw" - see EventCard.tsx / my-requests.tsx in
 * steer-me-app), resolves it via backend/steerMeHandoff.jsw, and
 * prefills whatever it returns. A handoff can carry just the entrant's
 * own info (plain "Enter the Draw" tap, no confirmed partner yet) or
 * both people's info (an already-accepted Steer Me partner request for
 * this exact event) - see migration 0036_entry_handoffs.sql in
 * steer-me-app for the full reasoning on why this is a short-lived,
 * single-use server-side handoff rather than raw data in the URL.
 *
 * Deliberately silent on failure/absence - a missing, expired, or
 * already-used handoff just means "show the normal blank form," never
 * an error surfaced to the entrant. This is a convenience, not a
 * requirement to enter.
 */
async function applyEntryHandoff() {
    const handoffId = wixLocation.query.handoff;
    if (!handoffId) return;

    let payload;
    try {
        payload = await resolveEntryHandoff(handoffId);
    } catch (err) {
        console.error(`[entrant-entry-form] resolveEntryHandoff threw: ${err.message}`);
        return;
    }
    if (!payload) return;

    const { me, partner } = payload;

    safeCall(() => { $w('#inputFirstName').value = me.firstName ?? ''; });
    safeCall(() => { $w('#inputLastName').value = me.lastName ?? ''; });
    if (me.classification != null) {
        safeCall(() => { $w('#inputClassification').value = String(me.classification); });
    }
    if (me.globalMembershipId) {
        safeCall(() => { $w('#inputGlobalId').value = me.globalMembershipId; });
    }
    // Steer Me collects one freeform "phone or email" field, not two
    // separate ones (real, confirmed data-model gap - see steer-me-app's
    // sign-up.tsx) - a simple @ check is the best available heuristic for
    // which of Draw Pro's two separate fields it belongs in. Whichever
    // field it doesn't look like stays blank for the entrant to fill in
    // themselves, same as if no handoff had ever run.
    if (me.contact) {
        safeCall(() => {
            if (me.contact.includes('@')) {
                $w('#inputEmail').value = me.contact;
            } else {
                $w('#inputPhone').value = me.contact;
            }
        });
    }

    if (!partner) return;

    // A handoff only ever carries partner data for an ALREADY-ACCEPTED
    // Steer Me partner request (see create_entry_handoff() in migration
    // 0036) - so checking this and filling fullDetails mode is safe to
    // do unconditionally, not something the entrant needs to opt into
    // first the way a fresh, un-prefilled visitor would.
    safeCall(() => { $w('#checkboxAddPartner').checked = true; });
    safeCall(() => togglePartnerFields());
    safeCall(() => { $w('#radioPartnerMode').value = 'fullDetails'; });
    safeCall(() => togglePartnerMode());
    if (me.role) {
        safeCall(() => { $w('#radioRole').value = me.role; });
    }

    safeCall(() => { $w('#inputPartnerFirstName').value = partner.firstName ?? ''; });
    safeCall(() => { $w('#inputPartnerLastName').value = partner.lastName ?? ''; });
    if (partner.classification != null) {
        safeCall(() => { $w('#inputPartnerClassification').value = String(partner.classification); });
    }
    if (partner.globalMembershipId) {
        safeCall(() => { $w('#inputPartnerGlobalId').value = partner.globalMembershipId; });
    }
    if (partner.contact) {
        safeCall(() => {
            if (partner.contact.includes('@')) {
                $w('#inputPartnerEmail').value = partner.contact;
            } else {
                $w('#inputPartnerPhone').value = partner.contact;
            }
        });
    }
}

// Runs fn() and swallows/logs any error instead of letting it propagate -
// same pattern established in producer-event-setup.js after #boxAddClass
// crashed that whole page over a single unexpected element type.
function safeCall(fn) {
    try {
        fn();
    } catch (err) {
        console.error(`[entrant-entry-form] setup step failed (page keeps working): ${err.message}`);
    }
}

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
    toggleDrawInRoleVisibility();
    updateFeePreview();
}

/**
 * Fee preview now covers a mixed submission: a pre-formed partner (if
 * checkboxAddPartner is checked) priced at the team rate, PLUS any
 * draw-in entries priced at pricePerEntry + drawInSurchargeFee. Both can
 * be present at once — confirmed real scenario, not an either/or like the
 * old radioEntryType version assumed. Also accounts for #checkboxUpAndBack
 * doubling the pre-formed entry count (same partner, opposite positions).
 */
async function updateFeePreview() {
    const drawInCount = Math.max(0, parseInt($w('#inputEntryCount').value, 10) || 0);
    const hasPartner = $w('#checkboxAddPartner').checked;
    const preformedCount = hasPartner ? ($w('#checkboxUpAndBack').checked ? 2 : 1) : 0;

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
            await calculateEntrantCharge(teamRate, preformedCount, currentEvent.paymentMethod);
        producerTotal += producerAmount;
        drawProTotal += drawProFee || 0;
        processingTotal += processingFee || 0;
        parts.push(`${preformedCount} pre-formed ${preformedCount === 1 ? 'entry' : 'entries'} at $${teamRate.toFixed(2)} each`);
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
    //
    // FIXED live 2026-07-28: this comment already said "everything," but
    // the code only ever collapsed the class/partner/guest/submit
    // elements - the entire "Your Info" entrant-identity section
    // (#inputFirstName through #inputPhone, plus the draw-in count/role
    // and the fee display, which are meaningless with nothing to submit)
    // was left fully visible and editable the whole time. Confirmed live
    // via a headless-browser render: a visitor landing on a not-yet-open
    // event saw a real, fillable-looking form sitting right next to the
    // "hasn't opened yet" message, with no way to actually submit it -
    // exactly the kind of half-finished-looking page this function's own
    // comment was trying to prevent.
    // Wrapped in safeCall individually - same defensive reasoning as the
    // rest of this file (a real element sometimes turns out not to be
    // the type its name implies, e.g. #boxAddClass on Producer Event
    // Setup - one surprise here shouldn't stop the rest from collapsing.
    safeCall(() => $w('#dropdownClass').collapse());
    safeCall(() => $w('#textEventCap').collapse());
    safeCall(() => $w('#checkboxAddPartner').collapse());
    safeCall(() => $w('#boxPartnerFields').collapse());
    safeCall(() => $w('#radioRole').collapse());
    safeCall(() => $w('#inputFirstName').collapse());
    safeCall(() => $w('#inputLastName').collapse());
    safeCall(() => $w('#inputClassification').collapse());
    safeCall(() => $w('#inputGlobalId').collapse());
    safeCall(() => $w('#inputEmail').collapse());
    safeCall(() => $w('#inputPhone').collapse());
    safeCall(() => $w('#inputEntryCount').collapse());
    safeCall(() => $w('#radioDrawInRole').collapse());
    safeCall(() => $w('#textFeeAmount').collapse());
    safeCall(() => $w('#textSteerMeNudge').collapse());
    safeCall(() => $w('#btnSubmitEntry').collapse());
    safeCall(() => $w('#checkboxGuestEntry').collapse());

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

    // FIXED live 2026-07-28: same class of bug found and fixed elsewhere
    // this same day (drawpro-home.js, producer-draw-sheet-review.js) -
    // this call wasn't wrapped in safeCall() like everything else on this
    // page is.
    safeCall(() => $w('#btnSubscribeAlert').onClick(() => handleSubscribeAlert(eventId)));
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
    // Defensive: the actual event data must load and return regardless
    // of whether displaying it succeeds - a bad #textEventTitle element
    // shouldn't be able to block currentEvent from ever getting set,
    // which the rest of this page depends on entirely.
    safeCall(() => { $w('#textEventTitle').text = event.title; });
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

/**
 * #radioRole now specifically means "my role WITH MY PARTNER" (see the
 * file header comment) — shown alongside the partner fields, not
 * separately.
 */
function togglePartnerFields() {
    if ($w('#checkboxAddPartner').checked) {
        $w('#boxPartnerFields').expand();
        $w('#radioRole').expand();
        $w('#checkboxUpAndBack').expand();
    } else {
        $w('#boxPartnerFields').collapse();
        $w('#radioRole').collapse();
        $w('#checkboxUpAndBack').collapse();
        $w('#checkboxUpAndBack').checked = false;
    }
}

/**
 * #radioDrawInRole is independent of #radioRole above — confirmed real
 * scenario: an entrant's role with a known partner can differ from their
 * role when drawing in (see file header comment). Shown whenever a
 * draw-in count is actually requested, regardless of whether a partner
 * is also being added.
 */
function toggleDrawInRoleVisibility() {
    if (currentClass && currentClass.entryModeAllowed === 'pick_only') {
        $w('#radioDrawInRole').collapse();
        return;
    }
    const drawInCount = Math.max(0, parseInt($w('#inputEntryCount').value, 10) || 0);
    if (drawInCount > 0) {
        $w('#radioDrawInRole').expand();
    } else {
        $w('#radioDrawInRole').collapse();
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

    // No role here — role now depends on WHICH part of the submission
    // (pre-formed vs draw-in), not one fixed value for the whole person.
    // See file header comment for the confirmed real scenario this fixes.
    const personInfo = {
        firstName: $w('#inputFirstName').value,
        lastName: $w('#inputLastName').value,
        classificationNumber: parseFloat($w('#inputClassification').value),
        globalMembershipId: $w('#inputGlobalId').value || null,
        email: $w('#inputEmail').value,
        phone: $w('#inputPhone').value || null,
        isGuestEntry: isGuest
    };

    const preformedPartners = [];
    if (hasPartner) {
        const myRole = $w('#radioRole').value; // "my role WITH MY PARTNER" specifically
        const oppositeRole = myRole === 'header' ? 'heeler' : 'header';
        const upAndBack = $w('#checkboxUpAndBack').checked;

        if ($w('#radioPartnerMode').value === 'emailOnly') {
            const partnerEmailOnly = $w('#inputPartnerEmailOnly').value;
            if (!partnerEmailOnly) {
                setStatus("Enter your partner's email.", true);
                return;
            }
            preformedPartners.push({ myRole, emailOnly: partnerEmailOnly });
            // Up and back: same two people, roles swapped — real team-
            // roping mechanic, not entering the identical pairing twice.
            if (upAndBack) {
                preformedPartners.push({ myRole: oppositeRole, emailOnly: partnerEmailOnly });
            }
        } else {
            const partnerFullDetails = {
                firstName: $w('#inputPartnerFirstName').value,
                lastName: $w('#inputPartnerLastName').value,
                classificationNumber: parseFloat($w('#inputPartnerClassification').value),
                globalMembershipId: $w('#inputPartnerGlobalId').value || null,
                email: $w('#inputPartnerEmail').value,
                phone: $w('#inputPartnerPhone').value || null,
                isGuestEntry: isGuest
                // No role here either — submitPreformedTeamFull derives
                // the partner's role as the opposite of myRole, backend-side.
            };
            preformedPartners.push({ myRole, fullDetails: partnerFullDetails });
            if (upAndBack) {
                preformedPartners.push({ myRole: oppositeRole, fullDetails: partnerFullDetails });
            }
        }
    }

    // "My role when drawing in" — independent of myRole above, can be the
    // same or different (confirmed real scenario: header with a known
    // partner, heeler for draw-in, same person, same submission).
    const drawIn = drawInCount > 0
        ? { role: $w('#radioDrawInRole').value, count: drawInCount }
        : null;

    $w('#btnSubmitEntry').disable();

    try {
        const result = await submitEntry(currentClass._id, personInfo, { preformedPartners, drawIn });
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
    // FIXED live 2026-07-28: same safeCall gap as #btnSubscribeAlert above.
    safeCall(() => $w('#btnPayNow').onClick(() => handlePayNow(paymentEntrant._id)));
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

// FIXED live 2026-07-28: caught by an automated back-test sweep - an
// uncaught "Cannot set properties of undefined (setting 'color')"
// TypeError was thrown from this exact function (identical, unwrapped
// code in all 6 pages that have their own setStatus()). Wrapped the
// function's OWN body here rather than every individual setStatus(...)
// call site, since this function is called from dozens of places per
// page - one fix here protects all of them at once.
function setStatus(message, isError) {
    safeCall(() => { $w('#textStatus').text = message; });
    safeCall(() => { $w('#textStatus').style.color = isError ? '#B3261E' : '#2E7D32'; });
}
