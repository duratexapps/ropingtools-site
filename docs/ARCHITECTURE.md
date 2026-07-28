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

## Update: a new page's code file has to originate in the git repo, not be created in the Wix Editor and synced down

Real, hard-won finding, worth recording precisely so it doesn't get
rediscovered the slow way again on Pages 2 and 3.

**The symptom**: after creating a new page ("Draw Pro Entry") in the Wix
Editor, its Page Code panel showed "Cannot edit in read-only editor" —
expected and correct for a Git-Integrated site (confirmed by Wix's own
tooltip: "Edit code in your local IDE. When you save, it's automatically
updated here"). The actual problem: the corresponding local file never
appeared in `src/pages/` in the `roping-tools` repo, no matter how many
times `wix dev` was restarted, how many times the page was saved and
published, or how many fresh Local Editor reconnections were tried.

**Wrong assumption that cost real time**: that a newly-created page's
code file syncs *down* from Wix to the local git repo automatically, the
same direction backend `.jsw` files and previously-existing page files
seem to behave. Confirmed wrong via Wix's own in-Editor Help AI, asked
directly: *"Wix does not support creating new .js [code] files directly
via the editor for Git-managed projects... To ensure syncing, create
[the] files... directly in your GitHub repository... the new page code
file still won't sync because it must originate from the Git repo, not
the Wix editor."* The direction is the opposite of what both of us
assumed.

**The actual fix**: get the new page's exact generated filename from the
Page Code sidebar in the Editor (format: `<Page Display Name>.<5-char
ID>.js`, e.g. `Draw Pro Entry.gq31q.js` — the ID is Wix-generated and
unrelated to the URL slug or the page's display name otherwise) and
create that exact file directly in `src/pages/` in the local repo, with
real content, then commit and push. It syncs through correctly once it
exists on the git side first.

**Reusable process for Pages 2 and 3** (Producer Event Setup, Producer
Draw Sheet Review): create the page in the Editor → Save → Publish → get
the exact filename from the Page Code sidebar → create that file locally
with the real page-code content from `velo/pages/drawpro-real/` in the
`ropingtools-site` repo → commit and push to `roping-tools`. Should not
require any of the multi-attempt troubleshooting this first page needed.

**Also encountered along the way, not the actual root cause but worth
knowing about**: `wix.config.json`'s pinned `"uiVersion"` field does not
auto-refresh on its own and there's no CLI flag to force it — clearing it
entirely to force a refresh was tried and made things briefly worse
(`wix dev` failed outright with "Missing master page" until the field was
restored from backup). Not recommended as a troubleshooting step for a
different problem — it wasn't the actual fix here and introduced a new
failure mode. Also re-confirmed the known `masterPage.js`-gets-marked-
deleted-by-wix-dev artifact recurs on essentially every `wix dev` run,
not just occasionally — restore it via `git checkout --` before every
commit while `wix dev` has been running, treat this as routine, not
exceptional.

---

## Draw Pro multi-class redesign (2026-07-21)

Triggered by placing `textEventCap` on the entrant entry form and asking a
direct question about it: is a Draw Pro event's cap really a single static
number? The honest answer, checked against the actual code rather than
assumed, was yes — and that turned out to be wrong. Confirmed by reviewing
two real event fliers side by side: a large-association WSTR qualifier
(Hallettsville, TX) and a small independent jackpot series (Gonzales, TX),
deliberately chosen as "the gamut" from largest to smallest. Both fliers list
several differently-capped ropings across multiple days, all still referred
to as one event.

**Core finding: one `DrawProEvents` record was doing two jobs that needed to
split.** "The day/weekend a producer is running" and "one specific roping
with its own cap/price/rules" are different things, and the original schema
conflated them into a single flat record with one `capNumber` and one
`pricePerEntry`. Full corrected schema is in `data-model.md` (see its own
"Revision history note" at the top) — summarized here as a decision record:

- **New `DrawProEventClasses` collection** carries everything that varies
  per roping: `capNumber`, an optional `heelerSubCap` (an *additional*
  constraint layered on top of the combined cap, not an alternate mode —
  corrected after an initial misread of a real flier's "#7.5 heeler cap"
  notation), `entryModeAllowed` (`pick_or_draw` / `pick_only` / `draw_only`),
  `maxEntriesPerEntrant`, `pricePerEntry`/`pricePerPreformedTeamEntry`,
  `drawInSurchargeFee`, optional minimum-classification-to-draw-in
  thresholds per role, and its own independent timing/status.
- **`DrawProEvents` becomes a lightweight shell** — title, producer, date,
  one shared entry link/QR/dropdown-of-classes. Confirmed explicitly: a
  flier listing 5+ classes across 3 days is still "one event."
- **Cross-class timing dependencies are handled by producer judgment, not
  automated.** Real fliers do show "books close after round 3 of the #7"
  — confirmed as common practice, not an edge case — but automating that
  would require tracking live round-by-round progress during an event,
  which doesn't exist anywhere in this design. Decided explicitly: the
  producer manually closes each class's books whenever they judge the
  moment has come; the round-based language on a flier is informational
  for entrants, not something the software enforces. Manual close was
  already effectively supported via the existing `status` field regardless
  of `entryCloseMode` — this decision meant no new mechanism, just making
  sure it's scoped per class once classes exist as separate entities.
- **`DrawProEntrants` now supports one person mixing pre-formed-team and
  draw-in entries within their own allowed count** — e.g. entering 3x with
  one known partner and two draw-in slots — via a new `submissionGroupId`
  field grouping the multiple records one submission can now produce, and
  a new `classId` field (an entrant enters a specific class within an
  event, not the event as an undifferentiated whole).
- **Draw-in surcharge fees have a real mechanical reason, not just an
  arbitrary producer markup**: in an unbalanced draw pool, the matching
  algorithm can be forced to give an entrant more actual runs than they
  requested/paid for just to get everyone matched. The entrant owes
  nothing extra for those forced runs — the producer absorbs the cost.
  Pre-formed teams (the Steer Me path) never create that imbalance in the
  first place, which is the concrete mechanical reason the fee structure
  nudges toward Steer Me, not an editorial choice layered on top.
- **Real, currently-unbuilt gap surfaced by this exercise**:
  `matching-engine.jsw`'s pairing algorithm pools "solo headers and solo
  heelers" as if every `DrawProEntrants` record is exactly one poolable
  slot — it has no logic today to expand a record with
  `requestedEntryCount: 2` into two separately matchable slots. This is a
  prerequisite for the mixed pre-formed/draw-in model above actually
  working, not yet implemented, flagged in `data-model.md` rather than
  quietly assumed to already work.

**Confirmed decision, not yet built: Producer Event Setup (Page 2) is
designed from the start around flier upload, not manual entry first with
scanning added later.** Producer uploads a flier image, AI drafts the full
event + class breakdown against this schema, producer reviews and corrects
every field before anything publishes — same trust pattern already used for
scanned entrant membership cards (AI/OCR drafts, a human confirms, nothing
auto-published unreviewed). Manual entry stays available as a fallback for
producers without a flier. Explicit reasoning for going straight to this
design rather than manual-first: making producers hand-retype an entire
flier's worth of structured data field-by-field would directly undermine
Draw Pro's own stated purpose of eliminating tedious manual
entering/cataloguing, and everything nailed down in this exercise (cap
rules, entry-mode restrictions, per-class pricing, surcharges, thresholds)
is exactly the target structure such a parser needs to fill in — this
conversation was effectively double-duty as both a schema correction and
the extraction schema for that planned feature.

**Not yet done as of this entry**: no code changes yet (`matching-engine.jsw`,
`event-setup.jsw`, `entrant-entry-form.js`, the live Wix collections
created via the REST API earlier in this project). This entry and the
`data-model.md` rewrite are the design record; implementation is a
follow-up. Page 1 (Entrant Entry Form) is actively under manual
construction in the Editor — the parts already placed for solo/individual
entrant fields remain valid; the "Partner"/team-entry section will need
rework once the mixed pre-formed/draw-in submission model above is
actually implemented.

---

## Wix Editor bug: moving an element outside its container can silently reset its Element ID (2026-07-21)

Confirmed live while building/styling Page 1: dragging an element outside
its parent container/margins in the Editor can silently strip its custom
Element ID, resetting it back to a generic auto-name (`input1`,
`radiogroup1`, etc.) with no warning or error at the time it happens. The
element itself, its content, and its position are unaffected — only the
ID is lost. This is dangerous specifically because there's no visible
symptom until something tries to reference that ID later (a `$w('#...')`
call that used to work suddenly can't find the element).

**Mitigation, not a fix (this is a real Wix bug, not something we can
prevent from our side):** if this happens, the specific element can be
identified by its remaining visible properties (label text, position,
type, what it's near) and cross-referenced against
`docs/DRAWPRO_MANUAL_PAGE_BUILD_GUIDE.md`'s element tables, then the
correct ID can be re-typed into the Properties panel — this is a full,
complete fix with no underlying data loss, since only the label was
reset, nothing else.

**Real, practical risk:** since there's no error at the moment of the
reset, a page could accumulate several silently-renamed elements without
it being obvious anything happened until testing surfaces a confusing
"element not found" error much later. Recommended practice going
forward: after any session of dragging/repositioning elements for
styling purposes, do a full pass checking every element's Properties
panel ID against the build guide before considering that session done —
not just the elements you remember moving.

**Follow-up from the same page-building session, unconfirmed but worth
recording:** `#dropdownClass` was reported added, then wasn't visible
in a full Layers-panel audit shortly after, alongside a mention of "the
site glitched once" around the same time. Unlike the ID-reset bug
above, this wasn't reproduced or diagnosed — it's recorded here as a
reported possible instance of Wix losing a newly-added element
entirely (not just its ID), not a confirmed bug. If this happens again,
worth checking Save timing (does it survive a Save + Editor refresh?)
and whether it's specific to Dropdown elements or general.

---

## Course disclaimer had no real log for anonymous visitors (2026-07-22)

**Confirmed bug, now fixed.** `legalAcknowledgments.jsw`'s `acknowledgeRisk()`
calls `currentMember.getMember()`, which throws if nobody's logged in. The
free preview chapter (and the risk-disclaimer modal itself) never required
login. The frontend's `acknowledgeRisk()` in `course-embed.html` closed the
modal immediately and fired the backend call as an unawaited promise,
swallowing any failure with a `console.warn` nobody would ever see. Net
effect: for any visitor who hadn't already logged in — the population most
likely to be encountering this content for the first time — clicking
through the disclaimer produced **zero record**, silently, while looking
identical to a successful acknowledgment.

A second, separate bug was found in the same pass: `hasAcknowledgedCurrentVersion()`
was written and wired into the backend, but the frontend never actually
called it anywhere. The modal unconditionally showed on every page load
for every visitor, logged in or not, regardless of prior acknowledgment.

**Fix**: content (including the free first chapter) now sits behind a
login gate (`#login-gate-overlay` in `course-embed.html`, `checkIsLoggedIn`/
`promptLoginAndWait` in `course-page.js`, using `wix-members-frontend`'s
`authentication.promptLogin()` — Wix's own hosted login/signup lightbox, no
custom signup form needed). The risk modal only shows to an already-logged-in
member, and only once `hasAcknowledgedCurrentVersion()` — now actually
called — confirms they haven't accepted the current `DISCLAIMER_VERSION`
yet. `acknowledgeRisk()` no longer hides the modal optimistically before
the save confirms; a failure is now a visible, retriable error rather than
a silently-swallowed one, since every visitor reaching that point is
guaranteed logged in and a failure there is a genuine, unexpected problem.

**Deliberate trade-off, decided with the user**: gating the free chapter
behind account creation adds friction — some anonymous visitors who'd
have casually sampled it will now bounce at the signup step instead.
Accepted anyway because (a) this is a liability record for a real
physical-risk activity, not a generic content paywall, and an
acknowledgment with no identity behind it is close to legally
meaningless, and (b) it has a real secondary benefit: every visitor who
does sample the free chapter is now an identified lead who can be
followed up with later if they don't subscribe, rather than an anonymous,
unreachable visit.

**Known, separate, unaddressed gap surfaced by this conversation**: Coaching/
Draw Pro run on Wix Members; Steer Me runs on its own independent Supabase
Auth. There is no SSO or account linking between the two today — a person
using both products needs two separate logins. Not fixed here; recorded as
a known limitation, not a bug, since building real cross-platform SSO
between two different auth vendors is a substantial separate effort, not
something to bolt on incidentally while fixing the disclaimer logging gap.

---

## Draw Pro -> Steer Me event continuity (2026-07-22)

**The gap this closes**: Steer Me already let producers post events (with
fliers), let entrants browse them, mark attending, and find a partner for
one — but nothing let an entrant actually *enter* the event. That dead-end
made the whole producer-facing side of Steer Me close to pointless: a
producer could post an event and never get an actual entry out of it.

**Confirmed direction**: Draw Pro is a tool to fix problems with the
status quo while pushing people toward Steer Me - the long-term goal is
Steer Me being the full experience, even though eliminating Draw Pro
entirely isn't realistic near-term. Given that, entering should hand off
to Draw Pro's real entry/cap/payment system rather than Steer Me building
a second, duplicate entry system of its own. `DrawProEvents.steerMeEventId`
already existed as a placeholder field for exactly this, with no code
behind it until now.

**What's built**: Draw Pro stays the single source of truth for the real
event data (classes, caps, pricing - Steer Me's schema doesn't have any
of that, deliberately). `backend/steerMeSync.jsw` cross-posts a
lightweight companion listing into Steer Me's own Supabase database via
its REST API, authenticated with a service-role key in Secrets Manager
(not added yet - see DRAWPRO_NEXT_STEPS.md). Sync fires from
`createEventClass()`, not `createEvent()`, since Steer Me's `events` table
requires at least one division/cap value on insert, which doesn't exist
until the first class is added.

On the Steer Me side: `producer_id` on `events` is now nullable (a Draw
Pro producer authenticates via Wix Members, with no guaranteed Supabase
account behind them at all), plus `draw_pro_event_id`,
`draw_pro_entry_url`, and `external_producer_name` for synced rows.
`EventCard` shows a new "Enter the Draw" button whenever
`draw_pro_entry_url` is present - deliberately independent of the
existing per-division "Partners" button, since a solo/draw-in entrant
(no partner needed at all, a real and previously entirely unsupported
path in Steer Me) needs the exact same way in as someone who found a
partner first.

**Accepted v1 boundaries, not oversights**:
- Sync happens once real data exists to sync (first class added), and
  only keeps `divisions`/the entry URL current after that - editing an
  event's title/date/location in Draw Pro afterward does not re-sync
  those fields to Steer Me. Revisit if that turns out to matter.
- No producer display name lookup from a bare Wix Member ID - there's no
  verified API for that here yet, so `external_producer_name` stays null
  and Steer Me's EventCard falls back to "Posted via Draw Pro" instead of
  guessing at an unconfirmed API.
- `listOnSteerMe` defaults to `true` (opt-out, not opt-in) - continuity is
  the intended default, not something a producer has to remember to turn
  on.

---

## Wix bug: Container Box doesn't support .disable()/.enable() (2026-07-23)

**Confirmed live, real production bug, not a guess.** `producer-event-setup.js`
called `$w('#boxAddClass').disable()` on page load - `#boxAddClass` is a
Container Box. That threw `TypeError: $w(...).disable is not a function`,
which is significant beyond just that one line: since it's a synchronous
throw inside `$w.onReady(async function () {...})`, it halted the entire
function right there, before execution ever reached the `onClick` wiring
further down for every button on the page - Add Class, Create Event, all
of it. From the producer's side this looked like total, silent button
failure: clicking anything did nothing, no error text shown anywhere on
the page itself.

Diagnosing this took several steps, in order, each of which was necessary
to actually find it: confirmed the Secrets Manager values and their
names were correct; confirmed the backend sync code was genuinely
deployed (not stale); confirmed Element IDs matched exactly; then finally
opened the browser's own DevTools console on the actual Preview window
(not Wix's separate Logging Tools panel, which only surfaces backend
logs, not this kind of frontend crash) and found the real error there.

**Fix**: use `.collapse()`/`.expand()` on Container Box elements instead
of `.disable()`/`.enable()` - universally supported across element types,
unlike disable/enable which is a form/button-specific API that some
container variants don't implement at all.

**General lesson for future pages**: if every button on a page appears to
do nothing at all (no success message, no error message, literally zero
visible reaction beyond the button's own built-in press animation), that
is a strong signal `$w.onReady()` itself is throwing before reaching any
event-handler registration - check the browser's DevTools console on the
actual Preview window first, before assuming the bug is anywhere in the
specific feature that seems broken.

**Update, same day**: the `.collapse()`/`.expand()` swap above was *also*
wrong - `#boxAddClass` threw `TypeError: $w(...).collapse is not a
function` too, same failure mode, same element, second guess in a row.
Whatever this element's real widget type is remains unconfirmed. Rather
than guess a third method, `producer-event-setup.js` was restructured
properly: all `onClick`/`onChange` handler registrations in
`$w.onReady()` now run *before* any cosmetic show/hide setup, and every
cosmetic setup call is wrapped in a local `safeCall()` helper that
catches and logs instead of throwing. This means a future surprise on any
element - not just this one - can no longer take down click-handling for
the whole page. `#boxAddClass` itself now uses `.hide()`/`.show()`
(the most universally-supported pair across Wix element types) as its
best-guess third attempt, but the real fix here is the defensive
restructuring, not finally guessing the right method name.

---

## IMPORTANT: two separate repos exist - only one is actually live (2026-07-23)

**Real mistake made and caught live this session, costing real debugging
time - worth flagging prominently so it isn't repeated.** This project
has two git repos: `ropingtools-site` (this one - working repo, docs,
full history) and `roping-tools` (bare mirror, but the ONLY one actually
wired to the site's Wix Git Integration). Nothing syncs between them
automatically - they're independent repos that happen to share a lot of
the same file contents because changes get manually copied over.

Page-code files (`velo/pages/**` here → `src/pages/*.<pageId>.js` there)
were being copied correctly every time this session, since the Wix
Editor's page-code panel being read-only forces a conscious "go copy this
over" step every time. **Backend `.jsw` files got missed** - several
edits (eventDate validation, a defensive fix in `steerMeSync.jsw`, two
brand-new files for a type-ahead feature) were committed here and
believed to be live, based on old assumptions from earlier in the
project that backend files "sync automatically." They didn't, this time.
The live Editor's Backend & Public panel was still showing stale code,
and two new files threw `Cannot find module` at runtime - both confirmed
directly in the panel before the real cause was understood.

**Going forward: every file change in `velo/backend/**` or
`velo/pages/**` needs a matching copy into the corresponding path under
`roping-tools/src/` and a separate commit+push there, every single time,
with no exceptions for "this one probably syncs on its own."** Verify
via the Editor's Backend & Public panel (for backend files) or the page
code panel (for page files) if there's ever doubt about whether a change
actually landed - don't assume.

---

## Wix Velo gotcha: cross-.jsw calls always return a Promise (2026-07-23)

**Confirmed live, real bug found via direct diagnostic logging - not a
guess.** `qr-and-alerts.jsw`'s `buildEntryUrl(eventId)` is plain,
ordinary synchronous code - no `async`, no promises, just a template
string return. Called from *within* `qr-and-alerts.jsw` itself, it
behaves exactly as written. But `steerMeSync.jsw` imports it from a
*different* `.jsw` file and called it without `await` - and the value
that came back was a genuine `Promise` object (confirmed via
`typeof`/`constructor.name` logging), not the string. That unresolved
Promise then serialized as a literal `"{}"` all the way into Supabase's
`draw_pro_entry_url` column, silently, with no error anywhere.

**The actual rule, confirmed empirically**: a function exported from one
Wix Velo `.jsw` Web Module always comes back wrapped in a Promise when
called from a *different* `.jsw` file - regardless of whether the
function itself is declared `async` or not. Same-file calls (e.g.
`qr-and-alerts.jsw` calling its own `buildEntryUrl` internally) are
unaffected and behave normally. Only cross-module `.jsw` imports trigger
this wrapping.

This is easy to miss because nothing throws - the Promise silently flows
through as if it were the real value, and depending on what happens to
it downstream (JSON.stringify, string concatenation, arithmetic), the
failure mode looks completely different each time and rarely points back
at "forgot to await." Found and fixed the same bug in three more places
in the same pass once this pattern was understood:
`event-setup.jsw`'s three calls to `payments.jsw`'s
`calculateProducerFee()` - all missing `await`, meaning `feeOwed` would
have silently been a Promise object instead of a real number in every
entry's fee calculation. Never caught yet since payment-flow testing is
still blocked on PayPal approval - would have been a much harder bug to
trace once real money was involved.

**Rule going forward: always `await` a call to a function imported from
a different `.jsw` file, with no exceptions - even ones whose own source
code is plainly synchronous.** If a cross-.jsw value's type ever looks
wrong (a URL that's `{}`, a number that behaves strangely), check for a
missing `await` before assuming the bug is anywhere else.

---

## Draw scaling for 200-500+ team classes (2026-07-23)

**Real, confirmed scenario, not a hypothetical edge case**: producers
have reported single-class fields (one roping, not one whole multi-class
event) with 200-500+ teams. `matching-engine.jsw`'s draw is designed to
run per class, but `executeDraw()` and `recomputeSpacingFlags()` both had
two real problems at that scale, found via direct code review before
either one ever caused a live failure:

1. **Sequential writes.** Every team got persisted with its own
   individual `wixData.insert()` call, in a loop - one network round trip
   per team. Total draw time scaled linearly with team count: fine at
   20-50 teams, likely tens of seconds at 100-250, and likely to exceed a
   platform execution timeout well before 500. `recomputeSpacingFlags()`
   had the same problem for `wixData.update()`, *plus* an individual
   `wixData.get()` per conflicted team just to look up names for the
   conflict message - and this function runs after every single manual
   swap a producer makes, not just once per draw.

   **Fix**: both now build the full array of records first, then persist
   everything in one `wixData.bulkInsert()` / `wixData.bulkUpdate()` call.
   `recomputeSpacingFlags()` also now pre-fetches every entrant it might
   need a name for in one query up front, instead of one-at-a-time inside
   the loop.

2. **Silent truncation at 1000 rows.** Both functions queried with a
   single `.limit(1000)` call - Wix Data's actual maximum page size. A
   class that ever exceeded 1000 entrant records (headers + heelers
   counted separately, so plausible at a large enough single-class field)
   would have silently excluded everyone past the first 1000 from the
   draw, with no error surfaced anywhere.

   **Fix**: a new `queryAllPages()` helper walks every page via
   `.next()` until exhausted, used everywhere this file previously
   capped at 1000.

**Not yet done, and only worth doing if a real load test shows it's
still needed**: decoupling the draw's actual execution from the
synchronous sign-off request entirely (mark the sheet "processing," run
the real work as a background job, producer sees a live status update).
This would remove timeout risk regardless of how large events ever get,
but it's a real architecture change - the bulk-write fix above should
already get a 500-team draw down to a handful of API calls total, likely
sufficient on its own. Revisit only if an actual load test at 300-500
teams says otherwise. No load test has been run yet - the numbers above
are reasoned estimates from the code's actual before/after shape, not
measured.

---

## Draw Pro producer profiles (2026-07-23)

**Real gap found, not a deliberate design decision.** Draw Pro producers
had no identity beyond their raw Wix Member account - no organization
name, contact info, or logo anywhere in the schema or pages. The only
producer-facing onboarding concept that existed at all was the PayPal
payout KYC step, itself still unbuilt (blocked on PayPal approval).

Confirmed via direct comparison: Steer Me already has this fully built
and live - a real `producer_profiles` Supabase table (migrations `0006`/
`0007`), a real screen (`app/producer.tsx`), a real hook
(`useProducerProfile.ts`). Draw Pro had nothing equivalent.

**Decision: build it as a separate, standalone Draw Pro concept, not
unified with Steer Me's.** Considered unifying (a producer who sets up a
profile on Steer Me automatically getting Draw Pro producer access) and
rejected it for two reasons:
1. It would fight an already-accepted architecture decision - Draw Pro,
   Steer Me, and the coaching course already use three independent login
   systems by design, specifically so none of them depends on another.
2. Draw Pro is meant to be the *source of truth* for real event data,
   with Steer Me as the lighter companion (see the "Draw Pro multi-class
   redesign" and "Draw Pro -> Steer Me event continuity" entries above).
   Making Draw Pro producer access depend on a Steer Me profile would
   invert that relationship, and would force every Draw Pro producer
   through a product they might not otherwise want at all - plenty of
   small local producers want a draw tool without caring about Steer
   Me's partner-finding features for themselves.

New `DrawProProducerProfiles` collection (see data-model.md), a new
`backend/producerProfiles.jsw` (`getProducerProfile()` /
`upsertProducerProfile()`), and a new standalone page
(`velo/pages/drawpro-real/producer-profile.js` - not yet created in the
Wix Editor as of this writing, so not yet mirrored to `roping-tools`).
`organizationName` now flows into `steerMeSync.jsw`'s
`external_producer_name` field once a producer sets one up - previously
always `null` unconditionally.

**Not done, worth considering later, not now**: a lightweight one-way
convenience where a NEW Draw Pro profile could pre-fill its organization
name from a matching Steer Me profile if one exists for the same email -
a suggestion, not shared identity, and only worth building once real
usage shows producers actually maintaining separate names across both
products is a genuine friction point.

---

## Draw Pro home page (2026-07-23)

Confirmed direction: this new page is meant to eventually **replace**
the current "Coming Soon" waitlist page (`public/drawpro/index.html` /
`velo/pages/drawpro-page.js`), once Draw Pro is ready to go fully
public. Built and tested now, ahead of that flip, per explicit
direction - this does NOT conflict with `DRAWPRO_NEXT_STEPS.md`'s
"don't flip the landing page prematurely" rule, since building a new
page alongside the old one isn't the flip itself; actually swapping
which page is the public `/drawpro` front door is a separate, later
decision.

Serves two audiences on one page - a signed-in-aware split, not two
separate pages:
- **Anonymous visitor**: the marketing/tour content, kept as an HTML
  embed (`public/drawpro/home-intro.html`) reusing the exact same tour
  carousel already built and tested on the old Coming Soon page - no
  reason to rebuild it as native elements. Native sign-up/login buttons
  sit below the embed, since HTML embeds are sandboxed from Wix Members
  login state (same confirmed limitation as the course-embed/old
  Coming Soon embeds).
- **Signed-in producer**: a personal dashboard instead - their own
  active and past events, a create-event link, a link to their producer
  profile. Confirmed scope: THIS producer's own events only, not a
  platform-wide directory of every producer's events (that's a
  different, not-yet-built feature if ever wanted).

"Active" vs "past" is judged by `eventDate` alone (>= today vs < today),
not by aggregating each event's classes' individual statuses - simple,
not perfectly precise for a multi-day event whose classes finish on
different days, but consistent with `eventDate` already being the one
anchor date used elsewhere in this schema for an event as a whole.

Source: `velo/pages/drawpro-real/drawpro-home.js`. Not yet created in
the Wix Editor as of this writing - staging only in `ropingtools-site`
until it is, same process as the other Draw Pro pages. Several
`wixLocation.to()` paths inside it are placeholders (sign-up/login,
Producer Event Setup, Producer Profile, Producer Draw Sheet Review)
since the real page URLs aren't known until each page exists - flagged
directly in the file's own comments, not silently wrong.

---

## Wix gotcha: Element IDs can't repeat across different repeaters on one page (2026-07-25)

**Confirmed live, real bug in the original spec, not a Wix quirk to work
around.** `drawpro-home.js`'s original doc comment told the builder to
give `#repeaterPastEvents`'s item template "the same item template as
`#repeaterActiveEvents`" - i.e., reuse `#textEventTitle`,
`#textEventDate`, etc. That's wrong: Wix's classic Editor allows the
same Element ID to repeat across *items within one repeater* (that's
the whole point of a repeater item template), but does **not** allow
the same ID to be reused across *two different repeaters* on the same
page - it's rejected as a duplicate, with no indication of where the
"existing" one actually is if the two repeaters aren't visually near
each other.

**Fix**: `renderEventRepeater()` (shared by both the active and past
events repeaters) now takes the item-template element IDs as a
parameter instead of hardcoding them, so each repeater gets its own
distinct set: `#repeaterActiveEvents` keeps `#textEventTitle`/
`#textEventDate`/`#textEventLocation`/`#linkManageEvent`;
`#repeaterPastEvents` uses `#textPastEventTitle`/`#textPastEventDate`/
`#textPastEventLocation`/`#linkPastManageEvent` instead.

**General lesson for future pages with more than one repeater**: never
reuse item-template Element IDs across two different repeaters, even
if they display the same shape of data. Give each repeater its own
distinctly-named set from the start, rather than discovering the
conflict live once one repeater's already built.

---

## PayPal Subscriptions for Draw Pro producer plans (2026-07-25)

**A genuinely different PayPal product than the entry-fee flow.** Entry
fees use PayPal for Platforms (Orders API + Partner Referrals) since
RopingTools is facilitating a payment between two other parties (the
entrant and the producer) and taking a cut - a true marketplace
relationship. Producer subscriptions are the opposite: RopingTools is
the direct merchant, the producer is the direct customer, no third
party involved. That's PayPal's plain **Subscriptions API**
(`/v1/billing/plans`, `/v1/billing/subscriptions`), which is a simpler,
more standard integration and - importantly - does **not** require the
pending PayPal for Platforms application to be approved first. The two
integrations share the same `getPayPalAccessToken()` OAuth helper and
the same `drawpro-paypal-client-id`/`drawpro-paypal-client-secret`
secrets, but hit entirely different PayPal endpoints.

**Price**: $149/year, a researched estimate rather than an arbitrary
number - see `docs/DRAWPRO_NEXT_STEPS.md`'s resolved placeholder entry
for the actual comparable-pricing research (Rodeo Producer $100/yr +
$50/event without online payment; Carlsen's Roping Management Program
$189/yr; Roping Assistant Professional $750 one-time as the premium
ceiling). Positioned above the bare-bones baseline given Draw Pro's
stronger feature set (multi-class events, automated draw/spacing,
Steer Me cross-posting), while staying accessible to the small/
mom-and-pop producer audience this whole project targets.

**Competitive differentiation, researched the same session**: beyond
partner-matching (which nothing found in that research comes close to),
the real additional value is the *ecosystem effect* - a cross-producer
event discovery directory (every competitor found is a single
producer's isolated registration form, not a browsable directory
spanning many producers), modern cloud/mobile access (competitor
pricing language reads like legacy desktop software - "licensed for a
single computer," "10-day usage license"), and the Enter-the-Draw
hand-off mechanic itself, which no competitor could replicate without
building the same two-product ecosystem. Deliberately NOT claiming the
draw/spacing algorithm itself is unique - no evidence competitors lack
equivalent logic, and overclaiming that would be dishonest marketing,
not confident positioning.

**Structure**: `createSubscriptionProduct()` and `createSubscriptionPlan()`
are one-time admin setup calls (not exposed in any UI) - run once,
after PayPal for Platforms approval lands and real credentials exist,
to get a plan id, which then gets stored as the
`drawpro-paypal-subscription-plan-id` secret. Every producer's
subscription attaches to that one shared plan via
`startProducerSubscription()`, which returns a PayPal-hosted approval
URL. `checkSubscriptionStatus()` is a polling fallback (same
established pattern as `checkPayoutOnboardingStatus()`) since no
webhook for subscription lifecycle events is built yet - acceptable
for now, same "built but not urgent" boundary already accepted
elsewhere in this codebase. `cancelSubscription()` now actually calls
PayPal's cancel endpoint, not just our own status flag - a real
correctness fix over the prior stub, which only ever updated our own
record and never touched PayPal at all.

The old `subscribeToAnnualPlan(producerId, annualFee)` stays, but
repurposed as an explicit manual/admin-override path only (comping an
early adopter, an offline payment arrangement) - not what a producer
uses to subscribe themselves anymore.

**Not yet built**: the actual producer-facing "Subscribe" UI (a natural
fit on the new Producer Dashboard page), and the two one-time admin
setup calls haven't been run yet since they need real PayPal credentials,
which don't exist until the pending Platforms application is approved -
though note the Subscriptions API itself doesn't strictly require that
approval, so this could in principle be tested earlier via PayPal's
sandbox if there's appetite to get ahead of it.

---

## Course: entire page's JavaScript was broken by two unescaped apostrophes (2026-07-25)

**Far more severe than the reported symptom.** Reported bug: a locked
chapter's teaser text said "log in to unlock this chapter," but there
was no actual login button anywhere to do that with - `unlockChapter()`
only ever checks access, it never had a way to open Wix's login lightbox
itself. Real, confirmed gap, fixed by adding a `.chapter-login-btn` next
to every "Unlock This Chapter" button (31 of them), wired to a new
`promptLoginForChapter()` function that opens the login lightbox via the
same `promptLogin` bridge action `startLoginGate()` already used
elsewhere, then automatically re-checks access once the visitor is
actually signed in.

**While verifying that fix, found something much bigger**: `course-embed.html`
is one single inline `<script>` tag for the entire page (confirmed - not
split into multiple script blocks). Two apostrophes inside single-quoted
JS string literals (`'...Hondo's Feedback...'` and `'...Hondo's
feedback.'`) were never escaped, both introduced in the "Name the coach:
Hondo" commit. A syntax error ANYWHERE in a single script tag prevents
the ENTIRE tag from parsing - meaning since that commit, **every piece
of JavaScript on this page was completely non-functional**: quizzes,
chapter unlocking, the Hondo AI-coach video-analysis feature, progress
tracking, all of it - not just the login button gap that was actually
reported. Confirmed via `node --check` against the extracted script
block, which failed at the first unescaped apostrophe; fixing both and
re-running confirmed the whole block now parses cleanly.

**Lesson for this file specifically going forward**: it's one giant
script tag with no build step, no linter, and no bundler catching syntax
errors before they ship - a single unescaped character anywhere in it
can silently take down the entire page's interactivity with no error
visible to anyone except someone who opens the browser console (or, as
happened here, runs the raw JS through a syntax checker directly).
Worth a deliberate pre-paste syntax check (`node --check` against the
extracted `<script>` contents, same as done here) before any future
edit to this file gets pasted into the live Wix embed, given how easy
this specific mistake is to make with any string containing a
contraction or possessive apostrophe.

---

## "First to enter, last to rope" sequencing + CSV export + multi-user pricing (2026-07-27)

Three related asks in one message. First two are built; the third is a
pricing recommendation only, not built.

**"First to enter, last to rope"** — a real, long-standing jackpot
incentive: entries submitted earlier get scheduled to run LATER, so
producers aren't rushed by everyone entering at the last minute. Built
as a per-class opt-in (`DrawProEventClasses.sequenceMode`: `random`
default | `entry_order`), not a global behavior change, since not every
producer runs this incentive. `matching-engine.jsw`'s
`sequenceWithSpacing()` already did greedy placement into the lowest
available open slot; the only change needed was WHAT ORDER teams are
considered in before that placement runs — sorting by entry timestamp
descending (instead of a random shuffle) means teams that entered latest
get first crack at low slot numbers, pushing earliest-entered teams into
the high slot numbers by the time their turn comes. The existing 10-team
minimum-spacing enforcement is completely unchanged and still applies on
top. No new field was needed for the timestamp itself —
`DrawProEntrants.entryTimestamp` was already captured at submission time
(`buildEntrantRecord()`), just not previously read by anything.

**Open product question resolved**: a blind-drawn team's two entrants
each entered independently and never chose each other, so "when did this
team enter" was ambiguous. Confirmed decision: use the EARLIER of the
two entrants' timestamps for a drawn team (same rule as a pre-formed
team, computed via one `Math.min()` in `getEffectiveEntryTimestamp()`
rather than branching on `preFormed`).

**CSV export** — researched before designing, per explicit direction.
Searched documented import/export specs for every competitor product
already identified this session (Rodeo Producer, Carlsen's Roping
Management Program, Roping Assistant Professional, Team Roping
System/rodeosystem.com) plus two more that surfaced (Speedy Steeds,
RodeoPro). Finding: no product publishes an exact column-level import
schema publicly, so there's no real external standard to match. Built a
plain, clearly-labeled generic CSV instead (`csv-export.jsw`'s
`exportDrawSheetCSV()`) — Team #, Header/Heeler name + number, entry
timestamp, class, event date — easy to adjust columns later against real
producer feedback rather than a guessed-at proprietary format.

Download mechanism is a real Velo constraint worth flagging: page code
has no direct File/Blob/anchor-click API, so the backend only returns
CSV text; the frontend triggers the download via
`wixLocation.to('data:text/csv;charset=utf-8,' + encodeURIComponent(csv))`.
This should work (text/csv isn't browser-renderable, so it prompts a
save rather than navigating away) but is **untested live** as of this
writing - confirm in Preview before relying on it in front of a real
producer.

**Multi-user accounts + tiered pricing** — design/pricing recommendation
only, nothing built. Architecturally sound as a `DrawProAccountUsers`
join collection (accountOwnerId, memberUserId, role) layered on top of
the existing single-producer `DrawProProducerProfiles` + PayPal
Subscriptions plan, not a replacement. Pricing benchmarked against
Carlsen's RMP ($189/yr single computer, $299/yr two licenses) and Rodeo
Producer ($100/yr + $50/event): recommended $149 (1 user, unchanged) /
$199 (3 users) / $249 (unlimited), which stays under every researched
competitor price point at every tier. Not implemented — PayPal Billing
Plans already support multiple plans under one product, so this would
extend `payments.jsw`'s existing `createSubscriptionPlan()` pattern
rather than needing new payment infrastructure, whenever this is
prioritized.

---

## Draw Pro tours: added real screen previews (2026-07-27)

Direct feedback from real people who took the tour: "just stuff to
read," not impressive. Both existing copies of the tour carousel -
`public/drawpro/home-intro.html` (the new, not-yet-live producer
dashboard page) AND `public/drawpro/index.html` (the still-live "Coming
Soon" page - the one real testers would have actually seen, per
DRAWPRO_NEXT_STEPS.md's "don't flip prematurely" rule) - got the same
treatment: each slide now shows a real screenshot plus 2 short "what to
notice" hint lines, instead of eyebrow/title/body text alone.

**Screenshots are real UI, not stock images or invented mockups.**
Headless-rendered (Playwright driving the machine's already-installed
Chrome, no new browser download needed) from this project's own existing
reference mockups (`docs/mockups/*.html`,
`docs/source/drawpro-build/ui/*.html`) - the same visual specs the real
Wix Editor pages were built to match. One gap found and fixed along the
way: `docs/source/drawpro-build/ui/producer-dashboard-mockup.html` turned
out to be stale/mistitled - it actually depicts the Draw Sheet Review
screen, not the real multi-event Producer Dashboard `drawpro-home.js`
builds (Active Events / Past Events lists). Rather than screenshot
something that would mislead a prospective producer, built a fresh,
accurate mockup (`docs/mockups/drawpro-producer-dashboard-mockup.html`)
matching what that real page actually renders, and flagged the stale
file's header so nobody reuses it by mistake.

**Delivery mechanism**: both tour files are plain HTML strings Justin
manually pastes into a Wix HTML Embed element (no git sync to the live
site) - consistent with that existing workflow, images are base64-
inlined directly in the file rather than hosted externally, so there's
still only one self-contained file to copy/paste. Each file grew from
~10KB to ~450KB as a result (4 JPEGs, resized to 960px wide and
compressed to keep the total reasonable) - worth testing that pasting
that much text into the Wix Editor's HTML Embed field still works
smoothly before assuming it's a non-issue.

**Real bug found and fixed during testing, not just cosmetic**: adding
a screenshot made the tour card taller than a real small-phone viewport
(confirmed at 375x667) - the Next button got pushed below the fold with
no way to reach it, which would have made the tour un-completable on
some phones. Fixed by switching `.tour-overlay` from
`align-items: center` (clips overflow) to `align-items: flex-start` plus
`overflow-y: auto` (scrolls instead), and capping screenshot height via
a `max-height: 700px` media query so it's rarely even needed. Verified
live via Playwright at both a comfortable (500x900) and a tight
(375x667) viewport, including confirming the Next button is reachable
by scroll in the worst case.

---

## Multi-user accounts + tiered pricing — actually built (2026-07-27)

Follow-up to the same-day entry above, which was a design/pricing
recommendation only. This is the real implementation.

**Deliberate design choice: no new "account" identity.** An added user
does NOT get their own events - they get GRANTED PERMISSION to act on
the account owner's existing `producerId` (a plain Wix Member id, same
convention `DrawProProducerProfiles.producerId` already uses). Every
`DrawProEvents`/`DrawProEventClasses`/etc record still belongs to
exactly one producerId, completely unchanged - avoids any migration of
existing data. New collection: `DrawProAccountUsers`
(accountOwnerId/memberUserId/inviteEmail/role/status). New module:
`backend/account-users.jsw` - `inviteAccountUser()`/`removeAccountUser()`
(owner-only, deliberately stricter than the general access check - who's
on the team is the paying owner's call, not something helpers grant each
other), `acceptAccountInvite()`, `listAccountUsers()` (owner OR an active
helper can view), and the shared `isAuthorizedForProducer()` /
`assertProducerAccess()` check.

**Real, pre-existing gap found and partially closed as a direct
consequence of this work, not the original goal**: most producer-facing
functions across `event-setup.jsw`/`matching-engine.jsw`/
`notifications.jsw` only ever checked "is someone signed in," never "does
this signed-in member actually own the specific event/class." True since
before multi-user accounts existed - just surfaced by building a real
authorization check for the first time. Applied to the highest-stakes
actions: class creation/open/close, `setClassRotationSize`, draw
finalize/sign-off (triggers the actual irreversible draw), manual
pairing/override, team swaps, spacing-conflict acknowledgment, CSV
export, and both notification functions (`sendDrawNotifications()`
previously had NO auth check at all - anyone who knew a classId could
trigger a real mass email blast to that class's entrants). NOT yet
applied to `steerMeSync.jsw`, `venues.jsw`, `qr-and-alerts.jsw`, or
`producerProfiles.jsw` - see `DRAWPRO_NEXT_STEPS.md`, flagging rather
than assuming those are fine by omission.

**Pricing tiers** live in `payments.jsw`'s `PRODUCER_SEAT_TIERS` (solo
$149/1 user, team3 $199/3 users, unlimited $249) - `createSubscriptionPlan()`
and `startProducerSubscription()` both now take a `seatTier` param and
create/attach to a separate PayPal Billing Plan per tier (one Product,
three Plans - PayPal's API already supported this, no new payment
mechanism needed). `subscribeToAnnualPlan()` (the manual/admin-override
path) also takes an optional `seatTier` now, defaulting to `solo`.
Seat limits are enforced in `account-users.jsw`'s `inviteAccountUser()`
by reading the owner's `DrawProProducerSubscriptions.seatTier` (defaults
to `solo`/1 seat if absent or unsubscribed - multi-user is an extension
of the same paid annual subscription, not a separate product).

**UI**: a "Manage Team" section added to Producer Profile
(`producer-profile.js`) - invite by email, see current team + seat usage,
remove a user. New Editor elements not yet added to the live page - see
`DRAWPRO_MANUAL_PAGE_BUILD_GUIDE.md`.

**Not yet done, flagged rather than silently left**: the 4th Triggered
Email template for invites (invites are recorded either way, just don't
email yet); the invited person's own "accept invite" page/flow
(`acceptAccountInvite()` exists, nothing calls it); and
`drawpro-home.js`'s producer dashboard still only queries events by
`member._id` alone, meaning a helper who accepts an invite today gets
real backend access but would see an EMPTY dashboard, not the events
they're supposed to help with - it needs to query across
`getAccessibleProducerIds(member._id)` instead. All three are listed in
`DRAWPRO_NEXT_STEPS.md`.

---

## Steer Me's own tour got the same screenshot treatment (2026-07-27)

Follow-up question after the Draw Pro tour work above: Steer Me
(separate repo, `steer-me-app`) has its own, completely independent
"How Steer Me Works" tour (`app/(auth)/tour.tsx`) with the exact same
underlying problem - icon + text only, no screen previews.

Different tech stack than Draw Pro's HTML-embed tours, so the mechanism
is different: no base64-inlining (Expo has a real static-asset pipeline
via `require()`, so the 4 screenshots live as real PNG files under
`assets/tour/` instead). Per explicit direction, images are static HTML
mockups of the app's real screens/components (`docs/mockups/steer-me/`
in *this* repo - `steerme-browse-mockup.html`, `-events-mockup.html`,
`-post-mockup.html`, faithfully copying colors/fonts from
`src/theme/theme.ts` and layout from `PartnerCard.tsx`/`EventCard.tsx`/
`NeedPostCard.tsx`), screenshotted headlessly the same way as Draw Pro's,
rather than capturing the actual running Expo app - chosen specifically
to avoid getting blocked on app-boot/env/seed-data issues, at the cost
of being a faithful reproduction rather than a literal capture. The
`events` mockup does double duty for two slides (full page for "See
What's Coming Up," a cropped/zoomed region for "Enter the Draw, Right
From Here") since the real `EventCard` already puts both concerns on one
card - avoided a near-duplicate second mockup file.

Same overflow lesson applied preemptively rather than waited for: the
slide content switched from a plain centered `View` to a `ScrollView`,
since a taller slide (image + hints) risks the identical small-phone
overflow bug found and fixed on Draw Pro's tour earlier the same day.

---

## Draw Pro's Subscribe UI — built to match Steer Me's existing one (2026-07-27)

Prompted by a direct comparison question: Steer Me already has a complete,
real Subscription screen (`app/subscription.tsx`) - fully coded, gated
only on the external step of setting up RevenueCat + App Store/Google
Play products. Checked Draw Pro's own pages and confirmed nothing called
`startProducerSubscription()` anywhere - the equivalent producer-facing
UI simply didn't exist, despite the backend being fully built the same
day as the tiered-pricing work above.

Built a Subscription section on Producer Profile (not a new page - no
Wix Editor page-creation step needed): current status, a tier picker
populated live from a new `payments.jsw` export,
`getSeatTierOptions()` (never hardcode prices into the page - this
function is the single source of truth so the two can't drift apart),
Subscribe (redirects to PayPal's hosted checkout) and Cancel buttons.

**Return-URL design choice**: rather than build a whole separate landing
page just to catch the PayPal redirect, `SUBSCRIPTION_RETURN_URL`/
`SUBSCRIPTION_CANCEL_URL` now point back at Producer Profile itself with
a `?subReturn=1`/`?subReturn=0` query flag - the same page's `onReady()`
checks for it and calls `checkSubscriptionStatus()` to reconcile before
displaying anything. Simpler than Steer Me's equivalent (which has no
return-URL concept at all, since RevenueCat's native purchase flow never
leaves the app).

**Real, pre-existing gap found and closed as a direct result**:
`startProducerSubscription()`, `cancelSubscription()`, and
`checkSubscriptionStatus()` had **no authorization check at all** before
this - any signed-in Wix member could have started or cancelled billing
for any producerId they knew. Restricted to the account owner only (same
reasoning as `account-users.jsw`'s invite/remove functions - billing
decisions are the paying owner's call, not something a helper should be
able to do even though they can otherwise act on the account's events).

**Same external dependency as Steer Me, different vendor**: this is
fully coded and ready, but won't work until `createSubscriptionProduct()`
and `createSubscriptionPlan(productId, seatTier)` (once per tier) are run
with real PayPal credentials, which don't exist yet pending the PayPal
for Platforms application approval - see `DRAWPRO_NEXT_STEPS.md`.

---

## Course: real content bug found - header/heeler technique conflated (2026-07-27)

User-reported and confirmed with the actual data: the course teaches
heading and heeling together without differentiating which end a given
piece of content or quiz question applies to - and the "correct"
technique sometimes genuinely differs by role. Confirmed example:
Chapter 1.1's quiz asked "What is the most common tip angle error seen
in beginning ropers?" with ONE universal answer ("too high") - true for
heelers, but backwards for headers, whose common beginner mistake is the
tip being too LOW. A heading-focused user got marked wrong for correctly
describing their own actual common mistake.

**First-pass audit** (9 of 32 chapters checked closely - the early
technical ones, where role differences actually bite; partnership/
mental-game/horsemanship chapters 6.x-8.x deprioritized as much less
likely to have this problem) found more than the one reported instance:

- **Chapter 1.1**: the confirmed tip-angle question, plus a second
  likely instance (Q6, arm position) not yet fixed - flagged, pending
  the user's confirmation of the correct header-side answer (unlike the
  tip-angle case, the user hadn't already stated what heading's correct
  arm-position technique actually is, so this wasn't fixed rather than
  guessed at).
- **Chapter 3.1 ("The Point of Release — Where It All Happens")** - the
  bigger structural finding. Generic-sounding title, but EVERY question
  in it is explicitly about heeling ("the single most important aspect
  of *heeling* is...", "a *heeler's* eyes..."). No header equivalent
  exists anywhere in the course for release/delivery-focus technique.
- **Chapter 4.1 (Lane System)** - 9 of 10 questions are heeler-specific;
  headers get one tacked-on question. Thin, not wrong.
- **Chapter 1.4 (Breakover)** is the model to replicate: already
  correctly splits header clock position (1 o'clock) from heeler clock
  position (12 o'clock) as two distinct, correctly-labeled questions.

**Confirmed product direction**: let a user choose their focus (Header /
Heeler / Both) at any time, not a one-time locked decision, with course
content and quizzes following that choice. 'Both' is a first-class
choice (shows everything merged), not just "undecided." Framed
explicitly as a durable architecture, not a one-off fix, since planned
future tie-down/breakaway roping content will need the same
discipline-selector pattern.

**Built so far**: a `role` field on quiz questions (`'header'` |
`'heeler'` | absent = applies to everyone) - Chapter 1.1's confirmed
tip-angle question is the first real example, fixed in both places it
lives (`courseContent.js` and `course-embed.html`'s duplicated free-
preview copy - see that file's own note on keeping the two in sync).
New `backend/coursePreferences.jsw`: `getFocusPreference()`/
`setFocusPreference()`/`filterQuizByRole()`, wired into
`content.jsw`'s `getChapterContent()` so filtering already works
server-side. Safe interim default: no focus set (or focus `'both'`)
shows ALL role-tagged content, so nothing is hidden from anyone until
the real selector UI exists.

**Not yet built, by deliberate choice given how much else shipped
tonight**: the actual "Choose Your Focus" UI. `course-embed.html` is a
single 3600+ line monolithic HTML/JS file with no build step (see this
doc's earlier entry on a single unescaped apostrophe once breaking the
entire page) - adding a new UI flow there deserves focused, careful,
isolated attention rather than being rushed at the end of a long
session. See `DRAWPRO_NEXT_STEPS.md`-equivalent tracking (or ask
directly) for the concrete next steps: (1) create the
`CourseFocusPreferences` collection (3 fields - documented in
`coursePreferences.jsw`'s file header), (2) build the actual focus-
picker UI and wire it to `setFocusPreference()`, (3) continue the
chapter-by-chapter audit for the remaining flagged/unchecked chapters.
