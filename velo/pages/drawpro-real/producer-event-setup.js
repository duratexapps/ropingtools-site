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
 *   #inputEventLocation     (text input, e.g. "Hallettsville, TX" - required, same as title. Has a
 *                            type-ahead: as the producer types, backend/locationSearch.jsw returns matches
 *                            from the same ~32,000-town dataset Steer Me's home_area autocomplete uses -
 *                            see #repeaterLocationSuggestions below)
 *   #repeaterLocationSuggestions (NEW, added 2026-07-23 - Repeater, hidden by default. Item template needs
 *                            one #btnLocationSuggestion (Button) inside it. Shown while #inputEventLocation
 *                            has matches, hidden again once one's picked or the field's cleared)
 *   #inputEventSite         (NEW, added 2026-07-23 - text input, e.g. "Circle T Arena" - the venue itself,
 *                            separate from #inputEventLocation (the town/city). Free text, but also has a
 *                            type-ahead against backend/venues.jsw's shared, cross-producer venue list - see
 *                            #repeaterVenueSuggestions below)
 *   #inputEventSiteLink     (NEW, added 2026-07-23 - text input, optional - the venue's booking page (often
 *                            openstalls.com) or a phone number if that's all a flier has. Auto-fills when a
 *                            venue suggestion is picked, but stays free-typeable otherwise)
 *   #repeaterVenueSuggestions (NEW, added 2026-07-23 - Repeater, hidden by default. Item template needs one
 *                            #btnVenueSuggestion (Button) inside it. Picking a suggestion fills BOTH
 *                            #inputEventSite and, if the saved venue has one, #inputEventSiteLink - and
 *                            #inputEventLocation too if it's still empty)
 *   #textEventTitleLocation (text - starts collapsed; expands to e.g. "Saturday Jackpot - Hallettsville, TX"
 *                            once the event shell is created, as an on-page confirmation of which event
 *                            you're configuring below)
 *   #inputEventDate        (date picker)
 *   #checkboxAllowPreEntry  (RENAMED live 2026-07-29 - the Editor's actual element is
 *                            #checkboxAllowPreEntry, not #togglePreEntry as originally
 *                            documented/coded. Confirmed via the Editor's own Layers panel
 *                            after a live report that the location-suggestion type-ahead
 *                            had silently stopped working - see setVisible()'s big comment
 *                            near the top of this file for the related, bigger fix that
 *                            same day)
 *   #toggleListOnSteerMe    (NEW, added 2026-07-22 — checkbox, checked by default. Cross-posts this event
 *                            to Steer Me so entrants there can discover it, find partners, and hand off
 *                            back here to actually enter — see backend/steerMeSync.jsw. Sync only actually
 *                            fires once at least one class exists, not at shell creation)
 *   #radioPaymentMethod    (radio group: 'cash' | 'online' — applies to the WHOLE event, not per class)
 *   #textPayoutWarning      (shown if 'online' selected but payout profile isn't complete. CONFIRMED
 *                            MISSING from the Editor as of 2026-07-29 - the code safely no-ops on it via
 *                            setVisible(), but this text element still needs to actually be added for the
 *                            payout warning to ever be visible to a producer)
 *   #linkPayoutSetup        (link to the producer payout profile page — not built yet, see note below)
 *   #btnCreateEvent        (button — creates the SHELL only now, not a full event+cap+price)
 *
 *   -- Add a class (repeatable — one call per roping) --
 *   #boxAddClass           (container of some kind — hidden until the event shell is created. Its exact
 *                            widget type is unconfirmed: it has thrown "is not a function" on both
 *                            .disable() AND .collapse(), so whatever it actually is doesn't behave like a
 *                            standard Container Box. Code below now uses .hide()/.show() and wraps the call
 *                            in safeCall() so a third surprise here can't take the whole page down again -
 *                            but if .hide()/.show() also fails, check this element's real widget type in
 *                            the Editor's Properties panel rather than guessing a 4th method)
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
 *   #inputRotationThreshold (NEW, added 2026-07-23 - text input, numeric, optional, e.g. "300". NOT the
 *                            rotation size itself - the actual rotation size can't be sensibly judged
 *                            before entries even open, so that decision happens later, on Producer Draw
 *                            Sheet Review, once the real entrant count is known. This is just "how big a
 *                            field should nudge me about splitting at all" - a judgment call a producer
 *                            CAN reasonably make in advance from their own venue/experience. Defaults to
 *                            300 if left blank. Purely a pacing/display concept - Draw Pro doesn't track
 *                            catches, advancement, or results, same established boundary as
 *                            qualifiesForIncentive)
 *   #checkboxFirstToEnterLastToRope (NEW, added 2026-07-27 - checkbox, unchecked by default. "First to
 *                            enter, last to rope" - a real, long-standing jackpot incentive (get entries
 *                            in early so the producer isn't rushed right before start time). When
 *                            checked, this class's run order is sequenced by entry timestamp instead of
 *                            pure random - earliest entry ends up with the LAST (highest) team number.
 *                            Opt-in per class, not a global default, since not every producer runs this
 *                            incentive. See matching-engine.jsw's sequenceWithSpacing() for the algorithm)
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
 *   #btnReplayTutorial     (always visible. CONFIRMED as of 2026-07-29: the Editor has an unrenamed
 *                            "button9" sitting in the visual spot where this button belongs (visible
 *                            label "Replay Tutorial"), but its actual ID was never changed from Wix's
 *                            auto-generated default, so $w('#btnReplayTutorial').onClick(...) silently
 *                            fails - rename that element's ID to btnReplayTutorial in the Editor's
 *                            Settings panel to wire it up, no code change needed once that's done)
 *
 *   -- Tour overlay elements (see public/onboarding-engine.js). CONFIRMED as of 2026-07-29: NONE of
 *      these 9 elements exist anywhere on this page yet - the onboarding tour was fully coded but
 *      never actually built in the Editor. safeCall() keeps this from breaking anything else, but the
 *      tour itself has never been visible to a real producer. Either build these 9 elements, or comment
 *      out the `startProducerTour()` call in $w.onReady() to stop it running against nothing. --
 *   #tourOverlay, #tourHighlightBox, #tourTooltip, #tourTitle, #tourBody,
 *   #textTourStepCount, #btnTourNext, #btnTourBack, #btnTourSkip
 *
 *   -- Producer nav strip (NEW, added 2026-07-28 - see drawpro-home.js's
 *      matching comment for the full reasoning; duplicated identically
 *      on all 4 producer pages) --
 *   #navDashboard   (Button/Link) - links to /producer-dashboard
 *   #navCreateEvent (Button/Link) - links to /producer-event-setup. CONFIRMED MISSING from this
 *                    particular page as of 2026-07-29 (present on the other 3 producer pages) - low
 *                    priority since it would just link back to the page you're already on, but add it
 *                    for consistency with the other 3 pages if convenient
 *   #navMyProfile   (Button/Link) - links to /producer-profile
 */

