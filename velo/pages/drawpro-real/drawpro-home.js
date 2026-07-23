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
 *   #btnCreateEvent       (Button, inside #boxProducerDashboard — links to
 *                          Producer Event Setup)
 *   #linkEditProfile      (Button/Link, inside #boxProducerDashboard — links
 *                          to the Producer Profile page)
 *   #textActiveEventsHeading (Text, inside #boxProducerDashboard)
 *   #repeaterActiveEvents (Repeater, inside #boxProducerDashboard — item
 *                          template needs #textEventTitle, #textEventDate,
 *                          #textEventLocation, #linkManageEvent inside)
 *   #textNoActiveEvents   (Text, inside #boxProducerDashboard — shown if
 *                          #repeaterActiveEvents is empty)
 *   #textPastEventsHeading (Text, inside #boxProducerDashboard)
 *   #repeaterPastEvents   (Repeater, inside #boxProducerDashboard — same
 *                          item template as #repeaterActiveEvents)
 *   #textNoPastEvents     (Text, inside #boxProducerDashboard — shown if
 *                          #repeaterPastEvents is empty)
 */

import wixData from 'wix-data';
import wixLocation from 'wix-location';
import { currentMember } from 'wix-members-frontend';

$w.onReady(async function () {
    const member = await currentMember.getMember().catch(() => null);

    if (member) {
        safeCall(() => $w('#boxVisitorCTA').collapse());
        safeCall(() => $w('#boxProducerDashboard').expand());
        wireDashboardButtons();
        await loadProducerEvents(member._id);
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

function wireVisitorButtons() {
    $w('#btnSignUp').onClick(() => wixLocation.to('/signup'));
    $w('#btnLogIn').onClick(() => wixLocation.to('/login'));
    // Adjust the two paths above once the real sign-up/login page URLs
    // are known - if #btnSignUp/#btnLogIn are Wix's own native Member
    // Login widgets instead of custom buttons, this whole function isn't
    // needed at all, since those widgets handle navigation themselves.
}

function wireDashboardButtons() {
    $w('#btnCreateEvent').onClick(() => wixLocation.to('/producer-event-setup'));
    $w('#linkEditProfile').onClick(() => wixLocation.to('/producer-profile'));
    // Adjust both paths once the real page URLs are known, same note as
    // wireVisitorButtons() above.
}

async function loadProducerEvents(producerId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [activeResult, pastResult] = await Promise.all([
        wixData.query('DrawProEvents').eq('producerId', producerId).ge('eventDate', today).ascending('eventDate').find(),
        wixData.query('DrawProEvents').eq('producerId', producerId).lt('eventDate', today).descending('eventDate').find()
    ]);

    renderEventRepeater('#repeaterActiveEvents', '#textNoActiveEvents', activeResult.items);
    renderEventRepeater('#repeaterPastEvents', '#textNoPastEvents', pastResult.items);
}

function renderEventRepeater(repeaterId, emptyTextId, events) {
    if (events.length === 0) {
        safeCall(() => $w(repeaterId).collapse());
        safeCall(() => $w(emptyTextId).expand());
        return;
    }

    safeCall(() => $w(emptyTextId).collapse());
    safeCall(() => $w(repeaterId).expand());
    $w(repeaterId).data = events;
    $w(repeaterId).onItemReady(($item, event) => {
        $item('#textEventTitle').text = event.title;
        $item('#textEventDate').text = new Date(event.eventDate).toLocaleDateString();
        $item('#textEventLocation').text = event.location;
        $item('#linkManageEvent').onClick(() =>
            wixLocation.to(`/producer-draw-sheet-review?event=${event._id}`)
        );
        // Adjust this path once the real Producer Draw Sheet Review page
        // URL is known - it already expects an ?event= query param, per
        // that page's own $w.onReady() (reads wixLocation.query.event).
    });
}
