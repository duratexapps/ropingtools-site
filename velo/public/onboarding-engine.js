/**
 * public/onboarding-engine.js
 * Shared Velo frontend code — a lightweight, reusable step-by-step tour
 * that highlights real page elements in place, rather than a separate
 * lightbox (Velo lightboxes can't reach into the calling page's own
 * elements, so an in-page overlay is the buildable pattern here).
 *
 * Each page supplies its own step list and the handful of overlay
 * elements below — the engine just drives them.
 *
 * Expected overlay elements on any page that uses this:
 *   #tourOverlay        (full-page translucent backdrop container)
 *   #tourHighlightBox    (a box element moved/resized to frame the target)
 *   #tourTooltip          (container positioned near the highlighted element)
 *   #tourTitle
 *   #tourBody
 *   #textTourStepCount    (e.g. "Step 2 of 5")
 *   #btnTourNext
 *   #btnTourBack
 *   #btnTourSkip
 */

/**
 * @param {Object} $w - the page's own $w selector, passed in since public
 *   code doesn't have direct access to a page's element scope
 * @param {Array<{targetId: string, title: string, body: string}>} steps
 * @param {Object} callbacks
 * @param {Function} callbacks.onFinish - called after the last step's Next
 * @param {Function} callbacks.onSkip - called if the user clicks Skip early
 */
// FIXED live 2026-07-28: caught by an automated back-test sweep - an
// uncaught "$w(...).expand is not a function" TypeError was thrown from
// this exact module (shared across every page that has a tour), from the
// unwrapped $w('#tourOverlay').expand() call below. Since this is public/
// shared code (not a page file), it has no local safeCall() of its own -
// added one here so every page using runTour() gets the same protection
// page-code files already have, in one place rather than duplicated per
// page.
// FIXED live 2026-07-30 - same gap fixed the same day in
// producer-event-setup.js's own safeCall()/setVisible(): every failure
// here used to log the same generic "tour step failed," with no element
// name attached, forcing pure process-of-elimination to figure out which
// of several identical-looking failures corresponded to which ID. label
// is now required at every call site below.
function safeCall(fn, label) {
    try {
        fn();
    } catch (err) {
        console.error(`[onboarding-engine] tour step failed (tour keeps working) for ${label}: ${err.message}`);
    }
}

export function runTour($w, steps, callbacks) {
    let currentStep = 0;

    safeCall(() => $w('#tourOverlay').expand(), '#tourOverlay.expand');
    safeCall(() => $w('#btnTourNext').onClick(handleNext), '#btnTourNext.onClick');
    safeCall(() => $w('#btnTourBack').onClick(handleBack), '#btnTourBack.onClick');
    safeCall(() => $w('#btnTourSkip').onClick(handleSkip), '#btnTourSkip.onClick');

    showStep(currentStep);

    async function showStep(index) {
        const step = steps[index];
        safeCall(() => { $w('#tourTitle').text = step.title; }, '#tourTitle.text=');
        safeCall(() => { $w('#tourBody').text = step.body; }, '#tourBody.text=');
        safeCall(() => { $w('#textTourStepCount').text = `Step ${index + 1} of ${steps.length}`; }, '#textTourStepCount.text=');
        safeCall(() => $w('#btnTourBack').disable(), '#btnTourBack.disable');
        if (index > 0) safeCall(() => $w('#btnTourBack').enable(), '#btnTourBack.enable');
        safeCall(() => { $w('#btnTourNext').label = index === steps.length - 1 ? 'Finish' : 'Next'; }, '#btnTourNext.label=');

        await positionTooltipNear(step.targetId);
    }

    async function positionTooltipNear(targetId) {
        try {
            const rect = await $w(targetId).getBoundingRect();
            // Frame the target element itself.
            safeCall(() => $w('#tourHighlightBox').show(), '#tourHighlightBox.show');
            safeCall(() => { $w('#tourHighlightBox').x = rect.x - 6; }, '#tourHighlightBox.x=');
            safeCall(() => { $w('#tourHighlightBox').y = rect.y - 6; }, '#tourHighlightBox.y=');
            safeCall(() => { $w('#tourHighlightBox').width = rect.width + 12; }, '#tourHighlightBox.width=');
            safeCall(() => { $w('#tourHighlightBox').height = rect.height + 12; }, '#tourHighlightBox.height=');

            // Place the tooltip just below the target, falling back to
            // above it if that would run off the bottom of the viewport.
            const tooltipY = rect.y + rect.height + 12;
            safeCall(() => { $w('#tourTooltip').x = rect.x; }, '#tourTooltip.x=');
            safeCall(() => { $w('#tourTooltip').y = tooltipY; }, '#tourTooltip.y=');
        } catch (err) {
            // Target element isn't visible on this step (e.g. a
            // conditionally-shown field) — show the tooltip centered
            // instead of failing the whole tour over one missing target.
            safeCall(() => $w('#tourHighlightBox').hide(), '#tourHighlightBox.hide');
            console.warn(`Tour step target "${targetId}" not found or not visible: ${err.message}`);
        }
    }

    function handleNext() {
        if (currentStep < steps.length - 1) {
            currentStep++;
            showStep(currentStep);
        } else {
            endTour();
            if (callbacks && callbacks.onFinish) callbacks.onFinish();
        }
    }

    function handleBack() {
        if (currentStep > 0) {
            currentStep--;
            showStep(currentStep);
        }
    }

    function handleSkip() {
        endTour();
        if (callbacks && callbacks.onSkip) callbacks.onSkip();
    }

    function endTour() {
        safeCall(() => $w('#tourOverlay').collapse(), '#tourOverlay.collapse');
        safeCall(() => $w('#tourHighlightBox').hide(), '#tourHighlightBox.hide (endTour)');
    }
}
