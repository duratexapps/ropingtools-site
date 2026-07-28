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
 *   #textEntrantsHeading      (NEW, added 2026-07-22 — e.g. "Entrants — Class 8.5", updates on every dropdown change)
 *   #textEntrantsStatus        (NEW — the selected class's raw status, uppercased, e.g. "DRAWN")
 *   #textEntrantsCaption       (NEW — "Locked once finalized." once finalized/drawn/notified, otherwise "Still open - entries can change until you finalize.")
 *   #textEntrantsCount        (NEW, added 2026-07-23 — e.g. sitting in the bottom corner of the Entrants
 *                             box. Count of individual entrant records for the selected class - each
 *                             DrawProEntrants record is one individual, so this is literally "how many
 *                             individuals have entered." Updates every time the entrant list reloads.)
 *   #repeaterEntrants        (repeater listing all entrants pre-draw for the SELECTED class, with #textEntrantName, #textEntrantRole, #textEntrantClass inside)
 *   #btnFinalize              (locks entries, moves to pending_signoff)
 *   #btnSignOff               (triggers the actual draw — requires confirm)
 *   #boxSignOffConfirm         (confirmation modal/container)
 *   #btnConfirmSignOff
 *   #btnCancelSignOff
 *   #textTeamsCount           (NEW, added 2026-07-23 — e.g. sitting in the bottom corner of the Drawn
 *                             Teams section. Count of drawn TEAMS (pairs), not individuals - updates
 *                             every time the team list reloads.)
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
 *   #textRotationLabel        (NEW, added 2026-07-23 — inside #repeaterTeams item. Shows "Rotation N" if the
 *                             class has a rotationSize set, hidden otherwise. Purely a pacing/display label
 *                             over the SAME draw order — Draw Pro doesn't track catches, advancement, or
 *                             results at any point; that stays the producer's own manual process, same
 *                             established boundary as qualifiesForIncentive. See assignRotations() below.)
 *   #boxRotationSuggestion    (NEW, added 2026-07-23 — hidden by default. Shown once entries are closed (real
 *                             count known) if the entrant count exceeds the class's rotationSuggestionThreshold
 *                             (or 300 if the producer didn't set one on Producer Event Setup) and no
 *                             rotationSize is set yet. The actual rotation SIZE is deliberately decided here,
 *                             not at class creation, since only now is the real field size known.)
 *   #textRotationSuggestionMessage (NEW — e.g. "347 entrants — consider splitting into rotations for pacing.")
 *   #inputRotationSizeToApply (NEW — numeric text input, pre-filled with a sensible default)
 *   #btnApplyRotationSize     (NEW — saves the chosen size via setClassRotationSize(), refreshes the draw
 *                             sheet display if teams are already drawn)
 *   #btnDismissRotationSuggestion (NEW — hides the box for this session without setting anything; will
 *                             reappear next time this class loads if still above threshold with no size set)
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
 *   #btnExportCSV             (NEW, added 2026-07-27 — visible once status = 'drawn' or 'notified'.
 *                             Exports the class's run order, including entry timestamps, as a CSV
 *                             for producers still using other software alongside/before Draw Pro.
 *                             See csv-export.jsw's file header for why the column layout is a plain
 *                             generic format rather than matching a specific competitor product.)
 *   #textStatus
 *
 *   -- Producer nav strip (NEW, added 2026-07-28 - see drawpro-home.js's
 *      matching comment for the full reasoning; duplicated identically
 *      on all 4 producer pages) --
 *   #navDashboard   (Button/Link) - links to /producer-dashboard
 *   #navCreateEvent (Button/Link) - links to /producer-event-setup
 *   #navMyProfile   (Button/Link) - links to /producer-profile
 *
 *   -- REMOVABLE DEMO FEATURE (NEW, added 2026-07-28) --
 *   Bulk-generates realistic demo entrants for the SELECTED class, for
 *   showing a prospective/onboarding producer the real speed/accuracy/
 *   organization of a full draw at volume without hand-typing fake names.
 *   See backend/demoDataGenerator.jsw's own file header for exactly how
 *   to remove this feature entirely later - it's deliberately isolated to
 *   that one backend file + this one block of elements/wiring, with zero
 *   changes anywhere else, so removal never risks the real product.
 *   #inputDemoEntrantCount   (Text input, numeric - how many entrants to
 *                            generate, e.g. defaults to "300" as a
 *                            placeholder)
 *   #btnGenerateDemoEntrants (Button)
 *   #btnClearDemoEntrants    (Button - removes only demo-generated
 *                            entrants for the selected class, never real
 *                            ones)
 *   #textDemoStatus          (Text - status messages + current demo
 *                            entrant count for the selected class)
 */

