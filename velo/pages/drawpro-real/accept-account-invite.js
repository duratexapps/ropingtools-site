/**
 * Page: Draw Pro — Accept Account Invite
 *
 * NEW, added 2026-07-27, closing a real gap flagged in DRAWPRO_NEXT_STEPS.md:
 * account-users.jsw's acceptAccountInvite(inviteId) existed and was ready
 * to call, but no page called it - meaning an invited helper had no actual
 * way to accept and start using their access, even though the backend
 * side was fully built.
 *
 * Expects a URL like /accept-account-invite?invite=<DrawProAccountUsers _id>
 * - that link is what the (not-yet-set-up, see account-users.jsw's
 * ACCOUNT_INVITE_EMAIL_ID) invite email points the invited person at.
 *
 * Handles both cases:
 *  - Already signed in when they land here: accept immediately.
 *  - Not signed in yet: show a sign-in/sign-up prompt first (this person
 *    may not have a Wix account at all yet). authentication.promptLogin()
 *    opens Wix's hosted login lightbox and resolves once they're actually
 *    logged in (same verified pattern as course-page.js's
 *    promptLoginAndWait()), so acceptance happens right after, on the
 *    same page load - no second visit needed.
 *
 * Expected Editor elements:
 *   #textHeading       (Text, e.g. "Join the Team")
 *   #textStatus        (Text, status/error messages)
 *   #boxSignInPrompt   (Container — shown if not signed in yet)
 *   #btnSignIn         (Button, inside #boxSignInPrompt — can be a plain Wix
 *                        "Member Login" widget instead, same note as
 *                        drawpro-home.js's #btnSignUp/#btnLogIn)
 *   #btnGoToDashboard  (Button — shown only once the invite is successfully
 *                        accepted; links to the Producer Dashboard)
 */

import wixLocation from 'wix-location';
import { currentMember, authentication } from 'wix-members-frontend';
import { acceptAccountInvite } from 'backend/account-users.jsw';

$w.onReady(async function () {
    safeCall(() => $w('#btnGoToDashboard').collapse());
    safeCall(() => $w('#boxSignInPrompt').collapse());

    const inviteId = wixLocation.query.invite;
    if (!inviteId) {
        setStatus('No invite link found - check the link in your invite email and try again.', true);
        return;
    }

    const member = await currentMember.getMember().catch(() => null);
    if (member) {
        await tryAccept(inviteId);
    } else {
        setStatus('Sign in (or create a free account) to accept this invite.');
        safeCall(() => $w('#boxSignInPrompt').expand());
        safeCall(() => $w('#btnSignIn').onClick(() => handleSignInThenAccept(inviteId)));
    }
});

// authentication.promptLogin({ mode: 'login' }) opens Wix's own hosted
// login lightbox (which already includes a "Sign up" path - no separate
// custom signup form needed) and resolves once the visitor is actually
// logged in - same verified pattern already used in course-page.js's
// promptLoginAndWait(). Rejects if they close it without completing, in
// which case this just leaves the sign-in prompt up rather than erroring.
async function handleSignInThenAccept(inviteId) {
    try {
        await authentication.promptLogin({ mode: 'login' });
    } catch (e) {
        return; // closed without signing in - leave the prompt up
    }
    safeCall(() => $w('#boxSignInPrompt').collapse());
    await tryAccept(inviteId);
}

function safeCall(fn) {
    try {
        fn();
    } catch (err) {
        console.error(`[accept-account-invite] setup step failed (page keeps working): ${err.message}`);
    }
}

async function tryAccept(inviteId) {
    setStatus('Accepting invite…');
    try {
        await acceptAccountInvite(inviteId);
        setStatus("You're in! You now have access to this producer's events.");
        safeCall(() => $w('#btnGoToDashboard').expand());
        // FIXED live 2026-07-28: confirmed real URL is /producer-dashboard
        // (the page displays as "Draw Pro" in the site menu now, but
        // renaming a page's display name doesn't change its URL slug -
        // same real gap found on the homepage's own Draw Pro link).
        safeCall(() => $w('#btnGoToDashboard').onClick(() => wixLocation.to('/producer-dashboard')));
    } catch (err) {
        setStatus(err.message, true);
    }
}

function setStatus(message, isError) {
    $w('#textStatus').text = message;
    $w('#textStatus').style.color = isError ? '#B3261E' : '#2E7D32';
}
