/**
 * Page: Draw Pro — Legal
 *
 * NEW, added 2026-07-28, per direct instruction: "create a separate item
 * 'Legal' on each platform... present but not overly conspicuous... contain
 * copies of all legal documents... verbiage along the lines of 'The use of
 * Draw Pro serves as your acknowledgment of the rules & regulations
 * outlined here.'"
 *
 * This whole page is a single static HTML embed - no backend calls, no
 * postMessage bridge, nothing login-aware needed, since it's a pure
 * read-only reference page (all 4 documents + a tab switcher + the
 * acknowledgment banner are self-contained inside the embed's own HTML/
 * CSS/JS). That's why this page-code file is nearly empty.
 *
 * HOW TO BUILD THIS PAGE IN THE WIX EDITOR:
 *   1. Create a new page. Name it "Legal". Set its URL slug to exactly
 *      "legal" (lowercase) - this is what producer-profile.js's
 *      #linkLegal button and home-intro.html's footer link both point to
 *      (wixLocation.to('/legal') and href="legal.html" respectively - see
 *      note below on why the embed itself uses a *relative* href instead).
 *   2. Add ONE HTML iframe embed element to the page, full width. Give it
 *      any element ID (this file doesn't need to reference it by ID since
 *      there's no postMessage bridge to wire up).
 *   3. Paste the ENTIRE contents of public/drawpro/legal.html into that
 *      embed element's HTML source.
 *   4. Do NOT add this page to the main site nav / header menu - per
 *      "present but not overly conspicuous," it's reached via:
 *        - a small muted footer link on the Draw Pro home/marketing embed
 *          (public/drawpro/home-intro.html, already added)
 *        - a small "Legal" link on the Producer Profile page
 *          (velo/pages/drawpro-real/producer-profile.js's new #linkLegal,
 *          already wired up)
 *
 * Why home-intro.html's footer link uses a relative href="legal.html"
 * with target="_blank" instead of wixLocation-style navigation: it's an
 * HTML embed (sandboxed iframe), so it can't call wixLocation directly.
 * This mirrors the exact same already-working pattern course-embed.html
 * uses for its own terms.html/privacy.html/disclaimer.html links - see
 * that file's footer for the precedent this was copied from.
 *
 * Move into the real repo's src/pages/<actual-page-id>.js once the /legal
 * page exists in the Editor, with the exact filename Wix generates - same
 * process as every other page in this project (Wix assigns the real
 * filename; it can't be predicted from the IDE ahead of time). Mirror this
 * same change into the roping-tools repo per the established two-repo
 * rule.
 */

$w.onReady(function () {
  // Intentionally empty - see file header. Nothing to wire up.
});