import wixLocation from 'wix-location';
import wixData from 'wix-data';
import { generateDemoEntrants, clearDemoEntrants, countDemoEntrants } from 'backend/demoDataGenerator.jsw';
import {
    finalizeDrawSheet, signOffDrawSheet, manualPairEntrants,
    swapTeamPositions, acknowledgeSpacingConflict, getUnresolvedSpacingConflicts
} from 'backend/matching-engine.jsw';
import { sendDrawNotifications, getManualContactList } from 'backend/notifications.jsw';
import { setClassRotationSize } from 'backend/event-setup.jsw';
import { exportDrawSheetCSV } from 'backend/csv-export.jsw';

const DEFAULT_ROTATION_SUGGESTION_THRESHOLD = 300;

let eventId;
let currentClassId = null;
let selectedForSwap = []; // holds up to 2 team _ids
let teamPendingAck = null;
// Cached from loadClassDropdown() so handleClassChanged() can look up the
// selected class's label/status without a second query on every dropdown
// change - added 2026-07-22 for the Entrants panel heading (mirrors the
// desktop mockup's "Entrants — Class 8.5 / Locked once finalized" header,
// which wasn't wired up to real data before this).
let allClasses = [];

$w.onReady(async function () {
    wireProducerNav();
    eventId = wixLocation.query.event;
    if (!eventId) {
        setStatus('No event specified.', true);
        return;
    }

    await loadClassDropdown();
    wireButtons();
});

// Runs fn() and swallows/logs any error instead of letting it propagate -
// same pattern established in producer-event-setup.js after #boxAddClass
// crashed that whole page's $w.onReady() over a single unexpected element
// type. Used here for #textEntrantsCount/#textTeamsCount specifically,
// since those are brand-new elements not yet built as of this writing -
// a typo'd ID or wrong widget type on either one should log an error and
// move on, not take down entrant/team list loading for the whole page.
function safeCall(fn) {
    try {
        fn();
    } catch (err) {
        console.error(`[producer-draw-sheet-review] setup step failed (page keeps working): ${err.message}`);
    }
}

// NEW, added 2026-07-28 - see drawpro-home.js's matching comment for the
// full reasoning. Duplicated identically on all 4 producer pages.
function wireProducerNav() {
    safeCall(() => $w('#navDashboard').onClick(() => wixLocation.to('/producer-dashboard')));
    safeCall(() => $w('#navCreateEvent').onClick(() => wixLocation.to('/producer-event-setup')));
    safeCall(() => $w('#navMyProfile').onClick(() => wixLocation.to('/producer-profile')));
}

// FIXED live 2026-07-28: this is the exact same crash pattern just found
// and fixed live on drawpro-home.js - ten wiring calls in a row, only the
// very last one (#btnExportCSV) actually wrapped in safeCall(). Since
// $w.onReady() is synchronous until its first await, ANY of the first ten
// throwing (wrong widget type, mistyped ID, etc.) would have silently
// killed every wiring call after it - on THIS page specifically, that
// means the entire draw-review/finalize/sign-off/manual-pair/notify flow,
// not just one button. Never actually triggered yet because this page
// hadn't been tested live with real entrants as of this writing - found
// proactively by auditing every other Draw Pro page for the same pattern
// right after drawpro-home.js's version of it caused a real blank page.
function wireButtons() {
    safeCall(() => $w('#dropdownClass').onChange(handleClassChanged));
    safeCall(() => $w('#btnFinalize').onClick(handleFinalize));
    safeCall(() => $w('#btnSignOff').onClick(() => $w('#boxSignOffConfirm').expand()));
    safeCall(() => $w('#btnCancelSignOff').onClick(() => $w('#boxSignOffConfirm').collapse()));
    safeCall(() => $w('#btnConfirmSignOff').onClick(handleSignOff));
    safeCall(() => $w('#btnManualPair').onClick(handleManualPair));
    safeCall(() => $w('#btnSendNotifications').onClick(handleSendNotifications));
    safeCall(() => $w('#btnSwapSelected').onClick(handleSwapSelected));
    safeCall(() => $w('#btnConfirmAcknowledge').onClick(handleConfirmAcknowledge));
    safeCall(() => $w('#btnApplyRotationSize').onClick(handleApplyRotationSize));
    safeCall(() => $w('#btnDismissRotationSuggestion').onClick(() => $w('#boxRotationSuggestion').collapse()));
    safeCall(() => $w('#btnSwapSelected').disable());
    safeCall(() => $w('#btnExportCSV').onClick(handleExportCSV));

    // REMOVABLE DEMO FEATURE - see this file's header comment and
    // backend/demoDataGenerator.jsw for the full reasoning and exact
    // removal steps.
    safeCall(() => $w('#btnGenerateDemoEntrants').onClick(handleGenerateDemoEntrants));
    safeCall(() => $w('#btnClearDemoEntrants').onClick(handleClearDemoEntrants));
}