import wixData from 'wix-data';
import wixLocation from 'wix-location';
import { createEvent, createEventClass, openClass, closeClass } from 'backend/event-setup.jsw';
import { generateEventQrCode, getAlertSubscriberCount } from 'backend/qr-and-alerts.jsw';
import { getPayoutProfile } from 'backend/payments.jsw';
import { hasSeenTour, markTourCompleted, markTourDismissed } from 'backend/onboarding.jsw';
import { searchHomeAreas } from 'backend/locationSearch.jsw';
import { searchVenues } from 'backend/venues.jsw';
import { currentMember } from 'wix-members-frontend';
import { runTour } from 'public/onboarding-engine.js';

const TYPEAHEAD_DEBOUNCE_MS = 300; // small pause after the last keystroke before calling the backend -
                                    // avoids firing a search on every single character typed. Bumped from
                                    // 200ms to 300ms 2026-07-23 after reported lag on the location
                                    // type-ahead - fewer redundant backend round trips while typing at
                                    // normal speed, alongside the stale-response guard and precomputed
                                    // search index fixes made the same day

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
    wireProducerNav();
    // Click handlers are wired FIRST, before any cosmetic show/hide setup
    // below. This page has twice now had a cosmetic setup call throw on
    // #boxAddClass (first .disable(), then .collapse() - both "is not a
    // function" on whatever element type this actually turned out to be)
    // which, because $w.onReady() is a single synchronous-until-await
    // function, silently killed everything after it INCLUDING every
    // onClick binding below - every button on the page looked completely
    // dead with zero visible error anywhere on the page itself.
    //
    // FIXED live 2026-07-28: moving the wiring earlier only moved WHERE
    // this exact failure mode could strike next - it didn't eliminate it.
    // Confirmed live via the browser console: a `$w(...).onClick is not a
    // function` TypeError was thrown from somewhere in this exact block,
    // which silently prevented #inputEventLocation's own .onInput() call
    // a few lines down from ever running - reported as "location
    // suggestions never appear," but the real cause was an earlier,
    // unrelated element in this same synchronous block, not the location
    // search feature itself. Every wiring call below is now individually
    // wrapped in safeCall(), same as the cosmetic setup already was -
    // one bad element can never again take any of the others down with
    // it, regardless of which specific element it turns out to be next.
    safeCall(() => $w('#btnCreateEvent').onClick(handleCreateEvent));
    safeCall(() => $w('#btnAddClass').onClick(handleAddClass));
    safeCall(() => $w('#btnGenerateQr').onClick(handleGenerateQr));
    safeCall(() => $w('#btnReplayTutorial').onClick(startProducerTour));
    safeCall(() => $w('#radioClassCloseMode').onChange(toggleClassCloseModeFields));
    safeCall(() => $w('#radioPaymentMethod').onChange(checkPayoutReadiness));
    safeCall(() => $w('#inputEventLocation').onInput(handleLocationInput));
    safeCall(() => $w('#inputEventSite').onInput(handleVenueInput));

    // Cosmetic/starting-state setup - each wrapped in safeCall() so one
    // element behaving unexpectedly (wrong widget type, unsupported
    // method, etc.) logs a console error and moves on instead of taking
    // the rest of onReady() down with it.
    setVisible(() => $w('#boxAddClass'), false);
    safeCall(() => $w('#btnGenerateQr').disable());
    setVisible(() => $w('#imageQrCode'), false);
    setVisible(() => $w('#textPayoutWarning'), false);
    setVisible(() => $w('#textEventTitleLocation'), false);
    setVisible(() => $w('#repeaterLocationSuggestions'), false);
    setVisible(() => $w('#repeaterVenueSuggestions'), false);
    safeCall(() => { $w('#toggleListOnSteerMe').checked = true; }); // opt-out, not opt-in - continuity is the intended default

    toggleClassCloseModeFields();
    await checkPayoutReadiness();

    const alreadySeen = await hasSeenTour('producer').catch(() => true); // fail safe: don't force a tour on a signed-out visitor
    if (!alreadySeen) {
        startProducerTour();
    }
});

