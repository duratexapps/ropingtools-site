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
 */

import { getProducerProfile, upsertProducerProfile } from 'backend/producerProfiles.jsw';
import { currentMember } from 'wix-members-frontend';

$w.onReady(async function () {
    $w('#btnSaveProfile').onClick(handleSave);
    await loadExistingProfile();
});

async function loadExistingProfile() {
    const member = await currentMember.getMember().catch(() => null);
    if (!member) {
        setStatus('Sign in as a producer to set up your profile.', true);
        $w('#btnSaveProfile').disable();
        return;
    }

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
