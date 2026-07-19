/**
 * Page: Producer — Draw Sheet Review & Sign-Off
 * Covers the "verify → draw → notify" pipeline's middle step for both
 * entry paths. Producer lands here once event status = 'closed'.
 *
 * Expected Editor elements:
 *   #repeaterEntrants        (repeater listing all entrants pre-draw,
 *                             with #textEntrantName, #textEntrantRole,
 *                             #textEntrantClass inside)
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
let selectedForSwap = []; // holds up to 2 team _ids
let teamPendingAck = null;

$w.onReady(async function () {
    eventId = wixLocation.query.event;
    if (!eventId) {
        setStatus('No event specified.', true);
        return;
    }

    await loadEntrantList();
    wireButtons();
});

function wireButtons() {
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

async function loadEntrantList() {
    const result = await wixData.query('DrawProEntrants').eq('eventId', eventId).find();
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
        await finalizeDrawSheet(eventId);
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
        const result = await signOffDrawSheet(eventId);
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
    const result = await wixData.query('DrawProTeams').eq('eventId', eventId).ascending('teamNumber').find();
    $w('#repeaterTeams').data = result.items;
    $w('#repeaterTeams').onItemReady(async ($item, team) => {
        const header = await wixData.get('DrawProEntrants', team.headerEntrantId);
        const heeler = await wixData.get('DrawProEntrants', team.heelerEntrantId);
        $item('#textTeamNumber').text = String(team.teamNumber);
        $item('#textHeader').text = `${header.firstName} ${header.lastName}`;
        $item('#textHeeler').text = `${heeler.firstName} ${heeler.lastName}`;

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
        await swapTeamPositions(eventId, selectedForSwap[0], selectedForSwap[1]);
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
        await acknowledgeSpacingConflict(eventId, teamPendingAck._id, note);
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
    const unresolved = await getUnresolvedSpacingConflicts(eventId);
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
        await manualPairEntrants(eventId, headerId, heelerId, acknowledged);
        setStatus('Manual pairing added. This has been logged for accountability.');
        await loadDrawnTeams();
        // Refresh unmatched list by re-querying rather than re-running the draw.
        const remaining = await wixData.query('DrawProDrawSheets').eq('eventId', eventId).find();
        // (In practice: re-filter unmatched list client-side after removing the just-paired pair.)
    } catch (err) {
        // Cap violations surface here with a clear rejection message —
        // the pairing is never created.
        setStatus(err.message, true);
    }
}

async function handleSendNotifications() {
    $w('#btnSendNotifications').disable();
    setStatus('Sending notifications…');

    try {
        const summary = await sendDrawNotifications(eventId);
        const manualContacts = await getManualContactList(eventId);

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
