/**
 * Page: Producer — Draw Sheet Review & Sign-Off
 * Covers the "verify → draw → notify" pipeline's middle step for both
 * entry paths.
 *
 * REWRITTEN 2026-07-21 for the multi-class redesign (see
 * docs/ARCHITECTURE.md's "Draw Pro multi-class redesign" entry). The old
 * version of this page reviewed/drew one flat event. Now every one of
 * matching-engine.jsw's and notifications.jsw's functions used here takes
 * a classId, not an eventId — draws run per class, since classes close and
 * draw independently (one class in an event can be finalized and drawn
 * while a sibling class is still open for entries). This page now needs a
 * class selector; everything downstream of it is scoped to whichever class
 * is selected.
 *
 * Expected Editor elements:
 *   #dropdownClass            (NEW — which class within the event to review/draw. Only classes with status 'closed' or beyond are meaningful choices here, since a still-'open' class isn't ready to finalize)
 *   #repeaterEntrants        (repeater listing all entrants pre-draw for the SELECTED class, with #textEntrantName, #textEntrantRole, #textEntrantClass inside)
 *   #btnFinalize              (locks entries, moves to pending_signoff)
 *   #btnSignOff               (triggers the actual draw — requires confirm)
 *   #boxSignOffConfirm         (confirmation modal/container)
 *   #btnConfirmSignOff
 *   #btnCancelSignOff
 *   #repeaterTeams            (post-draw: shows drawn teams, with
 *                             #textTeamNumber, #textHeader, #textHeeler,
 *                             #iconSpacingFlag (shown if spacingFlagged and
 *                             not yet acknowledged), #checkboxSwapSelect
 *                             (select this team as one half of a swap))
 *   #iconIncentiveFlag        (NEW — inside #repeaterTeams item. Shown only if
 *                             team.qualifiesForIncentive === true, so the
 *                             producer can visually pick out incentive-
 *                             qualifying teams at a glance during a live
 *                             event for their own manual time-bonus
 *                             tracking. Display-only, doesn't affect
 *                             anything else on this page.)
 *   #btnSwapSelected          (swaps the two currently-checked teams)
 *   #btnAcknowledgeConflict   (shown per flagged row, opens the ack box)
 *   #boxAcknowledgeConfirm    (confirmation container with a note field)
 *   #inputAcknowledgeNote
 *   #btnConfirmAcknowledge
 *   #repeaterUnmatched        (entrants the algorithm couldn't pair)
 *   #dropdownManualHeader, #dropdownManualHeeler, #btnManualPair
 *   #boxOverrideConfirm       (must acknowledge before override applies)
 *   #checkboxOverrideAck
 *   #btnSendNotifications     (visible once status = 'drawn')
 *   #textStatus
 */

import wixLocation from 'wix-location';
import wixData from 'wix-data';
import {
    finalizeDrawSheet, signOffDrawSheet, manualPairEntrants,
    swapTeamPositions, acknowledgeSpacingConflict, getUnresolvedSpacingConflicts
} from 'backend/matching-engine.jsw';
import { sendDrawNotifications, getManualContactList } from 'backend/notifications.jsw';

let eventId;
let currentClassId = null;
let selectedForSwap = []; // holds up to 2 team _ids
let teamPendingAck = null;

$w.onReady(async function () {
    eventId = wixLocation.query.event;
    if (!eventId) {
        setStatus('No event specified.', true);
        return;
    }

    await loadClassDropdown();
    wireButtons();
});

function wireButtons() {
    $w('#dropdownClass').onChange(handleClassChanged);
    $w('#btnFinalize').onClick(handleFinalize);
    $w('#btnSignOff').onClick(() => $w('#boxSignOffConfirm').expand());
    $w('#btnCancelSignOff').onClick(() => $w('#boxSignOffConfirm').collapse());
    $w('#btnConfirmSignOff').onClick(handleSignOff);
    $w('#btnManualPair').onClick(handleManualPair);
    $w('#btnSendNotifications').onClick(handleSendNotifications);
    $w('#btnSwapSelected').onClick(handleSwapSelected);
    $w('#btnConfirmAcknowledge').onClick(handleConfirmAcknowledge);
    $w('#btnSwapSelected').disable();
}

/**
 * Every class in this event, closed or beyond — a still-'open' class
 * isn't ready to finalize/draw yet, but showing it anyway (rather than
 * hiding it) lets the producer see at a glance which of their classes
 * aren't ready, instead of wondering why one's missing from the list.
 */