// Runs fn() and swallows/logs any error instead of letting it propagate -
// see the big comment at the top of $w.onReady() for why this exists.
function safeCall(fn) {
    try {
        fn();
    } catch (err) {
        console.error(`[producer-event-setup] setup step failed (page keeps working): ${err.message}`);
    }
}

// FIXED live 2026-07-29 - confirmed live via the Editor's own Developer
// Console: safeCall() was correctly preventing a CRASH on .hide()/.show()
// calls for #repeaterLocationSuggestions, #repeaterVenueSuggestions,
// #boxAddClass, #imageQrCode, and #textEventTitleLocation - but it was
// also silently swallowing the actual VISIBILITY CHANGE, since these
// elements turned out not to support hide()/show() as functions at all
// (same root cause already noted on #boxAddClass elsewhere in this file:
// "it has thrown 'is not a function' on both .disable() AND .collapse(),
// so whatever it actually is doesn't behave like a standard Container
// Box" - different Wix widget types genuinely expose different visibility
// APIs, hide()/show() vs collapse()/expand(), and there's no way to know
// which one a given Editor element actually needs without testing it).
// Confirmed live: the location/venue type-ahead was computing correct
// results and populating the repeater's data the whole time - it just
// never physically appeared, because the final .show() call kept failing
// silently. This tries hide()/show() first and falls back to
// collapse()/expand() if that throws, so the real visual result lands
// regardless of which pair this specific element turns out to support -
// rather than every future page needing its own guess-and-check pass.
function setVisible(getElement, visible) {
    try {
        const el = getElement();
        if (visible) el.show();
        else el.hide();
    } catch (err) {
        try {
            const el = getElement();
            if (visible) el.expand();
            else el.collapse();
        } catch (err2) {
            console.error(`[producer-event-setup] setVisible failed via both hide/show and collapse/expand: ${err2.message}`);
        }
    }
}

