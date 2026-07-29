/**
 * Page: Draw Pro — Home
 *
 * NEW, added 2026-07-23. Meant to eventually REPLACE the current
 * "Coming Soon" page (public/drawpro/index.html / velo/pages/drawpro-page.js)
 * once Draw Pro is ready to go fully public - see docs/ARCHITECTURE.md's
 * "Draw Pro home page" entry for the full reasoning. Built and tested
 * now, ahead of that flip, per explicit direction - not blocked on the
 * "don't flip prematurely" rule in DRAWPRO_NEXT_STEPS.md, since this is
 * a new page existing alongside the old one, not the flip itself.
 *
 * Serves two different audiences on ONE page:
 *  - Anonymous visitor: sees the marketing/tour content (an HTML embed,
 *    public/drawpro/home-intro.html - same tour carousel already built
 *    and tested on the old Coming Soon page) plus native sign-up/login
 *    elements below it.
 *  - Signed-in producer: sees a personal dashboard instead - their own
 *    active events, their own past events, a create-event link, and a
 *    link to their producer profile. Confirmed scope: THIS producer's
 *    own events only, not a platform-wide directory of everyone's events.
 *
 * Why the marketing/tour section is a separate HTML embed rather than
 * native elements: it's the exact same carousel already built and
 * tested on the old Coming Soon page, and HTML embeds are sandboxed
 * from Wix Members login state anyway (confirmed limitation, same as
 * the course/old Coming Soon embeds - see ARCHITECTURE.md), so nothing
 * about login-awareness could live inside it even if rebuilt natively.
 *
 * "Active" vs "past" is judged by eventDate alone (>= today vs < today),
 * not by aggregating each event's classes' individual statuses - events
 * can have several classes in different states, but eventDate is the
 * one single anchor date already used consistently elsewhere in this
 * schema. Simple, not perfectly precise for a multi-day event whose
 * classes finish on different days, but a reasonable v1 boundary.
 *
 * Expected Editor elements:
 *   #htmlDrawProIntro     (HTML iframe embed — paste in the full contents of
 *                          public/drawpro/home-intro.html)
 *   #boxVisitorCTA        (Container — shown when NOT signed in)
 *   #btnSignUp            (Button, inside #boxVisitorCTA — links to Draw Pro's
 *                          sign-up flow. Can be a plain Wix "Member Login" /
 *                          "Sign Up" widget dragged from the Editor's Members
 *                          element category instead of a custom button, if
 *                          that's faster to build — either works)
 *   #btnLogIn             (Button, inside #boxVisitorCTA — same note as above)
 *   #boxProducerDashboard (Container — shown when signed in)
 *   #textWelcome          (Text, inside #boxProducerDashboard — NEW, added 2026-07-28.
 *                          "Welcome back, [Org Name]," matching
 *                          docs/mockups/drawpro-producer-dashboard-mockup.html - that
 *                          mockup had this text, but no code ever actually wrote it
 *                          until now. IMPORTANT: every element in this
 *                          #boxProducerDashboard group must be an actual CHILD of that
 *                          container in the Editor's layers panel, not just visually
 *                          positioned near it - .expand()/.collapse() only affects the
 *                          container's own visibility, it doesn't cascade to elements
 *                          that merely overlap it on screen.)
 *   #btnCreateEvent       (Button, inside #boxProducerDashboard — links to
 *                          Producer Event Setup)
 *   #linkEditProfile      (Button/Link, inside #boxProducerDashboard — links
 *                          to the Producer Profile page)
 *   #textActiveEventsHeading (Text, inside #boxProducerDashboard)
 *   #repeaterActiveEvents (Repeater, inside #boxProducerDashboard — item template needs
 *                          #textActiveEventTitle, #textEventDate, #textEventLocation, #linkManageEvent
 *                          inside. #textActiveEventTitle (not the plainer #textEventTitle originally
 *                          spec'd) because something else on this page kept conflicting with
 *                          #textEventTitle specifically, unresolved after real troubleshooting -
 *                          renamed rather than keep hunting for a phantom element, 2026-07-25)
 *   #textNoActiveEvents   (Text, inside #boxProducerDashboard — shown if
 *                          #repeaterActiveEvents is empty)
 *   #textPastEventsHeading (Text, inside #boxProducerDashboard)
 *   #repeaterPastEvents   (Repeater, inside #boxProducerDashboard — CONFIRMED LIVE 2026-07-25: Wix's
 *                          classic Editor does not allow the same Element ID to be reused across two
 *                          DIFFERENT repeaters on one page (only within items of the SAME repeater) -
 *                          the original spec here said "same item template as #repeaterActiveEvents,"
 *                          which is wrong and caused a real "duplicate ID" error live. This repeater's
 *                          item template needs its OWN distinct IDs instead: #textPastEventTitle,
 *                          #textPastEventDate, #textPastEventLocation, #linkPastManageEvent)
 *   #textNoPastEvents     (Text, inside #boxProducerDashboard — shown if
 *                          #repeaterPastEvents is empty)
 *
 *   -- Producer nav strip (NEW, added 2026-07-28) --
 *   Real gap flagged directly by the user: Producer Event Setup, Producer
 *   Draw Sheet Review, and Producer Profile were all only reachable via
 *   the site's main public nav menu (confusing - mixed in alongside HOME/
 *   Course/Legal) or a handful of one-off buttons, with no consistent way
 *   to move between them once on one of them. This same 3-link strip is
 *   duplicated identically on all 4 producer pages (Dashboard, Event
 *   Setup, Draw Sheet Review, Profile) - Wix's classic Editor has no true
 *   shared-component mechanism, same reasoning as the Tour Overlay
 *   elements duplicated across pages elsewhere in this project. Always
 *   visible on all 4 (not conditionally shown only when signed in) -
 *   simpler, and harmless even for a signed-out visitor who somehow lands
 *   on one of these pages, since every actual action is still gated
 *   server-side regardless.
 *   #navDashboard   (Button/Link) - links to /producer-dashboard
 *   #navCreateEvent (Button/Link) - links to /producer-event-setup
 *   #navMyProfile   (Button/Link) - links to /producer-profile
 */

