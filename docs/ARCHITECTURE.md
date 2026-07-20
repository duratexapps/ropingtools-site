# Architecture decisions made in this pass

This documents choices made while turning `HANDOFF_BRIEF.md` into actual
code, before any of this has touched a real Wix site. Everything here is
written from Wix/Velo documentation, not verified against a live editor —
see "What still needs live verification" at the bottom.

## Embedding: one HTML iframe element, no splitting needed

The brief flagged uncertainty about Wix's embed size/complexity limits and
suggested splitting the 471KB file per-section as a fallback. Checked
current Wix docs: **the HTML iframe element has no character/size limit**
([Working with the HTML iframe Element](https://dev.wix.com/docs/develop-websites/articles/wix-editor-elements/other-elements/html-i-frame-element/working-with-the-html-iframe-element)).
So `public/course-embed.html` stays a single file, pasted into one HTML
embed element on one Wix page. Simpler to maintain, and the file's internal
nav between sections keeps working exactly as before.

## The postMessage bridge (the core new piece)

The HTML iframe element is **sandboxed** — it has no access to `wix-members`,
`wix-data`, Secrets Manager, or anything else in the parent page's Velo
context. That's true whether the embedded code is a raw HTML paste or a
Velo Custom Element in most configurations. So the embedded file can't
`import` a backend `.jsw` module directly the way normal Velo frontend code
does.

The fix: a small `postMessage` request/response bridge.

- **`public/course-embed.html`** — added a `wixBridge` helper near the top
  of the `<script>` block. `wixBridge.call(action, payload)` posts a
  message up to `window.parent` with a random correlation ID, and returns a
  Promise that resolves when a matching response message comes back (or
  rejects after a 30–60s timeout).
- **`velo/pages/course-page.js`** — Page Code for the Wix page hosting the
  embed. Listens for messages from the iframe via `$w('#courseEmbed').onMessage()`,
  dispatches by `action` to the real backend `.jsw` calls, and posts the
  result back with `iframeEl.postMessage()`.
- The backend `.jsw` modules (`aiCoach.jsw`, `progress.jsw`, `feedback.jsw`,
  `legalAcknowledgments.jsw`) are only ever called from Page Code — never
  from the iframe — so `currentMember.getMember()` inside them is always
  backed by the visitor's real, authenticated Wix session. **The client
  never supplies its own member ID anywhere in this flow**, which is what
  actually makes the credit system and progress tracking tamper-resistant.

Five things were rewired through this bridge:
1. `analyzeRoping()` — was a direct client-side fetch to
   `api.anthropic.com`; now calls `wixBridge.call('analyzeRoping', ...)`.
   **The prompt template itself moved server-side** (into
   `aiCoach.jsw`'s `buildCoachPrompt()`) — the client now only sends
   structured fields (position/skill/goal/chapterFocus/frames), not prompt
   text. This satisfies the brief's "preserve the prompt's intent" note by
   construction (it can't drift client-side because it doesn't live there
   anymore), and closes off prompt-injection through the free-text `goal`
   field feeding directly into a system-prompt-like string.
2. `recordQuizResult()` — fires `wixBridge.call('recordQuizResult', ...)`
   in addition to updating the existing in-memory `studentProgress` object
   (kept as-is so the report page still renders instantly without a round
   trip).
3. `sendFeedback()` — tries the backend call first, falls back to the
   original `mailto:` behavior if that fails (not logged in, network
   error, etc.) — matches the brief's explicit ask to keep mailto as a
   fallback, not remove it.
4. `acknowledgeRisk()` — now persists `{ memberId (implicit), documentType,
   version, timestamp }` via the bridge instead of just closing the modal.
5. `recordVideoAnalysis()` — **left as display-only.** It no longer needs
   its own sync call because `aiCoach.jsw` already writes to
   `VideoAnalysisLog` as part of the same transaction that deducts credits
   — logging it a second time from a separate, unauthenticated path would
   just create a race between two write paths for the same fact.

### Security note: `PARENT_ORIGIN`
Both the iframe's `postMessage` calls and the parent's message listener
currently accept any origin (`'*'` / no `event.origin` check). This is
flagged inline in both files. **Lock this down to the real production
origin before launch** — left open because the actual origin Wix serves
embedded HTML content under (may differ between the Wix preview domain and
the connected `ropingtools.com` custom domain) needs to be observed on a
real, published site, not guessed.

## Content gating (quizData + lesson HTML)

The brief's Technical Requirement #3 asked for chapter content and quiz
questions to move behind a backend check — originally all 32 chapters'
teaching content and all 320 quiz Q&As were static HTML/JS baked directly
into the file, visible to anyone via view-source, gating or no gating.

**Done in this pass**, via a scripted extraction (not hand-edited — a
471KB file with 32 chapters isn't something to slice by hand reliably):

- A one-off Node script walked the original file's DOM structure (matching
  `<div class="chapter">` blocks by brace-depth, not fixed line numbers, so
  it wasn't order- or whitespace-fragile) and pulled each chapter's teaching
  HTML out from between its `.chapter-body` open tag and its `<!-- QUIZ -->`
  comment, plus the entire `quizData` object.
- That extracted content now lives in **`velo/backend/courseContent.js`** —
  a plain backend `.js` file (not `.jsw`), which per Wix's own repo
  structure is importable by other backend files but **never exposed to the
  frontend at all**. This is stricter than "check permissions before
  returning it" — the content literally isn't reachable from client code.
- **`velo/backend/content.jsw`**'s `getChapterContent(chapterId)` is the
  only way this content reaches a browser: it checks `currentMember`, then
  queries `Purchases`/`Subscriptions` for entitlement, and only then returns
  the HTML + quiz array. Not logged in, or logged in but not entitled, both
  return `{ locked: true }` — no content, no chapter title leak beyond what
  was already public in `chapterTitles`.
- In `public/course-embed.html`, every chapter except **1.1** (the free
  preview, which stays fully inline/public, matching the brief's free-tier
  spec) now has its teaching-content region replaced with a
  `.chapter-locked` placeholder (teaser + "Unlock This Chapter" button) plus
  an empty `.chapter-content-mount` div. `toggleChapter()` — the existing
  function that already lazily rendered quizzes on first expand — now also
  calls the new `unlockChapter()` on first expand of a locked chapter, which
  round-trips through `wixBridge.call('getChapterContent', ...)`. If
  entitled, the mount div gets filled with the real HTML, `quizData[id]` gets
  populated client-side for that one chapter, and the existing `renderQuiz()`
  runs unchanged. If not entitled, the teaser text updates in place with a
  purchase prompt — no separate error state to build.
- The client-side `quizData` object now contains **only chapter 1-1's**
  10 questions — the other 310 questions across 31 chapters are gone from
  page source entirely, confirmed by grepping the shipped file for known
  chapter-1.2-only text after the transform (zero matches) alongside chapter
  1.1's text (still present, as expected).

**Not yet meaningful in practice**: `isEntitled()` in `content.jsw` queries
real `Purchases`/`Subscriptions` collections, but **no checkout flow writes
to those collections yet** (payment is still an open decision — see below).
Until that's built, every non-1.1 chapter will correctly show as locked for
every visitor, including the site owner testing it, because there's nothing
in those collections to match against. That's expected, not a bug — nothing
else needs to change in the gating logic once a real purchase writes a row
there.

**Verified**: the transform script's output was syntax-checked (`new
Function(...)` on the extracted `<script>` block) and structurally verified
(31 `.chapter-locked` placeholders, 32 intact `.chapter` shells, 32 intact
`.quiz-section`/12 `.video-coach-box` elements untouched, chapter-1.2-only
text absent from the client file, chapter-1.1 text still present). **Not**
verified: the actual `unlockChapter()` round-trip against a live Wix page,
since that depends on the postMessage bridge itself being live-verified
first (see below) and on `Purchases`/`Subscriptions` collections existing
with real test data.

### Not touched
- Payment (Wix Pricing Plans vs. Stripe-via-Velo) — brief explicitly leaves
  this as an open decision, nothing to prep code-wise until that's chosen.
- Coach's real name, legal doc placeholders, real feedback inbox address,
  testimonials — all still placeholders, per the brief's own "what not to
  do" list. `REAL_FEEDBACK_INBOX` in `course-embed.html` is isolated to one
  constant now, so it's a one-line fix once the client gives you a real
  address.
- `CreditTransactions` (full audit-log history vs. just current balance) —
  flagged as a likely near-term addition in `data-collections/SCHEMA.md`,
  not built.
- Monthly credit refresh for Annual plans — needs a Wix scheduled job, not
  written.

## What's actually been verified live vs. what's still on paper

**Verified against the real site** (`duratexapps/roping-tools`, connected
to the mycamperspot.com Wix account with Dev Mode on): Git Integration
works end-to-end — repo cloned, Wix CLI authenticated via device login,
`npm install` + `wix sync-types` succeed, no Velo Packages conflict was
present, and the backend `.jsw` modules + locked-down `permissions.json`
have been pushed to `main`. That's real, not theoretical.

**Still on paper, not live-tested** — because they all require a page in
the Editor with the HTML embed element actually placed (see task "Create
course page with HTML embed element," still pending):

- Whether `$w('#courseEmbed').onMessage()` / `.postMessage()` actually
  round-trips with a pasted HTML iframe embed (vs. only Custom Elements) —
  this is the single riskiest unverified assumption in the whole bridge.
- The iframe's `event.origin` / the parent's actual origin, needed to lock
  down `PARENT_ORIGIN` from `'*'` to the real value.
- Current `wix-members-backend` / `wix-secrets-backend` API names matching
  what's used in the `.jsw` files — Wix has been migrating some backend
  modules toward newer `-v2` / SDK-style equivalents.
- The `unlockChapter()` / `getChapterContent()` round trip end-to-end,
  including against real rows in `Purchases`/`Subscriptions` (collections
  don't exist yet either — see pending task).

None of this is blocked on anything technical, just on the remaining manual
Editor steps (Secrets Manager, the course page + embed element, the Data
Collections) landing first.

## Update: the `$w.onMessage()` bridge was live-tested and doesn't work — replaced with HTTP Functions

Once the Draw Pro coming-soon page's embed was actually live, its "Get
Notified" waitlist consistently failed with a timeout. Live console
debugging (in the Local Editor's Preview mode, with browser DevTools open)
found the real cause: `$w('#drawProEmbed')` returns `{ type: undefined,
constructor: Array, keys: [] }` — an **empty array**, not the HTML
Component reference Wix's own docs describe. This was confirmed repeatable
across multiple page reloads and Local Editor reconnects, with the element
ID visually confirmed correct in the Editor ("Section: drawProEmbed" badge
matched exactly). The classic `$w.HtmlComponent` messaging API
(`onMessage()`/`postMessage()`) that Wix's docs describe for the "HTML
iFrame Element" does not appear to apply to whatever component type the
current Editor's "Custom Embeds"/"Embed a Widget" flow actually creates —
this looks like a real platform gap or naming/version mismatch between
Wix's documentation and the current Editor, not a mistake in our setup.

**Fix: switched to Wix HTTP Functions instead**, for actions that don't
need a logged-in member's identity. `backend/http-functions.js` exposes
`post_joinDrawProWaitlist` / `options_joinDrawProWaitlist` as a plain REST
endpoint at `https://www.ropingtools.com/_functions/joinDrawProWaitlist`,
called directly via `fetch()` from `public/drawpro/index.html` — no `$w`,
no `onMessage`, no Page Code involvement at all. CORS headers are set
explicitly and permissively (`Access-Control-Allow-Origin: '*'`) since it
wasn't confirmed whether the embed iframe is same-origin with
`www.ropingtools.com` (a `filesusr.com` asset-domain URL was observed in
one network trace, suggesting it may not be) — tighten this once confirmed,
same as the `PARENT_ORIGIN` lockdown.

**What this means for everything else:**
- **Draw Pro's real build** (native `$w` elements + Page Code, not an HTML
  embed at all — see the build package from Claude Chat) is unaffected by
  this bug entirely, since native elements don't go through
  `$w('#id').onMessage()` on an HTML Component — this bug is specific to
  HTML/Custom-Embed iframe elements.
- **The Coaching course page** (`course-page.js` / `course-embed.html`)
  almost certainly has the same broken bridge — it hasn't been re-tested
  live since this was found. Its actions need real member identity
  (`currentMember` in the backend), which HTTP Functions can't get for
  free the way Page Code can — an HTTP Function would need the visitor's
  session to arrive via cookies on a cross-origin-safe request, which is
  unconfirmed. **This needs verifying before assuming the same fix applies
  there** — don't port this blind.
- **Steer Me web**, if it uses any HTML-embed pattern for interactive
  pieces, should default to HTTP Functions (or native `$w` elements, like
  Draw Pro's real build) from the start rather than the `$w.onMessage()`
  bridge — no reason to re-discover this same bug a third time.

## Update: Draw Pro's HTTP Function fully verified live, plus a second platform gap found (`elevate()`)

The HTTP Function fix above was carried through to a real, confirmed
working end-to-end test: `POST /_functions/joinDrawProWaitlist` → inserts
into `DrawProWaitlist` → verified via a direct data query. Along the way,
a second Wix platform behavior didn't match its own documentation:
**`wix-auth`'s `elevate()` did not work inside an HTTP Function**, tested
three ways (elevating individual `wixData` calls, elevating the whole
exported function, applying `elevate()` directly in `http-functions.js`
rather than an imported module) — all failed identically with `WDE0027:
does not have permissions`. Full details and the workaround (opening the
specific collection permission needed, rather than relying on `elevate()`)
are in `data-collections/SCHEMA.md`'s "Important operational notes"
section — that's now the canonical place for this, since it's really a
data-layer/permissions issue more than a bridge-architecture one.

**This sharpens the open question above about the Coaching course**: even
once its `$w.onMessage()` bridge gets fixed or replaced, its backend
functions (`aiCoach.jsw`, `progress.jsw`, etc.) all assume they can write
to Admin-locked collections from trusted backend code — the same
assumption that just failed for Draw Pro. Two unverified things need
checking before touching the course: (1) whether Page-Code-invoked
`.jsw` calls (the course's actual pattern, once the bridge itself works)
have the same `elevate()` failure HTTP Functions just showed, and (2) if
so, what the right fix looks like for *member-scoped* writes (a student's
own quiz result, their own credit balance) — "open the collection to
Everyone" isn't an acceptable answer there the way it was for Draw Pro's
anonymous waitlist, since these collections need to stay genuinely
member-private, not just publicly-writable.

**Also relevant for Steer Me and Draw Pro's real build**: all of this
project's Data Collections were re-verified to need their **Collection
ID** (not just display name) matching the code exactly — building via
CSV import silently leaves the ID as `Import1`, `Import2`, etc. even
after renaming. Every collection in this project built that way had to be
deleted and recreated. `SCHEMA.md` now documents using the Wix Data REST
API directly (with a scoped API Key) to create collections with the
correct ID from the start, which is the path future collections should
use instead of CSV import.

## Update: online payment processor switched from Stripe to PayPal for Platforms

Business decision, not a technical one — the near-term target audience
for Draw Pro is small/mom-and-pop producers, who are far more likely to
already have (or know how to set up) a PayPal account than a Stripe
account, which is largely invisible infrastructure outside developer/
tech-forward business circles. Larger, already-automated producers (who
may prefer Stripe or their own existing tooling) are an explicit later
target, once the payment flow is proven out against the lower-friction
audience first.

Confirmed via live documentation research (not assumed) that this
requirement is universal, not Stripe-specific: Visa/Mastercard's Payment
Facilitator rules require identity verification of any third party a
platform automatically routes split funds to, regardless of processor —
PayPal for Platforms requires the identical producer onboarding/KYC step
Stripe Connect does, it isn't a way around that requirement, just a
different vendor administering it. See the conversation record for the
fuller reasoning chain (mom-and-pop-audience trust vs. brand-name
familiarity, cost structure without a fixed per-account monthly fee).

**Schema addition** (not in the original `docs/source/drawpro-build/files/data-model.md`,
which is a raw reference copy of what Claude Chat delivered and isn't
edited after the fact): `DrawProEntrants` needs two new fields —
`pendingPayPalOrderId` (text, nullable) and `pendingCharge` (object,
nullable, `{ producerAmount, drawProFee, processingFee,
totalChargedToEntrant }`). These exist because PayPal's checkout is a
two-step, client-driven flow (create order → buyer approves → capture),
unlike Stripe's single-call `payment_intents` — `createPayPalOrder()`
stashes the computed charge breakdown against the entrant at order-
creation time so `capturePayPalOrder()` uses exactly what the buyer
approved rather than recomputing (and risking drift if pricing changes
between the two calls). Add these two fields to the `DrawProEntrants`
collection when it's created in Wix.

**Still needed before this is functional** (structurally complete,
matching this codebase's established "build it now, mark it not-live-
yet" pattern for Stripe/Strike/Triggered Email templates):
- PayPal for Platforms application approval (sales-contact process, in
  progress as of this update — not instant self-serve)
- Real credentials in Secrets Manager: `drawpro-paypal-client-id`,
  `drawpro-paypal-client-secret`, `drawpro-paypal-partner-merchant-id`
- `entrant-entry-form.js`'s actual PayPal JS SDK buttons — the backend
  contract (`createPayPalOrder`/`capturePayPalOrder`) is ready, but
  nothing renders PayPal's approval UI on the page yet
- The `MERCHANT.ONBOARDING.COMPLETED` webhook (would live in
  `backend/http-functions.js`, same pattern as `post_joinDrawProWaitlist`)
  — `checkPayoutOnboardingStatus()` is a working polling fallback in the
  meantime, called from the producer's onboarding-return page
- `Buffer.from(...).toString('base64')` (used for PayPal's OAuth Basic
  auth header) is assumed available in Velo's backend runtime but not
  yet live-tested specifically — verify before relying on it, same
  "don't assume, verify live" lesson as the `postMessage` bridge and
  `elevate()` findings above

## Update: Draw Pro's 12 real-product Data Collections created — and a Site ID mismatch caught the same way the Collection ID issue was

All 12 collections from `data-model.md` (`DrawProEvents` through
`DrawProOnboardingStatus`, plus the two PayPal fields on
`DrawProEntrants` noted above) were created via the Wix Data REST API,
same scoped-API-Key method used to fix the original CSV-import
Collection ID problem. Verified via a fresh, independent `GET
/wix-data/v2/collections` list query afterward (not just trusting the
creation calls' 200 responses) — confirmed 13 `DrawPro*` collections
exist on the site (the 12 new ones plus the pre-existing
`DrawProWaitlist`).

**Worth recording:** the first attempt used a Site ID read off a Wix
dashboard URL from a screenshot, and failed outright with `WDE0110:
Wix CMS app is not installed for site` — a real, substantive error (the
API key itself authenticated fine), not a permissions problem. The
actual, correct Site ID (confirmed via Wix's own AI agent) was
different from the URL-derived one. Root cause wasn't confirmed beyond
that, but the practical lesson is clear: **don't infer a Site ID from a
URL glimpsed in a screenshot — get it directly from Settings → General
Info, or ask Wix's own tooling, before spending a REST call on it.**
Same category of mistake as the Collection-ID-vs-display-name issue
this project already hit once — trust the platform's own source of
truth for an identifier, not an inference from surrounding UI.

Reference fields throughout all 12 collections were created as plain
`TEXT` (storing the `_id` string), not Wix Data's native `REFERENCE`
field type — deliberate, not a shortcut: every `.jsw` file in this
project already queries these relationships with plain
`wixData.query(X).eq('fieldName', idString)` calls, never Wix's
relational reference-traversal syntax, so a `TEXT` field is the correct
match for how the code actually works, not just the easier one to
create via REST (`REFERENCE` fields need exact target-collection
binding at creation time, which is awkward-to-impossible for
self-references like `DrawProEntrants.teamPartnerEntrantId` before the
collection exists).

## Update: `target="_top"` alone does not reliably escape Wix's Custom Embed iframe — confirmed live, fixed everywhere

Live symptom: clicking "Start Learning" on the published homepage produced
a blank black page reading "Forbidden," with the browser's URL bar showing
`www-ropingtools-com.filesusr.com/coaching` — the sandboxed embed iframe's
own Wix asset-CDN origin, not the real `www.ropingtools.com/coaching`.
This is the same category of thing as the `$w.onMessage()` bridge failure
above (Wix's Custom Embeds element not behaving like the classic,
documented HTML iFrame element), but a different specific symptom.

**Ruled out first, with direct evidence, not assumed:**
- Stale/pre-fix content in the live paste — checked via DevTools
  Inspect Element; `target="_top"` was confirmed present on the live
  rendered link.
- Iframe sandbox restriction — checked via
  `document.querySelector('iframe...').getAttribute('sandbox')` in the
  DevTools console; returned `null`, meaning no sandbox attribute at
  all, which itself rules out sandbox-based restriction (sandboxing
  only applies when the attribute is present).
- Ad-blocker/browser-shield interference — the console showed several
  `net::ERR_BLOCKED_BY_CLIENT` errors for `frog.wix.com` (Brave Shields
  blocking what's likely a first-party Wix script), a plausible
  alternate cause. Tested by disabling Brave Shields for the site
  entirely and retrying — same failure. Ruled out.

**Confirmed fix**, tested directly: switching the DevTools console's
execution context to the embed iframe itself (not "top") and running
`window.top.location.href = 'https://www.ropingtools.com/coaching'`
worked — the page actually navigated to the real course page. So
JavaScript-driven top-navigation works from inside this Custom Embed
even though the native `target="_top"` anchor attribute alone doesn't
reliably trigger the same behavior.

**Fix applied**: every internal navigation link across
`public/landing/index.html`, `public/drawpro/index.html`, and
`public/steerme/index.html` now has an `onclick="return topNavigate(event,
'/path')"` handler backing it, where `topNavigate()` calls
`event.preventDefault()` then sets `window.top.location.href` to the full
absolute URL. `target="_top"` is left on each `<a>` anyway as a harmless,
free fallback (still correct for a plain right-click "open in new tab").

**Likely retroactive explanation for an earlier bug in this project**:
the original "black blank page saying Forbidden" report (Draw Pro's "Back
to RopingTools" link, early in this project) was diagnosed at the time as
a missing `target="_top"` attribute. Given this confirmed finding, that
diagnosis may have been incomplete — the attribute being present doesn't
appear to be sufficient on its own. Not re-litigating that earlier fix,
just noting the likely real mechanism for future reference.

**Not yet checked**: whether `course-embed.html` has any internal
navigation links with the same pattern — searched and found none as of
this update, but worth re-checking if any get added later.

## Update: Steer Me web's production backend decision — Next.js + Supabase-direct, not the Wix Data mirror

Decided explicitly rather than left ambiguous: **Steer Me web's real
production backend is Next.js (the `steerme-web` repo) calling the native
app's actual Supabase project directly.** The Wix Data Collections backend
built earlier (`velo/backend/steerme/*.jsw` in this repo) is superseded,
not deleted — see `velo/backend/steerme/README.md` for the full status
note living alongside that code.

**Standard applied**: "whichever option streamlines the backend between
the web and the app is the correct option." The Wix Data version never
met that bar even when it was fully working — it mirrors the native app's
schema into a separate database, with zero actual data-sharing, which its
own delivery notes flagged as explicitly out of scope. Only a shared
Supabase connection actually satisfies "streamlines the backend between
web and app."

**Accepted, known tradeoff**: this means Steer Me does not share a login
with Coaching/Draw Pro's Wix Members Area — three separate account
systems across the suite as of this decision (Wix Members for
Coaching/Draw Pro, Supabase Auth for Steer Me/the native app). Not solved
here, not blocked by this decision either — revisit only if a unified
account across all of RopingTools becomes a real priority later.

## Update: plan for retiring the old Wix `/steerme` coming-soon page

Two "Steer Me coming soon" pages exist right now and that's temporary,
not a final state: the Wix-hosted one (`public/steerme/index.html`,
linked from the landing page today) and the new Next.js one (`steerme-web`
repo, meant for `steerme.ropingtools.com`).

**Confirmed sequencing**: once `steerme.ropingtools.com` is actually live
(Vercel deployment + the DNS CNAME in Wix, both still pending as of this
update) and the landing page's Steer Me links have been updated to point
there instead of `/steerme`, and that's been tested and confirmed working
— **only then** does the old Wix `/steerme` page get removed. Not before.
Removing it first, or removing it based on "should be working" rather than
confirmed-working, would risk a dead link on the live homepage with
nothing to catch it.

**Not yet done, waiting on the subdomain going live first**:
- Update `public/landing/index.html`'s two Steer Me links
  (`topNavigate(event, '/steerme')` calls) to point at
  `https://steerme.ropingtools.com` instead
- Confirm the new destination actually loads correctly from the live
  homepage (not just directly visiting the subdomain)
- Only then: delete the `/steerme` page in the Wix Editor and remove
  `public/steerme/index.html` from this repo

**Still unconfirmed, blocks the waitlist form on *both* versions of this
page equally until resolved**: whether the `SteerMeWaitlist` Wix Data
Collection has actually been created yet (instructions given earlier in
this project's history — "Start from scratch," not CSV import — but never
confirmed done).
