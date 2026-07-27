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
 */

import { getProducerProfile, upsertProducerProfile } from 'backend/producerProfiles.jsw';
import { inviteAccountUser, removeAccountUser, listAccountUsers } from 'backend/account-users.jsw';
import { getSubscription } from 'backend/payments.jsw';
import { currentMember } from 'wix-members-frontend';

let currentProducerId = null;

$w.onReady(async function () {
    $w('#btnSaveProfile').onClick(handleSave);
    safeCall(() => $w('#btnInviteUser').onClick(handleInviteUser));
    await loadExistingProfile();
    await loadTeamSection();
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