/* ================================================================ */
/* REMOVABLE DEMO FEATURE - see this file's header comment and       */
/* backend/demoDataGenerator.jsw for the full reasoning and exact     */
/* removal steps. Nothing outside this block + the two safeCall()     */
/* wiring lines above it needs to change to remove this feature.      */
/* ================================================================ */

async function handleGenerateDemoEntrants() {
    if (!currentClassId) {
        safeCall(() => { $w('#textDemoStatus').text = 'Select a class first.'; });
        return;
    }
    const requested = Number($w('#inputDemoEntrantCount').value) || 300;
    safeCall(() => { $w('#textDemoStatus').text = `Generating ~${requested} demo entrants… this can take a moment.`; });
    safeCall(() => $w('#btnGenerateDemoEntrants').disable());
    try {
        const { created } = await generateDemoEntrants(currentClassId, requested);
        safeCall(() => { $w('#textDemoStatus').text = `Created ${created} demo entrants.`; });
        await loadEntrantList();
    } catch (err) {
        safeCall(() => { $w('#textDemoStatus').text = `Failed to generate demo entrants: ${err.message}`; });
    } finally {
        safeCall(() => $w('#btnGenerateDemoEntrants').enable());
    }
}

async function handleClearDemoEntrants() {
    if (!currentClassId) {
        safeCall(() => { $w('#textDemoStatus').text = 'Select a class first.'; });
        return;
    }
    safeCall(() => { $w('#textDemoStatus').text = 'Removing demo entrants…'; });
    safeCall(() => $w('#btnClearDemoEntrants').disable());
    try {
        const { removed } = await clearDemoEntrants(currentClassId);
        safeCall(() => { $w('#textDemoStatus').text = `Removed ${removed} demo entrants.`; });
        await loadEntrantList();
    } catch (err) {
        safeCall(() => { $w('#textDemoStatus').text = `Failed to remove demo entrants: ${err.message}`; });
    } finally {
        safeCall(() => $w('#btnClearDemoEntrants').enable());
    }
}

async function refreshDemoEntrantCount() {
    if (!currentClassId) return;
    const count = await countDemoEntrants(currentClassId).catch(() => null);
    if (count != null) {
        safeCall(() => { $w('#textDemoStatus').text = `${count} demo entrant(s) currently on this class.`; });
    }
}

/* ================================================================ */
/* END REMOVABLE DEMO FEATURE                                        */
/* ================================================================ */

/**
 * Every class in this event, closed or beyond — a still-'open' class
 * isn't ready to finalize/draw yet, but showing it anyway (rather than
 * hiding it) lets the producer see at a glance which of their classes
 * aren't ready, instead of wondering why one's missing from the list.
 */
