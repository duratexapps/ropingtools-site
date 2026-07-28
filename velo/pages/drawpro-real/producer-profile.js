/**
 * Page: Producer — Profile
 *
 * NEW, added 2026-07-23. A Draw Pro producer's own org-facing identity -
 * organization name, contact info, logo. Genuinely missing until now:
 * producers had no identity in Draw Pro beyond their raw Wix Member
 * account. Deliberately a SEPARATE, standalone Draw Pro concept, not
 * unified with Steer Me's own producer_profiles (Supabase) - Draw Pro
 * and Steer Me already use three independent login systems by design
 * (see ARCHITECTURE.md), and Draw Pro is meant to work standalone
 * without requiring a Steer Me account at all. See ARCHITECTURE.md's
 * "Draw Pro producer profiles" entry for the full reasoning.
 *
 * Once set up, this organization name flows into backend/steerMeSync.jsw's
 * payload as external_producer_name - fixing a real gap where every
 * Draw-Pro-sourced event on Steer Me showed no producer name at all
 * (fell back to a generic "Posted via Draw Pro" label).
 *
 * Expected Editor elements:
 *   #inputOrgName        (text input, required)
 *   #inputContactEmail   (text input, optional)
 *   #inputContactPhone   (text input, optional)
 *   #inputLogoUrl        (text input, optional - a plain URL field for now, not a real image
 *                         upload component; upgrading to one is a reasonable future enhancement,
 *                         not done here to keep this first pass simple)
 *   #btnSaveProfile      (button)
 *   #textStatus          (text, status/error messages)
 *
 *   -- Manage Team (NEW, added 2026-07-27 - multi-user accounts) --
 *   #inputInviteEmail    (text input - email of the helper to invite)
 *   #btnInviteUser       (button)
 *   #textTeamStatus      (text, status/error messages for this section specifically -
 *                         separate from #textStatus above so an invite error doesn't
 *                         overwrite/get overwritten by a profile-save message)
 *   #repeaterTeamUsers   (repeater - item template needs #textTeamEmail, #textTeamStatus2
 *                         (the row's own invited/active/removed status - named _2 to avoid
 *                         colliding with the page-level #textTeamStatus, same repeater-ID
 *                         scoping rule noted on drawpro-home.js), #btnRemoveTeamUser inside)
 *   #textSeatInfo        (text - e.g. "2 of 3 seats used (team3 plan)" - updates after
 *                         every invite/remove)
 *
 *   -- Subscription (NEW, added 2026-07-27) --
 *   #textSubCurrentStatus (text - e.g. "Active - 3 users plan, renews Aug 1, 2027" or
 *                          "Not subscribed")
 *   #radioSubTier         (radio button group - options populated dynamically from
 *                          backend/payments.jsw's getSeatTierOptions(), so pricing/labels
 *                          shown here always match what actually gets charged - never
 *                          hardcode tier prices into this page's own text)
 *   #btnSubscribe         (button - starts PayPal checkout for the selected tier;
 *                          label changes to "Change Plan" if already subscribed)
 *   #btnCancelSubscription (button - cancels the active subscription; hidden if not subscribed)
 *   #textSubActionStatus  (text, status/error messages for subscribe/cancel actions
 *                          specifically - separate from #textSubCurrentStatus, same
 *                          reasoning as #textTeamStatus above)
 *
 *   -- Legal (NEW, added 2026-07-28) --
 *   #linkLegal            (button/link, small/muted styling - "present but not overly
 *                          conspicuous" per direct instruction, so this sits low on the
 *                          page among the other account-management controls rather than
 *                          as a nav item. Opens the Legal page (see velo/pages/
 *                          drawpro-real/drawpro-legal.js) in a new tab.)
 */

import wixLocation from 'wix-location';
import { getProducerProfile, upsertProducerProfile } from 'backend/producerProfiles.jsw';
import { inviteAccountUser, removeAccountUser, listAccountUsers } from 'backend/account-users.jsw';
import {
    getSubscription, getSeatTierOptions, startProducerSubscription,
    checkSubscriptionStatus, cancelSubscription
} from 'backend/payments.jsw';
import { currentMember } from 'wix-members-frontend';

let currentProducerId = null;

$w.onReady(async function () {
    $w('#btnSaveProfile').onClick(handleSave);
    safeCall(() => $w('#btnInviteUser').onClick(handleInviteUser));
    safeCall(() => $w('#btnSubscribe').onClick(handleSubscribeClick));
    safeCall(() => $w('#btnCancelSubscription').onClick(handleCancelClick));
    // NEW, added 2026-07-28 - opens the Legal page. wixLocation.to() rather
    // than a plain <a> since this is a native Wix element, not HTML embed
    // content; "legal" is the Legal page's URL slug (see drawpro-legal.js).
    safeCall(() => $w('#linkLegal').onClick(() => wixLocation.to('/legal')));
    await loadExistingProfile();
    await loadTeamSection();
    await loadSubscriptionSection();
});

