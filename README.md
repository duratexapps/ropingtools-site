# Team Roping Training Platform — ropingtools.com

Wix Velo build of the team roping training course, per `docs/source/HANDOFF_BRIEF.md`.

## Status

This folder is the **staging/reference copy** — the code that's actually
live is in the separate `roping-tools` repo (`git@github.com:duratexapps/roping-tools.git`,
cloned locally as a sibling to this folder), which Wix's Git Integration
provisioned. Backend modules and permissions from here have already been
pushed to that repo's `main` branch and should be synced to the site.

**Working site note:** building is happening on the **mycamperspot.com**
Wix account/site (Dev Mode was available there; it wasn't on the original
`ropingtools.com` site, which turned out to be stuck in Wix's Aria AI
site-builder flow). The `ropingtools.com` domain itself still needs to be
reconnected from wherever it currently points to this site — that's a
separate, non-blocking follow-up.

## What's here

```
public/course-embed.html      The course. Paste the full contents into a
                               Wix HTML iframe element once the course page
                               exists in the Editor. Chapter 1.1 stays
                               public/inline (free preview); every other
                               chapter is now a locked placeholder that
                               fetches real content via the bridge — see
                               "Content gating" in docs/ARCHITECTURE.md.
velo/pages/course-page.js     Velo Page Code for whichever page hosts that
                               embed — receives bridge messages, calls the
                               backend modules below. Needs to be copied
                               into the real repo's src/pages/<page-id>.js
                               once that page + embed element exist (Wix
                               only creates that filename from the Editor).
velo/backend/*.jsw            Backend web modules: AI-coaching proxy
                               (credit check + Anthropic call), gated
                               chapter content delivery, quiz progress
                               sync, feedback storage, legal
                               acknowledgment tracking. Already pushed to
                               the real repo.
velo/backend/courseContent.js Extracted chapter HTML + quiz Q&A for all 32
                               chapters — plain backend file (not .jsw), so
                               it's importable by content.jsw but never
                               reachable from the frontend. Already pushed.
data-collections/SCHEMA.md    Wix Data Collection field definitions to
                               create by hand in the Content Manager
                               (Wix Data has no code-migration format).
docs/ARCHITECTURE.md          What was decided/built and why, what's
                               verified live vs. still on paper.
docs/source/                  Original handoff brief + unmodified source
                               HTML, kept for reference/diffing.
legal/                        Draft legal docs (need attorney review —
                               see the brief).
```

## Done so far

- Git Integration connected; `roping-tools` repo cloned, Wix CLI
  authenticated, dependencies installed
- No Velo Packages conflict on the target site
- Backend pushed: `aiCoach.jsw`, `progress.jsw`, `feedback.jsw`,
  `legalAcknowledgments.jsw`, `content.jsw`, `courseContent.js`, plus a
  locked-down `permissions.json` (was wide open to anonymous callers by
  default; now explicit per-function)
- The postMessage bridge (`wixBridge` in the embed, `course-page.js` on the
  parent) rewiring the AI-coach call, progress sync, feedback, and risk
  acknowledgment off direct client-side calls
- Content gating: all 32 chapters' teaching content + all 320 quiz
  questions extracted out of client-visible page source; only chapter 1.1
  (free preview) still ships in the HTML. Everything else is fetched
  through an entitlement check — see `docs/ARCHITECTURE.md`

## Remaining manual steps (tracked, no rush)

1. **Add `ANTHROPIC_API_KEY` to Secrets Manager** on the site (Dev Mode →
   Secrets Manager) — never commit it anywhere.
2. **Create a course page + HTML iframe element** in the Editor, paste in
   `public/course-embed.html`'s contents. Once that page exists and is
   pulled locally, `velo/pages/course-page.js`'s logic needs to move into
   the real generated page-code file (Wix names it, can't be created from
   the IDE).
3. **Create the Wix Data Collections** in the Content Manager per
   `data-collections/SCHEMA.md` (`Purchases` and `Subscriptions` in
   particular — without them, every gated chapter will correctly show as
   locked for everyone, since there's nothing to check entitlement against
   yet).
4. **Reconnect the `ropingtools.com` domain** to this site (separate,
   non-blocking issue — see status note above).
5. Run `wix dev` for a live local preview, verify the bridge round-trips
   (see "What's actually been verified live" in `docs/ARCHITECTURE.md`),
   then `wix publish`.
6. Decide + build payment (Wix Pricing Plans vs. Stripe-via-Velo — see the
   brief) — this is what will actually start writing rows to
   `Purchases`/`Subscriptions`, making the content gating meaningful.
7. Get `legal/*.md` reviewed by a licensed attorney before real launch.