// NEW, added 2026-07-28 - see drawpro-home.js's matching comment for the
// full reasoning. Duplicated identically on all 4 producer pages.
function wireProducerNav() {
    safeCall(() => $w('#navDashboard').onClick(() => wixLocation.to('/producer-dashboard')));
    safeCall(() => $w('#navCreateEvent').onClick(() => wixLocation.to('/producer-event-setup')));
    safeCall(() => $w('#navMyProfile').onClick(() => wixLocation.to('/producer-profile')));
}

function startProducerTour() {
    runTour($w, PRODUCER_TOUR_STEPS, {
        onFinish: () => markTourCompleted('producer').catch(() => {}),
        onSkip: () => markTourDismissed('producer').catch(() => {})
    });
}

// FIXED live 2026-07-28: caught by an automated back-test sweep - an
// UNCAUGHT "$w(...).collapse is not a function" TypeError was thrown from
// this exact function (or toggleClassCloseModeFields() below - both are
// called directly from $w.onReady(), unwrapped, before this fix). Same
// failure class already fixed once for onClick/onChange/onInput wiring
// earlier the same day - turns out .collapse()/.expand() calls carried
// the identical risk and were missed in that pass, since that audit only
// searched for event-handler registration, not every $w method call.
async function checkPayoutReadiness() {
    if ($w('#radioPaymentMethod').value !== 'online') {
        setVisible(() => $w('#textPayoutWarning'), false);
        return;
    }
    const member = await currentMember.getMember().catch(() => null);
    if (!member) return;

    const profile = await getPayoutProfile(member._id);
    if (!profile || profile.onboardingStatus !== 'complete') {
        safeCall(() => { $w('#textPayoutWarning').text = "You'll need to finish payout setup before this event can accept online payments."; });
        setVisible(() => $w('#textPayoutWarning'), true);
    } else {
        setVisible(() => $w('#textPayoutWarning'), false);
    }
}

function toggleClassCloseModeFields() {
    const mode = $w('#radioClassCloseMode').value;
    if (mode === 'time') {
        setVisible(() => $w('#inputClassCloseDate'), true);
        setVisible(() => $w('#inputClassCloseCount'), false);
    } else if (mode === 'teamCount') {
        setVisible(() => $w('#inputClassCloseCount'), true);
        setVisible(() => $w('#inputClassCloseDate'), false);
    } else {
        // 'manual' — neither auto-close field applies; the producer just
        // clicks Close on this class whenever they decide, same manual
        // action every mode still supports regardless (see event-setup.jsw).
        setVisible(() => $w('#inputClassCloseDate'), false);
        setVisible(() => $w('#inputClassCloseCount'), false);
    }
}

/* ------------------------------------------------------------------ */
/* Type-ahead: event location (city) and event site (venue)            */
/* ------------------------------------------------------------------ */

let locationDebounceTimer = null;
let locationRequestToken = 0;