async function loadClassDropdown() {
    const result = await wixData.query('DrawProEventClasses').eq('eventId', eventId).find();
    allClasses = result.items;
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

// Status values, per data-model.md's DrawProEventClasses enum: draft |
// open | closed | finalized | drawn | notified. draft/open/closed are
// still editable states (entries aren't locked yet); finalized and
// beyond mean the entrant list is locked and a draw has run or is about
// to. Wording here is a first pass, not a locked-in decision - easy to
// adjust if it doesn't read right once you see it live.
function updateEntrantsHeading(cls) {
    $w('#textEntrantsHeading').text = `Entrants — Class ${cls.label}`;
    $w('#textEntrantsStatus').text = cls.status.toUpperCase();
    const isLocked = cls.status === 'finalized' || cls.status === 'drawn' || cls.status === 'notified';
    $w('#textEntrantsCaption').text = isLocked
        ? 'Locked once finalized.'
        : 'Still open - entries can change until you finalize.';
}

async function handleClassChanged() {
    currentClassId = $w('#dropdownClass').value;
    setStatus('');
    selectedForSwap = [];
    $w('#btnSwapSelected').disable();

    const cls = allClasses.find((c) => c._id === currentClassId);
    if (cls) updateEntrantsHeading(cls);

    await loadEntrantList();
    // REMOVABLE DEMO FEATURE - see this file's header comment.
    await refreshDemoEntrantCount();
}

async function loadEntrantList() {
    const result = await wixData.query('DrawProEntrants').eq('classId', currentClassId).find();
    $w('#repeaterEntrants').data = result.items;
    $w('#repeaterEntrants').onItemReady(($item, entrant) => safeCall(() => {
        $item('#textEntrantName').text = `${entrant.firstName} ${entrant.lastName}`;
        $item('#textEntrantRole').text = entrant.role;
        $item('#textEntrantClass').text = String(entrant.classificationNumber);
    }));

    // At-a-glance count, e.g. sitting in the bottom corner of the
    // Entrants box - each DrawProEntrants record is one individual
    // (a header and heeler in a pre-formed team are two separate
    // records), so this count is literally "how many individuals have
    // entered," same as requested.
    safeCall(() => { $w('#textEntrantsCount').text = String(result.items.length); });

    const cls = allClasses.find((c) => c._id === currentClassId);
    if (cls) checkRotationSuggestion(cls, result.items.length);
}

/**
 * Shows a one-time-per-visit nudge to split into rotations, ONLY once
 * entries are closed (real count known, per data-model.md's status
 * lifecycle - 'closed' is when no more entries can arrive, even though
 * 'finalized' is the stricter locked-for-review state further downstream).
 * Deliberately NOT shown at class-creation time - see
 * rotationSuggestionThreshold's doc comment in producer-event-setup.js
 * for why the actual rotation SIZE can't be sensibly judged before
 * entries even open, only the threshold that triggers this nudge can be.
 */
function checkRotationSuggestion(cls, entrantCount) {
    const countIsFinal = ['closed', 'finalized', 'drawn', 'notified'].includes(cls.status);
    const threshold = cls.rotationSuggestionThreshold || DEFAULT_ROTATION_SUGGESTION_THRESHOLD;

    if (!countIsFinal || cls.rotationSize || entrantCount <= threshold) {
        $w('#boxRotationSuggestion').collapse();
        return;
    }

    $w('#textRotationSuggestionMessage').text =
        `${entrantCount} entrants — consider splitting into rotations for pacing.`;
    $w('#inputRotationSizeToApply').value = '100';
    $w('#boxRotationSuggestion').expand();
}

async function handleApplyRotationSize() {
    const size = parseInt($w('#inputRotationSizeToApply').value, 10);
    if (!size || size <= 0) {
        setStatus('Enter a valid rotation size.', true);
        return;
    }

    try {
        const updatedClass = await setClassRotationSize(currentClassId, size);
        // Keep the local cache in sync so assignRotations() and any
        // future checkRotationSuggestion() call see the new value right
        // away, without needing a full page reload.
        const idx = allClasses.findIndex((c) => c._id === currentClassId);
        if (idx !== -1) allClasses[idx] = updatedClass;

        $w('#boxRotationSuggestion').collapse();
        setStatus(`Rotation size set to ${size}. Teams will be labeled by rotation below.`);

        if (['drawn', 'notified'].includes(updatedClass.status)) {
            await loadDrawnTeams();
        }
    } catch (err) {
        setStatus(err.message, true);
    }
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
        safeCall(() => $w('#btnExportCSV').enable());
    } catch (err) {
        setStatus(err.message, true);
        $w('#btnSignOff').enable();
    }
}

/**
 * Downloads the drawn run order (with entry timestamps) as a CSV. Velo
 * page code has no direct File/Blob/anchor-click API, so the returned
 * CSV text is handed to the browser via a data: URI navigation instead —
 * text/csv isn't browser-renderable, so this triggers a save prompt
 * rather than replacing the page. Untested live as of this writing (see
 * csv-export.jsw's file header) — confirm the download actually prompts
 * cleanly in Preview before relying on it in front of a real producer.
 */
