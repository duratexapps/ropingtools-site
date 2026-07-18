# Build Spec: Steer Me Web Version (`ropingtools.com/steerme`)

## What you're starting from

`steer-me.html` is a complete, working **phone-frame mobile app mockup** (390px wide, styled to look like an iOS app) with real interaction logic already built — this is not a rough sketch, it's a fully-clicked-through prototype covering 16 screens. Read the whole file before starting; this spec describes what's in it and what needs to change for a web version, but the actual UX detail lives in the file itself.

## Full feature inventory (already built, in the prototype)

**Athlete side:**
- Role selection on first visit (athlete / producer / both)
- Signup: photo, name, age with a minor/guardian-consent branch (guardian name + contact required, requests get routed to the guardian for approval before any contact info is shared), Global Handicap screenshot upload with simulated auto-scan of membership ID + classification number, position (header/heeler), home area, contact info, community guidelines acceptance
- Home dashboard with stats (eligible partners now, pending requests, booked) and quick-action tiles
- "Post a need": pick an event/classification cap, the app calculates the max partner classification allowed, submit to see matches
- Browse: eligible partners filtered by the classification-cap math, a toggle for current-location-vs-home-area search, a "my groups only" filter, and (when arriving from a specific event) a filtered view of just that event's attendees
- Per-partner actions: favorite, send a request, report, block
- "My Requests": track sent requests and status (pending / accepted / pending guardian approval), with call/text links once accepted
- Profile: Global ID + classification display, update classification, view subscription, notification toggle, manage blocked users, delete profile & data
- Community feed: post updates (text, optional event tag, optional photo), view others' posts
- Favorites list
- Groups: view your groups, create a group (name, type: age/region/skill/other, description), discover and join others
- Events (athlete-facing): browse producer-posted events, mark attending per division, rate & review past events (star rating + text)
- Notifications screen with a toggle
- Subscription: Annual ($39.99/yr) or Monthly ($6.99/mo), pitched against the ~$40 draw-in fee it replaces
- Report modal (offense categories already defined: abusive language, sexual content, soliciting a minor, harassment, fake profile/classification, event misrepresented, event didn't happen as advertised, unsafe conditions, non-payment of winnings, other)
- Rating modal (1–5 stars + review text)

**Producer side:**
- Producer signup: org name, contact name/info, affiliation, required proof-of-producer-status upload (business license, insurance certificate, or sanctioning-body letter), verification-pending state
- Producer dashboard: notification toggle, "create an event" action, list of own events
- Create event: name, date, location, entry fee, divisions/classification caps (comma-separated), description
- **Real pricing model already written into the UI copy**: free to create a producer profile and list events; once in-app entry-fee payment exists, 4% + $1.50 per paid registration, nothing charged until a payment is actually collected

**Trust & safety (already designed, keep all of it):**
- Guardian-consent flow for minors, as above
- 3-strike community guidelines enforcement described in the signup copy (3rd confirmed violation → suspension, account deletion, data scrubbed)
- Report and block functionality, block prevents future contact/requests/appearing in matches
- Data retention note: Global Handicap screenshot is deleted when a user updates their classification or deletes their profile — **preserve this behavior for real**, don't just keep the copy without the deletion actually happening once there's a real backend

## What has to change for a web version

1. **Layout.** The whole thing is built as a 390px phone frame with a bottom nav bar. That doesn't work as a desktop web page. This needs a genuine responsive redesign — not the phone frame stretched wide. Decide the desktop layout (likely a persistent side nav instead of a bottom tab bar, multi-column browse/feed layouts at wider viewports) while keeping every screen's actual functionality intact.

2. **All data is currently fake and hardcoded.** Search the file's `<script>` block for `POOL` (the athlete marketplace), `GROUPS`, `EVENTS` (classification cap options), `EVENTS_POSTED` (producer events), and the `me` object (the current hardcoded user, "Colt Bracken"). None of this is real. Before this can be a real product, all of it needs to come from actual stored data instead — see **Backend needs** below. Whether that happens in this round or the web version launches as another working prototype (real UI, still-fake data, like the coaching course's current state) is a **decision to confirm with the client, not something to assume** — the earlier open question about this hasn't been answered yet.

3. **Subscription billing currently says "billed through the App Store or Google Play."** That has to change. This is a web product now, and per the platform decision already made for the rest of ropingtools.com (see `HANDOFF_BRIEF.md`), **don't couple this to Apple/Google in-app purchase billing** — use the same approach as the coaching course (Wix Pricing Plans or Stripe-via-Velo). The subscription screen's copy needs updating accordingly, not just the payment plumbing.

4. **The Global Handicap screenshot "auto-scan"** (extracting membership ID and classification number from an uploaded image) is simulated in the demo. A real version needs either real OCR/document processing or, at minimum, a manual-entry fallback if that's out of scope for this round — confirm which with the client before assuming full OCR is in scope.

5. **Producer verification is instant in the demo** ("Demo: shown immediately below"). A real version needs an actual review queue an admin can act on before a producer's events go public.

## Backend needs (consistent with the rest of ropingtools.com — Wix Velo, not a separate stack)

Since this lives on the same Wix account and domain as the coaching course, use the same platform approach from `HANDOFF_BRIEF.md`: Wix Members Area for auth (athlete and producer are two roles/profile types on the same underlying account, matching how the prototype already models "both"), Wix Data Collections for storage, Velo backend web modules for matching logic and any server-side rules.

Suggested Wix Data Collections (naming to match the existing brief's convention):
- `AthleteProfiles` — name, photo, age/minor flag, guardian info if minor, Global ID, classification number, position, area, contact, verification status
- `ProducerProfiles` — org name, contact info, affiliation, verification document reference, verification status
- `PartnerRequests` — requester, recipient, event/cap, status, timestamps
- `Groups` and `GroupMemberships`
- `Events` — producer id, name, date, location, fee, divisions, description
- `EventAttendance` — event id, division, athlete id
- `Favorites`, `BlockedUsers`, `Reports`, `Ratings`
- `Notifications`

**The classification-cap matching logic** (who counts as "eligible" for a given event, based on the combined classification math already implemented in the prototype's `eligiblePartners()` function) should move into a Velo backend function — don't reimplement it purely in front-end JS once real user data is involved, since that logic determines who can see/contact whom and shouldn't be trivially bypassable from the browser.

## Open questions (same ones from before, plus new ones from this deeper read — don't guess)

- Prototype-with-fake-data (like the coaching course today) or real backend from day one?
- Is real OCR for the Global Handicap screenshot in scope, or manual entry as a fallback/starting point?
- Who reviews producer verification submissions, and where does that review happen?
- Confirm the $39.99/yr / $6.99/mo pricing is still current — it's already written into the prototype's copy, but that doesn't mean it's been re-confirmed since this document was built.