function handleLocationInput() {
    clearTimeout(locationDebounceTimer);
    const query = $w('#inputEventLocation').value;
    if (!query || query.trim().length < 2) {
        locationRequestToken += 1; // invalidate any in-flight search
        setVisible(() => $w('#repeaterLocationSuggestions'), false);
        return;
    }
    // Real, confirmed lag/flicker cause: with no ordering guard, typing
    // fast enough to have two searches in flight at once meant a slower
    // (now-stale) response could arrive AFTER a newer one and overwrite
    // it with outdated suggestions - looks exactly like lag even when
    // each individual search is fast. myToken must still match the
    // current token when the response comes back, or it's discarded.
    const myToken = ++locationRequestToken;
    locationDebounceTimer = setTimeout(async () => {
        const matches = await searchHomeAreas(query).catch(() => []);
        if (myToken !== locationRequestToken) return; // superseded by a newer search
        if (matches.length === 0) {
            setVisible(() => $w('#repeaterLocationSuggestions'), false);
            return;
        }
        $w('#repeaterLocationSuggestions').data = matches.map((label, i) => ({ _id: String(i), label }));
        $w('#repeaterLocationSuggestions').onItemReady(($item, item) => safeCall(() => {
            $item('#btnLocationSuggestion').label = item.label;
            $item('#btnLocationSuggestion').onClick(() => {
                $w('#inputEventLocation').value = item.label;
                setVisible(() => $w('#repeaterLocationSuggestions'), false);
            });
        }));
        setVisible(() => $w('#repeaterLocationSuggestions'), true);
    }, TYPEAHEAD_DEBOUNCE_MS);
}

let venueDebounceTimer = null;
let venueRequestToken = 0;

function handleVenueInput() {
    clearTimeout(venueDebounceTimer);
    // Typing again after a suggestion was picked invalidates the
    // auto-filled link until a suggestion is picked again - same
    // "unconfirmed edits don't count" rule Steer Me's own home_area
    // autocomplete uses, just applied to the derived link field here
    // instead of the field being typed into.
    $w('#inputEventSiteLink').value = '';

    const query = $w('#inputEventSite').value;
    if (!query || query.trim().length < 2) {
        venueRequestToken += 1; // invalidate any in-flight search
        setVisible(() => $w('#repeaterVenueSuggestions'), false);
        return;
    }
    // Same stale-response guard as handleLocationInput() above.
    const myToken = ++venueRequestToken;
    venueDebounceTimer = setTimeout(async () => {
        const matches = await searchVenues(query).catch(() => []);
        if (myToken !== venueRequestToken) return; // superseded by a newer search
        if (matches.length === 0) {
            setVisible(() => $w('#repeaterVenueSuggestions'), false);
            return;
        }
        $w('#repeaterVenueSuggestions').data = matches.map((v, i) => ({
            _id: String(i),
            name: v.name,
            location: v.location,
            link: v.link
        }));
        $w('#repeaterVenueSuggestions').onItemReady(($item, item) => safeCall(() => {
            $item('#btnVenueSuggestion').label = item.location ? `${item.name} (${item.location})` : item.name;
            $item('#btnVenueSuggestion').onClick(() => {
                $w('#inputEventSite').value = item.name;
                if (item.link) {
                    $w('#inputEventSiteLink').value = item.link;
                }
                // Only fills the town/city if the producer hasn't already
                // typed one - never overwrites an in-progress entry.
                if (item.location && !$w('#inputEventLocation').value) {
                    $w('#inputEventLocation').value = item.location;
                }
                setVisible(() => $w('#repeaterVenueSuggestions'), false);
            });
        }));
        setVisible(() => $w('#repeaterVenueSuggestions'), true);
    }, TYPEAHEAD_DEBOUNCE_MS);
}

/* ------------------------------------------------------------------ */
/* Event shell creation                                                */
/* ------------------------------------------------------------------ */