// Same defensive pattern established elsewhere in this project
// (producer-event-setup.js, drawpro-home.js) - the Manage Team section
// is new and its elements may not exist on the live page yet; one
// missing/mistyped element shouldn't crash the whole page's onReady().
function safeCall(fn) {
    try {
        fn();
    } catch (err) {
        console.error(`[producer-profile] setup step failed (page keeps working): ${err.message}`);
    }
}

async function loadExistingProfile() {
    const member = await currentMember.getMember().catch(() => null);
    if (!member) {
        setStatus('Sign in as a producer to set up your profile.', true);
        $w('#btnSaveProfile').disable();
        return;
    }
    currentProducerId = member._id;

    const profile = await getProducerProfile(member._id);
    if (profile) {
        $w('#inputOrgName').value = profile.organizationName || '';
        $w('#inputContactEmail').value = profile.contactEmail || '';
        $w('#inputContactPhone').value = profile.contactPhone || '';
        $w('#inputLogoUrl').value = profile.logoUrl || '';
    }
}

async function handleSave() {
    setStatus('');
    $w('#btnSaveProfile').disable();

    const profileInput = {
        organizationName: $w('#inputOrgName').value,
        contactEmail: $w('#inputContactEmail').value || null,
        contactPhone: $w('#inputContactPhone').value || null,
        logoUrl: $w('#inputLogoUrl').value || null
    };

    try {
        await upsertProducerProfile(profileInput);
        setStatus('Profile saved.');
    } catch (err) {
        setStatus(err.message, true);
    } finally {
        $w('#btnSaveProfile').enable();
    }
}

function setStatus(message, isError) {
    $w('#textStatus').text = message;
    $w('#textStatus').style.color = isError ? '#B3261E' : '#2E7D32';
}

/* ------------------------------------------------------------------ */
/* Manage Team - NEW, added 2026-07-27 (multi-user accounts)           */
/* ------------------------------------------------------------------ */

// Owner-only section, by design - account-users.jsw's inviteAccountUser()/
// removeAccountUser() reject anyone but the account owner (member._id ===
// producerId), so a signed-in HELPER visiting this page wouldn't be able
// to use these actions even if the elements are visible to them. Not
// hidden for helpers here since that's a call this page doesn't currently
// have enough info to make cleanly (see account-users.jsw's
// getAccessibleProducerIds() doc comment) - the backend rejection is the
// real enforcement either way.
async function loadTeamSection() {
    if (!currentProducerId) return;

    try {
        const [users, sub] = await Promise.all([
            listAccountUsers(currentProducerId),
            getSubscription(currentProducerId)
        ]);

        const tier = (sub && sub.seatTier) || 'solo';
        const limitLabel = tier === 'unlimited' ? 'unlimited' : (tier === 'team3' ? 3 : 1);
        const seatsUsed = users.length + 1; // +1 for the owner, who has no row of their own
        safeCall(() => {
            $w('#textSeatInfo').text = `${seatsUsed} of ${limitLabel} seat(s) used (${tier} plan)`;
        });

        safeCall(() => {
            $w('#repeaterTeamUsers').data = users;
            $w('#repeaterTeamUsers').onItemReady(($item, user) => {
                $item('#textTeamEmail').text = user.inviteEmail;
                $item('#textTeamStatus2').text = user.status;
                $item('#btnRemoveTeamUser').onClick(() => handleRemoveTeamUser(user._id));
            });
        });
    } catch (err) {
        // Not fatal to the rest of the page (profile save still works) -
        // log and move on, same defensive instinct as safeCall() above.
        console.error(`[producer-profile] loadTeamSection failed: ${err.message}`);
    }
}

async function handleInviteUser() {
    const email = $w('#inputInviteEmail').value;
    setTeamStatus('');
    safeCall(() => $w('#btnInviteUser').disable());

    try {
        await inviteAccountUser(currentProducerId, email);
        setTeamStatus('Invite sent.');
        safeCall(() => { $w('#inputInviteEmail').value = ''; });
        await loadTeamSection();
    } catch (err) {
        setTeamStatus(err.message, true);
    } finally {
        safeCall(() => $w('#btnInviteUser').enable());
    }
}

async function handleRemoveTeamUser(accountUserRecordId) {
    setTeamStatus('');
    try {
        await removeAccountUser(currentProducerId, accountUserRecordId);
        setTeamStatus('Removed.');
        await loadTeamSection();
    } catch (err) {
        setTeamStatus(err.message, true);
    }
}