async function handleExportCSV() {
    setStatus('Building CSV…');
    try {
        const csv = await exportDrawSheetCSV(currentClassId);
        wixLocation.to(`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`);
        setStatus('CSV download started.');
    } catch (err) {
        setStatus(err.message, true);
    }
}

async function loadDrawnTeams() {
    // Real scaling problem, same class of bug as matching-engine.jsw's
    // executeDraw() before it was fixed: this used to do one
    // wixData.get('DrawProEntrants', ...) PER TEAM, twice (header +
    // heeler) - up to 1000 individual calls at a 500-team field, purely
    // to display names. Now one batch query for every entrant in the
    // class up front, looked up locally from there.
    const result = await wixData.query('DrawProTeams').eq('classId', currentClassId).ascending('teamNumber').find();
    const teams = result.items;

    // At-a-glance count, e.g. sitting in the bottom corner of the Drawn
    // Teams section - number of TEAMS (pairs), not individuals, unlike
    // #textEntrantsCount above in loadEntrantList().
    safeCall(() => { $w('#textTeamsCount').text = String(teams.length); });

    const entrantsResult = await wixData.query('DrawProEntrants').eq('classId', currentClassId).find();
    const entrantsById = new Map(entrantsResult.items.map((e) => [e._id, e]));

    // Rotation display - purely a pacing label over the same draw order,
    // not anything Draw Pro tracks live. See assignRotations()'s own
    // comment for the full reasoning.
    const cls = allClasses.find((c) => c._id === currentClassId);
    const teamsWithRotations = assignRotations(teams, cls ? cls.rotationSize : null);

    $w('#repeaterTeams').data = teamsWithRotations;
    // Wrapped in safeCall - this is the densest per-item callback on the
    // page (a dozen+ element touches per row), so it's the most likely
    // place a single bad element type would otherwise take down
    // rendering for every OTHER team row too.
    $w('#repeaterTeams').onItemReady(($item, team) => safeCall(() => {
        const header = entrantsById.get(team.headerEntrantId);
        const heeler = entrantsById.get(team.heelerEntrantId);
        $item('#textTeamNumber').text = String(team.teamNumber);
        $item('#textHeader').text = `${header.firstName} ${header.lastName}`;
        $item('#textHeeler').text = `${heeler.firstName} ${heeler.lastName}`;

        if (team.rotationNumber != null) {
            $item('#textRotationLabel').text = `Rotation ${team.rotationNumber}`;
            $item('#textRotationLabel').expand();
        } else {
            $item('#textRotationLabel').collapse();
        }

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
    }));
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
    $w('#repeaterUnmatched').onItemReady(($item, entrant) => safeCall(() => {
        $item('#textEntrantName').text = `${entrant.firstName} ${entrant.lastName} (${entrant.role}, #${entrant.classificationNumber})`;
    }));

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

/**
 * Splits an already-sorted team list into rotations, purely for producer/
 * entrant display and pacing on a large field (confirmed real scenario:
 * single classes with 200-500+ teams, sometimes run across multiple
 * arenas). Deliberately NOT a live/dynamic concept - Draw Pro doesn't
 * track catches, advancement, buy-backs, or results at any point in this
 * pipeline; that stays the producer's own manual, in-arena process, same
 * established boundary as qualifiesForIncentive. This just labels the
 * SAME static draw order that already exists.
 *
 * rotationSize is the producer's target size (e.g. "about 100"). Every
 * rotation is exactly that size except the last, which absorbs whatever
 * remains - simplest, most predictable rule, matching the literal "teams
 * 1-100 in rotation 1, 101-200 in rotation 2" example this was built
 * from. (Note: a producer might sometimes think in terms of "however
 * many even rotations divide the field cleanly" instead - e.g. 550
 * teams as 5 rotations of 110 rather than 6 of ~92 - which this does NOT
 * do. Flagged as a real, acknowledged difference, not an oversight -
 * easy to change if the literal-chunking rule doesn't match real usage.)
 */
function assignRotations(teams, rotationSize) {
    if (!rotationSize || rotationSize <= 0 || teams.length === 0) {
        return teams.map((team) => ({ ...team, rotationNumber: null }));
    }
    return teams.map((team, i) => ({ ...team, rotationNumber: Math.floor(i / rotationSize) + 1 }));
}

function setStatus(message, isError) {
    $w('#textStatus').text = message;
    $w('#textStatus').style.color = isError ? '#B3261E' : '#2E7D32';
}