async function loadClassDropdown() {
    const result = await wixData.query('DrawProEventClasses').eq('eventId', eventId).find();
    $w('#dropdownClass').options = result.items.map(cls => ({
        label: `${cls.label} (${cls.status})`,
        value: cls._id
    }));
    if (result.items.length > 0) {
        currentClassId = result.items[0]._id;
        $w('#dropdownClass').value = currentClassId;
        await handleClassChanged();
    }
}

async function handleClassChanged() {
    currentClassId = $w('#dropdownClass').value;
    setStatus('');
    selectedForSwap = [];
    $w('#btnSwapSelected').disable();
    await loadEntrantList();
}

async function loadEntrantList() {
    const result = await wixData.query('DrawProEntrants').eq('classId', currentClassId).find();
    $w('#repeaterEntrants').data = result.items;
    $w('#repeaterEntrants').onItemReady(($item, entrant) => {
        $item('#textEntrantName').text = `${entrant.firstName} ${entrant.lastName}`;
        $item('#textEntrantRole').text = entrant.role;
        $item('#textEntrantClass').text = String(entrant.classificationNumber);
    });
}

async function handleFinalize() {
    setStatus('');
    $w('#btnFinalize').disable();
    try {
        await finalizeDrawSheet(currentClassId);
        setStatus('Entries locked. Review the list above, then sign off to run the draw.');
        $w('#btnSignOff').enable();
    } catch (err) {
        setStatus(err.message, true);
        $w('#btnFinalize').enable();
    }
}

async function handleSignOff() {
    $w('#boxSignOffConfirm').collapse();
    setStatus('Running the draw…');
    $w('#btnSignOff').disable();

    try {
        const result = await signOffDrawSheet(currentClassId);
        await loadDrawnTeams();

        if (result.unmatchedEntrants.length > 0) {
            setStatus(`Draw complete. ${result.unmatchedEntrants.length} entrant(s) could not be matched — pair them manually below.`, true);
            await loadUnmatchedEntrants(result.unmatchedEntrants);
        } else if (result.spacingConflicts.length > 0) {
            setStatus(`Draw complete. ${result.spacingConflicts.length} team(s) couldn't satisfy the 10-team spacing minimum — flagged below.`, true);
        } else {
            setStatus('Draw complete. Review the run order below, then send notifications.');
        }

        $w('#btnSendNotifications').enable();
    } catch (err) {
        setStatus(err.message, true);
        $w('#btnSignOff').enable();
    }
}

async function loadDrawnTeams() {
    const result = await wixData.query('DrawProTeams').eq('classId', currentClassId).ascending('teamNumber').find();
    $w('#repeaterTeams').data = result.items;
    $w('#repeaterTeams').onItemReady(async ($item, team) => {
        const header = await wixData.get('DrawProEntrants', team.headerEntrantId);
        const heeler = await wixData.get('DrawProEntrants', team.heelerEntrantId);
        $item('#textTeamNumber').text = String(team.teamNumber);
        $item('#textHeader').text = `${header.firstName} ${header.lastName}`;
        $item('#textHeeler').text = `${heeler.firstName} ${heeler.lastName}`;

        // Display-only — see file header comment. Doesn't affect anything
        // else about this team.
        if (team.qualifiesForIncentive) {
            $item('#iconIncentiveFlag').expand();
        } else {
            $item('#iconIncentiveFlag').collapse();
        }

        if (team.spacingFlagged && !team.spacingAcknowledged) {
            $item('#iconSpacingFlag').expand();
            $item('#iconSpacingFlag').tooltip = team.spacingConflictDetail;
            $item('#btnAcknowledgeConflict').expand();
            $item('#btnAcknowledgeConflict').onClick(() => openAcknowledgeBox(team));
            $item('#checkboxSwapSelect').enable();
        } else if (team.spacingFlagged && team.spacingAcknowledged) {
            $item('#iconSpacingFlag').expand();
            $item('#iconSpacingFlag').tooltip = `Acknowledged — no fix available. ${team.spacingConflictDetail || ''}`;
            $item('#btnAcknowledgeConflict').collapse();
        } else {
            $item('#iconSpacingFlag').collapse();
            $item('#btnAcknowledgeConflict').collapse();
        }

        $item('#checkboxSwapSelect').onChange(() => toggleSwapSelection(team._id, $item('#checkboxSwapSelect').checked));
    });
}