function setTeamStatus(message, isError) {
    safeCall(() => {
        $w('#textTeamStatus').text = message;
        $w('#textTeamStatus').style.color = isError ? '#B3261E' : '#2E7D32';
    });
}

/* ------------------------------------------------------------------ */
/* Subscription - NEW, added 2026-07-27                                */
/* ------------------------------------------------------------------ */

// This whole section answers a real, previously-open question: Steer Me
// already has a complete, real Subscribe screen (app/subscription.tsx,
// gated only on the external RevenueCat/App Store setup step) - Draw Pro
// had NO equivalent page at all until this one. Owner-only, same as
// account-users.jsw's Manage Team actions - startProducerSubscription()/
// cancelSubscription()/checkSubscriptionStatus() all reject anyone but
// the account owner server-side regardless of what this page shows.
async function loadSubscriptionSection() {
    if (!currentProducerId) return;

    try {
        // ?subReturn=1 means we're back from PayPal's approval flow
        // (SUBSCRIPTION_RETURN_URL) - reconcile our own record against
        // PayPal's real status before displaying anything. ?subReturn=0
        // means they hit SUBSCRIPTION_CANCEL_URL instead (backed out of
        // checkout) - nothing to reconcile, just a heads-up message.
        const subReturn = wixLocation.query.subReturn;
        if (subReturn === '1') {
            await checkSubscriptionStatus(currentProducerId).catch((err) =>
                console.error(`[producer-profile] checkSubscriptionStatus failed: ${err.message}`)
            );
        } else if (subReturn === '0') {
            setSubActionStatus('Checkout was cancelled - your subscription was not changed.');
        }

        const [tierOptions, sub] = await Promise.all([
            getSeatTierOptions(),
            getSubscription(currentProducerId)
        ]);

        safeCall(() => {
            $w('#radioSubTier').options = tierOptions.map((t) => ({
                label: `${t.label} — $${t.annualFee}/year`,
                value: t.key
            }));
        });

        const isActive = sub && sub.status === 'active';
        safeCall(() => {
            if (isActive) {
                const renewalText = sub.renewalDate
                    ? `renews ${new Date(sub.renewalDate).toLocaleDateString()}`
                    : '';
                $w('#textSubCurrentStatus').text = `Active — ${sub.seatTier || 'solo'} plan. ${renewalText}`.trim();
                $w('#radioSubTier').value = sub.seatTier || 'solo';
                $w('#btnSubscribe').label = 'Change Plan';
                $w('#btnCancelSubscription').expand();
            } else {
                $w('#textSubCurrentStatus').text = sub && sub.status === 'pending_approval'
                    ? 'Subscription pending approval — finish checkout with PayPal to activate it.'
                    : 'Not subscribed.';
                $w('#radioSubTier').value = 'solo';
                $w('#btnSubscribe').label = 'Subscribe';
                $w('#btnCancelSubscription').collapse();
            }
        });
    } catch (err) {
        console.error(`[producer-profile] loadSubscriptionSection failed: ${err.message}`);
    }
}

async function handleSubscribeClick() {
    setSubActionStatus('');
    const selectedTier = safeGet(() => $w('#radioSubTier').value) || 'solo';
    safeCall(() => $w('#btnSubscribe').disable());

    try {
        const approvalUrl = await startProducerSubscription(currentProducerId, selectedTier);
        // Redirects away to PayPal's hosted checkout - nothing left to do
        // on this page until they return via SUBSCRIPTION_RETURN_URL/
        // SUBSCRIPTION_CANCEL_URL, both of which point back here with
        // ?subReturn=, handled at the top of loadSubscriptionSection().
        wixLocation.to(approvalUrl);
    } catch (err) {
        setSubActionStatus(err.message, true);
        safeCall(() => $w('#btnSubscribe').enable());
    }
}

async function handleCancelClick() {
    setSubActionStatus('Cancelling…');
    safeCall(() => $w('#btnCancelSubscription').disable());

    try {
        await cancelSubscription(currentProducerId);
        setSubActionStatus('Subscription cancelled.');
        await loadSubscriptionSection();
    } catch (err) {
        setSubActionStatus(err.message, true);
    } finally {
        safeCall(() => $w('#btnCancelSubscription').enable());
    }
}

function setSubActionStatus(message, isError) {
    safeCall(() => {
        $w('#textSubActionStatus').text = message;
        $w('#textSubActionStatus').style.color = isError ? '#B3261E' : '#2E7D32';
    });
}

// Same idea as safeCall(), but for a value read rather than a void
// action - returns undefined instead of throwing if the element doesn't
// exist, so handleSubscribeClick() can fall back to 'solo' cleanly.
function safeGet(fn) {
    try {
        return fn();
    } catch (err) {
        return undefined;
    }
}
