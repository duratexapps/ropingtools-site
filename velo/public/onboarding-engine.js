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
export function runTour($w, steps, callbacks) {
    let currentStep = 0;

    $w('#tourOverlay').expand();
    $w('#btnTourNext').onClick(handleNext);
    $w('#btnTourBack').onClick(handleBack);
    $w('#btnTourSkip').onClick(handleSkip);

    showStep(currentStep);

    async function showStep(index) {
        const step = steps[index];
        $w('#tourTitle').text = step.title;
        $w('#tourBody').text = step.body;
        $w('#textTourStepCount').text = `Step ${index + 1} of ${steps.length}`;
        $w('#btnTourBack').disable();
        if (index > 0) $w('#btnTourBack').enable();
        $w('#btnTourNext').label = index === steps.length - 1 ? 'Finish' : 'Next';

        await positionTooltipNear(step.targetId);
    }

    async function positionTooltipNear(targetId) {
        try {
            const rect = await $w(targetId).getBoundingRect();
            // Frame the target element itself.
            $w('#tourHighlightBox').show();
            $w('#tourHighlightBox').x = rect.x - 6;
            $w('#tourHighlightBox').y = rect.y - 6;
            $w('#tourHighlightBox').width = rect.width + 12;
            $w('#tourHighlightBox').height = rect.height + 12;

            // Place the tooltip just below the target, falling back to
            // above it if that would run off the bottom of the viewport.
            const tooltipY = rect.y + rect.height + 12;
            $w('#tourTooltip').x = rect.x;
            $w('#tourTooltip').y = tooltipY;
        } catch (err) {
            // Target element isn't visible on this step (e.g. a
            // conditionally-shown field) — show the tooltip centered
            // instead of failing the whole tour over one missing target.
            $w('#tourHighlightBox').hide();
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
        $w('#tourOverlay').collapse();
        $w('#tourHighlightBox').hide();
    }
}