async function handleCreateEvent() {
    setStatus('');

    const eventInput = {
        title: $w('#inputTitle').value,
        location: $w('#inputEventLocation').value,
        eventSite: $w('#inputEventSite').value || null,
        eventSiteLink: $w('#inputEventSiteLink').value || null,
        eventDate: $w('#inputEventDate').value,
        // FIXED live 2026-07-29: confirmed via the Editor's own Layers
        // panel that this page's real pre-entry checkbox is named
        // #checkboxAllowPreEntry, not #togglePreEntry as originally
        // documented/coded - #togglePreEntry doesn't exist on this page
        // at all, so this was silently reading undefined every time
        // (a property read on a non-matching $w() reference doesn't
        // throw the way a method call like .onClick()/.hide() does,
        // which is why this specific bug never showed up in the
        // Developer Console the way the visibility bugs above did).
        preEntryEnabled: $w('#checkboxAllowPreEntry').checked,
        listOnSteerMe: $w('#toggleListOnSteerMe').checked,
        paymentMethod: $w('#radioPaymentMethod').value
    };

    safeCall(() => $w('#btnCreateEvent').disable());

    try {
        const event = await createEvent(eventInput);
        currentEventId = event._id;
        setStatus('Event created. Now add at least one class (roping) below.');
        safeCall(() => { $w('#textEventTitleLocation').text = `${event.title} - ${event.location}`; });
        setVisible(() => $w('#textEventTitleLocation'), true);
        setVisible(() => $w('#boxAddClass'), true);
        safeCall(() => $w('#btnGenerateQr').enable()); // QR can be generated before any class opens —
                                        // it goes on fliers ahead of time, and early
                                        // scanners get the "notify me when entries open"
                                        // option instead.
        safeCall(() => { $w('#btnCreateEvent').label = 'Event Created'; });
        safeCall(() => $w('#btnCreateEvent').disable()); // one shell per page visit — re-editing the
                                          // shell itself isn't handled by this pass
    } catch (err) {
        setStatus(err.message, true);
        safeCall(() => $w('#btnCreateEvent').enable());
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
        entryCloseTeamCount: closeMode === 'teamCount' ? parseInt($w('#inputClassCloseCount').value, 10) : null,
        rotationSuggestionThreshold: parseOptionalNumber($w('#inputRotationThreshold').value),
        sequenceMode: $w('#checkboxFirstToEnterLastToRope').checked ? 'entry_order' : 'random'
    };

    safeCall(() => $w('#btnAddClass').disable());

    try {
        await createEventClass(currentEventId, classInput);
        setStatus(`Class "${classInput.label}" added.`);
        clearClassForm();
        await refreshClassList();
    } catch (err) {
        setStatus(err.message, true);
    } finally {
        safeCall(() => $w('#btnAddClass').enable());
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
    safeCall(() => { $w('#checkboxFirstToEnterLastToRope').checked = false; });
}

/* ------------------------------------------------------------------ */
/* Classes added so far — list with per-class open/close               */
/* ------------------------------------------------------------------ */

async function refreshClassList() {
    const result = await wixData.query('DrawProEventClasses').eq('eventId', currentEventId).find();
    $w('#repeaterClasses').data = result.items;
    $w('#repeaterClasses').onItemReady(($item, cls) => safeCall(() => {
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
    }));
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
    safeCall(() => $w('#btnGenerateQr').disable());

    try {
        const { entryUrl, qrImageUrl } = await generateEventQrCode(currentEventId);
        safeCall(() => { $w('#imageQrCode').src = qrImageUrl; });
        setVisible(() => $w('#imageQrCode'), true);
        safeCall(() => { $w('#textEntryUrl').text = entryUrl; });

        const waitingCount = await getAlertSubscriberCount(currentEventId);
        if (waitingCount > 0) {
            setStatus(`QR code ready. ${waitingCount} people are already waiting for entries to open.`);
        } else {
            setStatus('QR code ready — add it to your flier.');
        }
    } catch (err) {
        setStatus(err.message, true);
    } finally {
        safeCall(() => $w('#btnGenerateQr').enable());
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