import wixData from 'wix-data';
import wixLocation from 'wix-location';
import { currentMember } from 'wix-members-frontend';
import { getAccessibleProducerIds } from 'backend/account-users.jsw';
import { getProducerProfile } from 'backend/producerProfiles.jsw';

$w.onReady(async function () {
    wireProducerNav();
    const member = await currentMember.getMember().catch(() => null);

    // FIXED live 2026-07-28, real gap flagged directly by the user: this
    // used to treat "signed in" and "ready to see the dashboard" as the
    // same thing. A brand-new member who just signed up has no
    // DrawProProducerProfiles row yet (that's a separate step, filled in
    // on the Producer Profile page) - landing them on this dashboard
    // showed an empty "0 active events" view with no indication they
    // still need to set up their profile first, instead of actually
    // guiding them there. Three real states now, not two:
    //   - not signed in -> marketing + sign-up (unchanged)
    //   - signed in, no producer profile yet -> straight to Producer
    //     Profile to finish setup (this is the actual "new producer"
    //     path - Producer Profile itself already has its own
    //     authentication.promptLogin() prompt for landing there with no
    //     session at all, so both directions of this handoff are covered)
    //   - signed in, profile already exists -> the real dashboard
    if (member) {
        const profile = await getProducerProfile(member._id).catch(() => null);
        if (!profile) {
            wixLocation.to('/producer-profile');
            return;
        }
        safeCall(() => $w('#boxVisitorCTA').collapse());
        safeCall(() => $w('#boxProducerDashboard').expand());
        // NEW, added 2026-07-28 - real gap found while comparing the
        // actual page against docs/mockups/drawpro-producer-dashboard-
        // mockup.html: that mockup shows "Welcome back, [Org Name]," but
        // nothing in this file had ever actually written that text -
        // profile.organizationName was already being fetched two lines
        // up (for the profile-exists check above), just never displayed.
        safeCall(() => { $w('#textWelcome').text = `Welcome back, ${profile.organizationName}`; });
        wireDashboardButtons();
        // FIXED 2026-07-27 - this used to query by member._id alone, which
        // meant a signed-in HELPER user (added via account-users.jsw's
        // multi-user accounts) saw an empty dashboard instead of the
        // account owner's events, even though their backend access was
        // already fully working. getAccessibleProducerIds() returns
        // [member._id, ...anyAccountsTheyHelpOn] - always includes their
        // own id first, so this is a no-op change for anyone who isn't an
        // active helper on someone else's account.
        const producerIds = await getAccessibleProducerIds(member._id);
        await loadProducerEvents(producerIds);
    } else {
        safeCall(() => $w('#boxProducerDashboard').collapse());
        safeCall(() => $w('#boxVisitorCTA').expand());
        wireVisitorButtons();
    }
});

// Same defensive pattern established in producer-event-setup.js -
// wraps a single show/hide call so an unexpected element type on this
// brand-new page can't take down the rest of onReady() the way
// #boxAddClass did there.
function safeCall(fn) {
    try {
        fn();
    } catch (err) {
        console.error(`[drawpro-home] setup step failed (page keeps working): ${err.message}`);
    }
}

