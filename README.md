# Team Roping Training Platform — ropingtools.com

Wix Velo build of the team roping training course, per `docs/source/HANDOFF_BRIEF.md`.

## Status

This is a **local staging area**, not yet connected to the real Wix site.
It exists so the AI-coaching security fix (moving the Anthropic API call
server-side) and the other backend pieces could be written and reviewed
before touching the live `ropingtools.com` Wix account.

## What's here

```
public/course-embed.html     The course, modified to call a postMessage
                              bridge instead of Anthropic directly. Paste
                              the full contents into a Wix HTML iframe
                              element once the site page exists.
velo/pages/course-page.js    Velo Page Code for whichever page hosts that
                              embed — receives bridge messages, calls the
                              backend modules below. Move into the real
                              site repo's src/pages/<page-id>.js once that
                              exists.
velo/backend/*.jsw           Backend web modules: AI coaching proxy
                              (credit check + Anthropic call), quiz
                              progress sync, feedback storage, legal
                              acknowledgment tracking.
data-collections/SCHEMA.md   Wix Data Collection field definitions to
                              create by hand in the Content Manager
                              (Wix Data has no code-migration format).
docs/ARCHITECTURE.md         What was decided in this pass and why, plus
                              what's still open and needs live-site
                              verification.
docs/source/                 Original handoff brief + unmodified source
                              HTML, kept for reference/diffing.
legal/                       Draft legal docs (need attorney review —
                              see the brief).
```

## Next steps (in order)

1. **Check for Velo Packages on the target Wix site.** Git Integration &
   Wix CLI doesn't work if legacy Velo Packages are installed (plain npm
   packages are fine). Dev Mode → Packages & Apps in the Wix Editor.
2. **Enable Git Integration** on the ropingtools.com site (Dev Mode →
   GitHub Integration → Connect to GitHub). Wix provisions a real repo —
   clone it locally.
3. **Merge this staging content into that real repo**: paste
   `public/course-embed.html` into an HTML iframe element on the target
   page, move `velo/pages/course-page.js` to the real page-code file Wix
   generates for that page, copy `velo/backend/*.jsw` into that repo's
   `backend/` folder.
4. **Create the Wix Data Collections** in the Content Manager per
   `data-collections/SCHEMA.md`.
5. **Add `ANTHROPIC_API_KEY` to Secrets Manager** on the site (Dev Mode →
   Secrets Manager) — never commit it anywhere.
6. Run `wix dev` for a live local preview, verify the bridge round-trips
   (see "What still needs live verification" in `docs/ARCHITECTURE.md`),
   then `wix publish`.
7. Decide + build payment (Wix Pricing Plans vs. Stripe-via-Velo — see the
   brief), then auth-gate content per `docs/ARCHITECTURE.md`'s "Content
   gating" open item.
8. Get `legal/*.md` reviewed by a licensed attorney before real launch.