function toggleSwapSelection(teamId, isChecked) {
    if (isChecked) {
        if (selectedForSwap.length >= 2) {
            // Only two teams can be selected at once — ignore further picks
            // until the producer swaps or clears a selection.
            return;
        }
        selectedForSwap.push(teamId);
    } else {
        selectedForSwap = selectedForSwap.filter(id => id !== teamId);
    }

    if (selectedForSwap.length === 2) {
        $w('#btnSwapSelected').enable();
    } else {
        $w('#btnSwapSelected').disable();
    }
}

async function handleSwapSelected() {
    if (selectedForSwap.length !== 2) return;
    setStatus('Swapping run-order positions…');
    $w('#btnSwapSelected').disable();

    try {
        await swapTeamPositions(currentClassId, selectedForSwap[0], selectedForSwap[1]);
        selectedForSwap = [];
        setStatus('Swapped. Spacing has been rechecked across the whole run order.');
        await loadDrawnTeams();
    } catch (err) {
        setStatus(err.message, true);
        $w('#btnSwapSelected').enable();
    }
}

function openAcknowledgeBox(team) {
    teamPendingAck = team;
    $w('#inputAcknowledgeNote').value = '';
    $w('#boxAcknowledgeConfirm').expand();
}

async function handleConfirmAcknowledge() {
    if (!teamPendingAck) return;
    const note = $w('#inputAcknowledgeNote').value;

    try {
        await acknowledgeSpacingConflict(currentClassId, teamPendingAck._id, note);
        setStatus(`Acknowledged team #${teamPendingAck.teamNumber} — no fix available. Logged for the record.`);
        $w('#boxAcknowledgeConfirm').collapse();
        teamPendingAck = null;
        await loadDrawnTeams();
        await refreshUnresolvedCount();
    } catch (err) {
        setStatus(err.message, true);
    }
}

async function refreshUnresolvedCount() {
    const unresolved = await getUnresolvedSpacingConflicts(currentClassId);
    if (unresolved.length === 0) {
        setStatus('No unresolved spacing conflicts remain.');
    }
    return unresolved.length;
}

async function loadUnmatchedEntrants(unmatchedEntrants) {
    $w('#repeaterUnmatched').data = unmatchedEntrants;
    $w('#repeaterUnmatched').onItemReady(($item, entrant) => {
        $item('#textEntrantName').text = `${entrant.firstName} ${entrant.lastName} (${entrant.role}, #${entrant.classificationNumber})`;
    });

    // Populate manual-pair dropdowns from the same unmatched pool.
    const headers = unmatchedEntrants.filter(e => e.role === 'header');
    const heelers = unmatchedEntrants.filter(e => e.role === 'heeler');
    $w('#dropdownManualHeader').options = headers.map(toDropdownOption);
    $w('#dropdownManualHeeler').options = heelers.map(toDropdownOption);
}

function toDropdownOption(entrant) {
    return { label: `${entrant.firstName} ${entrant.lastName} (#${entrant.classificationNumber})`, value: entrant._id };
}

async function handleManualPair() {
    const headerId = $w('#dropdownManualHeader').value;
    const heelerId = $w('#dropdownManualHeeler').value;
    const acknowledged = $w('#checkboxOverrideAck').checked;

    if (!headerId || !heelerId) {
        setStatus('Select both a header and a heeler to pair.', true);
        return;
    }
    if (!acknowledged) {
        setStatus('Acknowledge the override notice before pairing manually.', true);
        return;
    }

    try {
        await manualPairEntrants(currentClassId, headerId, heelerId, acknowledged);
        setStatus('Manual pairing added. This has been logged for accountability.');
        await loadDrawnTeams();
    } catch (err) {
        // Cap violations (combined or heeler sub-cap) surface here with a
        // clear rejection message — the pairing is never created.
        setStatus(err.message, true);
    }
}

async function handleSendNotifications() {
    $w('#btnSendNotifications').disable();
    setStatus('Sending notifications…');

    try {
        const summary = await sendDrawNotifications(currentClassId);
        const manualContacts = await getManualContactList(currentClassId);

        let message = `Sent: ${summary.sent}. Bounced: ${summary.bounced}.`;
        if (manualContacts.length > 0) {
            message += ` ${manualContacts.length} entrant(s) have no email on file — contact them directly.`;
        }
        setStatus(message);
    } catch (err) {
        setStatus(err.message, true);
        $w('#btnSendNotifications').enable();
    }
}

function setStatus(message, isError) {
    $w('#textStatus').text = message;
    $w('#textStatus').style.color = isError ? '#B3261E' : '#2E7D32';
}