// NEW, added 2026-07-28 - see this file's header comment for the full
// reasoning. Duplicated identically on all 4 producer pages.
function wireProducerNav() {
    safeCall(() => $w('#navDashboard').onClick(() => wixLocation.to('/producer-dashboard')));
    safeCall(() => $w('#navCreateEvent').onClick(() => wixLocation.to('/producer-event-setup')));
    safeCall(() => $w('#navMyProfile').onClick(() => wixLocation.to('/producer-profile')));
}

// FIXED live 2026-07-28: confirmed the exact scenario this function's own
// old comment predicted - #btnSignUp/#btnLogIn turned out to BE Wix's
// native Member Login/Sign Up widgets (confirmed live: clicking them opens
// Wix's own hosted lightbox), and calling .onClick() on a native Members
// widget throws ("... .onClick is not a function"). This was UNCAUGHT -
// unlike every other wiring call on this page, these two weren't wrapped
// in safeCall() - and since $w.onReady() is synchronous until its first
// await, the throw here killed the rest of that render pass, producing a
// fully blank page for any anonymous visitor. Wrapping in safeCall() both
// stops the crash AND is the complete fix - these lines are genuinely
// unnecessary no-ops for a native widget, which already handles its own
// click/navigation behavior with no custom code required.
function wireVisitorButtons() {
    safeCall(() => $w('#btnSignUp').onClick(() => wixLocation.to('/signup')));
    safeCall(() => $w('#btnLogIn').onClick(() => wixLocation.to('/login')));
}

function wireDashboardButtons() {
    safeCall(() => $w('#btnCreateEvent').onClick(() => wixLocation.to('/producer-event-setup')));
    safeCall(() => $w('#linkEditProfile').onClick(() => wixLocation.to('/producer-profile')));
}

async function loadProducerEvents(producerIds) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // hasSome(), not eq() - producerIds is now an array (own id + any
    // accounts this member actively helps on), see the onReady() comment
    // above. hasSome() with a single-item array behaves identically to
    // the old eq() call, so this is safe for the common (non-helper) case.
    const [activeResult, pastResult] = await Promise.all([
        wixData.query('DrawProEvents').hasSome('producerId', producerIds).ge('eventDate', today).ascending('eventDate').find(),
        wixData.query('DrawProEvents').hasSome('producerId', producerIds).lt('eventDate', today).descending('eventDate').find()
    ]);

    renderEventRepeater('#repeaterActiveEvents', '#textNoActiveEvents', activeResult.items, {
        title: '#textActiveEventTitle', date: '#textEventDate', location: '#textEventLocation', manage: '#linkManageEvent'
    });
    renderEventRepeater('#repeaterPastEvents', '#textNoPastEvents', pastResult.items, {
        title: '#textPastEventTitle', date: '#textPastEventDate', location: '#textPastEventLocation', manage: '#linkPastManageEvent'
    });
}

// itemIds is a set of item-template element IDs, not hardcoded - see the
// big comment on #repeaterPastEvents above. Wix doesn't allow the same
// Element ID reused across two DIFFERENT repeaters on one page (only
// within items of the SAME repeater), confirmed live 2026-07-25 - each
// repeater on this page needs its own distinct set of item-template IDs.
function renderEventRepeater(repeaterId, emptyTextId, events, itemIds) {
    if (events.length === 0) {
        safeCall(() => $w(repeaterId).collapse());
        safeCall(() => $w(emptyTextId).expand());
        return;
    }

    safeCall(() => $w(emptyTextId).collapse());
    safeCall(() => $w(repeaterId).expand());
    $w(repeaterId).data = events;
    $w(repeaterId).onItemReady(($item, event) => safeCall(() => {
        $item(itemIds.title).text = event.title;
        $item(itemIds.date).text = new Date(event.eventDate).toLocaleDateString();
        $item(itemIds.location).text = event.location;
        $item(itemIds.manage).onClick(() =>
            wixLocation.to(`/drawpro-producer-review?event=${event._id}`)
        );
        // FIXED live 2026-07-28: confirmed real URL is /drawpro-producer-review,
        // not /producer-draw-sheet-review as originally guessed here - part of
        // a full audit of every hardcoded page path in this codebase against
        // the actual URLs, done after discovering the homepage's own Draw Pro
        // link was pointing at the wrong page for the same reason (a renamed
        // page's display name doesn't change its URL slug).
    }));
}
