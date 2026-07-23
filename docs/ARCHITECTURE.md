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
